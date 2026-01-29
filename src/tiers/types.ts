/**
 * User Tier Types
 * Defines interfaces for user classification and tier detection
 */

import { z } from 'zod';
import type { ModelTier } from '../models/types.js';

// User tier levels
export type UserTierLevel = 'free' | 'credits' | 'pro' | 'enterprise';

// User tier information
export interface UserTier {
  level: UserTierLevel;
  displayName: string;
  description: string;
  features: TierFeatures;
  limits: TierLimits;
  detectedAt: Date;
  expiresAt?: Date;
}

// Features available per tier
export interface TierFeatures {
  maxModelsAccess: number;
  canAccessPremiumModels: boolean;
  canAccessVisionModels: boolean;
  canUseFunctionCalling: boolean;
  prioritySupport: boolean;
  customModelConfig: boolean;
  apiAccess: boolean;
  webhooks: boolean;
}

// Rate limits per tier
export interface TierLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  tokensPerRequest: number;
  tokensPerDay: number;
  concurrentSessions: number;
  maxSessionDuration: number; // in minutes
}

// Tier detection result
export interface TierDetectionResult {
  tier: UserTier;
  confidence: number;
  detectionMethod: TierDetectionMethod;
  rawData?: Record<string, unknown>;
}

// Methods for detecting user tier
export type TierDetectionMethod = 
  | 'api_key_validation'
  | 'config_file'
  | 'environment_variable'
  | 'default';

// Tier configuration
export interface TierConfiguration {
  defaultTier: UserTierLevel;
  tierPriority: UserTierLevel[];
  allowedModels: Record<UserTierLevel, string[]>;
  freeModels: string[];
}

// Zod schemas
export const UserTierLevelSchema = z.enum(['free', 'credits', 'pro', 'enterprise']);

export const TierFeaturesSchema = z.object({
  maxModelsAccess: z.number(),
  canAccessPremiumModels: z.boolean(),
  canAccessVisionModels: z.boolean(),
  canUseFunctionCalling: z.boolean(),
  prioritySupport: z.boolean(),
  customModelConfig: z.boolean(),
  apiAccess: z.boolean(),
  webhooks: z.boolean(),
});

export const TierLimitsSchema = z.object({
  requestsPerMinute: z.number(),
  requestsPerHour: z.number(),
  requestsPerDay: z.number(),
  tokensPerRequest: z.number(),
  tokensPerDay: z.number(),
  concurrentSessions: z.number(),
  maxSessionDuration: z.number(),
});

export const UserTierSchema = z.object({
  level: UserTierLevelSchema,
  displayName: z.string(),
  description: z.string(),
  features: TierFeaturesSchema,
  limits: TierLimitsSchema,
  detectedAt: z.date(),
  expiresAt: z.date().optional(),
});

// Default tier configurations
export const DEFAULT_TIER_FEATURES: Record<UserTierLevel, TierFeatures> = {
  free: {
    maxModelsAccess: 5,
    canAccessPremiumModels: false,
    canAccessVisionModels: false,
    canUseFunctionCalling: false,
    prioritySupport: false,
    customModelConfig: false,
    apiAccess: false,
    webhooks: false,
  },
  credits: {
    maxModelsAccess: 15,
    canAccessPremiumModels: true,
    canAccessVisionModels: true,
    canUseFunctionCalling: false,
    prioritySupport: false,
    customModelConfig: true,
    apiAccess: false,
    webhooks: false,
  },
  pro: {
    maxModelsAccess: 50,
    canAccessPremiumModels: true,
    canAccessVisionModels: true,
    canUseFunctionCalling: true,
    prioritySupport: true,
    customModelConfig: true,
    apiAccess: true,
    webhooks: true,
  },
  enterprise: {
    maxModelsAccess: -1, // unlimited
    canAccessPremiumModels: true,
    canAccessVisionModels: true,
    canUseFunctionCalling: true,
    prioritySupport: true,
    customModelConfig: true,
    apiAccess: true,
    webhooks: true,
  },
};

export const DEFAULT_TIER_LIMITS: Record<UserTierLevel, TierLimits> = {
  free: {
    requestsPerMinute: 10,
    requestsPerHour: 100,
    requestsPerDay: 500,
    tokensPerRequest: 4096,
    tokensPerDay: 50000,
    concurrentSessions: 1,
    maxSessionDuration: 30,
  },
  credits: {
    requestsPerMinute: 30,
    requestsPerHour: 500,
    requestsPerDay: 2000,
    tokensPerRequest: 8192,
    tokensPerDay: 200000,
    concurrentSessions: 3,
    maxSessionDuration: 120,
  },
  pro: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 10000,
    tokensPerRequest: 32768,
    tokensPerDay: 1000000,
    concurrentSessions: 10,
    maxSessionDuration: 480,
  },
  enterprise: {
    requestsPerMinute: 120,
    requestsPerHour: 5000,
    requestsPerDay: 50000,
    tokensPerRequest: 128000,
    tokensPerDay: 10000000,
    concurrentSessions: 50,
    maxSessionDuration: 1440,
  },
};

// Helper to create a user tier
export const createUserTier = (level: UserTierLevel): UserTier => ({
  level,
  displayName: level.charAt(0).toUpperCase() + level.slice(1),
  description: getTierDescription(level),
  features: DEFAULT_TIER_FEATURES[level],
  limits: DEFAULT_TIER_LIMITS[level],
  detectedAt: new Date(),
});

const getTierDescription = (level: UserTierLevel): string => {
  switch (level) {
    case 'free':
      return 'Basic access with limited models and rate limits';
    case 'credits':
      return 'Pay-as-you-go access with premium model availability';
    case 'pro':
      return 'Professional tier with full feature access and priority support';
    case 'enterprise':
      return 'Enterprise tier with unlimited access and dedicated support';
  }
};
