/**
 * Integration Tests
 * Tests for multiple systems working together
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test';
import {
  createMockProvider,
  createMockFileSystem,
  createMockGitRepository,
  createMockGitRepositoryWithHistory,
} from './mocks/index.js';
import {
  toolRegistry,
  enhancedToolRegistry,
  initializeTools,
  initializeEnhancedTools,
  ToolCallParser,
  ToolExecutor,
  FunctionCallingConverter,
} from '../src/tools/index.js';
import { ConversationManager, StreamingHandler, ContextWindowManager } from '../src/conversation/index.js';

// ===========================================
// Setup
// ===========================================

beforeAll(() => {
  initializeTools();
  initializeEnhancedTools();
});

// ===========================================
// Mock Provider Integration Tests
// ===========================================

describe('Mock Provider Integration', () => {
  test('should simulate conversation flow', async () => {
    const provider = createMockProvider();
    provider
      .queueResponse('I can help you with that!')
      .queueResponse('Here is the code you requested.')
      .queueResponse('Is there anything else?');

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: 'Help me write code' },
    ];

    const response1 = await provider.chat(messages);
    expect(response1.content).toBe('I can help you with that!');

    messages.push({ role: 'assistant', content: response1.content });
    messages.push({ role: 'user', content: 'Write a function' });

    const response2 = await provider.chat(messages);
    expect(response2.content).toBe('Here is the code you requested.');

    expect(provider.getCallCount('chat')).toBe(2);
  });

  test('should simulate streaming response', async () => {
    const provider = createMockProvider({
      defaultResponse: 'Hello, World!',
      streamChunkSize: 3,
    });

    const chunks: string[] = [];
    const response = await provider.chatStream(
      [{ role: 'user', content: 'Say hello' }],
      (chunk) => {
        if (!chunk.done) {
          chunks.push(chunk.content);
        }
      }
    );

    expect(response.content).toBe('Hello, World!');
    expect(chunks.join('')).toBe('Hello, World!');
    expect(chunks.length).toBe(Math.ceil('Hello, World!'.length / 3));
  });

  test('should simulate error scenarios', async () => {
    const provider = createMockProvider();
    provider.queueError(new Error('Rate limit exceeded'));

    await expect(
      provider.chat([{ role: 'user', content: 'Test' }])
    ).rejects.toThrow('Rate limit exceeded');

    // Second call should succeed (error was consumed)
    const response = await provider.chat([{ role: 'user', content: 'Test again' }]);
    expect(response.content).toBe('Mock response');
  });

  test('should track call history', async () => {
    const provider = createMockProvider();

    await provider.chat([{ role: 'user', content: 'First' }]);
    await provider.chat([{ role: 'user', content: 'Second' }]);
    await provider.isAvailable();

    const history = provider.getCallHistory();
    expect(history.length).toBe(3);
    expect(history[0].method).toBe('chat');
    expect(history[1].method).toBe('chat');
    expect(history[2].method).toBe('isAvailable');

    provider.clearHistory();
    expect(provider.getCallCount()).toBe(0);
  });

  test('should support pattern-based responses', async () => {
    const provider = createMockProvider();
    provider
      .setPatternResponse('hello', 'Hi there!')
      .setPatternResponse('code', 'Here is some code')
      .setDefaultResponse('I don\'t understand');

    const resp1 = await provider.chat([{ role: 'user', content: 'hello world' }]);
    expect(resp1.content).toBe('Hi there!');

    const resp2 = await provider.chat([{ role: 'user', content: 'write code' }]);
    expect(resp2.content).toBe('Here is some code');

    const resp3 = await provider.chat([{ role: 'user', content: 'random text' }]);
    expect(resp3.content).toBe('I don\'t understand');
  });
});

// ===========================================
// Mock FileSystem Integration Tests
// ===========================================

describe('Mock FileSystem Integration', () => {
  test('should support full file operations', () => {
    const fs = createMockFileSystem();

    // Create directory structure
    fs.mkdir('/project/src/components');
    expect(fs.dirExists('/project/src/components')).toBe(true);

    // Write files
    fs.writeFile('/project/src/index.ts', 'export const main = () => {};');
    fs.writeFile('/project/src/components/Button.tsx', 'export const Button = () => {};');

    // Read files
    expect(fs.readFile('/project/src/index.ts')).toBe('export const main = () => {};');

    // List directory
    const entries = fs.readdir('/project/src');
    expect(entries).toContain('components/');
    expect(entries).toContain('index.ts');

    // Rename file
    fs.rename('/project/src/index.ts', '/project/src/main.ts');
    expect(fs.fileExists('/project/src/main.ts')).toBe(true);
    expect(fs.fileExists('/project/src/index.ts')).toBe(false);

    // Delete file
    fs.unlink('/project/src/main.ts');
    expect(fs.fileExists('/project/src/main.ts')).toBe(false);
  });

  test('should track operations', () => {
    const fs = createMockFileSystem();

    fs.writeFile('/test.txt', 'content');
    fs.readFile('/test.txt');
    fs.unlink('/test.txt');

    const log = fs.getOperationLog();
    expect(log.length).toBe(3);
    expect(log[0].operation).toBe('writeFile');
    expect(log[1].operation).toBe('readFile');
    expect(log[2].operation).toBe('unlink');
  });

  test('should support snapshots', () => {
    const fs = createMockFileSystem();
    fs.populateTestFiles();

    const snapshot = fs.snapshot();
    expect(snapshot.files.length).toBeGreaterThan(0);
    expect(snapshot.directories.length).toBeGreaterThan(0);

    // Reset and verify empty
    fs.reset();
    expect(fs.snapshot().files.length).toBe(0);

    // Restore and verify
    fs.restore(snapshot);
    expect(fs.snapshot().files.length).toBe(snapshot.files.length);
  });

  test('should support working directory operations', () => {
    const fs = createMockFileSystem();
    fs.mkdir('/home/user/project');

    expect(fs.cwd()).toBe('/');

    fs.chdir('/home/user/project');
    expect(fs.cwd()).toBe('/home/user/project');

    // Relative path should work now
    fs.writeFile('test.txt', 'content');
    expect(fs.fileExists('/home/user/project/test.txt')).toBe(true);
  });
});

// ===========================================
// Mock Git Integration Tests
// ===========================================

describe('Mock Git Integration', () => {
  test('should support full Git workflow', () => {
    const repo = createMockGitRepository();

    // Modify and commit
    repo.modifyFile('README.md', '# New Project');
    repo.add('README.md');
    const commit = repo.commit('Add README');

    expect(commit.message).toBe('Add README');
    expect(commit.files).toContain('README.md');

    // Check log
    const log = repo.log({ maxCount: 2 });
    expect(log.length).toBe(2);
    expect(log[0].message).toBe('Add README');
  });

  test('should support branching workflow', () => {
    const repo = createMockGitRepository();

    // Create feature branch
    repo.branch('feature/new-feature');
    expect(repo.listBranches()).toContain('feature/new-feature');

    // Checkout and make changes
    repo.checkout('feature/new-feature');
    expect(repo.getCurrentBranch()).toBe('feature/new-feature');

    repo.modifyFile('feature.ts', 'export const feature = true;');
    repo.add('feature.ts');
    repo.commit('Implement feature');

    // Verify file is tracked in feature branch
    const log = repo.log();
    expect(log[0].message).toBe('Implement feature');
    expect(log[0].files).toContain('feature.ts');

    // Back to main (file still exists in working directory but that's expected for mock)
    repo.checkout('main');
    expect(repo.getCurrentBranch()).toBe('main');
  });

  test('should track status correctly', () => {
    const repo = createMockGitRepository();

    // Add untracked file
    repo.modifyFile('new.ts', 'new file');
    let status = repo.status();
    expect(status.untracked).toContain('new.ts');

    // Stage it
    repo.add('new.ts');
    status = repo.status();
    expect(status.staged.length).toBe(1);
    expect(status.staged[0].path).toBe('new.ts');
    expect(status.untracked).not.toContain('new.ts');

    // Commit
    repo.commit('Add new file');
    status = repo.status();
    expect(status.staged.length).toBe(0);
  });

  test('should support stash operations', () => {
    const repo = createMockGitRepository();

    repo.modifyFile('work-in-progress.ts', 'WIP');
    repo.add('work-in-progress.ts');

    repo.stash('Saving work');
    expect(repo.stashList().length).toBe(1);
    expect(repo.stashList()[0].message).toBe('Saving work');

    repo.stashPop();
    expect(repo.stashList().length).toBe(0);
  });

  test('should support pre-populated repository', () => {
    const repo = createMockGitRepositoryWithHistory();

    // Should have multiple commits
    const log = repo.log();
    expect(log.length).toBeGreaterThan(3);

    // Should have feature branch
    expect(repo.listBranches()).toContain('feature/test');

    // Should have files
    expect(repo.getFileContent('README.md')).toBeDefined();
    expect(repo.getFileContent('src/index.ts')).toBeDefined();
  });
});

// ===========================================
// Tool System Integration Tests
// ===========================================

describe('Tool System Integration', () => {
  test('should parse tool calls from LLM response using static method', () => {
    const text = `
I'll help you with that. Let me read the file first.

<tool_call name="file_read">{"path": "/test.txt"}</tool_call>
`;

    const calls = ToolCallParser.parseFromText(text);

    expect(calls.length).toBe(1);
    expect(calls[0].name).toBe('file_read');
    expect(calls[0].arguments.path).toBe('/test.txt');
  });

  test('should convert tools to provider formats', () => {
    const tools = toolRegistry.getDefinitions().slice(0, 3);

    const openAI = FunctionCallingConverter.toOpenAI(tools);
    expect(openAI.length).toBe(3);
    expect(openAI[0].type).toBe('function');
    expect(openAI[0].function).toHaveProperty('name');
    expect(openAI[0].function).toHaveProperty('description');
    expect(openAI[0].function).toHaveProperty('parameters');

    const gemini = FunctionCallingConverter.toGemini(tools);
    expect(gemini.length).toBe(3);
    expect(gemini[0]).toHaveProperty('name');
    expect(gemini[0]).toHaveProperty('description');
    expect(gemini[0]).toHaveProperty('parameters');
  });

  test('should integrate enhanced tools with registry', () => {
    // Enhanced tool registry should have basic tools
    expect(enhancedToolRegistry.has('file_read')).toBe(true);
    expect(enhancedToolRegistry.has('file_write')).toBe(true);
    expect(enhancedToolRegistry.has('terminal_execute')).toBe(true);

    // Tool count should be reasonable
    expect(enhancedToolRegistry.count).toBeGreaterThanOrEqual(6);
  });

  test('should get tool definitions', () => {
    const basicTools = toolRegistry.getDefinitions();
    const enhancedTools = enhancedToolRegistry.getDefinitions();

    // Both registries should have tools
    expect(basicTools.length).toBeGreaterThanOrEqual(6);
    expect(enhancedTools.length).toBeGreaterThanOrEqual(6);

    // Tools should have required properties
    for (const tool of basicTools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('parameters');
    }
  });
});

// ===========================================
// Conversation Integration Tests
// ===========================================

describe('Conversation Integration', () => {
  test('should manage conversation with provider', async () => {
    const manager = new ConversationManager();
    const provider = createMockProvider();
    provider
      .queueResponse('Hello! How can I help?')
      .queueResponse('Sure, I can explain that.');

    // Create conversation and set it active
    const conv = manager.create({ title: 'Test Chat' });
    manager.setActive(conv.id);

    // Simulate conversation flow - addMessage without ID uses active conversation
    manager.addMessage({
      role: 'user',
      content: 'Hi there!',
    });

    const response1 = await provider.chat([{
      role: 'user',
      content: 'Hi there!',
    }]);

    manager.addMessage({
      role: 'assistant',
      content: response1.content,
    });

    expect(manager.getMessages(conv.id).length).toBe(2);
    expect(manager.getMessages(conv.id)[1].content).toBe('Hello! How can I help?');

    // Continue conversation
    manager.addMessage({
      role: 'user',
      content: 'Can you explain X?',
    });

    const response2 = await provider.chat([{
      role: 'user',
      content: 'Can you explain X?',
    }]);

    manager.addMessage({
      role: 'assistant',
      content: response2.content,
    });

    expect(manager.getMessages(conv.id).length).toBe(4);
  });

  test('should handle streaming with conversation', async () => {
    const handler = new StreamingHandler();
    const provider = createMockProvider({
      defaultResponse: 'Here is the answer to your question.',
      streamChunkSize: 5,
    });

    const chunks: string[] = [];
    handler.on('text', (data: { chunk: string }) => chunks.push(data.chunk));

    handler.start();

    await provider.chatStream(
      [{ role: 'user', content: 'What is 2+2?' }],
      (chunk) => {
        if (!chunk.done) {
          handler.processRawText(chunk.content);
        } else {
          handler.end();
        }
      }
    );

    const state = handler.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.currentText).toBe('Here is the answer to your question.');
    expect(chunks.join('')).toBe('Here is the answer to your question.');
  });

  test('should manage context window with conversation', () => {
    const contextManager = new ContextWindowManager({ 
      maxTokens: 128000,
      reservedForResponse: 4096 
    });
    const convManager = new ConversationManager();

    // Add file context
    contextManager.addFile(
      '/src/index.ts',
      'console.log("Hello");'.repeat(10),
      'typescript',
      10 // priority
    );

    // Create conversation with context
    const conv = convManager.create({ title: 'Code Review' });
    convManager.setActive(conv.id);
    convManager.addMessage({
      role: 'user',
      content: 'Review this code',
    });

    // Build context window
    const contextWindow = contextManager.buildContextWindow();
    expect(contextWindow.fileContext.length).toBeGreaterThan(0);
    expect(contextManager.getStats().totalTokens).toBeGreaterThan(0);
  });

  test('should support conversation branching', async () => {
    const manager = new ConversationManager();
    const provider = createMockProvider();

    // Main conversation
    const conv = manager.create({ title: 'Main' });
    manager.setActive(conv.id);
    manager.addMessage({ role: 'user', content: 'Start' });
    manager.addMessage({ role: 'assistant', content: 'Response 1' });

    // Fork for alternative exploration
    provider.queueResponse('Alternative response A');
    const branch = manager.createBranch('Alternative approach');

    // Verify branch exists
    expect(branch).not.toBeNull();

    // Add to branch (switch to branch first)
    manager.switchBranch(branch!.id);
    manager.addMessage({ role: 'user', content: 'Try approach A' });
    
    const branchResponse = await provider.chat([{ role: 'user', content: 'Try approach A' }]);
    manager.addMessage({ role: 'assistant', content: branchResponse.content });

    // Switch back to original branch
    const originalBranchId = conv.branches.keys().next().value;
    if (originalBranchId) {
      manager.switchBranch(originalBranchId);
    }
    
    // Original conversation has 2 messages
    expect(manager.getMessages(conv.id).length).toBe(2);
  });
});

// ===========================================
// Cross-System Integration Tests
// ===========================================

describe('Cross-System Integration', () => {
  test('should integrate Git changes with conversation context', () => {
    const gitRepo = createMockGitRepositoryWithHistory();
    const contextManager = new ContextWindowManager();
    const convManager = new ConversationManager();

    // Get Git status
    const status = gitRepo.status();

    // Add Git context as a file
    contextManager.addFile(
      '/git-status',
      `Branch: ${status.current}\nTracking: ${status.tracking || 'none'}`,
      'text',
      5 // priority
    );

    // Create conversation about Git
    const conv = convManager.create({ title: 'Git Review' });
    convManager.setActive(conv.id);
    convManager.addMessage({
      role: 'user',
      content: `Review my changes on branch ${status.current}`,
    });

    // Verify integration
    const fileContext = contextManager.getFileContext();
    expect(fileContext.length).toBe(1);
    expect(fileContext[0].content).toContain(status.current);
  });

  test('should handle tool execution results in conversation', async () => {
    const provider = createMockProvider();
    provider
      .setPatternResponse('read.*file', 'I found the following content:\n\n```\ntest content\n```')
      .setDefaultResponse('I executed the tool.');

    const convManager = new ConversationManager();
    const conv = convManager.create({ title: 'Tool Test' });
    convManager.setActive(conv.id);

    // User requests file read
    convManager.addMessage({
      role: 'user',
      content: 'Read the file /test.txt',
    });

    // Simulate LLM requesting tool call
    const llmResponse = await provider.chat([{
      role: 'user',
      content: 'Read the file /test.txt',
    }]);

    convManager.addMessage({
      role: 'assistant',
      content: llmResponse.content,
    });

    // Verify conversation has tool result
    const messages = convManager.getMessages(conv.id);
    expect(messages.length).toBe(2);
    expect(messages[1].content).toContain('content');
  });

  test('should build complete context for complex request', () => {
    const contextManager = new ContextWindowManager({ 
      maxTokens: 128000,
      reservedForResponse: 4096 
    });

    // Add multiple file contexts
    contextManager.addFile(
      '/src/index.ts',
      'export function main() { return "main"; }',
      'typescript',
      10 // high priority
    );

    contextManager.addFile(
      '/src/utils.ts',
      'export function helper() { return "helper"; }',
      'typescript',
      5 // medium priority
    );

    contextManager.addFile(
      '/tests/index.test.ts',
      'test("main", () => expect(main()).toBe("main"));',
      'typescript',
      2 // low priority
    );

    // Build context window
    const contextWindow = contextManager.buildContextWindow();

    // Verify files included
    expect(contextWindow.fileContext.length).toBe(3);

    // Stats should reflect all files
    const stats = contextManager.getStats();
    expect(stats.fileCount).toBe(3);
  });

  test('should handle conversation export/import cycle', () => {
    const manager = new ConversationManager();

    // Create conversation with history
    const conv = manager.create({ title: 'Export Test' });
    manager.setActive(conv.id);
    manager.addMessage({ role: 'user', content: 'Hello' });
    manager.addMessage({ role: 'assistant', content: 'Hi there!' });
    manager.addMessage({ role: 'user', content: 'How are you?' });
    manager.addMessage({ role: 'assistant', content: 'I\'m doing well!' });

    // Export
    const exported = manager.exportToJSON(conv.id);
    expect(exported).toBeTruthy();

    // Create new manager and import
    const newManager = new ConversationManager();
    const imported = newManager.importFromJSON(exported!);

    // Verify import
    expect(imported).not.toBeNull();
    expect(newManager.getMessages(imported!.id).length).toBe(4);
    expect(newManager.getMessages(imported!.id)[0].content).toBe('Hello');
    expect(newManager.getMessages(imported!.id)[1].content).toBe('Hi there!');
  });
});

// ===========================================
// Performance Integration Tests
// ===========================================

describe('Performance Integration', () => {
  test('should handle large conversation efficiently', () => {
    const manager = new ConversationManager({ maxHistoryMessages: 100 });
    const conv = manager.create({ title: 'Large Conversation' });
    manager.setActive(conv.id);

    // Add many messages
    const startTime = Date.now();
    for (let i = 0; i < 100; i++) {
      manager.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}: ${'x'.repeat(100)}`,
      });
    }
    const duration = Date.now() - startTime;

    // Should complete in reasonable time
    expect(duration).toBeLessThan(1000);
    expect(manager.getMessages(conv.id).length).toBe(100);
  });

  test('should handle context window with many files efficiently', () => {
    const contextManager = new ContextWindowManager({ maxTokens: 50000 });

    // Add many files
    const startTime = Date.now();
    for (let i = 0; i < 50; i++) {
      contextManager.addFile(
        `/file${i}.ts`,
        'x'.repeat(100),
        'typescript',
        i < 10 ? 10 : i < 30 ? 5 : 1 // varying priorities
      );
    }
    const duration = Date.now() - startTime;

    // Should complete quickly
    const stats = contextManager.getStats();
    expect(stats.fileCount).toBeGreaterThan(0);
    expect(duration).toBeLessThan(500);
  });

  test('should handle rapid tool registry operations', () => {
    const startTime = Date.now();

    // Many lookups
    for (let i = 0; i < 1000; i++) {
      toolRegistry.has('file_read');
      toolRegistry.get('file_write');
      enhancedToolRegistry.has('terminal_execute');
    }

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100);
  });

  test('should handle mock provider under load', async () => {
    const provider = createMockProvider();

    const startTime = Date.now();
    const promises: Promise<unknown>[] = [];

    // Parallel requests
    for (let i = 0; i < 50; i++) {
      promises.push(
        provider.chat([{ role: 'user', content: `Message ${i}` }])
      );
    }

    await Promise.all(promises);
    const duration = Date.now() - startTime;

    expect(provider.getCallCount('chat')).toBe(50);
    expect(duration).toBeLessThan(1000);
  });
});
