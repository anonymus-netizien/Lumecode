/**
 * Model-Tier Integration Layer
 * Combines user tier information with model availability
 */

import type { ModelInfo, ModelTier, ModelQueryFilters } from '../models/types.js';
import type { UserTier, UserTierLevel, TierDetectionResult } from '../tiers/types.js';
import { getModelRegistry, type ModelRegistry } from '../models/registry.js';
import { getTierDetector, type TierDetector } from '../tiers/detector.js';
import { modelLogger as logger } from '../models/logger.js';

// Model with tier access information
export interface ModelWithAccess extends ModelInfo {
  isAccessible: boolean;
  accessReason?: string;
  requiresUpgrade: boolean;
  requiredTier?: UserTierLevel;
}

// Model availability summary
export interface ModelAvailabilitySummary {
  accessible: ModelWithAccess[];
  restricted: ModelWithAccess[];
  totalModels: number;
  accessibleCount: number;
  restrictedCount: number;
  freeCount: number;
}

// Tier-model mapping result
export interface TierModelMapping {
  userTier: UserTier;
  availableModels: ModelWithAccess[];
  recommendedModel?: ModelWithAccess;
  upgradeOptions: UpgradeOption[];
}

// Upgrade option
export interface UpgradeOption {
  targetTier: UserTierLevel;
  additionalModels: number;
  features: string[];
}

/**
 * ModelTierIntegration - Combines tier info with model availability
 */
export class ModelTierIntegration {
  private static instance: ModelTierIntegration | null = null;
  private registry: ModelRegistry;
  private tierDetector: TierDetector;

  private constructor() {
    this.registry = getModelRegistry();
    this.tierDetector = getTierDetector();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): ModelTierIntegration {
    if (!ModelTierIntegration.instance) {
      ModelTierIntegration.instance = new ModelTierIntegration();
    }
    return ModelTierIntegration.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    ModelTierIntegration.instance = null;
  }

  /**
   * Get models with access information for current user
   */
  public async getModelsWithAccess(filters?: ModelQueryFilters): Promise<ModelWithAccess[]> {
    const tierResult = await this.tierDetector.detectTier();
    const userTier = tierResult.tier.level;
    
    let models = filters 
      ? this.registry.queryModels(filters)
      : this.registry.getAllModels();

    return models.map(model => this.enrichModelWithAccess(model, userTier));
  }

  /**
   * Enrich a model with access information
   */
  private enrichModelWithAccess(model: ModelInfo, userTier: UserTierLevel): ModelWithAccess {
    const isAccessible = this.tierDetector.isModelAccessible(model.id, userTier);
    const isFree = this.tierDetector.isModelFree(model.id);

    let accessReason: string | undefined;
    let requiresUpgrade = false;
    let requiredTier: UserTierLevel | undefined;

    if (!isAccessible) {
      requiresUpgrade = true;
      requiredTier = this.getRequiredTierForModel(model.id);
      accessReason = `Requires ${requiredTier} tier or higher`;
    } else if (isFree) {
      accessReason = 'Free model - available to all users';
    } else {
      accessReason = `Available with ${userTier} tier`;
    }

    return {
      ...model,
      isAccessible,
      accessReason,
      requiresUpgrade,
      requiredTier,
    };
  }

  /**
   * Get the required tier for a model
   */
  private getRequiredTierForModel(modelId: string): UserTierLevel {
    const tierOrder: UserTierLevel[] = ['free', 'credits', 'pro', 'enterprise'];
    
    for (const tier of tierOrder) {
      if (this.tierDetector.isModelAccessible(modelId, tier)) {
        return tier;
      }
    }

    return 'enterprise';
  }

  /**
   * Get model availability summary
   */
  public async getAvailabilitySummary(): Promise<ModelAvailabilitySummary> {
    const modelsWithAccess = await this.getModelsWithAccess();
    
    const accessible = modelsWithAccess.filter(m => m.isAccessible);
    const restricted = modelsWithAccess.filter(m => !m.isAccessible);
    const free = modelsWithAccess.filter(m => m.isFree);

    return {
      accessible,
      restricted,
      totalModels: modelsWithAccess.length,
      accessibleCount: accessible.length,
      restrictedCount: restricted.length,
      freeCount: free.length,
    };
  }

  /**
   * Get complete tier-model mapping
   */
  public async getTierModelMapping(): Promise<TierModelMapping> {
    const tierResult = await this.tierDetector.detectTier();
    const modelsWithAccess = await this.getModelsWithAccess();
    
    const availableModels = modelsWithAccess.filter(m => m.isAccessible);
    const recommendedModel = this.selectRecommendedModel(availableModels);
    const upgradeOptions = this.calculateUpgradeOptions(tierResult.tier.level, modelsWithAccess);

    return {
      userTier: tierResult.tier,
      availableModels,
      recommendedModel,
      upgradeOptions,
    };
  }

  /**
   * Select the recommended model for the user
   */
  private selectRecommendedModel(availableModels: ModelWithAccess[]): ModelWithAccess | undefined {
    if (availableModels.length === 0) return undefined;

    // Prefer healthy models
    const healthyModels = availableModels.filter(m => m.health.status === 'healthy');
    const candidates = healthyModels.length > 0 ? healthyModels : availableModels;

    // Sort by capabilities and select best
    return candidates.sort((a, b) => {
      // Prefer models with more capabilities
      const aScore = this.calculateModelScore(a);
      const bScore = this.calculateModelScore(b);
      return bScore - aScore;
    })[0];
  }

  /**
   * Calculate a score for model selection
   */
  private calculateModelScore(model: ModelWithAccess): number {
    let score = 0;

    // Health bonus
    if (model.health.status === 'healthy') score += 100;
    else if (model.health.status === 'degraded') score += 50;

    // Capability bonuses
    if (model.capabilities.streaming) score += 20;
    if (model.capabilities.functionCalling) score += 30;
    if (model.capabilities.vision) score += 25;
    if (model.capabilities.codeGeneration) score += 20;
    if (model.capabilities.longContext) score += 15;

    // Context length bonus (normalized)
    score += Math.min(model.capabilities.maxContextLength / 10000, 50);

    // Free model bonus for accessibility
    if (model.isFree) score += 10;

    return score;
  }

  /**
   * Calculate upgrade options
   */
  private calculateUpgradeOptions(
    currentTier: UserTierLevel,
    allModels: ModelWithAccess[]
  ): UpgradeOption[] {
    const tierOrder: UserTierLevel[] = ['free', 'credits', 'pro', 'enterprise'];
    const currentIndex = tierOrder.indexOf(currentTier);
    const options: UpgradeOption[] = [];

    for (let i = currentIndex + 1; i < tierOrder.length; i++) {
      const targetTier = tierOrder[i];
      const additionalModels = allModels.filter(
        m => !m.isAccessible && this.tierDetector.isModelAccessible(m.id, targetTier)
      ).length;

      const features = this.getTierUpgradeFeatures(currentTier, targetTier);

      if (additionalModels > 0 || features.length > 0) {
        options.push({
          targetTier,
          additionalModels,
          features,
        });
      }
    }

    return options;
  }

  /**
   * Get features gained by upgrading tiers
   */
  private getTierUpgradeFeatures(from: UserTierLevel, to: UserTierLevel): string[] {
    const features: string[] = [];

    if (from === 'free') {
      if (to === 'credits' || to === 'pro' || to === 'enterprise') {
        features.push('Access to premium models');
        features.push('Higher rate limits');
      }
    }

    if (from === 'free' || from === 'credits') {
      if (to === 'pro' || to === 'enterprise') {
        features.push('Function calling support');
        features.push('Priority support');
        features.push('API access');
      }
    }

    if (to === 'enterprise') {
      features.push('Unlimited model access');
      features.push('Dedicated support');
      features.push('Custom integrations');
    }

    return features;
  }

  /**
   * Check if user can access a specific model
   */
  public async canAccessModel(modelId: string): Promise<{
    canAccess: boolean;
    reason: string;
    upgradeRequired?: UserTierLevel;
  }> {
    const tierResult = await this.tierDetector.detectTier();
    const userTier = tierResult.tier.level;
    const canAccess = this.tierDetector.isModelAccessible(modelId, userTier);

    if (canAccess) {
      return {
        canAccess: true,
        reason: `Model ${modelId} is accessible with ${userTier} tier`,
      };
    }

    const requiredTier = this.getRequiredTierForModel(modelId);
    return {
      canAccess: false,
      reason: `Model ${modelId} requires ${requiredTier} tier`,
      upgradeRequired: requiredTier,
    };
  }

  /**
   * Get free models with full details
   */
  public async getFreeModelsDetailed(): Promise<ModelWithAccess[]> {
    const allModels = await this.getModelsWithAccess();
    return allModels.filter(m => m.isFree);
  }

  /**
   * Label models with FREE tag
   */
  public async getModelsWithFreeLabel(): Promise<Array<ModelInfo & { freeLabel: string | null }>> {
    const models = this.registry.getAllModels();
    return models.map(model => ({
      ...model,
      freeLabel: this.tierDetector.isModelFree(model.id) ? 'FREE' : null,
    }));
  }
}

// Export singleton getter
export const getModelTierIntegration = (): ModelTierIntegration => 
  ModelTierIntegration.getInstance();
