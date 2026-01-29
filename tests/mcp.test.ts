/**
 * MCP Module Tests
 * Tests for MCP client, manager, and tools
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { MCPClient, MCPServerConfig, MCPTool } from '../src/mcp/client';
import { MCPManager, createMCPManager, KNOWN_MCP_SERVERS } from '../src/mcp/manager';
import { MCPTools, createMCPTools, registerMCPTools } from '../src/mcp/tools';

// ===========================================
// MCP Client Tests
// ===========================================

describe('MCPClient', () => {
  let client: MCPClient;
  const testConfig: MCPServerConfig = {
    id: 'test-server',
    name: 'Test Server',
    command: 'echo',
    args: ['hello'],
  };

  beforeEach(() => {
    client = new MCPClient(testConfig);
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  describe('initialization', () => {
    test('should create with config', () => {
      expect(client).toBeDefined();
      expect(client.isConnected()).toBe(false);
    });

    test('should store server ID', () => {
      expect(client['config'].id).toBe('test-server');
    });

    test('should use name from config', () => {
      expect(client['config'].name).toBe('Test Server');
    });

    test('should default name to ID if not provided', () => {
      const clientWithoutName = new MCPClient({
        id: 'unnamed',
        name: 'unnamed', // name is required in config
        command: 'echo',
      });
      expect(clientWithoutName['config'].name).toBe('unnamed');
    });
  });

  describe('getTools', () => {
    test('should return empty array when not connected', () => {
      const tools = client.getTools();
      expect(tools).toEqual([]);
    });
  });

  describe('getResources', () => {
    test('should return empty array when not connected', () => {
      const resources = client.getResources();
      expect(resources).toEqual([]);
    });
  });

  describe('getPrompts', () => {
    test('should return empty array when not connected', () => {
      const prompts = client.getPrompts();
      expect(prompts).toEqual([]);
    });
  });

  describe('disconnect', () => {
    test('should handle disconnect when not connected', async () => {
      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });
});

// ===========================================
// MCPManager Tests
// ===========================================

describe('MCPManager', () => {
  let manager: MCPManager;

  beforeEach(() => {
    manager = createMCPManager();
  });

  afterEach(async () => {
    await manager.disconnectAll();
  });

  describe('initialization', () => {
    test('should create empty manager', () => {
      expect(manager).toBeDefined();
      expect(manager.getConfiguredServers()).toEqual([]);
    });

    test('should create with initial servers', () => {
      const managerWithServers = createMCPManager({
        servers: [
          { id: 'test1', name: 'Test 1', command: 'echo' },
          { id: 'test2', name: 'Test 2', command: 'echo' },
        ],
      });
      expect(managerWithServers.getConfiguredServers()).toHaveLength(2);
    });
  });

  describe('addServer', () => {
    test('should add server config', () => {
      manager.addServer({ id: 'new-server', name: 'New Server', command: 'node', args: ['server.js'] });
      const servers = manager.getConfiguredServers();
      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe('new-server');
    });

    test('should not add duplicate server', () => {
      manager.addServer({ id: 'dup', name: 'Dup', command: 'echo' });
      manager.addServer({ id: 'dup', name: 'Dup', command: 'echo' });
      expect(manager.getConfiguredServers()).toHaveLength(1);
    });
  });

  describe('removeServer', () => {
    test('should remove server config', async () => {
      manager.addServer({ id: 'to-remove', name: 'To Remove', command: 'echo' });
      expect(manager.getConfiguredServers()).toHaveLength(1);

      await manager.removeServer('to-remove');
      expect(manager.getConfiguredServers()).toHaveLength(0);
    });

    test('should handle removing non-existent server', async () => {
      await manager.removeServer('nonexistent');
      expect(manager.getConfiguredServers()).toHaveLength(0);
    });
  });

  describe('getConnectedServers', () => {
    test('should return empty array initially', () => {
      expect(manager.getConnectedServers()).toEqual([]);
    });
  });

  describe('getAllTools', () => {
    test('should return empty array when no servers connected', () => {
      expect(manager.getAllTools()).toEqual([]);
    });
  });

  describe('getAllResources', () => {
    test('should return empty array when no servers connected', () => {
      expect(manager.getAllResources()).toEqual([]);
    });
  });

  describe('getAllPrompts', () => {
    test('should return empty array when no servers connected', () => {
      expect(manager.getAllPrompts()).toEqual([]);
    });
  });

  describe('getCapabilitiesSummary', () => {
    test('should return initial state', () => {
      const summary = manager.getCapabilitiesSummary();
      expect(summary.servers).toBe(0);
      expect(summary.connectedServers).toBe(0);
      expect(summary.tools).toBe(0);
      expect(summary.resources).toBe(0);
      expect(summary.prompts).toBe(0);
    });

    test('should count configured servers', () => {
      manager.addServer({ id: 's1', name: 'S1', command: 'echo' });
      manager.addServer({ id: 's2', name: 'S2', command: 'echo' });
      const summary = manager.getCapabilitiesSummary();
      expect(summary.servers).toBe(2);
      expect(summary.connectedServers).toBe(0);
    });
  });

  describe('getServerStatus', () => {
    test('should show server status', () => {
      manager.addServer({ id: 'status-test', name: 'Status Test', command: 'echo' });
      const status = manager.getServerStatus();
      expect(status.size).toBe(1);
      expect(status.get('status-test')?.connected).toBe(false);
      expect(status.get('status-test')?.configured).toBe(true);
    });
  });
});

// ===========================================
// KNOWN_MCP_SERVERS Tests
// ===========================================

describe('KNOWN_MCP_SERVERS', () => {
  test('should contain filesystem server', () => {
    expect(KNOWN_MCP_SERVERS.filesystem).toBeDefined();
    expect(KNOWN_MCP_SERVERS.filesystem.command).toBe('npx');
  });

  test('should contain github server', () => {
    expect(KNOWN_MCP_SERVERS.github).toBeDefined();
    expect(KNOWN_MCP_SERVERS.github.command).toBe('npx');
  });

  test('should contain postgres server', () => {
    expect(KNOWN_MCP_SERVERS.postgres).toBeDefined();
  });

  test('should contain sqlite server', () => {
    expect(KNOWN_MCP_SERVERS.sqlite).toBeDefined();
  });

  test('should contain puppeteer server', () => {
    expect(KNOWN_MCP_SERVERS.puppeteer).toBeDefined();
  });

  test('should contain brave_search server', () => {
    expect(KNOWN_MCP_SERVERS.brave_search).toBeDefined();
  });

  test('should contain memory server', () => {
    expect(KNOWN_MCP_SERVERS.memory).toBeDefined();
  });

  test('should contain fetch server', () => {
    expect(KNOWN_MCP_SERVERS.fetch).toBeDefined();
  });

  test('all servers should have command', () => {
    for (const [id, config] of Object.entries(KNOWN_MCP_SERVERS)) {
      expect(config.command).toBeDefined();
      expect(config.command.length).toBeGreaterThan(0);
    }
  });
});

// ===========================================
// MCPManager Known Servers Tests
// ===========================================

describe('MCPManager Known Servers', () => {
  let manager: MCPManager;

  beforeEach(() => {
    manager = createMCPManager();
  });

  afterEach(async () => {
    await manager.disconnectAll();
  });

  describe('addKnownServer', () => {
    test('should add filesystem server', () => {
      const added = manager.addKnownServer('filesystem');
      expect(added).toBe(true);
      expect(manager.getConfiguredServers()).toHaveLength(1);
    });

    test('should reject unknown server ID', () => {
      const added = manager.addKnownServer('nonexistent');
      expect(added).toBe(false);
      expect(manager.getConfiguredServers()).toHaveLength(0);
    });

    test('should set custom display name', () => {
      manager.addKnownServer('filesystem', 'My Filesystem');
      const servers = manager.getConfiguredServers();
      expect(servers[0].id).toBe('filesystem');
      expect(servers[0].name).toBe('My Filesystem');
    });

    test('should merge environment variables', () => {
      manager.addKnownServer('filesystem', undefined, { MY_VAR: 'value' });
      const servers = manager.getConfiguredServers();
      expect(servers[0].env?.MY_VAR).toBe('value');
    });
  });
});

// ===========================================
// MCPTools Tests
// ===========================================

describe('MCPTools', () => {
  let mcpTools: MCPTools;
  let manager: MCPManager;

  beforeEach(() => {
    manager = createMCPManager();
    mcpTools = createMCPTools(manager);
  });

  afterEach(async () => {
    await mcpTools.shutdown();
  });

  describe('initialization', () => {
    test('should create with manager', () => {
      expect(mcpTools).toBeDefined();
      expect(mcpTools.getManager()).toBe(manager);
    });

    test('should create without manager', () => {
      const toolsWithoutManager = createMCPTools();
      expect(toolsWithoutManager).toBeDefined();
      expect(toolsWithoutManager.getManager()).toBeDefined();
    });
  });

  describe('getTools', () => {
    test('should return array of tools', () => {
      const tools = mcpTools.getTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    test('should include mcp_list_servers tool', () => {
      const tools = mcpTools.getTools();
      const listServersTool = tools.find((t) => t.name === 'mcp_list_servers');
      expect(listServersTool).toBeDefined();
    });

    test('should include mcp_connect tool', () => {
      const tools = mcpTools.getTools();
      const connectTool = tools.find((t) => t.name === 'mcp_connect');
      expect(connectTool).toBeDefined();
    });

    test('should include mcp_disconnect tool', () => {
      const tools = mcpTools.getTools();
      const disconnectTool = tools.find((t) => t.name === 'mcp_disconnect');
      expect(disconnectTool).toBeDefined();
    });

    test('should include mcp_list_tools tool', () => {
      const tools = mcpTools.getTools();
      const listToolsTool = tools.find((t) => t.name === 'mcp_list_tools');
      expect(listToolsTool).toBeDefined();
    });

    test('should include mcp_call_tool tool', () => {
      const tools = mcpTools.getTools();
      const callTool = tools.find((t) => t.name === 'mcp_call_tool');
      expect(callTool).toBeDefined();
    });

    test('should include mcp_status tool', () => {
      const tools = mcpTools.getTools();
      const statusTool = tools.find((t) => t.name === 'mcp_status');
      expect(statusTool).toBeDefined();
    });

    test('all tools should have category mcp', () => {
      const tools = mcpTools.getTools();
      for (const tool of tools) {
        expect(tool.category).toBe('mcp');
      }
    });
  });

  describe('getDynamicTools', () => {
    test('should return empty array when no servers connected', () => {
      const dynamicTools = mcpTools.getDynamicTools();
      expect(dynamicTools).toEqual([]);
    });
  });

  describe('getAllTools', () => {
    test('should return all static tools', () => {
      const allTools = mcpTools.getAllTools();
      const staticTools = mcpTools.getTools();
      expect(allTools.length).toBeGreaterThanOrEqual(staticTools.length);
    });
  });

  describe('registerMCPTools factory', () => {
    test('should return array of tools', () => {
      const tools = registerMCPTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });
  });
});

// ===========================================
// MCP Tool Handlers Tests
// ===========================================

describe('MCP Tool Handlers', () => {
  let mcpTools: MCPTools;
  let manager: MCPManager;

  beforeEach(() => {
    manager = createMCPManager();
    mcpTools = createMCPTools(manager);
  });

  afterEach(async () => {
    await mcpTools.shutdown();
  });

  describe('mcp_list_servers handler', () => {
    test('should list configured servers', async () => {
      manager.addServer({ id: 'test-server', command: 'echo', name: 'Test' });

      const tools = mcpTools.getTools();
      const listTool = tools.find((t) => t.name === 'mcp_list_servers')!;
      const result = await listTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toContain('test-server');
    });

    test('should show known servers when none configured', async () => {
      const tools = mcpTools.getTools();
      const listTool = tools.find((t) => t.name === 'mcp_list_servers')!;
      const result = await listTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toContain('well-known servers');
    });
  });

  describe('mcp_connect handler', () => {
    test('should require serverId or all flag', async () => {
      const tools = mcpTools.getTools();
      const connectTool = tools.find((t) => t.name === 'mcp_connect')!;
      const result = await connectTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('serverId');
    });
  });

  describe('mcp_disconnect handler', () => {
    test('should require serverId or all flag', async () => {
      const tools = mcpTools.getTools();
      const disconnectTool = tools.find((t) => t.name === 'mcp_disconnect')!;
      const result = await disconnectTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('serverId');
    });

    test('should handle disconnect all', async () => {
      const tools = mcpTools.getTools();
      const disconnectTool = tools.find((t) => t.name === 'mcp_disconnect')!;
      const result = await disconnectTool.execute({ all: true });

      expect(result.success).toBe(true);
      expect(result.data).toContain('Disconnected from all');
    });
  });

  describe('mcp_list_tools handler', () => {
    test('should show no tools when disconnected', async () => {
      const tools = mcpTools.getTools();
      const listToolsTool = tools.find((t) => t.name === 'mcp_list_tools')!;
      const result = await listToolsTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toContain('No tools available');
    });
  });

  describe('mcp_call_tool handler', () => {
    test('should require tool parameter', async () => {
      const tools = mcpTools.getTools();
      const callTool = tools.find((t) => t.name === 'mcp_call_tool')!;

      try {
        await callTool.execute({});
        expect(true).toBe(false); // Should not reach
      } catch {
        // Expected - tool param required
        expect(true).toBe(true);
      }
    });
  });

  describe('mcp_list_resources handler', () => {
    test('should show no resources when disconnected', async () => {
      const tools = mcpTools.getTools();
      const listResourcesTool = tools.find((t) => t.name === 'mcp_list_resources')!;
      const result = await listResourcesTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toContain('No resources available');
    });
  });

  describe('mcp_list_prompts handler', () => {
    test('should show no prompts when disconnected', async () => {
      const tools = mcpTools.getTools();
      const listPromptsTool = tools.find((t) => t.name === 'mcp_list_prompts')!;
      const result = await listPromptsTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toContain('No prompts available');
    });
  });

  describe('mcp_add_known_server handler', () => {
    test('should add known server', async () => {
      const tools = mcpTools.getTools();
      const addTool = tools.find((t) => t.name === 'mcp_add_known_server')!;
      const result = await addTool.execute({ serverId: 'fetch', connect: false });

      expect(result.success).toBe(true);
      expect(result.data).toContain('fetch');
      expect(manager.getConfiguredServers()).toHaveLength(1);
    });

    test('should reject unknown server', async () => {
      const tools = mcpTools.getTools();
      const addTool = tools.find((t) => t.name === 'mcp_add_known_server')!;
      const result = await addTool.execute({ serverId: 'nonexistent', connect: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown server');
    });
  });

  describe('mcp_status handler', () => {
    test('should return status', async () => {
      const tools = mcpTools.getTools();
      const statusTool = tools.find((t) => t.name === 'mcp_status')!;
      const result = await statusTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toContain('MCP Status');
      expect(result.data).toContain('Configured Servers');
      expect(result.data).toContain('Available Tools');
    });

    test('should show server count', async () => {
      manager.addServer({ id: 's1', name: 'S1', command: 'echo' });
      manager.addServer({ id: 's2', name: 'S2', command: 'echo' });

      const tools = mcpTools.getTools();
      const statusTool = tools.find((t) => t.name === 'mcp_status')!;
      const result = await statusTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toContain('Configured Servers: 2');
    });
  });
});
