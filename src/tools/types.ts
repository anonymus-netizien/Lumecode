/**
 * Tool System Types
 * Extended types for the tool execution system
 */

import type { ToolResult, ToolParameters } from '../types/index.js';

// ===========================================
// Tool Definition Types
// ===========================================

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: ToolParameters;
  requiresConfirmation?: boolean;
  dangerLevel?: 'safe' | 'moderate' | 'dangerous';
}

export type ToolCategory = 
  | 'file_read'
  | 'file_write'
  | 'file_edit'
  | 'directory'
  | 'terminal'
  | 'search'
  | 'git'
  | 'web'
  | 'mcp';

// ===========================================
// Tool Execution Types
// ===========================================

export interface ToolExecutionContext {
  workingDirectory: string;
  sessionId?: string;
  userId?: string;
  timeout?: number;
  dryRun?: boolean;
}

export interface ToolExecutionResult extends ToolResult {
  executionTime: number;
  toolName: string;
  args: Record<string, unknown>;
  timestamp: Date;
}

// ===========================================
// File Tool Types
// ===========================================

export interface FileReadArgs {
  path: string;
  startLine?: number;
  endLine?: number;
  encoding?: string;
}

export interface FileWriteArgs {
  path: string;
  content: string;
  createDirectories?: boolean;
  backup?: boolean;
}

export interface FileEditArgs {
  path: string;
  edits: FileEdit[];
  dryRun?: boolean;
}

export interface FileEdit {
  type: 'replace' | 'insert' | 'delete';
  startLine: number;
  endLine?: number;
  content?: string;
  search?: string;
  replace?: string;
}

export interface DirectoryListArgs {
  path: string;
  recursive?: boolean;
  maxDepth?: number;
  includeHidden?: boolean;
  pattern?: string;
}

// ===========================================
// Terminal Tool Types
// ===========================================

export interface TerminalExecuteArgs {
  command: string;
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  shell?: string;
}

export interface TerminalResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
  timedOut?: boolean;
}

// ===========================================
// Search Tool Types
// ===========================================

export interface SearchFilesArgs {
  pattern: string;
  path?: string;
  filePattern?: string;
  caseSensitive?: boolean;
  maxResults?: number;
  includeContext?: boolean;
  contextLines?: number;
}

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  content: string;
  context?: {
    before: string[];
    after: string[];
  };
}

export interface SearchResult {
  matches: SearchMatch[];
  totalMatches: number;
  filesSearched: number;
  truncated: boolean;
}

// ===========================================
// Permission Types
// ===========================================

export interface ToolPermissions {
  allowedPaths?: string[];
  blockedPaths?: string[];
  allowedCommands?: string[];
  blockedCommands?: string[];
  maxFileSize?: number;
  maxExecutionTime?: number;
  // Enhanced permissions
  allowNetworkAccess?: boolean;
  allowFileWrite?: boolean;
  allowFileDelete?: boolean;
  allowTerminalExecute?: boolean;
  requireConfirmation?: 'all' | 'dangerous' | 'none';
  sandboxMode?: 'none' | 'strict' | 'docker';
}

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
}

// ===========================================
// Sandbox Types
// ===========================================

export interface SandboxConfig {
  enabled: boolean;
  type: 'process' | 'docker' | 'vm';
  allowedPaths: string[];
  networkAccess: boolean;
  maxMemory?: number;
  maxCpu?: number;
  timeout?: number;
}

export interface SandboxResult {
  success: boolean;
  output?: string;
  error?: string;
  resourceUsage?: {
    memory: number;
    cpu: number;
    time: number;
  };
}

// ===========================================
// Tool Validation Types
// ===========================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// ===========================================
// Tool Audit Types
// ===========================================

export interface ToolAuditEntry {
  id: string;
  timestamp: Date;
  toolName: string;
  args: Record<string, unknown>;
  result: {
    success: boolean;
    error?: string;
  };
  executionTime: number;
  userId?: string;
  sessionId?: string;
}
