/**
 * MCP Client Implementation
 * Connects to MCP servers and exposes their tools
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  ListResourcesResultSchema,
  ListPromptsResultSchema,
  ReadResourceResultSchema,
  GetPromptResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ===========================================
// Types
// ===========================================

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ===========================================
// MCP Client
// ===========================================

export class MCPClient extends EventEmitter {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private process: ChildProcess | null = null;
  private config: MCPServerConfig;
  private connected = false;
  private tools: MCPTool[] = [];
  private resources: MCPResource[] = [];
  private prompts: MCPPrompt[] = [];

  constructor(config: MCPServerConfig) {
    super();
    this.config = config;
    this.client = new Client(
      {
        name: 'lumecode',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
  }

  // ===========================================
  // Connection Management
  // ===========================================

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Create the transport
      const envVars: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          envVars[key] = value;
        }
      }
      if (this.config.env) {
        Object.assign(envVars, this.config.env);
      }
      
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args || [],
        env: envVars,
        cwd: this.config.cwd,
      });

      // Connect the client
      await this.client.connect(this.transport);
      this.connected = true;

      // Discover capabilities
      await this.discoverCapabilities();

      this.emit('connected', this.config.id);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.close();
    } catch {
      // Ignore close errors
    }

    this.connected = false;
    this.tools = [];
    this.resources = [];
    this.prompts = [];

    this.emit('disconnected', this.config.id);
  }

  /**
   * Discover server capabilities
   */
  private async discoverCapabilities(): Promise<void> {
    // Discover tools
    try {
      const toolsResult = await this.client.request(
        { method: 'tools/list' },
        ListToolsResultSchema
      );
      this.tools = (toolsResult.tools || []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as MCPTool['inputSchema'],
      }));
    } catch {
      this.tools = [];
    }

    // Discover resources
    try {
      const resourcesResult = await this.client.request(
        { method: 'resources/list' },
        ListResourcesResultSchema
      );
      this.resources = (resourcesResult.resources || []).map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      }));
    } catch {
      this.resources = [];
    }

    // Discover prompts
    try {
      const promptsResult = await this.client.request(
        { method: 'prompts/list' },
        ListPromptsResultSchema
      );
      this.prompts = (promptsResult.prompts || []).map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments?.map((a) => ({
          name: a.name,
          description: a.description,
          required: a.required,
        })),
      }));
    } catch {
      this.prompts = [];
    }
  }

  // ===========================================
  // Tool Operations
  // ===========================================

  /**
   * Get available tools
   */
  getTools(): MCPTool[] {
    return [...this.tools];
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<MCPToolResult> {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const result = await this.client.request(
        {
          method: 'tools/call',
          params: {
            name,
            arguments: args,
          },
        },
        CallToolResultSchema
      );

      return {
        content: result.content.map((c) => ({
          type: c.type,
          text: 'text' in c ? c.text : undefined,
          data: 'data' in c ? c.data : undefined,
          mimeType: 'mimeType' in c ? c.mimeType : undefined,
        })),
        isError: result.isError,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error calling tool: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  // ===========================================
  // Resource Operations
  // ===========================================

  /**
   * Get available resources
   */
  getResources(): MCPResource[] {
    return [...this.resources];
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<{
    contents: Array<{ uri: string; text?: string; blob?: string; mimeType?: string }>;
  }> {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    const result = await this.client.request(
      {
        method: 'resources/read',
        params: { uri },
      },
      ReadResourceResultSchema
    );

    return {
      contents: result.contents.map((c) => ({
        uri: c.uri,
        text: 'text' in c ? c.text : undefined,
        blob: 'blob' in c ? c.blob : undefined,
        mimeType: c.mimeType,
      })),
    };
  }

  // ===========================================
  // Prompt Operations
  // ===========================================

  /**
   * Get available prompts
   */
  getPrompts(): MCPPrompt[] {
    return [...this.prompts];
  }

  /**
   * Get a prompt
   */
  async getPrompt(
    name: string,
    args: Record<string, string> = {}
  ): Promise<{
    description?: string;
    messages: Array<{
      role: 'user' | 'assistant';
      content: { type: string; text?: string }[];
    }>;
  }> {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    const result = await this.client.request(
      {
        method: 'prompts/get',
        params: {
          name,
          arguments: args,
        },
      },
      GetPromptResultSchema
    );

    return {
      description: result.description,
      messages: result.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: Array.isArray(m.content)
          ? m.content.map((c) => ({
              type: c.type,
              text: 'text' in c ? c.text : undefined,
            }))
          : [{ type: 'text', text: m.content }],
      })),
    };
  }

  // ===========================================
  // Utilities
  // ===========================================

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get server config
   */
  getConfig(): MCPServerConfig {
    return { ...this.config };
  }

  /**
   * Get server ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get server name
   */
  getName(): string {
    return this.config.name;
  }
}

// ===========================================
// Factory Function
// ===========================================

export function createMCPClient(config: MCPServerConfig): MCPClient {
  return new MCPClient(config);
}
