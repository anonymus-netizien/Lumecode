/**
 * Lumecode Core Types
 * All TypeScript interfaces and types for the application
 */

import { z } from 'zod';

// ===========================================
// Provider Types
// ===========================================

export type ProviderName = 'gemini' | 'openrouter' | 'groq' | 'ollama';

export interface ProviderConfig {
  name: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
  timestamp?: Date;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: ProviderName;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
  toolCalls?: ToolCall[];
  raw?: unknown;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  error?: string;
}

export interface ProviderCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  maxContextLength: number;
  costPerMillionTokens?: {
    input: number;
    output: number;
  };
}

// ===========================================
// Agent Types
// ===========================================

export type AgentRole = 'build' | 'plan' | 'review' | 'general';

export interface AgentCapabilities {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canExecuteCommands: boolean;
  canAccessNetwork: boolean;
  requiresConfirmation: boolean;
}

export const AGENT_CAPABILITIES: Record<AgentRole, AgentCapabilities> = {
  build: {
    canReadFiles: true,
    canWriteFiles: true,
    canExecuteCommands: true,
    canAccessNetwork: true,
    requiresConfirmation: false,
  },
  plan: {
    canReadFiles: true,
    canWriteFiles: false,
    canExecuteCommands: true,
    canAccessNetwork: true,
    requiresConfirmation: true,
  },
  review: {
    canReadFiles: true,
    canWriteFiles: false,
    canExecuteCommands: false,
    canAccessNetwork: false,
    requiresConfirmation: false,
  },
  general: {
    canReadFiles: true,
    canWriteFiles: true,
    canExecuteCommands: true,
    canAccessNetwork: true,
    requiresConfirmation: true,
  },
};

export interface AgentConfig {
  role: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: AgentCapabilities;
  provider?: ProviderName;
  model?: string;
}

export interface AgentContext {
  workingDirectory: string;
  files: FileContext[];
  gitInfo?: GitInfo;
  environmentVariables?: Record<string, string>;
}

// ===========================================
// Session Types
// ===========================================

export interface Session {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  agent: AgentRole;
  provider: ProviderName;
  model: string;
  workingDirectory: string;
  messages: LLMMessage[];
  metadata?: SessionMetadata;
}

export interface SessionMetadata {
  totalTokens?: number;
  totalCost?: number;
  filesModified?: string[];
  commandsExecuted?: string[];
  tags?: string[];
}

export interface SessionSummary {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  agent: AgentRole;
  messageCount: number;
  preview?: string;
}

// ===========================================
// File System Types
// ===========================================

export interface FileContext {
  path: string;
  content: string;
  language?: string;
  startLine?: number;
  endLine?: number;
}

export interface FileOperation {
  type: 'read' | 'write' | 'delete' | 'rename' | 'create';
  path: string;
  content?: string;
  newPath?: string;
}

export interface FilePermission {
  path: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

export interface DirectoryTree {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryTree[];
  size?: number;
  modified?: Date;
}

// ===========================================
// Git Types
// ===========================================

export interface GitInfo {
  branch: string;
  remoteUrl?: string;
  isDirty: boolean;
  uncommittedFiles?: string[];
  lastCommit?: {
    hash: string;
    message: string;
    author: string;
    date: Date;
  };
}

export interface GitDiff {
  file: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

// ===========================================
// Tool/Function Calling Types
// ===========================================

export type ToolCategory = 
  | 'file'
  | 'file_read'
  | 'file_write'
  | 'file_edit'
  | 'directory'
  | 'terminal'
  | 'search'
  | 'git'
  | 'code'
  | 'web'
  | 'mcp'
  | 'general';

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
  category?: ToolCategory;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolProperty>;
  required?: string[];
}

export interface ToolProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ToolProperty;
  default?: unknown;
  properties?: Record<string, ToolProperty>;
  required?: string[];
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  data?: unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
}

// ===========================================
// Context Builder Types
// ===========================================

export interface ContextConfig {
  maxTokens: number;
  includeGitInfo: boolean;
  includeEnvVars: boolean;
  filePatterns?: string[];
  excludePatterns?: string[];
}

export interface BuiltContext {
  systemPrompt: string;
  files: FileContext[];
  gitInfo?: GitInfo;
  tools?: Tool[];
  tokenCount: number;
}

// ===========================================
// Engine Types
// ===========================================

export interface EngineConfig {
  provider: ProviderConfig;
  agent: AgentConfig;
  context: ContextConfig;
  maxRetries?: number;
  timeout?: number;
}

export interface EngineRequest {
  message: string;
  sessionId?: string;
  files?: FileContext[];
  tools?: Tool[];
}

export interface EngineResponse {
  message: LLMResponse;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  sessionId: string;
}

// ===========================================
// UI Types
// ===========================================

export interface UIState {
  currentView: 'chat' | 'files' | 'sessions' | 'settings';
  isLoading: boolean;
  error?: string;
  notification?: Notification;
}

export interface Notification {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
}

// ===========================================
// Configuration Types
// ===========================================

export interface AppConfig {
  defaultProvider: ProviderName;
  providers: Partial<Record<ProviderName, ProviderConfig>>;
  defaultAgent: AgentRole;
  dataDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  theme: 'dark' | 'light' | 'auto';
  telemetry: boolean;
}

// ===========================================
// Zod Schemas for Validation
// ===========================================

export const ProviderNameSchema = z.enum(['gemini', 'openrouter', 'groq', 'ollama', 'openai', 'anthropic']);

export const AgentRoleSchema = z.enum(['build', 'plan', 'review', 'general']);

export const LLMMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  name: z.string().optional(),
  timestamp: z.date().optional(),
});

export const SessionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  agent: AgentRoleSchema,
  provider: ProviderNameSchema,
  model: z.string(),
  workingDirectory: z.string(),
  messages: z.array(LLMMessageSchema),
});

export const AppConfigSchema = z.object({
  defaultProvider: ProviderNameSchema,
  defaultAgent: AgentRoleSchema,
  dataDir: z.string(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  theme: z.enum(['dark', 'light', 'auto']),
  telemetry: z.boolean(),
});

// ===========================================
// Error Types
// ===========================================

export class LumecodeError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'LumecodeError';
  }
}

export class ProviderError extends LumecodeError {
  constructor(message: string, public provider: ProviderName, details?: unknown) {
    super(message, 'PROVIDER_ERROR', details);
    this.name = 'ProviderError';
  }
}

export class AgentError extends LumecodeError {
  constructor(message: string, public agent: AgentRole, details?: unknown) {
    super(message, 'AGENT_ERROR', details);
    this.name = 'AgentError';
  }
}

export class FileSystemError extends LumecodeError {
  constructor(message: string, public path: string, details?: unknown) {
    super(message, 'FILESYSTEM_ERROR', details);
    this.name = 'FileSystemError';
  }
}

export class SessionError extends LumecodeError {
  constructor(message: string, public sessionId?: string, details?: unknown) {
    super(message, 'SESSION_ERROR', details);
    this.name = 'SessionError';
  }
}
