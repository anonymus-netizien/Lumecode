/**
 * Tool Registry
 * Central registry for all available tools
 */

import type { Tool, ToolResult, ToolParameters } from '../types/index.js';
import type { 
  ToolDefinition, 
  ToolCategory, 
  ToolExecutionContext, 
  ToolExecutionResult,
  ToolPermissions,
  PermissionCheck 
} from './types.js';

// ===========================================
// Base Tool Class
// ===========================================

export abstract class BaseTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract category: ToolCategory;
  abstract parameters: ToolParameters;
  
  dangerLevel: 'safe' | 'moderate' | 'dangerous' = 'safe';
  requiresConfirmation = false;

  protected context: ToolExecutionContext = {
    workingDirectory: process.cwd(),
  };

  setContext(ctx: Partial<ToolExecutionContext>): void {
    this.context = { ...this.context, ...ctx };
  }

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: this.category,
      parameters: this.parameters,
      requiresConfirmation: this.requiresConfirmation,
      dangerLevel: this.dangerLevel,
    };
  }

  /**
   * Get OpenAI-compatible function definition
   */
  toFunctionDefinition(): {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: ToolParameters;
    };
  } {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }

  abstract execute(args: Record<string, unknown>): Promise<ToolResult>;
}

// ===========================================
// Tool Registry Class
// ===========================================

class ToolRegistry {
  private tools = new Map<string, BaseTool>();
  private permissions: ToolPermissions = {};
  private executionHistory: ToolExecutionResult[] = [];
  private maxHistorySize = 100;

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
   * Get a tool by name
   */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
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
   * Get tool definitions for LLM
   */
  getDefinitions(): ToolDefinition[] {
    return this.getAll().map(tool => tool.getDefinition());
  }

  /**
   * Get OpenAI-compatible function definitions
   */
  getFunctionDefinitions(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: ToolParameters;
    };
  }> {
    return this.getAll().map(tool => tool.toFunctionDefinition());
  }

  /**
   * Set execution context for all tools
   */
  setContext(ctx: Partial<ToolExecutionContext>): void {
    for (const tool of this.tools.values()) {
      tool.setContext(ctx);
    }
  }

  /**
   * Set permission constraints
   */
  setPermissions(permissions: ToolPermissions): void {
    this.permissions = permissions;
  }

  /**
   * Check if an operation is permitted
   */
  checkPermission(toolName: string, args: Record<string, unknown>): PermissionCheck {
    const tool = this.get(toolName);
    if (!tool) {
      return { allowed: false, reason: `Tool '${toolName}' not found` };
    }

    // Check path permissions
    const path = args.path as string | undefined;
    if (path) {
      if (this.permissions.blockedPaths?.some(p => path.startsWith(p))) {
        return { allowed: false, reason: `Path '${path}' is blocked` };
      }
      if (this.permissions.allowedPaths?.length) {
        const allowed = this.permissions.allowedPaths.some(p => path.startsWith(p));
        if (!allowed) {
          return { allowed: false, reason: `Path '${path}' is not in allowed paths` };
        }
      }
    }

    // Check command permissions
    const command = args.command as string | undefined;
    if (command) {
      if (this.permissions.blockedCommands?.some(c => command.includes(c))) {
        return { allowed: false, reason: `Command contains blocked pattern` };
      }
      if (this.permissions.allowedCommands?.length) {
        const allowed = this.permissions.allowedCommands.some(c => 
          command.startsWith(c) || command.includes(c)
        );
        if (!allowed) {
          return { allowed: false, reason: `Command not in allowed list` };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Execute a tool with permission checking and logging
   */
  async execute(
    toolName: string, 
    args: Record<string, unknown>,
    context?: Partial<ToolExecutionContext>
  ): Promise<ToolExecutionResult> {
    const tool = this.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${toolName}' not found`,
        executionTime: 0,
        toolName,
        args,
        timestamp: new Date(),
      };
    }

    // Check permissions
    const permission = this.checkPermission(toolName, args);
    if (!permission.allowed) {
      return {
        success: false,
        error: `Permission denied: ${permission.reason}`,
        executionTime: 0,
        toolName,
        args,
        timestamp: new Date(),
      };
    }

    // Set context if provided
    if (context) {
      tool.setContext(context);
    }

    // Execute with timing
    const startTime = Date.now();
    let result: ToolResult;

    try {
      result = await tool.execute(args);
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const executionTime = Date.now() - startTime;

    const executionResult: ToolExecutionResult = {
      ...result,
      executionTime,
      toolName,
      args,
      timestamp: new Date(),
    };

    // Add to history
    this.executionHistory.push(executionResult);
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }

    return executionResult;
  }

  /**
   * Get execution history
   */
  getHistory(limit?: number): ToolExecutionResult[] {
    const history = [...this.executionHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Get tool count
   */
  get count(): number {
    return this.tools.size;
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const toolRegistry = new ToolRegistry();
export { ToolRegistry };
