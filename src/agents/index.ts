/**
 * Agent Index
 * Central export for all agents
 */

import { BaseAgent } from './base.js';
import { BuildAgent } from './build.js';
import type { AgentRole, DirectoryTree } from '../types/index.js';
import { type BaseProvider } from '../providers/index.js';

// ===========================================
// Plan Agent (Read-only with confirmation)
// ===========================================

export class PlanAgent extends BaseAgent {
  constructor(provider?: BaseProvider) {
    super('plan', provider);
  }

  protected initializeTools(): void {
    // Read file tool
    this.registerTool({
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to read' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const { fileSystem } = await import('../filesystem/index');
        const content = await fileSystem.readFile(args.path as string);
        return { success: true, output: content };
      },
    });

    // List directory tool
    this.registerTool({
      name: 'list_directory',
      description: 'List contents of a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the directory' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const { fileSystem } = await import('../filesystem/index');
        const entries = await fileSystem.listDirectory(args.path as string);
        return {
          success: true,
          output: entries.map((e: { name: string; type: 'file' | 'directory' }) => `${e.type === 'directory' ? '📁' : '📄'} ${e.name}`).join('\n'),
        };
      },
    });

    // Search files tool
    this.registerTool({
      name: 'search_files',
      description: 'Search for files matching a pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern to match files' },
          directory: { type: 'string', description: 'Directory to search in' },
        },
        required: ['pattern'],
      },
      execute: async (args) => {
        const { fileSystem } = await import('../filesystem/index');
        const files = await fileSystem.searchFiles(args.pattern as string, args.directory as string);
        return { success: true, output: files.join('\n') };
      },
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
    const tool = this.tools.get(call.name);
    if (!tool) return { success: false, error: `Unknown tool: ${call.name}` };
    return tool.execute(call.arguments);
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
    // Read file tool only
    this.registerTool({
      name: 'read_file',
      description: 'Read the contents of a file for review',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to read' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const { fileSystem } = await import('../filesystem/index');
        const content = await fileSystem.readFile(args.path as string);
        return { success: true, output: content };
      },
    });

    // List directory tool
    this.registerTool({
      name: 'list_directory',
      description: 'List contents of a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the directory' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const { fileSystem } = await import('../filesystem/index');
        const entries = await fileSystem.listDirectory(args.path as string);
        return {
          success: true,
          output: entries.map((e: { name: string; type: 'file' | 'directory' }) => `${e.type === 'directory' ? '📁' : '📄'} ${e.name}`).join('\n'),
        };
      },
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
    const tool = this.tools.get(call.name);
    if (!tool) return { success: false, error: `Unknown tool: ${call.name}` };
    return tool.execute(call.arguments);
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
    // All tools from BuildAgent but with confirmation
    this.registerTool({
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to read' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const { fileSystem } = await import('../filesystem/index');
        const content = await fileSystem.readFile(args.path as string);
        return { success: true, output: content };
      },
    });

    this.registerTool({
      name: 'write_file',
      description: 'Write content to a file (requires confirmation)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to write' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
      execute: async (args) => {
        const confirmed = await this.requestConfirmation(`Write to ${args.path}?`);
        if (!confirmed) return { success: false, error: 'Operation cancelled by user' };
        
        const { fileSystem } = await import('../filesystem/index');
        await fileSystem.writeFile(args.path as string, args.content as string);
        return { success: true, output: `File written: ${args.path}` };
      },
    });

    this.registerTool({
      name: 'run_command',
      description: 'Execute a shell command (requires confirmation)',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          cwd: { type: 'string', description: 'Working directory' },
        },
        required: ['command'],
      },
      execute: async (args) => {
        const confirmed = await this.requestConfirmation(`Run: ${args.command}?`);
        if (!confirmed) return { success: false, error: 'Operation cancelled by user' };
        
        const { fileSystem } = await import('../filesystem/index');
        const result = await fileSystem.executeCommand(
          args.command as string,
          (args.cwd as string) || this.context?.workingDirectory || process.cwd()
        );
        return {
          success: result.exitCode === 0,
          output: result.stdout,
          error: result.stderr || undefined,
        };
      },
    });

    this.registerTool({
      name: 'list_directory',
      description: 'List contents of a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the directory' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const { fileSystem } = await import('../filesystem/index');
        const entries = await fileSystem.listDirectory(args.path as string);
        return {
          success: true,
          output: entries.map((e: { name: string; type: 'file' | 'directory' }) => `${e.type === 'directory' ? '📁' : '📄'} ${e.name}`).join('\n'),
        };
      },
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
    const tool = this.tools.get(call.name);
    if (!tool) return { success: false, error: `Unknown tool: ${call.name}` };
    return tool.execute(call.arguments);
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
