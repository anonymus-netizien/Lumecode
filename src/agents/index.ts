/**
 * Agent Index
 * Central export for all agents
 */

import { BaseAgent } from './base.js';
import { BuildAgent } from './build.js';
import type { AgentRole } from '../types/index.js';
import { type BaseProvider } from '../providers/index.js';
import { toolRegistry } from '../tools/index.js';

// ===========================================
// Plan Agent (Read-only with confirmation)
// ===========================================

export class PlanAgent extends BaseAgent {
  constructor(provider?: BaseProvider) {
    super('plan', provider);
  }

  protected initializeTools(): void {
    // Plan agent uses registry tools with read-only access
    // Tools are filtered by capabilities in getToolDefinitionsForLLM
  }

  /**
   * Get tools available to Plan agent (read-only)
   */
  override getToolDefinitionsForLLM() {
    // Plan agent can only read - filter out write/execute tools
    return toolRegistry.getFunctionDefinitions().filter(tool => {
      const name = tool.function.name;
      return name === 'file_read' || name === 'directory_list' || name === 'search_files';
    });
  }

  async process(message: string): Promise<import('../types/index.js').LLMResponse> {
    const messages = this.buildMessages(message);
    this.addToHistory({ role: 'user', content: message });
    const response = await this.provider.chat(messages);
    this.addToHistory({ role: 'assistant', content: response.content });
    return response;
  }

  async handleToolCall(call: import('../types/index.js').ToolCall): Promise<import('../types/index.js').ToolResult> {
    // Verify tool is allowed for Plan agent
    const allowedTools = ['file_read', 'directory_list', 'search_files'];
    if (!allowedTools.includes(call.name)) {
      return { success: false, error: `Plan agent cannot use tool: ${call.name}` };
    }
    return this.executeRegistryTool(call.name, call.arguments);
  }
}

// ===========================================
// Review Agent (Read-only, no commands)
// ===========================================

export class ReviewAgent extends BaseAgent {
  constructor(provider?: BaseProvider) {
    super('review', provider);
  }

  protected initializeTools(): void {
    // Review agent uses registry tools with read-only access
  }

  /**
   * Get tools available to Review agent (read-only)
   */
  override getToolDefinitionsForLLM() {
    // Review agent can only read files
    return toolRegistry.getFunctionDefinitions().filter(tool => {
      const name = tool.function.name;
      return name === 'file_read' || name === 'directory_list';
    });
  }

  async process(message: string): Promise<import('../types/index.js').LLMResponse> {
    const messages = this.buildMessages(message);
    this.addToHistory({ role: 'user', content: message });
    const response = await this.provider.chat(messages);
    this.addToHistory({ role: 'assistant', content: response.content });
    return response;
  }

  async handleToolCall(call: import('../types/index.js').ToolCall): Promise<import('../types/index.js').ToolResult> {
    const allowedTools = ['file_read', 'directory_list'];
    if (!allowedTools.includes(call.name)) {
      return { success: false, error: `Review agent cannot use tool: ${call.name}` };
    }
    return this.executeRegistryTool(call.name, call.arguments);
  }
}

// ===========================================
// General Agent (Full access with confirmation)
// ===========================================

export class GeneralAgent extends BaseAgent {
  constructor(provider?: BaseProvider) {
    super('general', provider);
  }

  protected initializeTools(): void {
    // General agent uses all registry tools but requires confirmation
  }

  /**
   * Get tools available to General agent (all tools)
   */
  override getToolDefinitionsForLLM() {
    // General agent has access to all tools
    return toolRegistry.getFunctionDefinitions();
  }

  async process(message: string): Promise<import('../types/index.js').LLMResponse> {
    const messages = this.buildMessages(message);
    this.addToHistory({ role: 'user', content: message });
    const response = await this.provider.chat(messages);
    this.addToHistory({ role: 'assistant', content: response.content });
    return response;
  }

  async handleToolCall(call: import('../types/index.js').ToolCall): Promise<import('../types/index.js').ToolResult> {
    // General agent requires confirmation for write operations
    const writeTools = ['file_write', 'file_edit', 'terminal_execute'];
    if (writeTools.includes(call.name)) {
      const confirmed = await this.requestConfirmation(
        `Execute ${call.name}: ${JSON.stringify(call.arguments).slice(0, 100)}...`
      );
      if (!confirmed) {
        return { success: false, error: 'Operation cancelled by user' };
      }
    }
    return this.executeRegistryTool(call.name, call.arguments);
  }
}

// ===========================================
// Agent Factory
// ===========================================

export function createAgent(role: AgentRole, provider?: BaseProvider): BaseAgent {
  switch (role) {
    case 'build':
      return new BuildAgent(provider);
    case 'plan':
      return new PlanAgent(provider);
    case 'review':
      return new ReviewAgent(provider);
    case 'general':
      return new GeneralAgent(provider);
    default:
      throw new Error(`Unknown agent role: ${role}`);
  }
}

// ===========================================
// Agent Registry
// ===========================================

class AgentRegistry {
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private activeAgent: BaseAgent | null = null;

  initialize(defaultRole: AgentRole = 'build', provider?: BaseProvider): void {
    const roles: AgentRole[] = ['build', 'plan', 'review', 'general'];
    
    for (const role of roles) {
      this.agents.set(role, createAgent(role, provider));
    }

    this.activeAgent = this.agents.get(defaultRole) || null;
  }

  get(role: AgentRole): BaseAgent | undefined {
    return this.agents.get(role);
  }

  getActive(): BaseAgent {
    if (!this.activeAgent) {
      throw new Error('No active agent. Call initialize() first.');
    }
    return this.activeAgent;
  }

  setActive(role: AgentRole): boolean {
    const agent = this.agents.get(role);
    if (!agent) return false;
    this.activeAgent = agent;
    return true;
  }

  list(): AgentRole[] {
    return Array.from(this.agents.keys());
  }

  getInfo(): Array<{ role: AgentRole; name: string; isActive: boolean }> {
    return Array.from(this.agents.entries()).map(([role, agent]) => ({
      role,
      name: agent.name,
      isActive: agent === this.activeAgent,
    }));
  }
}

export const agentRegistry = new AgentRegistry();

// Re-exports
export { BaseAgent } from './base.js';
export { BuildAgent } from './build.js';
export { AGENT_PROMPTS, AGENT_DESCRIPTIONS, AGENT_SHORTCUTS } from './prompts.js';
