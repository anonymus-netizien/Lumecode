/**
 * Model Registry
 * Central registry for managing AI model inventory across all providers
 */

import { EventEmitter } from 'events';
import type {
  ModelInfo,
  ModelQueryFilters,
  ModelRegistryState,
  ModelSyncError,
  ProviderModelResponse,
  ModelTier,
  ModelCapabilities,
  ModelHealth,
} from './types.js';
import { createDefaultHealth, createDefaultCapabilities } from './types.js';
import { modelLogger as logger } from './logger.js';

// Event types for the registry
export interface ModelRegistryEvents {
  'sync:start': () => void;
  'sync:complete': (models: ModelInfo[]) => void;
  'sync:error': (error: ModelSyncError) => void;
  'model:added': (model: ModelInfo) => void;
  'model:updated': (model: ModelInfo) => void;
  'model:removed': (modelId: string) => void;
  'health:updated': (modelId: string, health: ModelHealth) => void;
}

/**
 * ModelRegistry - Singleton class for managing AI model inventory
 */
export class ModelRegistry extends EventEmitter {
  private static instance: ModelRegistry | null = null;
  private state: ModelRegistryState;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private readonly syncIntervalMs = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    super();
    this.state = {
      models: new Map(),
      lastSync: null,
      syncInProgress: false,
      errors: [],
    };
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (ModelRegistry.instance) {
      ModelRegistry.instance.stopAutoSync();
      ModelRegistry.instance = null;
    }
  }

  /**
   * Get all models
   */
  public getAllModels(): ModelInfo[] {
    return Array.from(this.state.models.values());
  }

  /**
   * Get a model by ID
   */
  public getModel(id: string): ModelInfo | undefined {
    return this.state.models.get(id);
  }

  /**
   * Query models with filters
   */
  public queryModels(filters: ModelQueryFilters): ModelInfo[] {
    let models = this.getAllModels();

    if (filters.provider) {
      models = models.filter(m => m.provider === filters.provider);
    }

    if (filters.tier) {
      models = models.filter(m => m.tier === filters.tier);
    }

    if (filters.isFree !== undefined) {
      models = models.filter(m => m.isFree === filters.isFree);
    }

    if (filters.hasVision !== undefined) {
      models = models.filter(m => m.capabilities.vision === filters.hasVision);
    }

    if (filters.hasStreaming !== undefined) {
      models = models.filter(m => m.capabilities.streaming === filters.hasStreaming);
    }

    if (filters.hasFunctionCalling !== undefined) {
      models = models.filter(m => m.capabilities.functionCalling === filters.hasFunctionCalling);
    }

    if (filters.minContextLength !== undefined) {
      models = models.filter(m => m.capabilities.maxContextLength >= filters.minContextLength!);
    }

    if (filters.healthStatus) {
      models = models.filter(m => m.health.status === filters.healthStatus);
    }

    return models;
  }

  /**
   * Get all free models
   */
  public getFreeModels(): ModelInfo[] {
    return this.queryModels({ isFree: true });
  }

  /**
   * Get models by provider
   */
  public getModelsByProvider(provider: string): ModelInfo[] {
    return this.queryModels({ provider });
  }

  /**
   * Get models by tier
   */
  public getModelsByTier(tier: ModelTier): ModelInfo[] {
    return this.queryModels({ tier });
  }

  /**
   * Add or update a model
   */
  public upsertModel(model: ModelInfo): void {
    const existing = this.state.models.get(model.id);
    this.state.models.set(model.id, {
      ...model,
      updatedAt: new Date(),
    });

    if (existing) {
      this.emit('model:updated', model);
      logger.debug(`Model updated: ${model.id}`);
    } else {
      this.emit('model:added', model);
      logger.debug(`Model added: ${model.id}`);
    }
  }

  /**
   * Remove a model
   */
  public removeModel(id: string): boolean {
    const removed = this.state.models.delete(id);
    if (removed) {
      this.emit('model:removed', id);
      logger.debug(`Model removed: ${id}`);
    }
    return removed;
  }

  /**
   * Update model health
   */
  public updateModelHealth(modelId: string, health: Partial<ModelHealth>): void {
    const model = this.state.models.get(modelId);
    if (model) {
      model.health = {
        ...model.health,
        ...health,
        lastChecked: new Date(),
      };
      this.emit('health:updated', modelId, model.health);
      logger.debug({ status: model.health.status }, `Health updated for model: ${modelId}`);
    }
  }

  /**
   * Register models from a provider response
   */
  public registerProviderModels(response: ProviderModelResponse): void {
    logger.info(`Registering ${response.models.length} models from ${response.provider}`);
    
    for (const model of response.models) {
      this.upsertModel(model);
    }
  }

  /**
   * Sync models from all providers
   */
  public async syncFromProviders(
    providerFetchers: Array<() => Promise<ProviderModelResponse>>
  ): Promise<void> {
    if (this.state.syncInProgress) {
      logger.warn('Sync already in progress, skipping');
      return;
    }

    this.state.syncInProgress = true;
    this.state.errors = [];
    this.emit('sync:start');
    logger.info('Starting model sync from all providers');

    const results: ProviderModelResponse[] = [];

    for (const fetcher of providerFetchers) {
      try {
        const response = await fetcher();
        results.push(response);
        this.registerProviderModels(response);
      } catch (error) {
        const syncError: ModelSyncError = {
          provider: 'unknown',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
          retryCount: 0,
        };
        this.state.errors.push(syncError);
        this.emit('sync:error', syncError);
        logger.error({ error: syncError.error }, 'Provider sync failed');
      }
    }

    this.state.syncInProgress = false;
    this.state.lastSync = new Date();
    this.emit('sync:complete', this.getAllModels());
    logger.info(`Sync complete. Total models: ${this.state.models.size}`);
  }

  /**
   * Start automatic sync
   */
  public startAutoSync(
    providerFetchers: Array<() => Promise<ProviderModelResponse>>
  ): void {
    if (this.syncInterval) {
      logger.warn('Auto-sync already running');
      return;
    }

    logger.info('Starting auto-sync');
    this.syncFromProviders(providerFetchers);
    this.syncInterval = setInterval(() => {
      this.syncFromProviders(providerFetchers);
    }, this.syncIntervalMs);
  }

  /**
   * Stop automatic sync
   */
  public stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('Auto-sync stopped');
    }
  }

  /**
   * Get registry state
   */
  public getState(): Readonly<ModelRegistryState> {
    return {
      ...this.state,
      models: new Map(this.state.models),
    };
  }

  /**
   * Get sync errors
   */
  public getErrors(): ModelSyncError[] {
    return [...this.state.errors];
  }

  /**
   * Check if sync is in progress
   */
  public isSyncing(): boolean {
    return this.state.syncInProgress;
  }

  /**
   * Get last sync time
   */
  public getLastSyncTime(): Date | null {
    return this.state.lastSync;
  }

  /**
   * Clear all models
   */
  public clear(): void {
    this.state.models.clear();
    this.state.errors = [];
    logger.info('Model registry cleared');
  }

  /**
   * Get model count
   */
  public get size(): number {
    return this.state.models.size;
  }

  /**
   * Check if a model exists
   */
  public has(id: string): boolean {
    return this.state.models.has(id);
  }
}

/**
 * Create a model info object with defaults
 */
export const createModelInfo = (
  partial: Partial<ModelInfo> & { id: string; name: string; provider: string }
): ModelInfo => {
  const now = new Date();
  const tier = partial.tier ?? 'free';
  return {
    id: partial.id,
    name: partial.name,
    provider: partial.provider,
    tier,
    isFree: partial.isFree ?? tier === 'free',
    capabilities: partial.capabilities ?? createDefaultCapabilities(),
    health: partial.health ?? createDefaultHealth(),
    description: partial.description,
    contextWindow: partial.contextWindow,
    pricing: partial.pricing,
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
};

// Export singleton getter
export const getModelRegistry = (): ModelRegistry => ModelRegistry.getInstance();
