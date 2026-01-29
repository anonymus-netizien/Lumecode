/**
 * MCP Tools for LLM Function Calling
 * Exposes MCP server management and tool calling as AI-usable tools
 */

import { z } from 'zod';
import {
  MCPManager,
  createMCPManager,
  KNOWN_MCP_SERVERS,
  AggregatedTool,
} from './manager.js';
import { MCPServerConfig } from './client.js';
import type { Tool, ToolCategory, ToolResult } from '../types/index.js';

// ===========================================
// MCP Tools Class
// ===========================================

export class MCPTools {
  private manager: MCPManager;

  constructor(manager?: MCPManager) {
    this.manager = manager || createMCPManager();
  }

  // ===========================================
  // Tool Definitions
  // ===========================================

  getTools(): Tool[] {
    return [
      this.createListServersTool(),
      this.createConnectServerTool(),
      this.createDisconnectServerTool(),
      this.createListMCPToolsTool(),
      this.createCallMCPToolTool(),
      this.createListResourcesTool(),
      this.createReadResourceTool(),
      this.createListPromptsTool(),
      this.createGetPromptTool(),
      this.createAddKnownServerTool(),
      this.createGetStatusTool(),
    ];
  }

  /**
   * Get dynamically generated tools from connected MCP servers
   */
  getDynamicTools(): Tool[] {
    const mcpTools = this.manager.getAllTools();
    return mcpTools.map((mcpTool) => this.convertMCPToolToTool(mcpTool));
  }

  /**
   * Get all tools (static + dynamic from MCP servers)
   */
  getAllTools(): Tool[] {
    return [...this.getTools(), ...this.getDynamicTools()];
  }

  // ===========================================
  // Convert MCP Tool to Internal Tool
  // ===========================================

  private convertMCPToolToTool(mcpTool: AggregatedTool): Tool {
    // Convert MCP schema to our ToolParameters format
    const properties: Record<string, { type: string; description?: string }> = {};
    if (mcpTool.inputSchema.properties) {
      for (const [key, value] of Object.entries(mcpTool.inputSchema.properties)) {
        const propValue = value as { type?: string; description?: string };
        properties[key] = {
          type: (propValue.type as string) || 'string',
          description: propValue.description,
        };
      }
    }
    
    return {
      name: `mcp_${mcpTool.serverId}_${mcpTool.name}`,
      description: mcpTool.description || `MCP tool: ${mcpTool.name} from ${mcpTool.serverName}`,
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: properties as Record<string, import('../types/index.js').ToolProperty>,
        required: mcpTool.inputSchema.required || [],
      },
      execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        try {
          const result = await this.manager.callTool(mcpTool.fullName, params);

          if (result.isError) {
            return {
              success: false,
              error: result.content.map((c) => c.text || '').join('\n'),
            };
          }

          const output = result.content
            .map((c) => {
              if (c.text) return c.text;
              if (c.data) return `[Binary data: ${c.mimeType || 'unknown'}]`;
              return '';
            })
            .join('\n');

          return { success: true, data: output };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  // ===========================================
  // Individual Tool Creators
  // ===========================================

  private createListServersTool(): Tool {
    return {
      name: 'mcp_list_servers',
      description: 'List all configured and connected MCP servers',
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (): Promise<ToolResult> => {
        try {
          const configured = this.manager.getConfiguredServers();
          const connected = new Set(this.manager.getConnectedServers());

          if (configured.length === 0) {
            let output = 'No MCP servers configured.\n\n';
            output += 'Available well-known servers:\n';
            for (const [id, config] of Object.entries(KNOWN_MCP_SERVERS)) {
              output += `  • ${id}: ${config.command} ${(config.args || []).join(' ')}\n`;
            }
            output += '\nUse mcp_add_known_server to add one.';
            return { success: true, data: output };
          }

          let output = `MCP Servers (${configured.length}):\n\n`;
          for (const server of configured) {
            const status = connected.has(server.id) ? '🟢 Connected' : '⚪ Not connected';
            output += `${status} ${server.name} (${server.id})\n`;
            output += `  Command: ${server.command} ${(server.args || []).join(' ')}\n`;

            if (connected.has(server.id)) {
              const tools = this.manager.getServerTools(server.id);
              output += `  Tools: ${tools.length}\n`;
            }
            output += '\n';
          }

          return { success: true, data: output.trim() };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createConnectServerTool(): Tool {
    return {
      name: 'mcp_connect',
      description: 'Connect to an MCP server',
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          serverId: {
            type: 'string',
            description: 'Server ID to connect to',
          },
          all: {
            type: 'boolean',
            description: 'Connect to all configured servers',
          },
        },
        required: [],
      },
      execute: async (params: { serverId?: string; all?: boolean }): Promise<ToolResult> => {
        try {
          if (params.all) {
            const results = await this.manager.connectAll();
            let output = 'Connection results:\n';
            for (const [id, success] of results) {
              output += `  ${success ? '✓' : '✗'} ${id}\n`;
            }
            return { success: true, data: output };
          }

          if (!params.serverId) {
            return { success: false, error: 'Specify serverId or set all=true' };
          }

          const success = await this.manager.connectServer(params.serverId);
          if (success) {
            const tools = this.manager.getServerTools(params.serverId);
            return {
              success: true,
              data: `Connected to ${params.serverId}. Available tools: ${tools.length}`,
            };
          }

          return { success: false, error: `Failed to connect to ${params.serverId}` };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createDisconnectServerTool(): Tool {
    return {
      name: 'mcp_disconnect',
      description: 'Disconnect from an MCP server',
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          serverId: {
            type: 'string',
            description: 'Server ID to disconnect from',
          },
          all: {
            type: 'boolean',
            description: 'Disconnect from all servers',
          },
        },
        required: [],
      },
      execute: async (params: { serverId?: string; all?: boolean }): Promise<ToolResult> => {
        try {
          if (params.all) {
            await this.manager.disconnectAll();
            return { success: true, data: 'Disconnected from all servers' };
          }

          if (!params.serverId) {
            return { success: false, error: 'Specify serverId or set all=true' };
          }

          await this.manager.disconnectServer(params.serverId);
          return { success: true, data: `Disconnected from ${params.serverId}` };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createListMCPToolsTool(): Tool {
    return {
      name: 'mcp_list_tools',
      description: 'List all tools available from connected MCP servers',
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          serverId: {
            type: 'string',
            description: 'Filter by server ID (optional)',
          },
        },
        required: [],
      },
      execute: async (params: { serverId?: string }): Promise<ToolResult> => {
        try {
          let tools = this.manager.getAllTools();

          if (params.serverId) {
            tools = tools.filter((t) => t.serverId === params.serverId);
          }

          if (tools.length === 0) {
            return { success: true, data: 'No tools available. Connect to an MCP server first.' };
          }

          let output = `Available MCP Tools (${tools.length}):\n\n`;

          // Group by server
          const byServer = new Map<string, typeof tools>();
          for (const tool of tools) {
            const serverTools = byServer.get(tool.serverId) || [];
            serverTools.push(tool);
            byServer.set(tool.serverId, serverTools);
          }

          for (const [serverId, serverTools] of byServer) {
            output += `📦 ${serverId}:\n`;
            for (const tool of serverTools) {
              output += `  • ${tool.name}`;
              if (tool.description) {
                output += ` - ${tool.description.slice(0, 60)}${tool.description.length > 60 ? '...' : ''}`;
              }
              output += '\n';
            }
            output += '\n';
          }

          return { success: true, data: output.trim() };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createCallMCPToolTool(): Tool {
    return {
      name: 'mcp_call_tool',
      description: 'Call an MCP tool by name. Use format "serverId:toolName" or just "toolName" if unique.',
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            description: 'Tool name (serverId:toolName or just toolName)',
          },
          args: {
            type: 'object',
            description: 'Arguments to pass to the tool',
          },
        },
        required: ['tool'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const params = args as { tool: string; args?: Record<string, unknown> };
        try {
          const result = await this.manager.callTool(params.tool, params.args || {});

          if (result.isError) {
            return {
              success: false,
              error: result.content.map((c) => c.text || '').join('\n'),
            };
          }

          const output = result.content
            .map((c) => {
              if (c.text) return c.text;
              if (c.data) return `[Binary data: ${c.mimeType || 'unknown'}]`;
              return '';
            })
            .join('\n');

          return { success: true, data: output || 'Tool executed successfully' };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createListResourcesTool(): Tool {
    return {
      name: 'mcp_list_resources',
      description: 'List all resources available from connected MCP servers',
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (): Promise<ToolResult> => {
        try {
          const resources = this.manager.getAllResources();

          if (resources.length === 0) {
            return { success: true, data: 'No resources available.' };
          }

          let output = `Available Resources (${resources.length}):\n\n`;
          for (const resource of resources) {
            output += `📄 ${resource.name}\n`;
            output += `   URI: ${resource.uri}\n`;
            output += `   Server: ${resource.serverName}\n`;
            if (resource.description) {
              output += `   ${resource.description}\n`;
            }
            output += '\n';
          }

          return { success: true, data: output.trim() };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createReadResourceTool(): Tool {
    return {
      name: 'mcp_read_resource',
      description: 'Read a resource from an MCP server',
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          serverId: {
            type: 'string',
            description: 'Server ID',
          },
          uri: {
            type: 'string',
            description: 'Resource URI',
          },
        },
        required: ['serverId', 'uri'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const params = args as { serverId: string; uri: string };
        try {
          const result = await this.manager.readResource(params.serverId, params.uri);

          if (!result) {
            return { success: false, error: 'Server not connected or resource not found' };
          }

          const output = result.contents
            .map((c) => c.text || `[Binary: ${c.uri}]`)
            .join('\n---\n');

          return { success: true, data: output };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createListPromptsTool(): Tool {
    return {
      name: 'mcp_list_prompts',
      description: 'List all prompts available from connected MCP servers',
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (): Promise<ToolResult> => {
        try {
          const prompts = this.manager.getAllPrompts();

          if (prompts.length === 0) {
            return { success: true, data: 'No prompts available.' };
          }

          let output = `Available Prompts (${prompts.length}):\n\n`;
          for (const prompt of prompts) {
            output += `💬 ${prompt.name} (${prompt.serverName})\n`;
            if (prompt.description) {
              output += `   ${prompt.description}\n`;
            }
            if (prompt.arguments && prompt.arguments.length > 0) {
              output += `   Arguments:\n`;
              for (const arg of prompt.arguments) {
                const req = arg.required ? '*' : '';
                output += `     - ${arg.name}${req}: ${arg.description || ''}\n`;
              }
            }
            output += '\n';
          }

          return { success: true, data: output.trim() };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGetPromptTool(): Tool {
    return {
      name: 'mcp_get_prompt',
      description: 'Get a prompt template from an MCP server',
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          serverId: {
            type: 'string',
            description: 'Server ID',
          },
          name: {
            type: 'string',
            description: 'Prompt name',
          },
          args: {
            type: 'object',
            description: 'Prompt arguments',
          },
        },
        required: ['serverId', 'name'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const params = args as {
          serverId: string;
          name: string;
          args?: Record<string, string>;
        };
        try {
          const result = await this.manager.getPrompt(
            params.serverId,
            params.name,
            params.args || {}
          );

          if (!result) {
            return { success: false, error: 'Server not connected or prompt not found' };
          }

          let output = '';
          if (result.description) {
            output += `Description: ${result.description}\n\n`;
          }

          output += 'Messages:\n';
          for (const msg of result.messages) {
            output += `\n[${msg.role.toUpperCase()}]\n`;
            for (const content of msg.content) {
              output += content.text || '';
            }
            output += '\n';
          }

          return { success: true, data: output };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createAddKnownServerTool(): Tool {
    return {
      name: 'mcp_add_known_server',
      description: 'Add a well-known MCP server by ID',
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          serverId: {
            type: 'string',
            description: 'Known server ID (e.g., filesystem, github, postgres)',
            enum: Object.keys(KNOWN_MCP_SERVERS),
          },
          env: {
            type: 'object',
            description: 'Environment variables for the server',
          },
          connect: {
            type: 'boolean',
            description: 'Immediately connect after adding (default: true)',
          },
        },
        required: ['serverId'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const params = args as {
          serverId: string;
          env?: Record<string, string>;
          connect?: boolean;
        };
        try {
          const added = this.manager.addKnownServer(params.serverId, undefined, params.env);

          if (!added) {
            const available = Object.keys(KNOWN_MCP_SERVERS).join(', ');
            return {
              success: false,
              error: `Unknown server: ${params.serverId}. Available: ${available}`,
            };
          }

          if (params.connect !== false) {
            const connected = await this.manager.connectServer(params.serverId);
            if (connected) {
              const tools = this.manager.getServerTools(params.serverId);
              return {
                success: true,
                data: `Added and connected to ${params.serverId}. Available tools: ${tools.length}`,
              };
            }
            return {
              success: true,
              data: `Added ${params.serverId} but failed to connect. Try mcp_connect later.`,
            };
          }

          return { success: true, data: `Added ${params.serverId}. Use mcp_connect to connect.` };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGetStatusTool(): Tool {
    return {
      name: 'mcp_status',
      description: 'Get MCP system status and capabilities summary',
      category: 'mcp' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (): Promise<ToolResult> => {
        try {
          const summary = this.manager.getCapabilitiesSummary();
          const status = this.manager.getServerStatus();

          let output = 'MCP Status\n';
          output += '==========\n\n';
          output += `Configured Servers: ${summary.servers}\n`;
          output += `Connected Servers: ${summary.connectedServers}\n`;
          output += `Available Tools: ${summary.tools}\n`;
          output += `Available Resources: ${summary.resources}\n`;
          output += `Available Prompts: ${summary.prompts}\n`;

          if (status.size > 0) {
            output += '\nServer Status:\n';
            for (const [id, s] of status) {
              const icon = s.connected ? '🟢' : '⚪';
              output += `  ${icon} ${id}\n`;
            }
          }

          return { success: true, data: output };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  // ===========================================
  // Manager Access
  // ===========================================

  /**
   * Get the underlying MCP manager
   */
  getManager(): MCPManager {
    return this.manager;
  }

  /**
   * Shutdown - disconnect all servers
   */
  async shutdown(): Promise<void> {
    await this.manager.disconnectAll();
  }
}

// ===========================================
// Factory Functions
// ===========================================

export function createMCPTools(manager?: MCPManager): MCPTools {
  return new MCPTools(manager);
}

export function registerMCPTools(manager?: MCPManager): Tool[] {
  const mcpTools = createMCPTools(manager);
  return mcpTools.getTools();
}
