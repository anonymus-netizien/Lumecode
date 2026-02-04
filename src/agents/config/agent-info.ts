/**
 * AgentInfo Schema
 * Defines structure for dynamic agent configuration and capabilities
 */

import { z } from 'zod';
import type { AgentRole, LLMMessage, ProviderName } from '../../types/index.js';
import type { PermissionRuleset } from '../../security/permissions.js';

// ===========================================
// Zod Schemas for Validation
// ===========================================

export const AgentCapabilitiesSchema = z.object({
  canReadFiles: z.boolean().default(true),
  canWriteFiles: z.boolean().default(false),
  canExecuteCommands: z.boolean().default(false),
  canAccessNetwork: z.boolean().default(false),
  canAccessGit: z.boolean().default(false),
  requiresUserConfirmation: z.boolean().default(false),
});

export const AgentConfigurationSchema = z.object({
  maxContextTokens: z.number().default(8000),
  defaultTemperature: z.number().default(0.7).refine(val => val >= 0 && val <= 1, {
    message: 'Temperature must be between 0 and 1',
  }),
  maxRetries: z.number().default(3).refine(val => val >= 1, {
    message: 'Max retries must be at least 1',
  }),
  timeoutSeconds: z.number().default(30).refine(val => val >= 5, {
    message: 'Timeout must be at least 5 seconds',
  }),
  defaultProvider: z.string().optional(),
  defaultModel: z.string().optional(),
});

export const AgentToolsSchema = z.object({
  enabled: z.array(z.string()).default([]),
  disabled: z.array(z.string()).default([]),
});

export const AgentPromptsSchema = z.object({
  system: z.string().describe('System prompt (can be loaded from markdown)'),
  instructions: z.string().optional().describe('Additional instructions'),
  examples: z.array(z.string()).optional().describe('Few-shot examples'),
});

export const AgentInfoSchema = z.object({
  id: z.string().describe('Unique agent identifier'),
  role: z.enum(['build', 'plan', 'review', 'general'] as const).describe('Agent role'),
  name: z.string().describe('Display name'),
  description: z.string().describe('What this agent does'),
  version: z.string().describe('Agent version'),
  
  capabilities: AgentCapabilitiesSchema,
  configuration: AgentConfigurationSchema,
  tools: AgentToolsSchema,
  prompts: AgentPromptsSchema,
  
  metadata: z.record(z.unknown()).optional().describe('Custom metadata'),
});

// ===========================================
// TypeScript Types
// ===========================================

export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;
export type AgentConfiguration = z.infer<typeof AgentConfigurationSchema>;
export type AgentTools = z.infer<typeof AgentToolsSchema>;
export type AgentPrompts = z.infer<typeof AgentPromptsSchema>;

export interface AgentInfo extends z.infer<typeof AgentInfoSchema> {
  capabilities: AgentCapabilities;
  configuration: AgentConfiguration;
  tools: AgentTools;
  prompts: AgentPrompts;
  permissions?: PermissionRuleset;
}

// ===========================================
// Config File Structure
// ===========================================

export const AgentConfigFileSchema = z.object({
  agents: z.array(AgentInfoSchema),
  defaults: AgentInfoSchema.partial().optional(),
  version: z.string().optional().default('1.0.0'),
});

export type AgentConfigFile = z.infer<typeof AgentConfigFileSchema>;

// ===========================================
// Validation Functions
// ===========================================

/**
 * Validate AgentInfo against schema
 */
export function validateAgentInfo(data: unknown): { valid: true; data: AgentInfo } | { valid: false; errors: string[] } {
  try {
    const validated = AgentInfoSchema.parse(data);
    return { valid: true, data: validated as AgentInfo };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      };
    }
    return { valid: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Validate config file
 */
export function validateAgentConfigFile(data: unknown): { valid: true; data: AgentConfigFile } | { valid: false; errors: string[] } {
  try {
    const validated = AgentConfigFileSchema.parse(data);
    return { valid: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      };
    }
    return { valid: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Merge defaults with specific agent config
 */
export function mergeAgentConfig(
  defaults: Partial<AgentInfo> | undefined,
  specific: AgentInfo
): AgentInfo {
  if (!defaults) return specific;

  return {
    ...specific,
    name: specific.name || defaults.name || 'Unknown Agent',
    description: specific.description || defaults.description || '',
    version: specific.version || defaults.version || '1.0.0',
    
    capabilities: {
      ...AgentCapabilitiesSchema.parse(defaults.capabilities || {}),
      ...specific.capabilities,
    },
    
    configuration: {
      ...AgentConfigurationSchema.parse(defaults.configuration || {}),
      ...specific.configuration,
    },
    
    tools: {
      enabled: [...(defaults.tools?.enabled || []), ...specific.tools.enabled],
      disabled: [...(defaults.tools?.disabled || []), ...specific.tools.disabled],
    },
    
    prompts: {
      system: specific.prompts.system || defaults.prompts?.system || '',
      instructions: specific.prompts.instructions || defaults.prompts?.instructions,
      examples: [...(defaults.prompts?.examples || []), ...(specific.prompts.examples || [])],
    },
    
    metadata: {
      ...defaults.metadata,
      ...specific.metadata,
    },
  };
}

// ===========================================
// Built-in Agent Definitions
// ===========================================

export const DEFAULT_BUILD_AGENT: AgentInfo = {
  id: 'build',
  role: 'build',
  name: 'Build Agent',
  description: 'Generates code and implements features',
  version: '1.0.0',
  
  capabilities: {
    canReadFiles: true,
    canWriteFiles: true,
    canExecuteCommands: true,
    canAccessNetwork: false,
    canAccessGit: true,
    requiresUserConfirmation: false,
  },
  
  configuration: {
    maxContextTokens: 16000,
    defaultTemperature: 0.5,
    maxRetries: 3,
    timeoutSeconds: 60,
  },
  
  tools: {
    enabled: ['file-reader', 'file-writer', 'command-executor', 'git-operations'],
    disabled: [],
  },
  
  prompts: {
    system: 'You are a code generation expert. Write clean, well-tested code.',
    instructions: 'Follow the project structure and conventions.',
  },
};

export const DEFAULT_PLAN_AGENT: AgentInfo = {
  id: 'plan',
  role: 'plan',
  name: 'Plan Agent',
  description: 'Creates implementation plans and strategies',
  version: '1.0.0',
  
  capabilities: {
    canReadFiles: true,
    canWriteFiles: false,
    canExecuteCommands: false,
    canAccessNetwork: true,
    canAccessGit: true,
    requiresUserConfirmation: true,
  },
  
  configuration: {
    maxContextTokens: 12000,
    defaultTemperature: 0.7,
    maxRetries: 2,
    timeoutSeconds: 45,
  },
  
  tools: {
    enabled: ['file-reader', 'project-analyzer'],
    disabled: ['file-writer', 'command-executor'],
  },
  
  prompts: {
    system: 'You are an expert technical planner. Create detailed, actionable plans.',
    instructions: 'Break down complex tasks into manageable steps.',
  },
};

export const DEFAULT_REVIEW_AGENT: AgentInfo = {
  id: 'review',
  role: 'review',
  name: 'Review Agent',
  description: 'Reviews code for quality and correctness',
  version: '1.0.0',
  
  capabilities: {
    canReadFiles: true,
    canWriteFiles: false,
    canExecuteCommands: false,
    canAccessNetwork: false,
    canAccessGit: false,
    requiresUserConfirmation: false,
  },
  
  configuration: {
    maxContextTokens: 8000,
    defaultTemperature: 0.3,
    maxRetries: 1,
    timeoutSeconds: 30,
  },
  
  tools: {
    enabled: ['file-reader', 'code-analyzer'],
    disabled: ['file-writer', 'command-executor'],
  },
  
  prompts: {
    system: 'You are a thorough code reviewer. Identify issues and suggest improvements.',
    instructions: 'Check for bugs, performance issues, and code style.',
  },
};

export const DEFAULT_GENERAL_AGENT: AgentInfo = {
  id: 'general',
  role: 'general',
  name: 'General Agent',
  description: 'General purpose assistant for various tasks',
  version: '1.0.0',
  
  capabilities: {
    canReadFiles: true,
    canWriteFiles: true,
    canExecuteCommands: false,
    canAccessNetwork: true,
    canAccessGit: false,
    requiresUserConfirmation: true,
  },
  
  configuration: {
    maxContextTokens: 10000,
    defaultTemperature: 0.6,
    maxRetries: 2,
    timeoutSeconds: 40,
  },
  
  tools: {
    enabled: ['file-reader', 'file-writer', 'project-analyzer'],
    disabled: ['command-executor'],
  },
  
  prompts: {
    system: 'You are a helpful AI assistant for general tasks.',
    instructions: 'Be clear, concise, and helpful.',
  },
};

/**
 * Get default agent info by role
 */
export function getDefaultAgentInfo(role: AgentRole): AgentInfo {
  const defaults: Record<AgentRole, AgentInfo> = {
    build: DEFAULT_BUILD_AGENT,
    plan: DEFAULT_PLAN_AGENT,
    review: DEFAULT_REVIEW_AGENT,
    general: DEFAULT_GENERAL_AGENT,
  };
  return defaults[role];
}
