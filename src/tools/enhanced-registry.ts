/**
 * Enhanced Tool Registry
 * Production-grade tool management with:
 * - Permission system per agent role
 * - Audit logging
 * - Rate limiting
 * - Tool validation
 * - Execution tracking
 */

import type { Tool, ToolResult, ToolParameters, AgentRole, AgentCapabilities, AGENT_CAPABILITIES } from '../types/index.js';
import type { 
  ToolDefinition, 
  ToolCategory, 
  ToolExecutionContext, 
  ToolExecutionResult,
  ToolPermissions,
  PermissionCheck,
  ToolAuditEntry,
  SandboxConfig,
} from './types.js';
import { BaseTool } from './registry.js';
import { ToolValidator } from './validator.js';
import { FunctionCallingConverter } from './function-calling.js';

// ===========================================
// Rate Limiter
// ===========================================

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig = { maxRequests: 100, windowMs: 60000 }) {
    this.config = config;
  }

  /**
   * Check if request is allowed
   */
  check(key: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get existing requests in window
    let requests = this.requests.get(key) || [];
    requests = requests.filter(time => time > windowStart);

    const remaining = Math.max(0, this.config.maxRequests - requests.length);
    const oldestRequest = requests[0] || now;
    const resetIn = Math.max(0, oldestRequest + this.config.windowMs - now);

    if (requests.length >= this.config.maxRequests) {
      return { allowed: false, remaining: 0, resetIn };
    }

    // Add this request
    requests.push(now);
    this.requests.set(key, requests);

    return { allowed: true, remaining: remaining - 1, resetIn };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clear(): void {
    this.requests.clear();
  }
}

// ===========================================
// Audit Logger
// ===========================================

class AuditLogger {
  private entries: ToolAuditEntry[] = [];
  private maxEntries = 1000;
  private listeners: Array<(entry: ToolAuditEntry) => void> = [];

  /**
   * Log a tool execution
   */
  log(entry: Omit<ToolAuditEntry, 'id' | 'timestamp'>): ToolAuditEntry {
    const fullEntry: ToolAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
      ...entry,
    };

    this.entries.push(fullEntry);

    // Trim old entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(fullEntry);
      } catch {
        // Ignore listener errors
      }
    }

    return fullEntry;
  }

  /**
   * Get audit entries
   */
  getEntries(options: {
    limit?: number;
    toolName?: string;
    sessionId?: string;
    since?: Date;
    successOnly?: boolean;
    failureOnly?: boolean;
  } = {}): ToolAuditEntry[] {
    let filtered = [...this.entries];

    if (options.toolName) {
      filtered = filtered.filter(e => e.toolName === options.toolName);
    }

    if (options.sessionId) {
      filtered = filtered.filter(e => e.sessionId === options.sessionId);
    }

    if (options.since) {
      filtered = filtered.filter(e => e.timestamp >= options.since!);
    }

    if (options.successOnly) {
      filtered = filtered.filter(e => e.result.success);
    }

    if (options.failureOnly) {
      filtered = filtered.filter(e => !e.result.success);
    }

    // Return newest first
    filtered.reverse();

    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Subscribe to audit events
   */
  subscribe(listener: (entry: ToolAuditEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Export audit log
   */
  export(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * Clear audit log
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalExecutions: number;
    successCount: number;
    failureCount: number;
    averageExecutionTime: number;
    byTool: Record<string, { count: number; avgTime: number }>;
  } {
    const totalExecutions = this.entries.length;
    const successCount = this.entries.filter(e => e.result.success).length;
    const failureCount = totalExecutions - successCount;
    const totalTime = this.entries.reduce((sum, e) => sum + e.executionTime, 0);
    const averageExecutionTime = totalExecutions > 0 ? totalTime / totalExecutions : 0;

    const byTool: Record<string, { count: number; totalTime: number }> = {};
    for (const entry of this.entries) {
      if (!byTool[entry.toolName]) {
        byTool[entry.toolName] = { count: 0, totalTime: 0 };
      }
      byTool[entry.toolName].count++;
      byTool[entry.toolName].totalTime += entry.executionTime;
    }

    const byToolStats: Record<string, { count: number; avgTime: number }> = {};
    for (const [name, stats] of Object.entries(byTool)) {
      byToolStats[name] = {
        count: stats.count,
        avgTime: stats.count > 0 ? stats.totalTime / stats.count : 0,
      };
    }

    return {
      totalExecutions,
      successCount,
      failureCount,
      averageExecutionTime,
      byTool: byToolStats,
    };
  }
}

// ===========================================
// Permission Manager
// ===========================================

const DEFAULT_PERMISSIONS: Record<AgentRole, ToolPermissions> = {
  build: {
    allowFileWrite: true,
    allowFileDelete: true,
    allowTerminalExecute: true,
    allowNetworkAccess: true,
    requireConfirmation: 'dangerous',
    sandboxMode: 'none',
  },
  plan: {
    allowFileWrite: false,
    allowFileDelete: false,
    allowTerminalExecute: true,
    allowNetworkAccess: true,
    requireConfirmation: 'all',
    sandboxMode: 'none',
  },
  review: {
    allowFileWrite: false,
    allowFileDelete: false,
    allowTerminalExecute: false,
    allowNetworkAccess: false,
    requireConfirmation: 'none',
    sandboxMode: 'strict',
  },
  general: {
    allowFileWrite: true,
    allowFileDelete: false,
    allowTerminalExecute: true,
    allowNetworkAccess: true,
    requireConfirmation: 'dangerous',
    sandboxMode: 'none',
  },
};

class PermissionManager {
  private rolePermissions: Record<AgentRole, ToolPermissions> = DEFAULT_PERMISSIONS;
  private customPermissions: ToolPermissions = {};
  private currentRole: AgentRole = 'general';

  setRole(role: AgentRole): void {
    this.currentRole = role;
  }

  setCustomPermissions(permissions: Partial<ToolPermissions>): void {
    this.customPermissions = { ...this.customPermissions, ...permissions };
  }

  /**
   * Check if a tool operation is permitted
   */
  check(
    toolCategory: ToolCategory,
    operation: string,
    args: Record<string, unknown>
  ): PermissionCheck {
    const permissions = {
      ...this.rolePermissions[this.currentRole],
      ...this.customPermissions,
    };

    // Check category-specific permissions
    switch (toolCategory) {
      case 'file_write':
      case 'file_edit':
        if (!permissions.allowFileWrite) {
          return {
            allowed: false,
            reason: `File write operations not allowed for ${this.currentRole} agent`,
          };
        }
        break;

      case 'terminal':
        if (!permissions.allowTerminalExecute) {
          return {
            allowed: false,
            reason: `Terminal execution not allowed for ${this.currentRole} agent`,
          };
        }
        break;

      case 'web':
        if (!permissions.allowNetworkAccess) {
          return {
            allowed: false,
            reason: `Network access not allowed for ${this.currentRole} agent`,
          };
        }
        break;
    }

    // Check path permissions
    const path = args.path as string | undefined;
    if (path) {
      if (permissions.blockedPaths?.some(p => path.includes(p))) {
        return { allowed: false, reason: `Path '${path}' is blocked` };
      }
      if (permissions.allowedPaths?.length) {
        const allowed = permissions.allowedPaths.some(p => path.startsWith(p));
        if (!allowed) {
          return { allowed: false, reason: `Path '${path}' not in allowed paths` };
        }
      }
    }

    // Check command permissions
    const command = args.command as string | undefined;
    if (command) {
      if (permissions.blockedCommands?.some(c => command.includes(c))) {
        return { allowed: false, reason: 'Command contains blocked pattern' };
      }
    }

    // Determine if confirmation is required
    const requiresConfirmation = this.shouldRequireConfirmation(toolCategory, permissions);

    return { allowed: true, requiresConfirmation };
  }

  private shouldRequireConfirmation(
    category: ToolCategory,
    permissions: ToolPermissions
  ): boolean {
    if (permissions.requireConfirmation === 'all') return true;
    if (permissions.requireConfirmation === 'none') return false;
    
    // 'dangerous' mode
    const dangerousCategories: ToolCategory[] = ['terminal', 'file_write', 'file_edit'];
    return dangerousCategories.includes(category);
  }
}

// ===========================================
// Enhanced Tool Registry
// ===========================================

export class EnhancedToolRegistry {
  private tools = new Map<string, BaseTool>();
  private rateLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60000 });
  private auditLogger = new AuditLogger();
  private permissionManager = new PermissionManager();
  private validator: ToolValidator;
  private context: ToolExecutionContext = {
    workingDirectory: process.cwd(),
  };

  constructor() {
    this.validator = new ToolValidator(this.context.workingDirectory);
  }

  // ===========================================
  // Registration
  // ===========================================

  /**
   * Register a tool
   */
  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools
   */
  registerAll(tools: BaseTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  // ===========================================
  // Tool Access
  // ===========================================

  /**
   * Get a tool by name
   */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): BaseTool[] {
    return this.getAll().filter(tool => tool.category === category);
  }

  /**
   * Check if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tool count
   */
  get count(): number {
    return this.tools.size;
  }

  // ===========================================
  // Tool Definitions for LLMs
  // ===========================================

  /**
   * Get tool definitions
   */
  getDefinitions(): ToolDefinition[] {
    return this.getAll().map(tool => tool.getDefinition());
  }

  /**
   * Get OpenAI-compatible function definitions
   */
  getOpenAIFunctions() {
    return FunctionCallingConverter.toOpenAI(
      this.getAll().map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }))
    );
  }

  /**
   * Get Gemini-compatible function definitions
   */
  getGeminiFunctions() {
    return FunctionCallingConverter.toGemini(
      this.getAll().map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }))
    );
  }

  // ===========================================
  // Context & Configuration
  // ===========================================

  /**
   * Set execution context
   */
  setContext(ctx: Partial<ToolExecutionContext>): void {
    this.context = { ...this.context, ...ctx };
    this.validator = new ToolValidator(this.context.workingDirectory);
    
    for (const tool of this.tools.values()) {
      tool.setContext(this.context);
    }
  }

  /**
   * Set agent role for permission checking
   */
  setAgentRole(role: AgentRole): void {
    this.permissionManager.setRole(role);
  }

  /**
   * Set custom permissions
   */
  setPermissions(permissions: Partial<ToolPermissions>): void {
    this.permissionManager.setCustomPermissions(permissions);
  }

  // ===========================================
  // Execution
  // ===========================================

  /**
   * Execute a tool with full validation, permission checking, and logging
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    options: {
      skipValidation?: boolean;
      skipPermissionCheck?: boolean;
      skipRateLimit?: boolean;
      sessionId?: string;
      userId?: string;
    } = {}
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const timestamp = new Date();

    // Get tool
    const tool = this.get(toolName);
    if (!tool) {
      const result: ToolExecutionResult = {
        success: false,
        error: `Tool '${toolName}' not found. Available tools: ${Array.from(this.tools.keys()).join(', ')}`,
        executionTime: Date.now() - startTime,
        toolName,
        args,
        timestamp,
      };
      this.auditLogger.log({
        toolName,
        args,
        result: { success: false, error: result.error },
        executionTime: result.executionTime,
        sessionId: options.sessionId,
        userId: options.userId,
      });
      return result;
    }

    // Rate limit check
    if (!options.skipRateLimit) {
      const rateLimitKey = `${options.sessionId || 'global'}:${toolName}`;
      const rateCheck = this.rateLimiter.check(rateLimitKey);
      if (!rateCheck.allowed) {
        const result: ToolExecutionResult = {
          success: false,
          error: `Rate limit exceeded for ${toolName}. Try again in ${Math.ceil(rateCheck.resetIn / 1000)}s`,
          executionTime: Date.now() - startTime,
          toolName,
          args,
          timestamp,
        };
        this.auditLogger.log({
          toolName,
          args,
          result: { success: false, error: result.error },
          executionTime: result.executionTime,
          sessionId: options.sessionId,
          userId: options.userId,
        });
        return result;
      }
    }

    // Validation
    if (!options.skipValidation) {
      const validation = this.validator.validate(toolName, args, tool.parameters);
      if (!validation.valid) {
        const errorMessages = validation.errors.map(e => `${e.field}: ${e.message}`).join('; ');
        const result: ToolExecutionResult = {
          success: false,
          error: `Validation failed: ${errorMessages}`,
          executionTime: Date.now() - startTime,
          toolName,
          args,
          timestamp,
          data: { validationErrors: validation.errors, warnings: validation.warnings },
        };
        this.auditLogger.log({
          toolName,
          args,
          result: { success: false, error: result.error },
          executionTime: result.executionTime,
          sessionId: options.sessionId,
          userId: options.userId,
        });
        return result;
      }
    }

    // Permission check
    if (!options.skipPermissionCheck) {
      const permission = this.permissionManager.check(tool.category, toolName, args);
      if (!permission.allowed) {
        const result: ToolExecutionResult = {
          success: false,
          error: `Permission denied: ${permission.reason}`,
          executionTime: Date.now() - startTime,
          toolName,
          args,
          timestamp,
        };
        this.auditLogger.log({
          toolName,
          args,
          result: { success: false, error: result.error },
          executionTime: result.executionTime,
          sessionId: options.sessionId,
          userId: options.userId,
        });
        return result;
      }
    }

    // Execute
    let toolResult: ToolResult;
    try {
      tool.setContext(this.context);
      toolResult = await tool.execute(args);
    } catch (error) {
      toolResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const executionTime = Date.now() - startTime;

    const result: ToolExecutionResult = {
      ...toolResult,
      executionTime,
      toolName,
      args,
      timestamp,
    };

    // Audit log
    this.auditLogger.log({
      toolName,
      args,
      result: { success: toolResult.success, error: toolResult.error },
      executionTime,
      sessionId: options.sessionId,
      userId: options.userId,
    });

    return result;
  }

  // ===========================================
  // Audit & Stats
  // ===========================================

  /**
   * Get audit logger
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * Get execution statistics
   */
  getStats() {
    return this.auditLogger.getStats();
  }

  /**
   * Get recent executions
   */
  getRecentExecutions(limit = 10) {
    return this.auditLogger.getEntries({ limit });
  }

  // ===========================================
  // Cleanup
  // ===========================================

  /**
   * Clear all state
   */
  clear(): void {
    this.rateLimiter.clear();
    this.auditLogger.clear();
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const enhancedToolRegistry = new EnhancedToolRegistry();
