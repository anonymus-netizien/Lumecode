/**
 * MCP Server Manager
 * Manages multiple MCP server connections
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MCPClient,
  createMCPClient,
  MCPServerConfig,
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPToolResult,
} from './client.js';

// ===========================================
// Types
// ===========================================

export interface MCPManagerConfig {
  configPath?: string;
  servers?: MCPServerConfig[];
  autoConnect?: boolean;
}

export interface MCPConfigFile {
  mcpServers: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
}

export interface AggregatedTool extends MCPTool {
  serverId: string;
  serverName: string;
  fullName: string; // serverId:toolName
}

export interface AggregatedResource extends MCPResource {
  serverId: string;
  serverName: string;
}

export interface AggregatedPrompt extends MCPPrompt {
  serverId: string;
  serverName: string;
}

// ===========================================
// Well-Known MCP Servers
// ===========================================

export const KNOWN_MCP_SERVERS: Record<string, Omit<MCPServerConfig, 'id' | 'name'>> = {
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
  },
  github: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
  },
  postgres: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
  },
  sqlite: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
  },
  puppeteer: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
  },
  brave_search: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
  },
  google_maps: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-maps'],
  },
  slack: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
  },
  memory: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
  },
  fetch: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
  },
};

// ===========================================
// MCP Manager
// ===========================================

export class MCPManager extends EventEmitter {
  private clients: Map<string, MCPClient> = new Map();
  private config: MCPManagerConfig;
  private serverConfigs: Map<string, MCPServerConfig> = new Map();

  constructor(config: MCPManagerConfig = {}) {
    super();
    this.config = {
      autoConnect: false,
      ...config,
    };

    // Add configured servers
    if (config.servers) {
      for (const server of config.servers) {
        this.serverConfigs.set(server.id, server);
      }
    }
  }

  // ===========================================
  // Configuration
  // ===========================================

  /**
   * Load configuration from file (Claude Desktop format)
   */
  async loadConfig(configPath?: string): Promise<void> {
    const filePath = configPath || this.config.configPath;
    if (!filePath) {
      return;
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const config = JSON.parse(content) as MCPConfigFile;

      if (config.mcpServers) {
        for (const [id, serverConfig] of Object.entries(config.mcpServers)) {
          this.serverConfigs.set(id, {
            id,
            name: id,
            command: serverConfig.command,
            args: serverConfig.args,
            env: serverConfig.env,
          });
        }
      }

      // Auto-connect if configured
      if (this.config.autoConnect) {
        await this.connectAll();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.emit('error', error);
      }
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(configPath: string): Promise<void> {
    const config: MCPConfigFile = {
      mcpServers: {},
    };

    for (const [id, serverConfig] of this.serverConfigs) {
      config.mcpServers[id] = {
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
      };
    }

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Add a server configuration
   */
  addServer(config: MCPServerConfig): void {
    this.serverConfigs.set(config.id, config);
    this.emit('serverAdded', config.id);
  }

  /**
   * Remove a server configuration
   */
  async removeServer(serverId: string): Promise<void> {
    await this.disconnectServer(serverId);
    this.serverConfigs.delete(serverId);
    this.emit('serverRemoved', serverId);
  }

  /**
   * Add a well-known server
   */
  addKnownServer(
    serverId: string,
    name?: string,
    env?: Record<string, string>
  ): boolean {
    const knownConfig = KNOWN_MCP_SERVERS[serverId];
    if (!knownConfig) {
      return false;
    }

    this.addServer({
      id: serverId,
      name: name || serverId,
      ...knownConfig,
      env: { ...knownConfig.env, ...env },
    });

    return true;
  }

  // ===========================================
  // Connection Management
  // ===========================================

  /**
   * Connect to a specific server
   */
  async connectServer(serverId: string): Promise<boolean> {
    const config = this.serverConfigs.get(serverId);
    if (!config) {
      return false;
    }

    // Check if already connected
    if (this.clients.has(serverId)) {
      return true;
    }

    try {
      const client = createMCPClient(config);

      // Forward events
      client.on('error', (error) => this.emit('error', serverId, error));
      client.on('disconnected', () => {
        this.clients.delete(serverId);
        this.emit('serverDisconnected', serverId);
      });

      await client.connect();
      this.clients.set(serverId, client);
      this.emit('serverConnected', serverId);

      return true;
    } catch (error) {
      this.emit('error', serverId, error);
      return false;
    }
  }

  /**
   * Disconnect from a specific server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverId);
    }
  }

  /**
   * Connect to all configured servers
   */
  async connectAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const serverId of this.serverConfigs.keys()) {
      const success = await this.connectServer(serverId);
      results.set(serverId, success);
    }

    return results;
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.keys()).map((id) =>
      this.disconnectServer(id)
    );
    await Promise.all(disconnectPromises);
  }

  // ===========================================
  // Tool Operations
  // ===========================================

  /**
   * Get all tools from all connected servers
   */
  getAllTools(): AggregatedTool[] {
    const tools: AggregatedTool[] = [];

    for (const [serverId, client] of this.clients) {
      const serverTools = client.getTools();
      for (const tool of serverTools) {
        tools.push({
          ...tool,
          serverId,
          serverName: client.getName(),
          fullName: `${serverId}:${tool.name}`,
        });
      }
    }

    return tools;
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverId: string): MCPTool[] {
    const client = this.clients.get(serverId);
    return client ? client.getTools() : [];
  }

  /**
   * Call a tool (format: "serverId:toolName" or just "toolName" if unique)
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<MCPToolResult> {
    // Check if it's a fully qualified name
    if (toolName.includes(':')) {
      const [serverId, name] = toolName.split(':', 2);
      const client = this.clients.get(serverId);
      if (!client) {
        return {
          content: [{ type: 'text', text: `Server not connected: ${serverId}` }],
          isError: true,
        };
      }
      return client.callTool(name, args);
    }

    // Find the tool in any connected server
    for (const client of this.clients.values()) {
      const tools = client.getTools();
      if (tools.some((t) => t.name === toolName)) {
        return client.callTool(toolName, args);
      }
    }

    return {
      content: [{ type: 'text', text: `Tool not found: ${toolName}` }],
      isError: true,
    };
  }

  // ===========================================
  // Resource Operations
  // ===========================================

  /**
   * Get all resources from all connected servers
   */
  getAllResources(): AggregatedResource[] {
    const resources: AggregatedResource[] = [];

    for (const [serverId, client] of this.clients) {
      const serverResources = client.getResources();
      for (const resource of serverResources) {
        resources.push({
          ...resource,
          serverId,
          serverName: client.getName(),
        });
      }
    }

    return resources;
  }

  /**
   * Read a resource from a specific server
   */
  async readResource(
    serverId: string,
    uri: string
  ): Promise<{ contents: Array<{ uri: string; text?: string; blob?: string }> } | null> {
    const client = this.clients.get(serverId);
    if (!client) {
      return null;
    }
    return client.readResource(uri);
  }

  // ===========================================
  // Prompt Operations
  // ===========================================

  /**
   * Get all prompts from all connected servers
   */
  getAllPrompts(): AggregatedPrompt[] {
    const prompts: AggregatedPrompt[] = [];

    for (const [serverId, client] of this.clients) {
      const serverPrompts = client.getPrompts();
      for (const prompt of serverPrompts) {
        prompts.push({
          ...prompt,
          serverId,
          serverName: client.getName(),
        });
      }
    }

    return prompts;
  }

  /**
   * Get a prompt from a specific server
   */
  async getPrompt(
    serverId: string,
    name: string,
    args: Record<string, string> = {}
  ): Promise<{
    description?: string;
    messages: Array<{
      role: 'user' | 'assistant';
      content: { type: string; text?: string }[];
    }>;
  } | null> {
    const client = this.clients.get(serverId);
    if (!client) {
      return null;
    }
    return client.getPrompt(name, args);
  }

  // ===========================================
  // Status & Info
  // ===========================================

  /**
   * Get list of configured servers
   */
  getConfiguredServers(): MCPServerConfig[] {
    return Array.from(this.serverConfigs.values());
  }

  /**
   * Get list of connected servers
   */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Check if a server is connected
   */
  isServerConnected(serverId: string): boolean {
    return this.clients.has(serverId);
  }

  /**
   * Get server status
   */
  getServerStatus(): Map<string, { configured: boolean; connected: boolean }> {
    const status = new Map<string, { configured: boolean; connected: boolean }>();

    for (const serverId of this.serverConfigs.keys()) {
      status.set(serverId, {
        configured: true,
        connected: this.clients.has(serverId),
      });
    }

    return status;
  }

  /**
   * Get summary of capabilities
   */
  getCapabilitiesSummary(): {
    servers: number;
    connectedServers: number;
    tools: number;
    resources: number;
    prompts: number;
  } {
    return {
      servers: this.serverConfigs.size,
      connectedServers: this.clients.size,
      tools: this.getAllTools().length,
      resources: this.getAllResources().length,
      prompts: this.getAllPrompts().length,
    };
  }
}

// ===========================================
// Factory Function
// ===========================================

export function createMCPManager(config?: MCPManagerConfig): MCPManager {
  return new MCPManager(config);
}
