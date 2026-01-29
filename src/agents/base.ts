/**
 * Base Agent Abstract Class
 * All agents must extend this class
 */

import type {
  AgentRole,
  AgentConfig,
  AgentCapabilities,
  AgentContext,
  LLMMessage,
  LLMResponse,
  Tool,
  ToolCall,
  ToolResult,
} from '../types/index.js';
import { AGENT_CAPABILITIES } from '../types/index.js';
import { providerRegistry, type BaseProvider } from '../providers/index.js';
import { AGENT_PROMPTS, AGENT_DESCRIPTIONS } from './prompts.js';
import { toolRegistry, type ToolExecutionResult } from '../tools/index.js';

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected context: AgentContext | null = null;
  protected provider: BaseProvider;
  protected tools: Map<string, Tool> = new Map();
  protected conversationHistory: LLMMessage[] = [];
  protected confirmationHandler: ((action: string) => Promise<boolean>) | null = null;
  protected toolCallHandler: ((toolName: string, args: Record<string, unknown>) => void) | null = null;

  constructor(role: AgentRole, provider?: BaseProvider) {
    this.config = {
      role,
      name: this.formatName(role),
      description: AGENT_DESCRIPTIONS[role],
      systemPrompt: AGENT_PROMPTS[role],
      capabilities: AGENT_CAPABILITIES[role],
    };

    this.provider = provider || providerRegistry.getActive();
    this.initializeTools();
  }

  // ===========================================
  // Abstract Methods
  // ===========================================

  /**
   * Initialize tools available to this agent
   */
  protected abstract initializeTools(): void;

  /**
   * Process a user message and generate a response
   */
  abstract process(message: string): Promise<LLMResponse>;

  /**
   * Handle a tool call result
   */
  abstract handleToolCall(call: ToolCall): Promise<ToolResult>;

  // ===========================================
  // Tool Call Handler
  // ===========================================

  /**
   * Set a handler to be notified of tool calls
   */
  setToolCallHandler(handler: (toolName: string, args: Record<string, unknown>) => void): void {
    this.toolCallHandler = handler;
  }

  /**
   * Set a confirmation handler for dangerous operations
   */
  setConfirmationHandler(handler: (action: string) => Promise<boolean>): void {
    this.confirmationHandler = handler;
  }

  /**
   * Execute a tool using the central tool registry
   */
  protected async executeRegistryTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    // Notify handler if set
    if (this.toolCallHandler) {
      this.toolCallHandler(toolName, args);
    }

    // Check if tool requires confirmation
    const tool = toolRegistry.get(toolName);
    if (tool?.requiresConfirmation && this.capabilities.requiresConfirmation) {
      const confirmed = await this.requestConfirmation(
        `Execute ${toolName}: ${JSON.stringify(args).slice(0, 100)}...`
      );
      if (!confirmed) {
        return {
          success: false,
          error: 'Operation cancelled by user',
          executionTime: 0,
          toolName,
          args,
          timestamp: new Date(),
        };
      }
    }

    // Execute via registry
    return toolRegistry.execute(toolName, args, {
      workingDirectory: this.context?.workingDirectory || process.cwd(),
    });
  }

  /**
   * Get tool definitions for LLM function calling
   */
  getToolDefinitionsForLLM(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: import('../types/index.js').ToolParameters;
    };
  }> {
    // Filter tools based on agent capabilities
    const allTools = toolRegistry.getAll();
    const allowedTools = allTools.filter(tool => {
      // Check capability restrictions
      if (tool.category === 'file_write' || tool.category === 'file_edit') {
        return this.capabilities.canWriteFiles;
      }
      if (tool.category === 'terminal') {
        return this.capabilities.canExecuteCommands;
      }
      return true;
    });

    return allowedTools.map(tool => tool.toFunctionDefinition());
  }

  // ===========================================
  // Common Methods
  // ===========================================

  /**
   * Get agent role
   */
  get role(): AgentRole {
    return this.config.role;
  }

  /**
   * Get agent name
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * Get agent capabilities
   */
  get capabilities(): AgentCapabilities {
    return this.config.capabilities;
  }

  /**
   * Set the working context
   */
  setContext(context: AgentContext): void {
    this.context = context;
  }

  /**
   * Get the current context
   */
  getContext(): AgentContext | null {
    return this.context;
  }

  /**
   * Set the LLM provider
   */
  setProvider(provider: BaseProvider): void {
    this.provider = provider;
  }

  /**
   * Get conversation history
   */
  getHistory(): LLMMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Add a message to history
   */
  protected addToHistory(message: LLMMessage): void {
    this.conversationHistory.push({
      ...message,
      timestamp: message.timestamp || new Date(),
    });
  }

  /**
   * Build messages array for LLM request
   */
  protected buildMessages(userMessage: string): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // System prompt with context
    let systemPrompt = this.config.systemPrompt;
    
    if (this.context) {
      systemPrompt += '\n\n## Current Context\n';
      systemPrompt += `Working Directory: ${this.context.workingDirectory}\n`;
      
      if (this.context.files.length > 0) {
        systemPrompt += '\n### Loaded Files:\n';
        for (const file of this.context.files) {
          systemPrompt += `- ${file.path} (${file.language || 'unknown'})\n`;
        }
      }

      if (this.context.gitInfo) {
        systemPrompt += `\n### Git Info:\n`;
        systemPrompt += `Branch: ${this.context.gitInfo.branch}\n`;
        systemPrompt += `Dirty: ${this.context.gitInfo.isDirty}\n`;
      }
    }

    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // Add conversation history
    messages.push(...this.conversationHistory);

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    return messages;
  }

  /**
   * Register a tool
   */
  protected registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get available tools
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Check if agent can perform an action
   */
  canPerform(action: keyof AgentCapabilities): boolean {
    return this.capabilities[action];
  }

  /**
   * Request confirmation for an action
   */
  protected async requestConfirmation(action: string): Promise<boolean> {
    if (!this.capabilities.requiresConfirmation) {
      return true;
    }
    // This will be overridden by the UI layer
    console.log(`[Confirmation Required] ${action}`);
    return true;
  }

  // ===========================================
  // Helpers
  // ===========================================

  private formatName(role: AgentRole): string {
    return role.charAt(0).toUpperCase() + role.slice(1) + ' Agent';
  }
}

export default BaseAgent;
