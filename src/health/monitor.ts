/**
 * Health Monitor
 * Monitors the health and availability of AI models
 */

import { EventEmitter } from 'events';
import type { ModelHealth, HealthStatus, ModelInfo } from '../models/types.js';
import { getModelRegistry, type ModelRegistry } from '../models/registry.js';
import { modelLogger as logger } from '../models/logger.js';

// Health check configuration
export interface HealthCheckConfig {
  intervalMs: number;
  timeoutMs: number;
  unhealthyThreshold: number;
  degradedThreshold: number;
  maxRetries: number;
}

// Health check result
export interface HealthCheckResult {
  modelId: string;
  status: HealthStatus;
  latencyMs: number | null;
  error?: string;
  timestamp: Date;
}

// Health monitor events
export interface HealthMonitorEvents {
  'check:start': (modelId: string) => void;
  'check:complete': (result: HealthCheckResult) => void;
  'check:error': (modelId: string, error: Error) => void;
  'status:changed': (modelId: string, oldStatus: HealthStatus, newStatus: HealthStatus) => void;
  'alert:unhealthy': (modelId: string) => void;
  'alert:degraded': (modelId: string) => void;
  'alert:recovered': (modelId: string) => void;
}

// Default configuration
const DEFAULT_CONFIG: HealthCheckConfig = {
  intervalMs: 60 * 1000, // 1 minute
  timeoutMs: 10 * 1000, // 10 seconds
  unhealthyThreshold: 0.5, // 50% error rate
  degradedThreshold: 0.2, // 20% error rate
  maxRetries: 3,
};

/**
 * HealthMonitor - Monitors model health across all providers
 */
export class HealthMonitor extends EventEmitter {
  private static instance: HealthMonitor | null = null;
  private config: HealthCheckConfig;
  private registry: ModelRegistry;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private healthHistory: Map<string, HealthCheckResult[]> = new Map();
  private readonly maxHistorySize = 100;

  private constructor(config?: Partial<HealthCheckConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = getModelRegistry();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(config?: Partial<HealthCheckConfig>): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor(config);
    }
    return HealthMonitor.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (HealthMonitor.instance) {
      HealthMonitor.instance.stop();
      HealthMonitor.instance = null;
    }
  }

  /**
   * Start health monitoring
   */
  public start(): void {
    if (this.checkInterval) {
      logger.warn('Health monitor already running');
      return;
    }

    logger.info('Starting health monitor');
    this.checkInterval = setInterval(() => {
      this.checkAllModels();
    }, this.config.intervalMs);

    // Initial check
    this.checkAllModels();
  }

  /**
   * Stop health monitoring
   */
  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Health monitor stopped');
    }
  }

  /**
   * Check health of all registered models
   */
  public async checkAllModels(): Promise<HealthCheckResult[]> {
    const models = this.registry.getAllModels();
    logger.debug(`Checking health of ${models.length} models`);

    const results: HealthCheckResult[] = [];

    for (const model of models) {
      try {
        const result = await this.checkModel(model.id);
        results.push(result);
      } catch (error) {
        logger.error({ error }, `Health check failed for model ${model.id}`);
      }
    }

    return results;
  }

  /**
   * Check health of a specific model
   */
  public async checkModel(modelId: string): Promise<HealthCheckResult> {
    this.emit('check:start', modelId);
    logger.debug(`Starting health check for model: ${modelId}`);

    const model = this.registry.getModel(modelId);
    if (!model) {
      const result: HealthCheckResult = {
        modelId,
        status: 'unknown',
        latencyMs: null,
        error: 'Model not found in registry',
        timestamp: new Date(),
      };
      return result;
    }

    const startTime = Date.now();
    let result: HealthCheckResult;

    try {
      // Perform actual health check (simulated for now)
      // In production, this would make a lightweight API call
      const isHealthy = await this.performHealthCheck(model);
      const latencyMs = Date.now() - startTime;

      const status = this.determineStatus(model.health, latencyMs);
      const oldStatus = model.health.status;

      result = {
        modelId,
        status,
        latencyMs,
        timestamp: new Date(),
      };

      // Update registry
      this.updateModelHealth(modelId, result);

      // Check for status changes
      if (oldStatus !== status) {
        this.emit('status:changed', modelId, oldStatus, status);
        this.handleStatusChange(modelId, oldStatus, status);
      }

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      result = {
        modelId,
        status: 'unhealthy',
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };

      this.updateModelHealth(modelId, result);
      this.emit('check:error', modelId, error instanceof Error ? error : new Error(String(error)));
    }

    // Store in history
    this.addToHistory(modelId, result);
    this.emit('check:complete', result);

    return result;
  }

  /**
   * Perform the actual health check
   */
  private async performHealthCheck(model: ModelInfo): Promise<boolean> {
    // In a real implementation, this would:
    // 1. Make a lightweight API call to the provider
    // 2. Check response time and validity
    // 3. Handle timeouts
    
    // For now, simulate based on existing health data
    const random = Math.random();
    const baseHealthiness = model.health.status === 'healthy' ? 0.95 : 0.7;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(random < baseHealthiness);
      }, Math.random() * 100 + 50); // 50-150ms simulated latency
    });
  }

  /**
   * Determine health status based on metrics
   */
  private determineStatus(currentHealth: ModelHealth, latencyMs: number): HealthStatus {
    const errorRate = currentHealth.errorRate;
    
    if (errorRate >= this.config.unhealthyThreshold) {
      return 'unhealthy';
    }
    
    if (errorRate >= this.config.degradedThreshold) {
      return 'degraded';
    }

    // Also consider latency
    if (latencyMs > this.config.timeoutMs * 0.8) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Update model health in registry
   */
  private updateModelHealth(modelId: string, result: HealthCheckResult): void {
    const model = this.registry.getModel(modelId);
    if (!model) return;

    const totalRequests = model.health.successfulRequests + model.health.failedRequests;
    const newTotalRequests = totalRequests + 1;

    const isSuccess = result.status === 'healthy';
    const newSuccessful = isSuccess 
      ? model.health.successfulRequests + 1 
      : model.health.successfulRequests;
    const newFailed = isSuccess 
      ? model.health.failedRequests 
      : model.health.failedRequests + 1;

    const newErrorRate = newTotalRequests > 0 
      ? newFailed / newTotalRequests 
      : 0;

    const newAvgResponseTime = totalRequests > 0 && result.latencyMs !== null
      ? (model.health.averageResponseTime * totalRequests + result.latencyMs) / newTotalRequests
      : result.latencyMs ?? 0;

    this.registry.updateModelHealth(modelId, {
      status: result.status,
      latencyMs: result.latencyMs,
      lastChecked: result.timestamp,
      errorRate: newErrorRate,
      successfulRequests: newSuccessful,
      failedRequests: newFailed,
      averageResponseTime: newAvgResponseTime,
    });
  }

  /**
   * Handle status changes
   */
  private handleStatusChange(modelId: string, oldStatus: HealthStatus, newStatus: HealthStatus): void {
    logger.info(`Model ${modelId} status changed: ${oldStatus} -> ${newStatus}`);

    if (newStatus === 'unhealthy') {
      this.emit('alert:unhealthy', modelId);
    } else if (newStatus === 'degraded') {
      this.emit('alert:degraded', modelId);
    } else if (oldStatus !== 'healthy' && newStatus === 'healthy') {
      this.emit('alert:recovered', modelId);
    }
  }

  /**
   * Add result to history
   */
  private addToHistory(modelId: string, result: HealthCheckResult): void {
    if (!this.healthHistory.has(modelId)) {
      this.healthHistory.set(modelId, []);
    }

    const history = this.healthHistory.get(modelId)!;
    history.push(result);

    // Trim history if needed
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Get health history for a model
   */
  public getHistory(modelId: string): HealthCheckResult[] {
    return [...(this.healthHistory.get(modelId) ?? [])];
  }

  /**
   * Get current health status for a model
   */
  public getHealth(modelId: string): ModelHealth | undefined {
    return this.registry.getModel(modelId)?.health;
  }

  /**
   * Get all unhealthy models
   */
  public getUnhealthyModels(): ModelInfo[] {
    return this.registry.queryModels({ healthStatus: 'unhealthy' });
  }

  /**
   * Get all degraded models
   */
  public getDegradedModels(): ModelInfo[] {
    return this.registry.queryModels({ healthStatus: 'degraded' });
  }

  /**
   * Get health summary
   */
  public getHealthSummary(): {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  } {
    const models = this.registry.getAllModels();
    return {
      total: models.length,
      healthy: models.filter(m => m.health.status === 'healthy').length,
      degraded: models.filter(m => m.health.status === 'degraded').length,
      unhealthy: models.filter(m => m.health.status === 'unhealthy').length,
      unknown: models.filter(m => m.health.status === 'unknown').length,
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Health monitor configuration updated');
  }

  /**
   * Get current configuration
   */
  public getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  /**
   * Clear health history
   */
  public clearHistory(): void {
    this.healthHistory.clear();
    logger.info('Health history cleared');
  }
}

// Export singleton getter
export const getHealthMonitor = (config?: Partial<HealthCheckConfig>): HealthMonitor => 
  HealthMonitor.getInstance(config);
