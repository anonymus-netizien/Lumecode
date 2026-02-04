/**
 * Phase 2 Tests
 * Dynamic Agent Configuration & Generation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';
import {
  AgentInfoSchema,
  validateAgentInfo,
  validateAgentConfigFile,
  mergeAgentConfig,
  DEFAULT_BUILD_AGENT,
  DEFAULT_PLAN_AGENT,
  DEFAULT_REVIEW_AGENT,
  DEFAULT_GENERAL_AGENT,
  getDefaultAgentInfo,
} from '../src/agents/config/agent-info';
import {
  AgentGenerator,
  getAgentGenerator,
  resetAgentGenerator,
} from '../src/agents/config/agent-generator';

// ===========================================
// Phase 2.1: AgentInfo Schema Tests
// ===========================================

describe('Phase 2.1: AgentInfo Schema', () => {
  it('should validate basic AgentInfo structure', () => {
    const result = validateAgentInfo(DEFAULT_BUILD_AGENT);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.id).toBe('build');
      expect(result.data.role).toBe('build');
    }
  });

  it('should reject invalid AgentInfo', () => {
    const invalid = {
      id: 'test',
      // missing required fields
    };
    const result = validateAgentInfo(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('should validate AgentConfigFile with multiple agents', () => {
    const config = {
      agents: [DEFAULT_BUILD_AGENT, DEFAULT_PLAN_AGENT],
      version: '1.0.0',
    };
    const result = validateAgentConfigFile(config);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.agents.length).toBe(2);
    }
  });

  it('should merge defaults with specific config', () => {
    const defaults = {
      configuration: {
        maxContextTokens: 5000,
        defaultTemperature: 0.5,
      },
    };

    const specific = { ...DEFAULT_BUILD_AGENT };

    const merged = mergeAgentConfig(defaults, specific);
    expect(merged.configuration.maxContextTokens).toBe(16000); // Specific overrides defaults
    expect(merged.role).toBe('build');
  });

  it('should provide default agent info by role', () => {
    const build = getDefaultAgentInfo('build');
    const plan = getDefaultAgentInfo('plan');
    const review = getDefaultAgentInfo('review');
    const general = getDefaultAgentInfo('general');

    expect(build.role).toBe('build');
    expect(plan.role).toBe('plan');
    expect(review.role).toBe('review');
    expect(general.role).toBe('general');
  });

  it('should validate capabilities structure', () => {
    expect(DEFAULT_BUILD_AGENT.capabilities.canReadFiles).toBe(true);
    expect(DEFAULT_BUILD_AGENT.capabilities.canExecuteCommands).toBe(true);
    expect(DEFAULT_REVIEW_AGENT.capabilities.canWriteFiles).toBe(false);
    expect(DEFAULT_REVIEW_AGENT.capabilities.canExecuteCommands).toBe(false);
  });

  it('should validate configuration limits', () => {
    const agent = DEFAULT_PLAN_AGENT;
    expect(agent.configuration.maxContextTokens).toBeGreaterThan(0);
    expect(agent.configuration.defaultTemperature).toBeGreaterThanOrEqual(0);
    expect(agent.configuration.defaultTemperature).toBeLessThanOrEqual(1);
    expect(agent.configuration.maxRetries).toBeGreaterThan(0);
  });

  it('should validate tools structure', () => {
    const agent = DEFAULT_BUILD_AGENT;
    expect(Array.isArray(agent.tools.enabled)).toBe(true);
    expect(Array.isArray(agent.tools.disabled)).toBe(true);
    expect(agent.tools.enabled.length).toBeGreaterThan(0);
  });

  it('should validate prompts have system message', () => {
    [DEFAULT_BUILD_AGENT, DEFAULT_PLAN_AGENT, DEFAULT_REVIEW_AGENT, DEFAULT_GENERAL_AGENT].forEach(
      (agent) => {
        expect(agent.prompts.system.length).toBeGreaterThan(0);
      }
    );
  });
});

// ===========================================
// Phase 2.1: AgentGenerator Tests
// ===========================================

describe('Phase 2.1: AgentGenerator', () => {
  let testConfigDir: string;
  let testConfigPath: string;

  beforeEach(() => {
    testConfigDir = join('/tmp', `lumecode-test-${Date.now()}`);
    testConfigPath = join(testConfigDir, 'agents.yaml');
    mkdirSync(testConfigDir, { recursive: true });
    resetAgentGenerator();
  });

  afterEach(() => {
    try {
      unlinkSync(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
    try {
      rmdirSync(testConfigDir);
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  it('should load default agents when no config file exists', () => {
    const generator = new AgentGenerator(testConfigPath);
    const agents = generator.listAgents();
    expect(agents.length).toBe(4);
    expect(agents.map((a) => a.role).sort()).toEqual(['build', 'general', 'plan', 'review']);
  });

  it('should get agent info by id', () => {
    const generator = new AgentGenerator(testConfigPath);
    const build = generator.getAgentInfo('build');
    expect(build).not.toBeNull();
    if (build) {
      expect(build.role).toBe('build');
      expect(build.capabilities.canExecuteCommands).toBe(true);
    }
  });

  it('should get agent info by role', () => {
    const generator = new AgentGenerator(testConfigPath);
    const plan = generator.getAgentByRole('plan');
    expect(plan).not.toBeNull();
    if (plan) {
      expect(plan.role).toBe('plan');
    }
  });

  it('should check if agent exists', () => {
    const generator = new AgentGenerator(testConfigPath);
    expect(generator.hasAgent('build')).toBe(true);
    expect(generator.hasAgent('nonexistent')).toBe(false);
  });

  it('should update agent configuration at runtime', () => {
    const generator = new AgentGenerator(testConfigPath);
    const success = generator.updateAgent('build', {
      configuration: {
        ...DEFAULT_BUILD_AGENT.configuration,
        defaultTemperature: 0.9,
      },
    });
    expect(success).toBe(true);

    const updated = generator.getAgentInfo('build');
    expect(updated?.configuration.defaultTemperature).toBe(0.9);
  });

  it('should reject invalid agent updates', () => {
    const generator = new AgentGenerator(testConfigPath);
    const success = generator.updateAgent('build', {
      // @ts-expect-error - intentionally invalid
      configuration: {
        defaultTemperature: 999, // Out of range
      },
    });
    expect(success).toBe(false);
  });

  it('should return null for non-existent agent', () => {
    const generator = new AgentGenerator(testConfigPath);
    const agent = generator.getAgentInfo('nonexistent');
    expect(agent).toBeNull();
  });

  it('should export configuration', () => {
    const generator = new AgentGenerator(testConfigPath);
    const exported = generator.exportConfig();
    expect(exported.version).toBeDefined();
    expect(exported.agents.length).toBe(4);
  });

  it('should use singleton pattern', () => {
    resetAgentGenerator();
    const gen1 = getAgentGenerator();
    const gen2 = getAgentGenerator();
    expect(gen1).toBe(gen2);
  });

  it('should list all agents with metadata', () => {
    const generator = new AgentGenerator(testConfigPath);
    const agents = generator.listAgents();
    agents.forEach((agent) => {
      expect(agent.id).toBeDefined();
      expect(agent.role).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.description).toBeDefined();
      expect(agent.version).toBeDefined();
      expect(agent.capabilities).toBeDefined();
      expect(agent.configuration).toBeDefined();
      expect(agent.tools).toBeDefined();
      expect(agent.prompts).toBeDefined();
    });
  });

  it('should maintain different roles with different capabilities', () => {
    const generator = new AgentGenerator(testConfigPath);
    const build = generator.getAgentInfo('build');
    const review = generator.getAgentInfo('review');

    expect(build?.capabilities.canExecuteCommands).toBe(true);
    expect(review?.capabilities.canExecuteCommands).toBe(false);

    expect(build?.capabilities.canWriteFiles).toBe(true);
    expect(review?.capabilities.canWriteFiles).toBe(false);
  });

  it('should have appropriate token limits per agent', () => {
    const generator = new AgentGenerator(testConfigPath);
    const build = generator.getAgentInfo('build');
    const review = generator.getAgentInfo('review');

    // Build agents typically need more context
    expect(build?.configuration.maxContextTokens).toBeGreaterThanOrEqual(
      review?.configuration.maxContextTokens || 0
    );
  });

  it('should preserve agent metadata', () => {
    const generator = new AgentGenerator(testConfigPath);
    const build = generator.getAgentInfo('build');
    expect(build).toBeDefined();
    expect(build?.id).toBe('build');
    expect(build?.role).toBe('build');
  });
});

// ===========================================
// Phase 2.1: Integration Tests
// ===========================================

describe('Phase 2.1: Integration', () => {
  it('should maintain agent configuration consistency', () => {
    const generator = new AgentGenerator();
    const allAgents = generator.listAgents();

    allAgents.forEach((agent) => {
      const info = generator.getAgentInfo(agent.id);
      expect(info?.id).toBe(agent.id);
      expect(info?.role).toBe(agent.role);
      expect(info?.capabilities).toEqual(agent.capabilities);
    });
  });

  it('should support updating and retrieving updated configuration', () => {
    const generator = new AgentGenerator();
    const originalTemp = generator.getAgentInfo('build')?.configuration.defaultTemperature;

    generator.updateAgent('build', {
      configuration: {
        ...DEFAULT_BUILD_AGENT.configuration,
        defaultTemperature: 0.3,
      },
    });

    const updated = generator.getAgentInfo('build')?.configuration.defaultTemperature;
    expect(updated).toBe(0.3);
    expect(updated).not.toBe(originalTemp);
  });
});
