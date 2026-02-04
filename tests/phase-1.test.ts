/**
 * Phase 1 Implementation Tests
 * Tests for prompts, permissions, context compaction, and cost tracking
 */

import { describe, it, expect } from 'bun:test';

// Test 1: Prompt Loading
describe('Phase 1.1: Prompt Loading', () => {
  it('should load prompts from markdown files', async () => {
    const { loadPromptsWithCache } = await import('../src/utils/prompt-loader.js');
    const prompts = loadPromptsWithCache('agents/prompts');

    expect(prompts).toBeDefined();
    expect(prompts.build).toBeDefined();
    expect(prompts.plan).toBeDefined();
    expect(prompts.review).toBeDefined();
    expect(prompts.general).toBeDefined();
    expect(prompts.build.length).toBeGreaterThan(0);
  });

  it('should cache loaded prompts', async () => {
    const { loadPromptsWithCache } = await import('../src/utils/prompt-loader.js');
    const prompts1 = loadPromptsWithCache('agents/prompts');
    const prompts2 = loadPromptsWithCache('agents/prompts');

    expect(prompts1).toBe(prompts2); // Same instance
  });
});

// Test 2: Permission Rules
describe('Phase 1.2: Permission Rules', () => {
  it('should match file paths correctly', async () => {
    const { matchPath } = await import('../src/security/permissions.js');

    expect(matchPath('src/app.ts', ['src/**/*.ts'])).toBe(true);
    expect(matchPath('.env', ['.env*'])).toBe(true);
    expect(matchPath('.gitignore', ['.git/**'])).toBe(false);
    expect(matchPath('node_modules/package/index.js', ['node_modules/**'])).toBe(true);
  });

  it('should match commands correctly', async () => {
    const { matchCommand } = await import('../src/security/permissions.js');

    expect(matchCommand('npm test', ['npm test'])).toBe(true);
    expect(matchCommand('npm run build', ['npm run *'])).toBe(true);
    expect(matchCommand('git status', ['git status'])).toBe(true);
    expect(matchCommand('sudo rm -rf /', ['sudo *'])).toBe(true);
  });

  it('should validate file access by agent role', async () => {
    const { DEFAULT_PERMISSIONS, validateFileAccess } = 
      await import('../src/security/permissions.js');

    const buildPerms = DEFAULT_PERMISSIONS.build;
    const reviewPerms = DEFAULT_PERMISSIONS.review;

    // Build can read and write
    expect(validateFileAccess('src/app.ts', 'read', buildPerms).allowed).toBe(true);
    expect(validateFileAccess('src/app.ts', 'write', buildPerms).allowed).toBe(true);

    // Review can only read
    expect(validateFileAccess('src/app.ts', 'read', reviewPerms).allowed).toBe(true);
    expect(validateFileAccess('src/app.ts', 'write', reviewPerms).allowed).toBe(false);

    // Cannot write to .env
    expect(validateFileAccess('.env', 'write', buildPerms).allowed).toBe(false);
  });

  it('should validate command execution by agent role', async () => {
    const { DEFAULT_PERMISSIONS, validateCommandExecution } = 
      await import('../src/security/permissions.js');

    const buildPerms = DEFAULT_PERMISSIONS.build;
    const planPerms = DEFAULT_PERMISSIONS.plan;

    // Build can run any command (except denied)
    expect(validateCommandExecution('npm test', buildPerms).allowed).toBe(true);
    expect(validateCommandExecution('bun build', buildPerms).allowed).toBe(true);

    // Plan can only run specific commands
    expect(validateCommandExecution('npm test', planPerms).allowed).toBe(true);
    expect(validateCommandExecution('npm install', planPerms).allowed).toBe(false);

    // Dangerous commands are blocked
    expect(validateCommandExecution('rm -rf /', buildPerms).allowed).toBe(false);
  });

  it('should use permission manager', async () => {
    const { agentPermissionManager } = await import('../src/security/permissions.js');

    const buildCanRead = agentPermissionManager.canReadFile('src/app.ts', 'build');
    expect(buildCanRead.allowed).toBe(true);

    const reviewCanWrite = agentPermissionManager.canWriteFile('src/app.ts', 'review');
    expect(reviewCanWrite.allowed).toBe(false);

    const buildCanRun = agentPermissionManager.canExecuteCommand('npm test', 'build');
    expect(buildCanRun.allowed).toBe(true);
  });
});

// Test 3: Context Compaction
describe('Phase 1.3: Context Compaction', () => {
  it('should compact long conversation history', async () => {
    const { ConversationCompactor } = await import('../src/conversation/compaction.js');
    const compactor = new ConversationCompactor({
      maxMessages: 10,
      preserveRecent: 3,
    });

    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
    }));

    const compacted = compactor.compact(messages);
    expect(compacted.length).toBeLessThanOrEqual(10);
    expect(compacted.length).toBeGreaterThanOrEqual(3);
  });

  it('should track compaction statistics', async () => {
    const { ConversationCompactor } = await import('../src/conversation/compaction.js');
    const compactor = new ConversationCompactor({
      maxMessages: 5,
      preserveRecent: 2,
    });

    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      content: 'x'.repeat(100),
    }));

    compactor.compact(messages);
    const stats = compactor.getStats();

    expect(stats.length).toBe(1);
    expect(stats[0].originalMessageCount).toBe(10);
    expect(stats[0].estimatedTokensSaved).toBeGreaterThan(0);
  });
});

// Test 4: Cost Tracking
describe('Phase 1.4: Cost Tracking', () => {
  it('should estimate costs correctly', async () => {
    const { estimateCost } = await import('../src/models/cost-tracker.js');

    // Free tier (Gemini)
    expect(estimateCost('gemini', 'gemini-2.0-flash', 1000, 500)).toBe(0);

    // Paid tier (GPT-4)
    const cost = estimateCost('openai', 'gpt-4', 1000, 500);
    expect(cost).toBeGreaterThan(0);

    // Cost = (1000 / 1M) * 30 + (500 / 1M) * 60
    const expectedCost = (1000 / 1_000_000) * 30 + (500 / 1_000_000) * 60;
    expect(Math.abs(cost - expectedCost)).toBeLessThan(0.0001);
  });

  it('should track costs in database', async () => {
    const { CostTracker } = await import('../src/models/cost-tracker.js');
    const tracker = new CostTracker(':memory:'); // In-memory DB for testing

    const sessionId = 'test-session-123';
    const record = tracker.record(
      'openai',
      'gpt-3.5-turbo',
      1000,
      500,
      'build',
      sessionId
    );

    expect(record.id).toBeDefined();
    expect(record.cost).toBeGreaterThan(0);

    const totalCost = tracker.getSessionCost(sessionId);
    expect(totalCost).toBe(record.cost);

    tracker.close();
  });

  it('should provide cost summaries', async () => {
    const { CostTracker } = await import('../src/models/cost-tracker.js');
    const tracker = new CostTracker(':memory:');

    const sessionId = 'test-session-456';

    // Record multiple costs
    tracker.record('gemini', 'gemini-2.0-flash', 1000, 500, 'build', sessionId);
    tracker.record('openai', 'gpt-3.5-turbo', 2000, 1000, 'plan', sessionId);

    const summary = tracker.getSummary(sessionId);
    expect(summary.totalTokens).toBe(4500);
    expect(summary.inputTokens).toBe(3000);
    expect(summary.outputTokens).toBe(1500);
    expect(summary.byProvider.gemini).toBeDefined();
    expect(summary.byAgent.build).toBeDefined();

    tracker.close();
  });
});

// Test 5: Integration - Permissions in context
describe('Phase 1: Integration', () => {
  it('should load agents with externalized prompts', async () => {
    const { AGENT_PROMPTS } = await import('../src/agents/prompts.js');

    expect(AGENT_PROMPTS.build).toBeDefined();
    expect(AGENT_PROMPTS.build.length).toBeGreaterThan(100);
    expect(AGENT_PROMPTS.build).toContain('Build');
  });

  it('should enforce permissions on sensitive files', async () => {
    const { agentPermissionManager } = await import('../src/security/permissions.js');

    // .env files should be protected
    const envAccess = agentPermissionManager.canWriteFile('.env', 'build');
    expect(envAccess.allowed).toBe(false);

    // .git should be protected
    const gitAccess = agentPermissionManager.canWriteFile('.git/config', 'build');
    expect(gitAccess.allowed).toBe(false);

    // Regular files should work
    const appAccess = agentPermissionManager.canWriteFile('src/app.ts', 'build');
    expect(appAccess.allowed).toBe(true);
  });
});
