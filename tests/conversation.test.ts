/**
 * Conversation Module Tests
 * Tests for conversation manager, streaming, and context window
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  ConversationManager,
  createConversationManager,
  ConversationMessage,
} from '../src/conversation/manager';
import {
  StreamingHandler,
  createStreamingHandler,
  processStream,
  StreamChunk,
} from '../src/conversation/streaming';
import {
  ContextWindowManager,
  createContextWindowManager,
} from '../src/conversation/context-window';

// ===========================================
// ConversationManager Tests
// ===========================================

describe('ConversationManager', () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = createConversationManager();
  });

  describe('initialization', () => {
    test('should create manager with default config', () => {
      expect(manager).toBeDefined();
    });

    test('should create manager with custom config', () => {
      const customManager = createConversationManager({
        maxContextTokens: 50000,
        enableBranching: false,
      });
      expect(customManager).toBeDefined();
    });
  });

  describe('conversation CRUD', () => {
    test('should create a new conversation', () => {
      const conv = manager.create({ title: 'Test Conversation' });
      expect(conv).toBeDefined();
      expect(conv.id).toBeDefined();
      expect(conv.title).toBe('Test Conversation');
    });

    test('should get conversation by ID', () => {
      const created = manager.create({ title: 'Test' });
      const retrieved = manager.get(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    test('should return null for non-existent conversation', () => {
      const retrieved = manager.get('non-existent-id');
      expect(retrieved).toBeNull();
    });

    test('should list all conversations', () => {
      manager.create({ title: 'Conv 1' });
      manager.create({ title: 'Conv 2' });
      const list = manager.list();
      expect(list.length).toBe(2);
    });

    test('should delete a conversation', () => {
      const conv = manager.create({ title: 'To Delete' });
      const deleted = manager.delete(conv.id);
      expect(deleted).toBe(true);
      expect(manager.get(conv.id)).toBeNull();
    });

    test('should update conversation metadata', () => {
      const conv = manager.create({ title: 'Original' });
      manager.update(conv.id, { title: 'Updated' });
      const updated = manager.get(conv.id);
      expect(updated?.title).toBe('Updated');
    });
  });

  describe('active conversation', () => {
    test('should set and get active conversation', () => {
      const conv = manager.create({ title: 'Active Test' });
      const active = manager.getActive();
      expect(active?.id).toBe(conv.id);
    });

    test('should switch active conversation', () => {
      const conv1 = manager.create({ title: 'First' });
      const conv2 = manager.create({ title: 'Second' });
      
      expect(manager.getActive()?.id).toBe(conv2.id);
      
      manager.setActive(conv1.id);
      expect(manager.getActive()?.id).toBe(conv1.id);
    });
  });

  describe('message management', () => {
    test('should add messages to conversation', () => {
      manager.create({ title: 'Message Test' });
      
      const msg = manager.addMessage({
        role: 'user',
        content: 'Hello, world!',
      });

      expect(msg).toBeDefined();
      expect(msg?.content).toBe('Hello, world!');
      expect(msg?.id).toBeDefined();
    });

    test('should retrieve messages', () => {
      manager.create({ title: 'Retrieve Test' });
      manager.addMessage({ role: 'user', content: 'First' });
      manager.addMessage({ role: 'assistant', content: 'Second' });

      const messages = manager.getMessages();
      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
    });

    test('should get messages formatted for LLM', () => {
      manager.create({ title: 'LLM Format Test' });
      manager.addMessage({ role: 'user', content: 'Question' });
      manager.addMessage({ role: 'assistant', content: 'Answer' });

      const llmMessages = manager.getMessagesForLLM();
      expect(llmMessages.length).toBe(2);
      expect(llmMessages[0].role).toBe('user');
      expect(llmMessages[1].role).toBe('assistant');
    });

    test('should edit a message', () => {
      manager.create({ title: 'Edit Test' });
      const msg = manager.addMessage({ role: 'user', content: 'Original' });

      const edited = manager.editMessage(msg!.id, 'Edited content');
      expect(edited?.content).toBe('Edited content');
      expect(edited?.metadata?.edited).toBe(true);
      expect(edited?.metadata?.originalContent).toBe('Original');
    });

    test('should delete messages after a point', () => {
      manager.create({ title: 'Delete After Test' });
      const msg1 = manager.addMessage({ role: 'user', content: 'First' });
      manager.addMessage({ role: 'assistant', content: 'Second' });
      manager.addMessage({ role: 'user', content: 'Third' });

      const deleted = manager.deleteMessagesAfter(msg1!.id);
      expect(deleted).toBe(2);
      expect(manager.getMessages().length).toBe(1);
    });
  });

  describe('branching', () => {
    test('should create a branch', () => {
      manager.create({ title: 'Branch Test' });
      manager.addMessage({ role: 'user', content: 'Before branch' });

      const branch = manager.createBranch('Alternative');
      expect(branch).toBeDefined();
      expect(branch?.name).toBe('Alternative');
    });

    test('should switch between branches', () => {
      manager.create({ title: 'Switch Test' });
      manager.addMessage({ role: 'user', content: 'Main message' });

      const branch = manager.createBranch('Alt');
      manager.addMessage({ role: 'assistant', content: 'Alt response' });

      const branches = manager.listBranches();
      expect(branches.length).toBe(2);

      // Switch back to main
      const mainBranch = branches.find(b => b.name === 'Main');
      manager.switchBranch(mainBranch!.id);

      const messages = manager.getMessages();
      expect(messages.length).toBe(1);
    });

    test('should list branches', () => {
      manager.create({ title: 'List Branches Test' });
      manager.createBranch('Branch 1');
      manager.createBranch('Branch 2');

      const branches = manager.listBranches();
      expect(branches.length).toBe(3); // Main + 2 branches
    });
  });

  describe('context optimization', () => {
    test('should get context-optimized messages', () => {
      manager.create({ title: 'Context Test' });
      
      // Add several messages
      for (let i = 0; i < 10; i++) {
        manager.addMessage({ role: 'user', content: `Message ${i}` });
      }

      const optimized = manager.getContextOptimizedMessages(1000);
      expect(optimized.length).toBeLessThanOrEqual(10);
    });

    test('should count tokens', () => {
      manager.create({ title: 'Token Count Test' });
      manager.addMessage({ role: 'user', content: 'Hello world' });

      const tokenCount = manager.getTokenCount();
      expect(tokenCount).toBeGreaterThan(0);
    });
  });

  describe('export/import', () => {
    test('should export to Markdown', () => {
      manager.create({ title: 'Export MD Test' });
      manager.addMessage({ role: 'user', content: 'User says hello' });
      manager.addMessage({ role: 'assistant', content: 'Assistant responds' });

      const markdown = manager.exportToMarkdown();
      expect(markdown).toContain('# Export MD Test');
      expect(markdown).toContain('User says hello');
      expect(markdown).toContain('Assistant responds');
    });

    test('should export to JSON', () => {
      const conv = manager.create({ title: 'Export JSON Test' });
      manager.addMessage({ role: 'user', content: 'Test message' });

      const json = manager.exportToJSON();
      expect(json).toContain(conv.id);
      expect(json).toContain('Test message');
    });

    test('should import from JSON', () => {
      const original = manager.create({ title: 'Original' });
      manager.addMessage({ role: 'user', content: 'Original message' });
      const json = manager.exportToJSON();

      // Clear and reimport
      manager.clear();
      const imported = manager.importFromJSON(json);

      expect(imported).toBeDefined();
      expect(imported?.title).toBe('Original');
    });
  });
});

// ===========================================
// StreamingHandler Tests
// ===========================================

describe('StreamingHandler', () => {
  let handler: StreamingHandler;

  beforeEach(() => {
    handler = createStreamingHandler();
  });

  describe('initialization', () => {
    test('should create handler', () => {
      expect(handler).toBeDefined();
    });

    test('should not be streaming initially', () => {
      expect(handler.isStreaming()).toBe(false);
    });
  });

  describe('stream control', () => {
    test('should start streaming', () => {
      handler.start();
      expect(handler.isStreaming()).toBe(true);
    });

    test('should end streaming', () => {
      handler.start();
      handler.end();
      expect(handler.isStreaming()).toBe(false);
    });

    test('should abort streaming', () => {
      handler.start();
      handler.abort('User cancelled');
      expect(handler.isStreaming()).toBe(false);
    });
  });

  describe('text processing', () => {
    test('should process text chunks', () => {
      handler.start();
      handler.processChunk({ type: 'text', content: 'Hello ' });
      handler.processChunk({ type: 'text', content: 'world!' });

      expect(handler.getText()).toBe('Hello world!');
    });

    test('should process raw text', () => {
      let fullText = '';
      const customHandler = createStreamingHandler({
        onText: (chunk, full) => { fullText = full; },
      });
      
      customHandler.start();
      customHandler.processRawText('Streaming ');
      customHandler.processRawText('text.');
      customHandler.end();

      expect(fullText).toContain('Streaming');
      expect(fullText).toContain('text.');
    });
  });

  describe('tool call detection', () => {
    test('should detect JSON tool calls', () => {
      const toolCalls: any[] = [];
      const customHandler = createStreamingHandler({
        onToolCall: (tc) => toolCalls.push(tc),
        parseToolCalls: true,
      });

      customHandler.start();
      customHandler.processRawText('{"name": "test_tool", "arguments": {"arg": "value"}}');
      customHandler.end();

      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].name).toBe('test_tool');
    });

    test('should handle streaming without tool calls', () => {
      handler.start();
      handler.processRawText('Just regular text');
      handler.end();

      expect(handler.getToolCalls().length).toBe(0);
    });
  });

  describe('callbacks', () => {
    test('should call onText callback', () => {
      let receivedText = '';
      const customHandler = createStreamingHandler({
        onText: (text) => { receivedText += text; },
      });

      customHandler.start();
      customHandler.processChunk({ type: 'text', content: 'Test' });

      expect(receivedText).toBe('Test');
    });

    test('should call onComplete callback', () => {
      let completed = false;
      const customHandler = createStreamingHandler({
        onComplete: () => { completed = true; },
      });

      customHandler.start();
      customHandler.end();

      expect(completed).toBe(true);
    });
  });

  describe('state', () => {
    test('should return current state', () => {
      handler.start();
      handler.processChunk({ type: 'text', content: 'Test' });

      const state = handler.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.currentText).toBe('Test');
    });
  });
});

// ===========================================
// ContextWindowManager Tests
// ===========================================

describe('ContextWindowManager', () => {
  let contextManager: ContextWindowManager;

  beforeEach(() => {
    contextManager = createContextWindowManager({
      maxTokens: 10000,
    });
  });

  describe('initialization', () => {
    test('should create manager with defaults', () => {
      expect(contextManager).toBeDefined();
    });

    test('should create manager with custom config', () => {
      const custom = createContextWindowManager({
        maxTokens: 50000,
        reservedForResponse: 2000,
      });
      const stats = custom.getStats();
      expect(stats.maxTokens).toBe(50000);
    });
  });

  describe('message management', () => {
    test('should add messages', () => {
      contextManager.addMessage({ role: 'user', content: 'Hello' });
      const messages = contextManager.getMessages();
      expect(messages.length).toBe(1);
    });

    test('should add multiple messages', () => {
      contextManager.addMessages([
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Second' },
      ]);
      expect(contextManager.getMessages().length).toBe(2);
    });

    test('should clear messages', () => {
      contextManager.addMessage({ role: 'user', content: 'Test' });
      contextManager.clearMessages();
      expect(contextManager.getMessages().length).toBe(0);
    });
  });

  describe('file context management', () => {
    test('should add file to context', () => {
      const added = contextManager.addFile(
        '/test/file.ts',
        'const x = 1;',
        'typescript',
        5
      );
      expect(added).toBe(true);
      expect(contextManager.getFileContext().length).toBe(1);
    });

    test('should remove file from context', () => {
      contextManager.addFile('/test/file.ts', 'code', 'typescript');
      const removed = contextManager.removeFile('/test/file.ts');
      expect(removed).toBe(true);
      expect(contextManager.getFileContext().length).toBe(0);
    });

    test('should update file priority', () => {
      contextManager.addFile('/test/file.ts', 'code', 'typescript', 3);
      contextManager.updateFilePriority('/test/file.ts', 10);
      
      const files = contextManager.getFileContext();
      expect(files[0].priority).toBe(10);
    });

    test('should sort files by priority', () => {
      contextManager.addFile('/low.ts', 'low', 'typescript', 1);
      contextManager.addFile('/high.ts', 'high', 'typescript', 10);
      contextManager.addFile('/med.ts', 'med', 'typescript', 5);

      const files = contextManager.getFileContext();
      expect(files[0].path).toBe('/high.ts');
      expect(files[2].path).toBe('/low.ts');
    });

    test('should truncate large files', () => {
      const largeContent = 'x'.repeat(50000);
      contextManager.addFile('/large.ts', largeContent, 'typescript');

      const files = contextManager.getFileContext();
      expect(files[0].content.length).toBeLessThan(largeContent.length);
      expect(files[0].content).toContain('truncated');
    });
  });

  describe('context building', () => {
    test('should build context window', () => {
      contextManager.setSystemPrompt('You are an assistant.');
      contextManager.addMessage({ role: 'user', content: 'Hello' });
      contextManager.addFile('/test.ts', 'const x = 1;', 'typescript');

      const context = contextManager.buildContextWindow();

      expect(context.systemPrompt).toBe('You are an assistant.');
      expect(context.messages.length).toBe(1);
      expect(context.fileContext.length).toBe(1);
      expect(context.totalTokens).toBeGreaterThan(0);
    });

    test('should set agent role', () => {
      contextManager.setAgentRole('build');
      const context = contextManager.buildContextWindow();
      expect(context.systemPrompt.length).toBeGreaterThan(0);
    });
  });

  describe('pruning', () => {
    test('should auto-prune when exceeding threshold', () => {
      // Add lots of messages to trigger pruning
      for (let i = 0; i < 100; i++) {
        contextManager.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: 'x'.repeat(500),
        });
      }

      const stats = contextManager.getStats();
      // Should have pruned some content
      expect(stats.utilizationPercent).toBeLessThanOrEqual(90);
    });

    test('should get available tokens', () => {
      const available = contextManager.getAvailableTokens();
      expect(available).toBeGreaterThan(0);
    });
  });

  describe('statistics', () => {
    test('should return context stats', () => {
      contextManager.setSystemPrompt('System');
      contextManager.addMessage({ role: 'user', content: 'Hello' });
      contextManager.addFile('/file.ts', 'code', 'typescript');

      const stats = contextManager.getStats();

      expect(stats.systemPromptTokens).toBeGreaterThan(0);
      expect(stats.messageTokens).toBeGreaterThan(0);
      expect(stats.fileContextTokens).toBeGreaterThan(0);
      expect(stats.messageCount).toBe(1);
      expect(stats.fileCount).toBe(1);
      expect(stats.utilizationPercent).toBeGreaterThan(0);
    });
  });

  describe('serialization', () => {
    test('should export to JSON', () => {
      contextManager.addMessage({ role: 'user', content: 'Test' });
      const json = contextManager.toJSON();

      expect(json).toContain('Test');
      expect(JSON.parse(json)).toBeDefined();
    });

    test('should import from JSON', () => {
      contextManager.addMessage({ role: 'user', content: 'Original' });
      const json = contextManager.toJSON();

      const newManager = createContextWindowManager();
      newManager.fromJSON(json);

      expect(newManager.getMessages().length).toBe(1);
      expect(newManager.getMessages()[0].content).toBe('Original');
    });
  });
});

// ===========================================
// Integration Tests
// ===========================================

describe('Conversation Integration', () => {
  test('should work together for a full conversation flow', () => {
    const manager = createConversationManager();
    const contextManager = createContextWindowManager();

    // Create conversation
    manager.create({ title: 'Integration Test', agentRole: 'build' });

    // Add some context
    contextManager.setAgentRole('build');
    contextManager.addFile('/src/app.ts', 'const app = () => {};', 'typescript');

    // Simulate conversation
    manager.addMessage({ role: 'user', content: 'Create a function' });
    contextManager.addMessage({ role: 'user', content: 'Create a function' });

    manager.addMessage({ role: 'assistant', content: 'Here is the function...' });
    contextManager.addMessage({ role: 'assistant', content: 'Here is the function...' });

    // Build context for LLM
    const context = contextManager.buildContextWindow();

    expect(context.messages.length).toBe(2);
    expect(context.fileContext.length).toBe(1);
    expect(manager.getMessages().length).toBe(2);
  });

  test('should handle streaming with conversation manager', async () => {
    const manager = createConversationManager();
    manager.create({ title: 'Streaming Integration' });

    const handler = createStreamingHandler({
      onComplete: (text) => {
        manager.addMessage({ role: 'assistant', content: text });
      },
    });

    manager.addMessage({ role: 'user', content: 'Hello' });

    handler.start();
    handler.processChunk({ type: 'text', content: 'Hi there!' });
    handler.end();

    const messages = manager.getMessages();
    expect(messages.length).toBe(2);
    expect(messages[1].content).toBe('Hi there!');
  });
});
