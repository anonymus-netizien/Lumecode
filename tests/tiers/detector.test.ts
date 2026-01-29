/**
 * Tier Detector Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TierDetector, getTierDetector } from '../../src/tiers/detector.js';
import { createUserTier } from '../../src/tiers/types.js';

describe('TierDetector', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    TierDetector.resetInstance();
    // Clear relevant env vars
    delete process.env.LUMECODE_USER_TIER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    TierDetector.resetInstance();
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getTierDetector();
      const instance2 = getTierDetector();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance correctly', () => {
      const instance1 = getTierDetector();
      TierDetector.resetInstance();
      const instance2 = getTierDetector();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('tier detection', () => {
    it('should detect tier from environment variable', async () => {
      process.env.LUMECODE_USER_TIER = 'pro';
      
      const detector = getTierDetector();
      const result = await detector.detectTier();

      expect(result.tier.level).toBe('pro');
      expect(result.detectionMethod).toBe('environment_variable');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should detect pro tier with OpenAI key', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      
      const detector = getTierDetector();
      const result = await detector.detectTier();

      expect(result.tier.level).toBe('pro');
      expect(result.detectionMethod).toBe('api_key_validation');
    });

    it('should detect pro tier with Anthropic key', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      
      const detector = getTierDetector();
      const result = await detector.detectTier();

      expect(result.tier.level).toBe('pro');
      expect(result.detectionMethod).toBe('api_key_validation');
    });

    it('should detect credits tier with OpenRouter key', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-test-key';
      
      const detector = getTierDetector();
      const result = await detector.detectTier();

      expect(result.tier.level).toBe('credits');
      expect(result.detectionMethod).toBe('api_key_validation');
    });

    it('should detect free tier with Gemini key only', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key';
      
      const detector = getTierDetector();
      const result = await detector.detectTier();

      expect(result.tier.level).toBe('free');
      expect(result.detectionMethod).toBe('api_key_validation');
    });

    it('should default to free tier when no keys', async () => {
      const detector = getTierDetector();
      const result = await detector.detectTier();

      expect(result.tier.level).toBe('free');
      expect(result.detectionMethod).toBe('default');
      expect(result.confidence).toBe(1.0);
    });

    it('should cache detection results', async () => {
      const detector = getTierDetector();
      
      const result1 = await detector.detectTier();
      const result2 = await detector.detectTier();

      // Should be the same cached result
      expect(result1).toEqual(result2);
    });

    it('should clear cache when requested', async () => {
      const detector = getTierDetector();
      
      await detector.detectTier();
      detector.clearCache();
      
      // After clearing, should detect again
      const result = await detector.detectTier();
      expect(result).toBeDefined();
    });
  });

  describe('model access', () => {
    it('should allow free models for free tier', () => {
      const detector = getTierDetector();
      
      expect(detector.isModelAccessible('gemini-1.5-flash', 'free')).toBe(true);
      expect(detector.isModelAccessible('llama-3.1-8b-instant', 'free')).toBe(true);
    });

    it('should restrict premium models for free tier', () => {
      const detector = getTierDetector();
      
      expect(detector.isModelAccessible('gpt-4o', 'free')).toBe(false);
      expect(detector.isModelAccessible('claude-3-5-sonnet', 'free')).toBe(false);
    });

    it('should allow premium models for pro tier', () => {
      const detector = getTierDetector();
      
      expect(detector.isModelAccessible('gpt-4o', 'pro')).toBe(true);
      expect(detector.isModelAccessible('claude-3-5-sonnet', 'pro')).toBe(true);
    });

    it('should allow all models for enterprise tier', () => {
      const detector = getTierDetector();
      
      expect(detector.isModelAccessible('gpt-4o', 'enterprise')).toBe(true);
      expect(detector.isModelAccessible('any-model-name', 'enterprise')).toBe(true);
    });
  });

  describe('free model detection', () => {
    it('should identify free models correctly', () => {
      const detector = getTierDetector();
      
      expect(detector.isModelFree('gemini-1.5-flash')).toBe(true);
      expect(detector.isModelFree('llama-3.1-8b-instant')).toBe(true);
      expect(detector.isModelFree('mixtral-8x7b-32768')).toBe(true);
    });

    it('should identify paid models correctly', () => {
      const detector = getTierDetector();
      
      expect(detector.isModelFree('gpt-4o')).toBe(false);
      expect(detector.isModelFree('claude-3-opus')).toBe(false);
    });

    it('should return list of free models', () => {
      const detector = getTierDetector();
      const freeModels = detector.getFreeModels();
      
      expect(freeModels.length).toBeGreaterThan(0);
      expect(freeModels).toContain('gemini-1.5-flash');
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      const detector = getTierDetector();
      
      detector.updateConfig({
        freeModels: ['custom-free-model'],
      });

      const config = detector.getConfig();
      expect(config.freeModels).toContain('custom-free-model');
    });

    it('should return allowed models for tier', () => {
      const detector = getTierDetector();
      
      const freeAllowed = detector.getAllowedModels('free');
      const proAllowed = detector.getAllowedModels('pro');
      const enterpriseAllowed = detector.getAllowedModels('enterprise');

      expect(freeAllowed.length).toBeGreaterThan(0);
      expect(proAllowed.length).toBeGreaterThan(0);
      expect(enterpriseAllowed).toContain('*');
    });
  });
});

describe('createUserTier', () => {
  it('should create free tier with correct defaults', () => {
    const tier = createUserTier('free');
    
    expect(tier.level).toBe('free');
    expect(tier.displayName).toBe('Free');
    expect(tier.features.maxModelsAccess).toBe(5);
    expect(tier.features.canAccessPremiumModels).toBe(false);
    expect(tier.limits.requestsPerMinute).toBe(10);
  });

  it('should create pro tier with correct defaults', () => {
    const tier = createUserTier('pro');
    
    expect(tier.level).toBe('pro');
    expect(tier.displayName).toBe('Pro');
    expect(tier.features.maxModelsAccess).toBe(50);
    expect(tier.features.canAccessPremiumModels).toBe(true);
    expect(tier.features.prioritySupport).toBe(true);
    expect(tier.limits.requestsPerMinute).toBe(60);
  });

  it('should create enterprise tier with unlimited access', () => {
    const tier = createUserTier('enterprise');
    
    expect(tier.level).toBe('enterprise');
    expect(tier.features.maxModelsAccess).toBe(-1);
    expect(tier.limits.requestsPerMinute).toBe(120);
  });

  it('should set detectedAt timestamp', () => {
    const before = new Date();
    const tier = createUserTier('free');
    const after = new Date();
    
    expect(tier.detectedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(tier.detectedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
