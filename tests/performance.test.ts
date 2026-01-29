/**
 * Performance Tests for Lumecode
 *
 * Tests for performance, scalability, and stress scenarios:
 * - Memory usage under load
 * - Large conversation handling
 * - Concurrent operations
 * - Tool registry performance
 * - Context window efficiency
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ConversationManager } from '../src/conversation/manager';
import { ContextWindowManager } from '../src/conversation/context-window';
import { ToolRegistry, BaseTool } from '../src/tools/registry';
import type { ToolParameters } from '../src/types/index';
import type { ToolCategory } from '../src/tools/types';
import { createMockProvider, createMockFileSystem, createMockGitRepository } from './mocks';

// ===========================================
// Mock Tool for Testing
// ===========================================

class MockTool extends BaseTool {
  name: string;
  description: string;
  category: ToolCategory = 'file_read';
  parameters: ToolParameters;
  private executeFn: (args: Record<string, unknown>) => Promise<{ success: boolean; output?: string; error?: string }>;

  constructor(config: {
    name: string;
    description: string;
    parameters: ToolParameters;
    execute: (args: Record<string, unknown>) => Promise<{ success: boolean; output?: string; error?: string }>;
  }) {
    super();
    this.name = config.name;
    this.description = config.description;
    this.parameters = config.parameters;
    this.executeFn = config.execute;
  }

  async execute(args: Record<string, unknown>): Promise<{ success: boolean; output?: string; error?: string }> {
    return this.executeFn(args);
  }
}

// ===========================================
// Performance Test Utilities
// ===========================================

/**
 * Measure execution time of a synchronous function
 */
function measureTimeSync<T>(fn: () => T): { result: T; duration: number } {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * Measure execution time of an async function
 */
async function measureTimeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * Run a function multiple times and return average duration
 */
async function benchmark<T>(
  fn: () => Promise<T> | T,
  iterations: number = 100
): Promise<{ avgDuration: number; minDuration: number; maxDuration: number }> {
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;
    durations.push(duration);
  }

  return {
    avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
  };
}

/**
 * Generate large text content
 */
function generateLargeContent(lines: number): string {
  const content: string[] = [];
  for (let i = 0; i < lines; i++) {
    content.push(`Line ${i}: ${'x'.repeat(80)}`);
  }
  return content.join('\n');
}

// ===========================================
// Conversation Performance Tests
// ===========================================

describe('Conversation Performance', () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager();
  });

  test('should handle large number of conversations', () => {
    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 100; i++) {
        manager.create({ title: `Conversation ${i}` });
      }
    });

    // Verify all conversations created
    const conversations = manager.list();
    expect(conversations.length).toBe(100);

    // Should complete quickly (< 100ms for 100 conversations)
    expect(duration).toBeLessThan(100);
  });

  test('should handle conversation with many messages', () => {
    const conv = manager.create({ title: 'Large Conversation' });
    manager.setActive(conv.id);

    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 500; i++) {
        manager.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}: ${'content '.repeat(20)}`,
        });
      }
    });

    const messages = manager.getMessages(conv.id);
    expect(messages.length).toBe(500);

    // Should complete quickly (< 200ms for 500 messages)
    expect(duration).toBeLessThan(200);
  });

  test('should handle rapid branch creation', () => {
    const conv = manager.create({ title: 'Branch Test' });
    manager.setActive(conv.id);

    // Add some initial messages
    for (let i = 0; i < 10; i++) {
      manager.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      });
    }

    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 20; i++) {
        const branch = manager.createBranch(`Branch ${i}`);
        if (branch) {
          manager.switchBranch(branch.id);
          manager.addMessage({ role: 'user', content: `Branch ${i} message` });
        }
      }
    });

    // Should complete quickly (< 100ms for 20 branches)
    expect(duration).toBeLessThan(100);
  });

  test('should export/import large conversation efficiently', () => {
    const conv = manager.create({ title: 'Export Test' });
    manager.setActive(conv.id);

    // Add many messages
    for (let i = 0; i < 200; i++) {
      manager.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}: ${'content '.repeat(50)}`,
      });
    }

    // Measure export
    const { result: exported, duration: exportDuration } = measureTimeSync(() =>
      manager.exportToJSON(conv.id)
    );

    expect(exportDuration).toBeLessThan(50);
    expect(exported.length).toBeGreaterThan(1000);

    // Measure import
    const { duration: importDuration } = measureTimeSync(() =>
      manager.importFromJSON(exported)
    );

    expect(importDuration).toBeLessThan(50);
  });
});

// ===========================================
// Context Window Performance Tests
// ===========================================

describe('Context Window Performance', () => {
  test('should handle many file additions', () => {
    const contextManager = new ContextWindowManager({
      maxTokens: 128000,
      reservedForResponse: 4096,
    });

    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 100; i++) {
        contextManager.addFile(
          `/src/file${i}.ts`,
          `export const value${i} = ${i};`,
          'typescript',
          Math.random() * 10
        );
      }
    });

    const stats = contextManager.getStats();
    expect(stats.fileCount).toBe(100);

    // Should complete quickly (< 100ms for 100 files)
    expect(duration).toBeLessThan(100);
  });

  test('should build context window efficiently', () => {
    const contextManager = new ContextWindowManager({
      maxTokens: 128000,
      reservedForResponse: 4096,
    });

    // Add files
    for (let i = 0; i < 50; i++) {
      contextManager.addFile(
        `/src/file${i}.ts`,
        generateLargeContent(50), // ~50 lines per file
        'typescript',
        i % 10
      );
    }

    // Add messages
    for (let i = 0; i < 50; i++) {
      contextManager.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}: ${'word '.repeat(100)}`,
      });
    }

    const { result: contextWindow, duration } = measureTimeSync(() =>
      contextManager.buildContextWindow()
    );

    expect(contextWindow.fileContext.length).toBeGreaterThan(0);
    expect(contextWindow.messages.length).toBeGreaterThan(0);

    // Should build quickly (< 50ms)
    expect(duration).toBeLessThan(50);
  });

  test('should prune efficiently under memory pressure', () => {
    const contextManager = new ContextWindowManager({
      maxTokens: 5000,
      reservedForResponse: 1000,
      summarizationThreshold: 0.7,
    });

    // Add enough content to trigger pruning
    for (let i = 0; i < 100; i++) {
      contextManager.addFile(
        `/src/file${i}.ts`,
        generateLargeContent(10),
        'typescript',
        i % 10
      );
    }

    const { duration } = measureTimeSync(() =>
      contextManager.autoPrune()
    );

    // Pruning should be fast
    expect(duration).toBeLessThan(50);

    // Should have pruned something or maintained limits
    const stats = contextManager.getStats();
    expect(stats.totalTokens).toBeLessThanOrEqual(5000);
  });

  test('should handle getting stats efficiently', () => {
    const contextManager = new ContextWindowManager({
      maxTokens: 128000,
      reservedForResponse: 4096,
    });

    // Add files and messages
    for (let i = 0; i < 30; i++) {
      contextManager.addFile(
        `/src/file${i}.ts`,
        generateLargeContent(30),
        'typescript',
        i % 10
      );
    }

    for (let i = 0; i < 30; i++) {
      contextManager.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}: ${'content '.repeat(50)}`,
      });
    }

    // Get stats many times
    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 100; i++) {
        contextManager.getStats();
      }
    });

    // Getting stats should be fast
    expect(duration).toBeLessThan(100);
  });
});

// ===========================================
// Tool Registry Performance Tests
// ===========================================

describe('Tool Registry Performance', () => {
  test('should handle many tool registrations', () => {
    const registry = new ToolRegistry();

    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 100; i++) {
        registry.register(new MockTool({
          name: `tool_${i}`,
          description: `Test tool ${i}`,
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'string', description: `Input for tool ${i}` },
            },
            required: ['input'],
          },
          execute: async () => ({ success: true }),
        }));
      }
    });

    expect(registry.getAll().length).toBe(100);

    // Should complete quickly (< 50ms for 100 tools)
    expect(duration).toBeLessThan(50);
  });

  test('should execute tools rapidly', async () => {
    const registry = new ToolRegistry();

    // Register a simple tool
    registry.register(new MockTool({
      name: 'quick_tool',
      description: 'A quick tool',
      parameters: {
        type: 'object',
        properties: { value: { type: 'number', description: 'Value to double' } },
        required: ['value'],
      },
      execute: async (params) => ({
        success: true,
        output: String((params.value as number) * 2),
      }),
    }));

    const stats = await benchmark(
      async () => {
        const result = await registry.execute('quick_tool', { value: 42 });
        return result;
      },
      50
    );

    // Average execution should be very fast (< 5ms)
    expect(stats.avgDuration).toBeLessThan(5);
  });

  test('should get all tools efficiently', () => {
    const registry = new ToolRegistry();

    // Register many tools
    for (let i = 0; i < 50; i++) {
      registry.register(new MockTool({
        name: `tool_${i}`,
        description: `Test tool ${i}`,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        execute: async () => ({ success: true }),
      }));
    }

    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 100; i++) {
        registry.getAll();
      }
    });

    // Getting all tools should be fast
    expect(duration).toBeLessThan(50);
  });
});

// ===========================================
// Mock Provider Performance Tests
// ===========================================

describe('Mock Provider Performance', () => {
  test('should handle rapid chat calls', async () => {
    const provider = createMockProvider();

    const stats = await benchmark(
      async () => {
        return provider.chat([{ role: 'user', content: 'Test message' }]);
      },
      100
    );

    // Average chat call should be very fast (< 5ms without delay)
    expect(stats.avgDuration).toBeLessThan(5);
  });

  test('should handle streaming efficiently', async () => {
    const provider = createMockProvider();
    provider.queueResponse('This is a longer response that will be streamed in chunks.');

    const stats = await benchmark(
      async () => {
        let chunks = 0;
        await provider.chatStream(
          [{ role: 'user', content: 'Test' }],
          () => {
            chunks++;
          }
        );
        return chunks;
      },
      50
    );

    // Streaming should be fast
    expect(stats.avgDuration).toBeLessThan(20);
  });

  test('should track call history without memory leak', async () => {
    const provider = createMockProvider();

    // Make many calls
    for (let i = 0; i < 100; i++) {
      await provider.chat([{ role: 'user', content: `Message ${i}` }]);
    }

    const history = provider.getCallHistory();
    expect(history.length).toBe(100);

    // Reset should clear history
    provider.reset();
    expect(provider.getCallHistory().length).toBe(0);
  });
});

// ===========================================
// Mock FileSystem Performance Tests
// ===========================================

describe('Mock FileSystem Performance', () => {
  test('should handle many file operations', () => {
    const fs = createMockFileSystem();

    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 500; i++) {
        fs.writeFile(`/project/file${i}.ts`, `content ${i}`);
      }
    });

    // List all files in project directory
    const files = fs.readdir('/project');
    expect(files.length).toBe(500);

    // Should complete quickly (< 100ms for 500 files)
    expect(duration).toBeLessThan(100);
  });

  test('should snapshot/restore efficiently', () => {
    const fs = createMockFileSystem();

    // Create files
    for (let i = 0; i < 100; i++) {
      fs.writeFile(`/project/file${i}.ts`, generateLargeContent(20));
    }

    // Snapshot
    let snap: ReturnType<typeof fs.snapshot>;
    const { duration: snapshotDuration } = measureTimeSync(() => {
      snap = fs.snapshot();
    });

    expect(snapshotDuration).toBeLessThan(50);

    // Modify
    for (let i = 0; i < 50; i++) {
      fs.writeFile(`/project/file${i}.ts`, 'modified');
    }

    // Restore
    const { duration: restoreDuration } = measureTimeSync(() =>
      fs.restore(snap!)
    );

    expect(restoreDuration).toBeLessThan(50);

    // Verify restore
    expect(fs.readFile('/project/file0.ts')).not.toBe('modified');
  });

  test('should handle deep directory structures', () => {
    const fs = createMockFileSystem();

    const { duration } = measureTimeSync(() => {
      for (let depth = 0; depth < 10; depth++) {
        const path = Array.from({ length: depth + 1 }, (_, i) => `level${i}`).join('/');
        for (let i = 0; i < 10; i++) {
          fs.writeFile(`/${path}/file${i}.ts`, `content at depth ${depth}`);
        }
      }
    });

    // Should handle deep structures efficiently
    expect(duration).toBeLessThan(100);
  });
});

// ===========================================
// Mock Git Performance Tests
// ===========================================

describe('Mock Git Performance', () => {
  test('should handle many commits', () => {
    const repo = createMockGitRepository();

    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 100; i++) {
        repo.modifyFile(`file${i % 10}.ts`, `content ${i}`);
        repo.add('.');
        repo.commit(`Commit ${i}`);
      }
    });

    const log = repo.log();
    expect(log.length).toBeGreaterThanOrEqual(100);

    // Should complete quickly (< 100ms for 100 commits)
    expect(duration).toBeLessThan(100);
  });

  test('should handle many branches', () => {
    const repo = createMockGitRepository();

    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 50; i++) {
        repo.branch(`feature/${i}`);
      }
    });

    // Should complete quickly
    expect(duration).toBeLessThan(50);
  });

  test('should handle rapid branch switching', () => {
    const repo = createMockGitRepository();

    // Create branches
    for (let i = 0; i < 10; i++) {
      repo.branch(`branch${i}`);
    }

    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 100; i++) {
        repo.checkout(`branch${i % 10}`);
      }
    });

    // Should switch quickly
    expect(duration).toBeLessThan(50);
  });
});

// ===========================================
// Concurrent Operations Tests
// ===========================================

describe('Concurrent Operations Performance', () => {
  test('should handle concurrent provider calls', async () => {
    const provider = createMockProvider();

    const { duration } = await measureTimeAsync(async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        provider.chat([{ role: 'user', content: `Message ${i}` }])
      );
      return Promise.all(promises);
    });

    // Concurrent calls should complete efficiently
    expect(duration).toBeLessThan(100);
  });

  test('should handle concurrent file operations', async () => {
    const fs = createMockFileSystem();

    const { duration } = await measureTimeAsync(async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve(fs.writeFile(`/project/file${i}.ts`, `content ${i}`))
      );
      return Promise.all(promises);
    });

    expect(fs.readdir('/project').length).toBe(100);

    // Should complete quickly
    expect(duration).toBeLessThan(50);
  });

  test('should handle concurrent conversation updates', async () => {
    const manager = new ConversationManager();
    
    // Create multiple conversations
    const conversations = Array.from({ length: 10 }, (_, i) =>
      manager.create({ title: `Conv ${i}` })
    );

    // Add messages to each conversation
    for (const conv of conversations) {
      manager.setActive(conv.id);
      manager.addMessage({ role: 'user', content: 'Test message' });
    }

    // Verify all messages were added
    for (const conv of conversations) {
      const messages = manager.getMessages(conv.id);
      expect(messages.length).toBe(1);
    }
  });
});

// ===========================================
// Memory Efficiency Tests
// ===========================================

describe('Memory Efficiency', () => {
  test('should not leak memory on repeated operations', () => {
    const manager = new ConversationManager();

    // Create and delete many conversations
    for (let i = 0; i < 100; i++) {
      const conv = manager.create({ title: `Temp ${i}` });
      manager.delete(conv.id);
    }

    // Should have no conversations
    expect(manager.list().length).toBe(0);
  });

  test('should handle large content without issues', () => {
    const contextManager = new ContextWindowManager({
      maxTokens: 128000,
      reservedForResponse: 4096,
    });

    // Add large file
    const largeContent = generateLargeContent(1000); // ~1000 lines
    contextManager.addFile('/large-file.ts', largeContent, 'typescript', 10);

    const stats = contextManager.getStats();
    expect(stats.fileCount).toBe(1);

    // Build context
    const contextWindow = contextManager.buildContextWindow();
    expect(contextWindow.fileContext.length).toBeGreaterThan(0);
  });

  test('should handle reset operations cleanly', async () => {
    const provider = createMockProvider();
    const fs = createMockFileSystem();
    const repo = createMockGitRepository();

    // Do many operations
    for (let i = 0; i < 50; i++) {
      await provider.chat([{ role: 'user', content: `Message ${i}` }]);
      fs.writeFile(`/file${i}.ts`, 'content');
      repo.modifyFile(`file${i}.ts`, 'content');
      repo.add('.');
      repo.commit(`Commit ${i}`);
    }

    // Reset provider and clear filesystem
    provider.reset();

    // Verify clean state
    expect(provider.getCallHistory().length).toBe(0);
  });
});

// ===========================================
// Stress Tests
// ===========================================

describe('Stress Tests', () => {
  test('should survive sustained load', async () => {
    const provider = createMockProvider();
    const contextManager = new ContextWindowManager({
      maxTokens: 128000,
      reservedForResponse: 4096,
    });
    const convManager = new ConversationManager();

    // Simulate sustained usage
    const conv = convManager.create({ title: 'Stress Test' });
    convManager.setActive(conv.id);

    const { duration } = await measureTimeAsync(async () => {
      for (let i = 0; i < 100; i++) {
        // Add context
        contextManager.addFile(
          `/src/file${i % 10}.ts`,
          `content ${i}`,
          'typescript',
          i % 10
        );

        // Add message
        convManager.addMessage({
          role: 'user',
          content: `Message ${i}`,
        });

        // Make provider call
        const response = await provider.chat([{ role: 'user', content: `Request ${i}` }]);

        convManager.addMessage({
          role: 'assistant',
          content: response.content,
        });
      }
    });

    // Should complete within reasonable time
    expect(duration).toBeLessThan(500);

    // System should still be functional
    const messages = convManager.getMessages(conv.id);
    expect(messages.length).toBe(200); // 100 user + 100 assistant
  });

  test('should handle rapid context window rebuilds', () => {
    const contextManager = new ContextWindowManager({
      maxTokens: 128000,
      reservedForResponse: 4096,
    });

    // Add files
    for (let i = 0; i < 20; i++) {
      contextManager.addFile(
        `/src/file${i}.ts`,
        generateLargeContent(20),
        'typescript',
        i % 10
      );
    }

    const { duration } = measureTimeSync(() => {
      for (let i = 0; i < 100; i++) {
        contextManager.buildContextWindow();
      }
    });

    // Should handle rapid rebuilds
    expect(duration).toBeLessThan(200);
  });
});
