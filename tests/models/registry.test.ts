/**
 * Model Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ModelRegistry, getModelRegistry, createModelInfo } from '../../src/models/registry.js';
import type { ModelInfo, ProviderModelResponse } from '../../src/models/types.js';
import { createDefaultHealth, createDefaultCapabilities } from '../../src/models/types.js';

describe('ModelRegistry', () => {
  beforeEach(() => {
    ModelRegistry.resetInstance();
  });

  afterEach(() => {
    ModelRegistry.resetInstance();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getModelRegistry();
      const instance2 = getModelRegistry();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance correctly', () => {
      const instance1 = getModelRegistry();
      ModelRegistry.resetInstance();
      const instance2 = getModelRegistry();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('model operations', () => {
    it('should add a model', () => {
      const registry = getModelRegistry();
      const model = createModelInfo({
        id: 'test-model',
        name: 'Test Model',
        provider: 'test-provider',
      });

      registry.upsertModel(model);

      expect(registry.size).toBe(1);
      expect(registry.has('test-model')).toBe(true);
    });

    it('should get a model by ID', () => {
      const registry = getModelRegistry();
      const model = createModelInfo({
        id: 'test-model',
        name: 'Test Model',
        provider: 'test-provider',
      });

      registry.upsertModel(model);
      const retrieved = registry.getModel('test-model');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-model');
      expect(retrieved?.name).toBe('Test Model');
    });

    it('should return undefined for non-existent model', () => {
      const registry = getModelRegistry();
      const model = registry.getModel('non-existent');
      expect(model).toBeUndefined();
    });

    it('should remove a model', () => {
      const registry = getModelRegistry();
      const model = createModelInfo({
        id: 'test-model',
        name: 'Test Model',
        provider: 'test-provider',
      });

      registry.upsertModel(model);
      expect(registry.size).toBe(1);

      const removed = registry.removeModel('test-model');
      expect(removed).toBe(true);
      expect(registry.size).toBe(0);
    });

    it('should get all models', () => {
      const registry = getModelRegistry();
      
      registry.upsertModel(createModelInfo({
        id: 'model-1',
        name: 'Model 1',
        provider: 'provider-a',
      }));
      
      registry.upsertModel(createModelInfo({
        id: 'model-2',
        name: 'Model 2',
        provider: 'provider-b',
      }));

      const models = registry.getAllModels();
      expect(models.length).toBe(2);
    });
  });

  describe('query operations', () => {
    beforeEach(() => {
      const registry = getModelRegistry();
      
      registry.upsertModel(createModelInfo({
        id: 'gemini-pro',
        name: 'Gemini Pro',
        provider: 'google',
        tier: 'free',
        isFree: true,
        capabilities: {
          ...createDefaultCapabilities(),
          vision: true,
          maxContextLength: 32000,
        },
      }));

      registry.upsertModel(createModelInfo({
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'openai',
        tier: 'pro',
        isFree: false,
        capabilities: {
          ...createDefaultCapabilities(),
          functionCalling: true,
          maxContextLength: 128000,
        },
      }));

      registry.upsertModel(createModelInfo({
        id: 'claude-3',
        name: 'Claude 3',
        provider: 'anthropic',
        tier: 'credits',
        isFree: false,
        capabilities: {
          ...createDefaultCapabilities(),
          vision: true,
          functionCalling: true,
          maxContextLength: 200000,
        },
      }));
    });

    it('should filter by provider', () => {
      const registry = getModelRegistry();
      const models = registry.queryModels({ provider: 'google' });
      
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('gemini-pro');
    });

    it('should filter by tier', () => {
      const registry = getModelRegistry();
      const models = registry.queryModels({ tier: 'pro' });
      
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('gpt-4');
    });

    it('should filter by free status', () => {
      const registry = getModelRegistry();
      const freeModels = registry.getFreeModels();
      
      expect(freeModels.length).toBe(1);
      expect(freeModels[0].id).toBe('gemini-pro');
    });

    it('should filter by vision capability', () => {
      const registry = getModelRegistry();
      const models = registry.queryModels({ hasVision: true });
      
      expect(models.length).toBe(2);
      expect(models.map(m => m.id)).toContain('gemini-pro');
      expect(models.map(m => m.id)).toContain('claude-3');
    });

    it('should filter by function calling capability', () => {
      const registry = getModelRegistry();
      const models = registry.queryModels({ hasFunctionCalling: true });
      
      expect(models.length).toBe(2);
    });

    it('should filter by minimum context length', () => {
      const registry = getModelRegistry();
      const models = registry.queryModels({ minContextLength: 100000 });
      
      expect(models.length).toBe(2);
      expect(models.map(m => m.id)).toContain('gpt-4');
      expect(models.map(m => m.id)).toContain('claude-3');
    });

    it('should combine multiple filters', () => {
      const registry = getModelRegistry();
      const models = registry.queryModels({
        hasVision: true,
        hasFunctionCalling: true,
      });
      
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('claude-3');
    });
  });

  describe('health updates', () => {
    it('should update model health', () => {
      const registry = getModelRegistry();
      
      registry.upsertModel(createModelInfo({
        id: 'test-model',
        name: 'Test Model',
        provider: 'test',
      }));

      registry.updateModelHealth('test-model', {
        status: 'healthy',
        latencyMs: 150,
        errorRate: 0.01,
      });

      const model = registry.getModel('test-model');
      expect(model?.health.status).toBe('healthy');
      expect(model?.health.latencyMs).toBe(150);
      expect(model?.health.errorRate).toBe(0.01);
    });
  });

  describe('provider registration', () => {
    it('should register provider models', () => {
      const registry = getModelRegistry();
      
      const response: ProviderModelResponse = {
        provider: 'test-provider',
        syncedAt: new Date(),
        models: [
          createModelInfo({ id: 'model-1', name: 'Model 1', provider: 'test-provider' }),
          createModelInfo({ id: 'model-2', name: 'Model 2', provider: 'test-provider' }),
        ],
      };

      registry.registerProviderModels(response);

      expect(registry.size).toBe(2);
      expect(registry.getModelsByProvider('test-provider').length).toBe(2);
    });
  });
});

describe('createModelInfo', () => {
  beforeEach(() => {
    ModelRegistry.resetInstance();
  });

  afterEach(() => {
    ModelRegistry.resetInstance();
  });

  it('should create model with defaults', () => {
    const model = createModelInfo({
      id: 'test-id',
      name: 'Test Name',
      provider: 'test-provider',
    });

    expect(model.id).toBe('test-id');
    expect(model.name).toBe('Test Name');
    expect(model.provider).toBe('test-provider');
    expect(model.tier).toBe('free');
    expect(model.isFree).toBe(true);
    expect(model.tags).toEqual([]);
    expect(model.capabilities).toBeDefined();
    expect(model.health).toBeDefined();
    expect(model.createdAt).toBeInstanceOf(Date);
    expect(model.updatedAt).toBeInstanceOf(Date);
  });

  it('should allow overriding defaults', () => {
    const model = createModelInfo({
      id: 'test-id',
      name: 'Test Name',
      provider: 'test-provider',
      tier: 'pro',
      isFree: false,
      tags: ['advanced', 'vision'],
    });

    expect(model.tier).toBe('pro');
    expect(model.isFree).toBe(false);
    expect(model.tags).toEqual(['advanced', 'vision']);
  });
});
