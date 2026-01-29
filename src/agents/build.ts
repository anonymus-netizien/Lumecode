/**
 * Build Agent
 * Full-access implementation agent with file read/write and command execution
 * Now uses the centralized tool registry system
 */

import { BaseAgent } from './base.js';
import type {
  LLMMessage,
  LLMResponse,
  Tool,
  ToolCall,
  ToolResult,
} from '../types/index.js';
import { type BaseProvider } from '../providers/index.js';
import { toolRegistry } from '../tools/index.js';

export class BuildAgent extends BaseAgent {
  constructor(provider?: BaseProvider) {
    super('build', provider);
  }

  protected initializeTools(): void {
    // Build Agent uses all tools from the centralized registry
    // The registry is auto-initialized with all standard tools
    // This method now just sets up any agent-specific tool configurations
    
    // No local tool registration needed - we use the registry directly
  }

  /**
   * Get tools available to this agent based on capabilities
   */
  override getToolDefinitionsForLLM() {
    // Build agent has full access to all tools
    return toolRegistry.getFunctionDefinitions();
  }

  async process(message: string): Promise<LLMResponse> {
    const messages = this.buildMessages(message);
    
    // Add user message to history
    this.addToHistory({
      role: 'user',
      content: message,
    });

    // Get response from provider
    const response = await this.provider.chat(messages);

    // Add assistant response to history
    this.addToHistory({
      role: 'assistant',
      content: response.content,
    });

    return response;
  }

  async processStream(
    message: string,
    onChunk: (content: string) => void
  ): Promise<LLMResponse> {
    const messages = this.buildMessages(message);
    
    this.addToHistory({
      role: 'user',
      content: message,
    });

    const response = await this.provider.chatStream(messages, (chunk) => {
      if (!chunk.done && chunk.content) {
        onChunk(chunk.content);
      }
    });

    this.addToHistory({
      role: 'assistant',
      content: response.content,
    });

    return response;
  }

  async handleToolCall(call: ToolCall): Promise<ToolResult> {
    // First check local tools (for backward compatibility)
    const localTool = this.tools.get(call.name);
    if (localTool) {
      try {
        return await localTool.execute(call.arguments);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // Use registry-based tool execution
    return this.executeRegistryTool(call.name, call.arguments);
  }
}

export default BuildAgent;
