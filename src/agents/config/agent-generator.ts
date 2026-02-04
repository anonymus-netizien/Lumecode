/**
 * AgentGenerator
 * Creates BaseAgent instances from AgentInfo configuration
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import type { AgentInfo, AgentConfigFile } from './agent-info.js';
import { 
  validateAgentConfigFile, 
  validateAgentInfo,
  mergeAgentConfig,
  getDefaultAgentInfo,
  AgentInfoSchema,
} from './agent-info.js';
import { BaseAgent } from '../base.js';
import { PromptLoader } from '../../utils/prompt-loader.js';
import { agentPermissionManager } from '../../security/permissions.js';
import type { AgentRole } from '../../types/index.js';

export class AgentGenerator {
  private agents: Map<string, AgentInfo> = new Map();
  private configPath: string;
  private promptLoader: PromptLoader;

  constructor(configPath?: string) {
    this.configPath = configPath || resolve(process.cwd(), 'config/agents.yaml');
    this.promptLoader = new PromptLoader();
    this.loadConfiguration();
  }

  /**
   * Load agents from configuration file
   */
  private loadConfiguration(): void {
    try {
      // Try to load from file first
      const content = readFileSync(this.configPath, 'utf-8');
      const parsed = parseYaml(content) as unknown;
      
      const validation = validateAgentConfigFile(parsed);
      if (!validation.valid) {
        console.warn(`Config validation failed: ${validation.errors.join(', ')}. Using defaults.`);
        this.loadDefaults();
        return;
      }

      const config = validation.data;
      
      // Process each agent with defaults
      for (const agent of config.agents) {
        const merged = mergeAgentConfig(config.defaults, agent);
        const infoValidation = validateAgentInfo(merged);
        
        if (infoValidation.valid) {
          this.agents.set(agent.id, infoValidation.data);
        } else {
          console.warn(`Agent ${agent.id} validation failed: ${infoValidation.errors.join(', ')}`);
        }
      }
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}: ${String(error)}. Using defaults.`);
      this.loadDefaults();
    }
  }

  /**
   * Load default agent configurations
   */
  private loadDefaults(): void {
    const roles: AgentRole[] = ['build', 'plan', 'review', 'general'];
    for (const role of roles) {
      const defaultInfo = getDefaultAgentInfo(role);
      this.agents.set(role, defaultInfo);
    }
  }

  /**
   * Generate BaseAgent instance from AgentInfo
   */
  async generateAgent(agentId: string): Promise<BaseAgent> {
    const info = this.agents.get(agentId);
    if (!info) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    // Load prompt from file or use provided
    let systemPrompt = info.prompts.system;
    try {
      const loadedPrompt = await this.promptLoader.load(info.role);
      if (loadedPrompt) {
        systemPrompt = loadedPrompt;
      }
    } catch {
      // Fall back to configured prompt
    }

    // Create agent instance based on role
    const agent = new BaseAgent(info.role);

    // Bind configuration
    (agent as any).agentInfo = info;
    (agent as any).configuration = info.configuration;

    return agent;
  }

  /**
   * List all available agents
   */
  listAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent metadata without instantiation
   */
  getAgentInfo(agentId: string): AgentInfo | null {
    return this.agents.get(agentId) ?? null;
  }

  /**
   * Get agent by role
   */
  getAgentByRole(role: AgentRole): AgentInfo | null {
    const agents = Array.from(this.agents.values());
    return agents.find(a => a.role === role) ?? null;
  }

  /**
   * Check if agent exists
   */
  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Update agent configuration at runtime
   */
  updateAgent(agentId: string, updates: Partial<AgentInfo>): boolean {
    const existing = this.agents.get(agentId);
    if (!existing) return false;

    const merged: AgentInfo = {
      ...existing,
      ...updates,
    };

    const validation = validateAgentInfo(merged);
    if (!validation.valid) {
      return false;
    }

    this.agents.set(agentId, validation.data);
    return true;
  }

  /**
   * Hot-reload configuration from file
   */
  reload(): void {
    this.agents.clear();
    this.loadConfiguration();
  }

  /**
   * Get all agents as a map
   */
  getAllAgents(): Map<string, AgentInfo> {
    return new Map(this.agents);
  }

  /**
   * Export current configuration
   */
  exportConfig(): AgentConfigFile {
    return {
      version: '1.0.0',
      agents: Array.from(this.agents.values()),
    };
  }

  /**
   * Get agent capabilities
   */
  getCapabilities(agentId: string): any {
    const info = this.agents.get(agentId);
    if (!info) return null;

    return {
      id: info.id,
      name: info.name,
      description: info.description,
      capabilities: info.capabilities,
      tools: info.tools,
      permissions: agentPermissionManager.getRuleset(info.role),
    };
  }
}

// Singleton instance
let generatorInstance: AgentGenerator | null = null;

/**
 * Get or create singleton AgentGenerator
 */
export function getAgentGenerator(configPath?: string): AgentGenerator {
  if (!generatorInstance) {
    generatorInstance = new AgentGenerator(configPath);
  }
  return generatorInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetAgentGenerator(): void {
  generatorInstance = null;
}
