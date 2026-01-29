/**
 * User Tier Detector
 * Detects and classifies user tier based on configuration and API keys
 */

import type {
  UserTier,
  UserTierLevel,
  TierDetectionResult,
  TierDetectionMethod,
  TierConfiguration,
} from './types.js';
import { createUserTier, DEFAULT_TIER_FEATURES, DEFAULT_TIER_LIMITS } from './types.js';
import { modelLogger as logger } from '../models/logger.js';

// Default tier configuration
const DEFAULT_TIER_CONFIG: TierConfiguration = {
  defaultTier: 'free',
  tierPriority: ['enterprise', 'pro', 'credits', 'free'],
  allowedModels: {
    free: [
      'gemini-1.5-flash',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
    ],
    credits: [
      'gemini-1.5-pro',
      'gpt-4o-mini',
      'claude-3-haiku',
      'llama-3.1-70b-versatile',
    ],
    pro: [
      'gpt-4o',
      'claude-3-5-sonnet',
      'gemini-1.5-pro',
      'llama-3.1-405b',
    ],
    enterprise: ['*'], // All models
  },
  freeModels: [
    'gemini-1.5-flash',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma-7b-it',
  ],
};

/**
 * TierDetector - Detects user tier based on various signals
 */
export class TierDetector {
  private static instance: TierDetector | null = null;
  private config: TierConfiguration;
  private cachedTier: TierDetectionResult | null = null;
  private cacheExpiry: Date | null = null;
  private readonly cacheDurationMs = 5 * 60 * 1000; // 5 minutes

  private constructor(config?: Partial<TierConfiguration>) {
    this.config = {
      ...DEFAULT_TIER_CONFIG,
      ...config,
    };
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(config?: Partial<TierConfiguration>): TierDetector {
    if (!TierDetector.instance) {
      TierDetector.instance = new TierDetector(config);
    }
    return TierDetector.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    TierDetector.instance = null;
  }

  /**
   * Detect user tier
   */
  public async detectTier(): Promise<TierDetectionResult> {
    // Check cache
    if (this.cachedTier && this.cacheExpiry && new Date() < this.cacheExpiry) {
      logger.debug('Returning cached tier detection result');
      return this.cachedTier;
    }

    logger.info('Detecting user tier');

    // Try detection methods in order of priority
    let result = await this.detectFromEnvironment();
    if (result) {
      this.cacheResult(result);
      return result;
    }

    result = await this.detectFromApiKeys();
    if (result) {
      this.cacheResult(result);
      return result;
    }

    result = await this.detectFromConfig();
    if (result) {
      this.cacheResult(result);
      return result;
    }

    // Default to free tier
    const defaultResult: TierDetectionResult = {
      tier: createUserTier('free'),
      confidence: 1.0,
      detectionMethod: 'default',
    };

    this.cacheResult(defaultResult);
    logger.info({ tier: defaultResult.tier.level }, 'User tier detected');
    return defaultResult;
  }

  /**
   * Detect tier from environment variables
   */
  private async detectFromEnvironment(): Promise<TierDetectionResult | null> {
    const tierEnv = process.env.LUMECODE_USER_TIER;
    
    if (tierEnv && this.isValidTierLevel(tierEnv)) {
      logger.debug('Tier detected from environment variable');
      return {
        tier: createUserTier(tierEnv as UserTierLevel),
        confidence: 0.95,
        detectionMethod: 'environment_variable',
        rawData: { source: 'LUMECODE_USER_TIER', value: tierEnv },
      };
    }

    return null;
  }

  /**
   * Detect tier from API key validation
   */
  private async detectFromApiKeys(): Promise<TierDetectionResult | null> {
    const apiKeys = this.getConfiguredApiKeys();
    
    if (apiKeys.length === 0) {
      return null;
    }

    // Determine tier based on which API keys are configured
    // Enterprise: Has dedicated/custom API endpoints
    // Pro: Has OpenAI or Anthropic keys
    // Credits: Has any paid provider key
    // Free: Only free providers or no keys

    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const hasGemini = !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_API_KEY;
    const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
    const hasGroq = !!process.env.GROQ_API_KEY;

    let tier: UserTierLevel = 'free';
    let confidence = 0.7;

    if (hasOpenAI || hasAnthropic) {
      tier = 'pro';
      confidence = 0.85;
    } else if (hasOpenRouter) {
      tier = 'credits';
      confidence = 0.8;
    } else if (hasGemini || hasGroq) {
      tier = 'free';
      confidence = 0.9;
    }

    logger.debug({ tier, confidence }, 'Tier detected from API keys');

    return {
      tier: createUserTier(tier),
      confidence,
      detectionMethod: 'api_key_validation',
      rawData: {
        hasOpenAI,
        hasAnthropic,
        hasGemini,
        hasOpenRouter,
        hasGroq,
      },
    };
  }

  /**
   * Detect tier from config file
   */
  private async detectFromConfig(): Promise<TierDetectionResult | null> {
    // This would read from the config file if tier is specified there
    // For now, return null to fall through to default
    return null;
  }

  /**
   * Get list of configured API keys
   */
  private getConfiguredApiKeys(): string[] {
    const keyVars = [
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'GOOGLE_API_KEY',
      'OPENROUTER_API_KEY',
      'GROQ_API_KEY',
      'OLLAMA_API_KEY',
    ];

    return keyVars.filter(key => !!process.env[key]);
  }

  /**
   * Validate tier level string
   */
  private isValidTierLevel(value: string): boolean {
    return ['free', 'credits', 'pro', 'enterprise'].includes(value);
  }

  /**
   * Cache the detection result
   */
  private cacheResult(result: TierDetectionResult): void {
    this.cachedTier = result;
    this.cacheExpiry = new Date(Date.now() + this.cacheDurationMs);
  }

  /**
   * Clear the cache
   */
  public clearCache(): void {
    this.cachedTier = null;
    this.cacheExpiry = null;
    logger.debug('Tier detection cache cleared');
  }

  /**
   * Check if a model is accessible for a given tier
   */
  public isModelAccessible(modelId: string, tier: UserTierLevel): boolean {
    const allowedModels = this.config.allowedModels[tier];
    
    // Enterprise has access to all models
    if (allowedModels.includes('*')) {
      return true;
    }

    // Check if model is in allowed list
    return allowedModels.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(modelId);
      }
      return pattern === modelId;
    });
  }

  /**
   * Check if a model is free
   */
  public isModelFree(modelId: string): boolean {
    return this.config.freeModels.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(modelId);
      }
      return pattern === modelId;
    });
  }

  /**
   * Get allowed models for a tier
   */
  public getAllowedModels(tier: UserTierLevel): string[] {
    return [...this.config.allowedModels[tier]];
  }

  /**
   * Get free models list
   */
  public getFreeModels(): string[] {
    return [...this.config.freeModels];
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<TierConfiguration>): void {
    this.config = {
      ...this.config,
      ...config,
    };
    this.clearCache();
    logger.info('Tier detector configuration updated');
  }

  /**
   * Get current configuration
   */
  public getConfig(): TierConfiguration {
    return { ...this.config };
  }
}

// Export singleton getter
export const getTierDetector = (config?: Partial<TierConfiguration>): TierDetector => 
  TierDetector.getInstance(config);
