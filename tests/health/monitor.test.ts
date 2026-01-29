/**
 * Health Monitor Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { HealthMonitor, getHealthMonitor } from '../../src/health/monitor.js';
import { ModelRegistry, getModelRegistry, createModelInfo } from '../../src/models/registry.js';

describe('HealthMonitor', () => {
  beforeEach(() => {
    ModelRegistry.resetInstance();
    HealthMonitor.resetInstance();
    
    // Setup some test models
    const registry = getModelRegistry();
    registry.upsertModel(createModelInfo({
      id: 'test-model-1',
      name: 'Test Model 1',
      provider: 'test-provider',
    }));
    registry.upsertModel(createModelInfo({
      id: 'test-model-2',
      name: 'Test Model 2',
      provider: 'test-provider',
    }));
  });

  afterEach(() => {
    HealthMonitor.resetInstance();
    ModelRegistry.resetInstance();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getHealthMonitor();
      const instance2 = getHealthMonitor();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance correctly', () => {
      const instance1 = getHealthMonitor();
      HealthMonitor.resetInstance();
      const instance2 = getHealthMonitor();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('health checks', () => {
    it('should check model health', async () => {
      const monitor = getHealthMonitor();
      const result = await monitor.checkModel('test-model-1');

      expect(result).toBeDefined();
      expect(result.modelId).toBe('test-model-1');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(result.status);
    });

    it('should return unknown for non-existent model', async () => {
      const monitor = getHealthMonitor();
      const result = await monitor.checkModel('non-existent');

      expect(result.status).toBe('unknown');
      expect(result.error).toBe('Model not found in registry');
    });

    it('should check all models', async () => {
      const monitor = getHealthMonitor();
      const results = await monitor.checkAllModels();

      expect(results.length).toBe(2);
      expect(results.every(r => r.modelId)).toBe(true);
    });

    it('should track health history', async () => {
      const monitor = getHealthMonitor();
      
      await monitor.checkModel('test-model-1');
      await monitor.checkModel('test-model-1');
      await monitor.checkModel('test-model-1');

      const history = monitor.getHistory('test-model-1');
      expect(history.length).toBe(3);
    });
  });

  describe('health retrieval', () => {
    it('should get model health', async () => {
      const monitor = getHealthMonitor();
      await monitor.checkModel('test-model-1');

      const health = monitor.getHealth('test-model-1');
      expect(health).toBeDefined();
      expect(health?.lastChecked).toBeInstanceOf(Date);
    });

    it('should return undefined for non-existent model health', () => {
      const monitor = getHealthMonitor();
      const health = monitor.getHealth('non-existent');
      expect(health).toBeUndefined();
    });

    it('should get health summary', async () => {
      const monitor = getHealthMonitor();
      await monitor.checkAllModels();

      const summary = monitor.getHealthSummary();
      
      expect(summary.total).toBe(2);
      expect(summary.healthy + summary.degraded + summary.unhealthy + summary.unknown).toBe(2);
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      const monitor = getHealthMonitor();
      
      monitor.updateConfig({
        intervalMs: 30000,
        timeoutMs: 5000,
      });

      const config = monitor.getConfig();
      expect(config.intervalMs).toBe(30000);
      expect(config.timeoutMs).toBe(5000);
    });

    it('should return default configuration', () => {
      const monitor = getHealthMonitor();
      const config = monitor.getConfig();

      expect(config.intervalMs).toBe(60000);
      expect(config.timeoutMs).toBe(10000);
      expect(config.unhealthyThreshold).toBe(0.5);
      expect(config.degradedThreshold).toBe(0.2);
    });
  });

  describe('history management', () => {
    it('should clear history', async () => {
      const monitor = getHealthMonitor();
      
      await monitor.checkModel('test-model-1');
      expect(monitor.getHistory('test-model-1').length).toBe(1);

      monitor.clearHistory();
      expect(monitor.getHistory('test-model-1').length).toBe(0);
    });
  });

  describe('filtering', () => {
    it('should get unhealthy models', async () => {
      const monitor = getHealthMonitor();
      const unhealthy = monitor.getUnhealthyModels();
      
      // Initially no unhealthy models
      expect(Array.isArray(unhealthy)).toBe(true);
    });

    it('should get degraded models', async () => {
      const monitor = getHealthMonitor();
      const degraded = monitor.getDegradedModels();
      
      expect(Array.isArray(degraded)).toBe(true);
    });
  });
});
