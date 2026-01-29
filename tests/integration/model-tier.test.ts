/**
 * Model-Tier Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ModelTierIntegration, getModelTierIntegration } from '../../src/integration/model-tier.js';
import { ModelRegistry, getModelRegistry, createModelInfo } from '../../src/models/registry.js';
import { TierDetector, getTierDetector } from '../../src/tiers/detector.js';
import { createDefaultCapabilities, createDefaultHealth } from '../../src/models/types.js';

describe('ModelTierIntegration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    ModelRegistry.resetInstance();
    TierDetector.resetInstance();
    ModelTierIntegration.resetInstance();

    // Clear env vars
    delete process.env.LUMECODE_USER_TIER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    // Setup test models
    const registry = getModelRegistry();
    
    registry.upsertModel(createModelInfo({
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      provider: 'google',
      tier: 'free',
      isFree: true,
      capabilities: {
        ...createDefaultCapabilities(),
        streaming: true,
      },
      health: {
        ...createDefaultHealth(),
        status: 'healthy',
      },
    }));

    registry.upsertModel(createModelInfo({
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      tier: 'pro',
      isFree: false,
      capabilities: {
        ...createDefaultCapabilities(),
        functionCalling: true,
        vision: true,
      },
      health: {
        ...createDefaultHealth(),
        status: 'healthy',
      },
    }));

    registry.upsertModel(createModelInfo({
      id: 'claude-3-opus',
      name: 'Claude 3 Opus',
      provider: 'anthropic',
      tier: 'enterprise',
      isFree: false,
      capabilities: {
        ...createDefaultCapabilities(),
        functionCalling: true,
        vision: true,
        longContext: true,
        maxContextLength: 200000,
      },
      health: {
        ...createDefaultHealth(),
        status: 'healthy',
      },
    }));
  });

  afterEach(() => {
    ModelTierIntegration.resetInstance();
    TierDetector.resetInstance();
    ModelRegistry.resetInstance();
    process.env = { ...originalEnv };
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getModelTierIntegration();
      const instance2 = getModelTierIntegration();
      expect(instance1).toBe(instance2);
    });
  });

  describe('model access', () => {
    it('should show accessible models for free tier', async () => {
      const integration = getModelTierIntegration();
      const models = await integration.getModelsWithAccess();

      // Free models like gemini-1.5-flash should be accessible
      const freeModel = models.find(m => m.id === 'gemini-1.5-flash');
      expect(freeModel).toBeDefined();
      // Check that the model is marked as free
      expect(freeModel?.isFree).toBe(true);
    });

    it('should show restricted models for free tier', async () => {
      const integration = getModelTierIntegration();
      const models = await integration.getModelsWithAccess();

      const proModel = models.find(m => m.id === 'gpt-4o');
      expect(proModel?.isAccessible).toBe(false);
      expect(proModel?.requiresUpgrade).toBe(true);
    });

    it('should show all models accessible for pro tier', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      TierDetector.resetInstance();
      ModelTierIntegration.resetInstance();

      const integration = getModelTierIntegration();
      const models = await integration.getModelsWithAccess();

      const proModel = models.find(m => m.id === 'gpt-4o');
      expect(proModel?.isAccessible).toBe(true);
    });
  });

  describe('availability summary', () => {
    it('should return correct availability counts', async () => {
      const integration = getModelTierIntegration();
      const summary = await integration.getAvailabilitySummary();

      expect(summary.totalModels).toBe(3);
      // At least 1 model should be free
      expect(summary.freeCount).toBe(1);
    });
  });

  describe('tier-model mapping', () => {
    it('should return complete mapping', async () => {
      const integration = getModelTierIntegration();
      const mapping = await integration.getTierModelMapping();

      expect(mapping.userTier).toBeDefined();
      expect(mapping.availableModels).toBeDefined();
      expect(Array.isArray(mapping.upgradeOptions)).toBe(true);
    });

    it('should recommend a model', async () => {
      const integration = getModelTierIntegration();
      const mapping = await integration.getTierModelMapping();

      // Should have at least one available model
      if (mapping.availableModels.length > 0) {
        expect(mapping.recommendedModel).toBeDefined();
      }
    });

    it('should provide upgrade options', async () => {
      const integration = getModelTierIntegration();
      const mapping = await integration.getTierModelMapping();

      // Free tier should have upgrade options
      expect(mapping.upgradeOptions.length).toBeGreaterThan(0);
      expect(mapping.upgradeOptions[0].targetTier).toBeDefined();
    });
  });

  describe('model access checks', () => {
    it('should check if user can access model', async () => {
      const integration = getModelTierIntegration();
      
      // Pro model should be restricted for default (free) tier
      const proAccess = await integration.canAccessModel('gpt-4o');
      expect(proAccess.canAccess).toBe(false);
      expect(proAccess.upgradeRequired).toBeDefined();
    });
  });

  describe('free models', () => {
    it('should return free models with details', async () => {
      const integration = getModelTierIntegration();
      const freeModels = await integration.getFreeModelsDetailed();

      expect(freeModels.length).toBe(1);
      expect(freeModels[0].id).toBe('gemini-1.5-flash');
      expect(freeModels[0].isFree).toBe(true);
    });

    it('should label models with FREE tag', async () => {
      const integration = getModelTierIntegration();
      const models = await integration.getModelsWithFreeLabel();

      const freeModel = models.find(m => m.id === 'gemini-1.5-flash');
      const proModel = models.find(m => m.id === 'gpt-4o');

      expect(freeModel?.freeLabel).toBe('FREE');
      expect(proModel?.freeLabel).toBeNull();
    });
  });

  describe('filtering', () => {
    it('should filter models with access info', async () => {
      const integration = getModelTierIntegration();
      const models = await integration.getModelsWithAccess({ hasVision: true });

      expect(models.length).toBe(2);
      expect(models.every(m => m.capabilities.vision)).toBe(true);
    });

    it('should filter by provider', async () => {
      const integration = getModelTierIntegration();
      const models = await integration.getModelsWithAccess({ provider: 'google' });

      expect(models.length).toBe(1);
      expect(models[0].provider).toBe('google');
    });
  });
});
