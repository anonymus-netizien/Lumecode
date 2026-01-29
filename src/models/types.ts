/**
 * Model Management Types
 * Defines interfaces for AI model inventory, capabilities, and health monitoring
 */

import { z } from 'zod';

// Model tier classification
export type ModelTier = 'free' | 'credits' | 'pro' | 'enterprise';

// Model capability flags
export interface ModelCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  codeGeneration: boolean;
  longContext: boolean;
  maxContextLength: number;
  maxOutputTokens: number;
}

// Health status for a model
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

// Model health information
export interface ModelHealth {
  status: HealthStatus;
  latencyMs: number | null;
  lastChecked: Date;
  errorRate: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
}

// Core model information
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  tier: ModelTier;
  isFree: boolean;
  capabilities: ModelCapabilities;
  health: ModelHealth;
  description?: string;
  contextWindow?: number;
  pricing?: {
    inputPer1kTokens: number;
    outputPer1kTokens: number;
  };
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Model query filters
export interface ModelQueryFilters {
  provider?: string;
  tier?: ModelTier;
  isFree?: boolean;
  hasVision?: boolean;
  hasStreaming?: boolean;
  hasFunctionCalling?: boolean;
  minContextLength?: number;
  healthStatus?: HealthStatus;
}

// Model registry state
export interface ModelRegistryState {
  models: Map<string, ModelInfo>;
  lastSync: Date | null;
  syncInProgress: boolean;
  errors: ModelSyncError[];
}

// Sync error information
export interface ModelSyncError {
  provider: string;
  error: string;
  timestamp: Date;
  retryCount: number;
}

// Provider model response
export interface ProviderModelResponse {
  models: ModelInfo[];
  provider: string;
  syncedAt: Date;
}

// Zod schemas for validation
export const ModelTierSchema = z.enum(['free', 'credits', 'pro', 'enterprise']);

export const ModelCapabilitiesSchema = z.object({
  streaming: z.boolean(),
  functionCalling: z.boolean(),
  vision: z.boolean(),
  codeGeneration: z.boolean(),
  longContext: z.boolean(),
  maxContextLength: z.number(),
  maxOutputTokens: z.number(),
});

export const HealthStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']);

export const ModelHealthSchema = z.object({
  status: HealthStatusSchema,
  latencyMs: z.number().nullable(),
  lastChecked: z.date(),
  errorRate: z.number(),
  successfulRequests: z.number(),
  failedRequests: z.number(),
  averageResponseTime: z.number(),
});

export const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  tier: ModelTierSchema,
  isFree: z.boolean(),
  capabilities: ModelCapabilitiesSchema,
  health: ModelHealthSchema,
  description: z.string().optional(),
  contextWindow: z.number().optional(),
  pricing: z.object({
    inputPer1kTokens: z.number(),
    outputPer1kTokens: z.number(),
  }).optional(),
  tags: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ModelQueryFiltersSchema = z.object({
  provider: z.string().optional(),
  tier: ModelTierSchema.optional(),
  isFree: z.boolean().optional(),
  hasVision: z.boolean().optional(),
  hasStreaming: z.boolean().optional(),
  hasFunctionCalling: z.boolean().optional(),
  minContextLength: z.number().optional(),
  healthStatus: HealthStatusSchema.optional(),
});

// Default health state
export const createDefaultHealth = (): ModelHealth => ({
  status: 'unknown',
  latencyMs: null,
  lastChecked: new Date(),
  errorRate: 0,
  successfulRequests: 0,
  failedRequests: 0,
  averageResponseTime: 0,
});

// Default capabilities
export const createDefaultCapabilities = (): ModelCapabilities => ({
  streaming: true,
  functionCalling: false,
  vision: false,
  codeGeneration: true,
  longContext: false,
  maxContextLength: 4096,
  maxOutputTokens: 2048,
});
