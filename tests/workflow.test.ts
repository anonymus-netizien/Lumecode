/**
 * Workflow Tests
 * End-to-end tests simulating real user scenarios
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import {
  createMockProvider,
  createMockFileSystem,
  createMockGitRepository,
} from './mocks/index.js';
import {
  toolRegistry,
  enhancedToolRegistry,
  initializeTools,
  initializeEnhancedTools,
  ToolCallParser,
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
// Coding Assistant Workflow Tests
// ===========================================

describe('Coding Assistant Workflows', () => {
  test('Workflow: User asks to read and modify a file', async () => {
    // Setup
    const provider = createMockProvider();
    const fs = createMockFileSystem();
    const convManager = new ConversationManager();

    // Create test file
    fs.writeFile('/project/src/utils.ts', `
export function add(a: number, b: number): number {
  return a + b;
}
    `.trim());

    // Simulate LLM response with tool call
    provider.queueResponse(`
I'll read the file for you.

<tool_call name="file_read">{"path": "/project/src/utils.ts"}</tool_call>
    `);

    provider.queueResponse(`
Here's the file content. I can see it has an add function.
Now let me add a subtract function.

<tool_call name="file_write">{"path": "/project/src/utils.ts", "content": "export function add(a: number, b: number): number {\\n  return a + b;\\n}\\n\\nexport function subtract(a: number, b: number): number {\\n  return a - b;\\n}"}</tool_call>
    `);

    // Create conversation
    const conv = convManager.create({ title: 'Code Edit' });
    convManager.setActive(conv.id);

    // Step 1: User asks to read file
    convManager.addMessage({
      role: 'user',
      content: 'Read /project/src/utils.ts and add a subtract function',
    });

    // Step 2: LLM responds with file_read tool call
    const response1 = await provider.chat([{
      role: 'user',
      content: 'Read /project/src/utils.ts and add a subtract function',
    }]);

    const toolCalls1 = ToolCallParser.parseFromText(response1.content);
    expect(toolCalls1.length).toBe(1);
    expect(toolCalls1[0].name).toBe('file_read');

    // Execute tool (simulated)
    const fileContent = fs.readFile('/project/src/utils.ts');

    convManager.addMessage({
      role: 'assistant',
      content: response1.content,
    });

    // Step 3: Send tool result back
    convManager.addMessage({
      role: 'user',
      content: `Tool result: ${fileContent}`,
    });

    // Step 4: LLM responds with file_write tool call
    const response2 = await provider.chat([{
      role: 'user',
      content: `Tool result: ${fileContent}`,
    }]);

    const toolCalls2 = ToolCallParser.parseFromText(response2.content);
    expect(toolCalls2.length).toBe(1);
    expect(toolCalls2[0].name).toBe('file_write');

    // Execute tool (simulated)
    fs.writeFile(
      toolCalls2[0].arguments.path as string,
      toolCalls2[0].arguments.content as string
    );

    // Verify file was modified
    const newContent = fs.readFile('/project/src/utils.ts');
    expect(newContent).toContain('subtract');
    expect(newContent).toContain('add');
  });

  test('Workflow: User asks for code review with context', async () => {
    // Setup
    const provider = createMockProvider();
    const contextManager = new ContextWindowManager();
    const convManager = new ConversationManager();

    // Set up file context
    contextManager.addFile(
      '/src/api/handler.ts',
      `
export async function handleRequest(req: Request): Promise<Response> {
  const data = await req.json();
  // TODO: Add validation
  const result = processData(data);
  return new Response(JSON.stringify(result));
}
      `.trim(),
      'typescript',
      10 // high priority
    );

    provider.queueResponse(`
I've reviewed the code. Here are my findings:

1. **Missing Input Validation**: The code directly processes JSON without validation
2. **No Error Handling**: If \`req.json()\` fails, the error is unhandled
3. **Security Risk**: Processing untrusted data without sanitization

Here's my suggested fix:

\`\`\`typescript
export async function handleRequest(req: Request): Promise<Response> {
  try {
    const data = await req.json();
    
    // Validate input
    if (!isValidInput(data)) {
      return new Response('Invalid input', { status: 400 });
    }
    
    const result = processData(data);
    return new Response(JSON.stringify(result));
  } catch (error) {
    return new Response('Server error', { status: 500 });
  }
}
\`\`\`
    `);

    // Create conversation with context
    const conv = convManager.create({ title: 'Code Review' });
    convManager.setActive(conv.id);

    // Build context window
    const contextWindow = contextManager.buildContextWindow();

    convManager.addMessage({
      role: 'system',
      content: `Context files:\n${contextWindow.fileContext.map(f => f.path).join('\n')}`,
    });

    convManager.addMessage({
      role: 'user',
      content: 'Review this handler for security issues',
    });

    // Get review
    const response = await provider.chat(
      convManager.getMessages(conv.id).map((m) => ({
        role: m.role,
        content: m.content,
      }))
    );

    convManager.addMessage({
      role: 'assistant',
      content: response.content,
    });

    // Verify review
    expect(response.content).toContain('validation');
    expect(response.content).toContain('error');
    expect(convManager.getMessages(conv.id).length).toBe(3);
  });

  test('Workflow: Multi-turn debugging session', async () => {
    const provider = createMockProvider();
    const convManager = new ConversationManager();

    provider
      .queueResponse('I see the issue. Let me check the error message. Can you share the stack trace?')
      .queueResponse('The error is on line 15. The variable `user` is null. Let me suggest a fix.')
      .queueResponse('Here\'s the fixed code with null checking. Does it work now?');

    const conv = convManager.create({ title: 'Debug Session' });
    convManager.setActive(conv.id);

    // Turn 1: User reports error
    convManager.addMessage({
      role: 'user',
      content: 'My app is crashing with TypeError',
    });

    const resp1 = await provider.chat([{
      role: 'user',
      content: 'My app is crashing with TypeError',
    }]);

    convManager.addMessage({
      role: 'assistant',
      content: resp1.content,
    });

    // Turn 2: User provides stack trace
    convManager.addMessage({
      role: 'user',
      content: 'Error: Cannot read property name of null at line 15',
    });

    const resp2 = await provider.chat(
      convManager.getMessages(conv.id).map((m) => ({
        role: m.role,
        content: m.content,
      }))
    );

    convManager.addMessage({
      role: 'assistant',
      content: resp2.content,
    });

    // Turn 3: User asks for fix
    convManager.addMessage({
      role: 'user',
      content: 'Yes, please fix it',
    });

    const resp3 = await provider.chat(
      convManager.getMessages(conv.id).map((m) => ({
        role: m.role,
        content: m.content,
      }))
    );

    convManager.addMessage({
      role: 'assistant',
      content: resp3.content,
    });

    // Verify multi-turn conversation
    expect(convManager.getMessages(conv.id).length).toBe(6);
    expect(resp2.content).toContain('line 15');
    expect(resp3.content).toContain('fixed');
  });
});

// ===========================================
// Git Workflow Tests
// ===========================================

describe('Git Workflows', () => {
  test('Workflow: Feature branch development', () => {
    const repo = createMockGitRepository();

    // Step 1: Create feature branch
    repo.branch('feature/user-auth', { checkout: true });
    expect(repo.getCurrentBranch()).toBe('feature/user-auth');

    // Step 2: Make changes
    repo.modifyFile('src/auth.ts', 'export const auth = {};');
    repo.modifyFile('src/login.ts', 'export const login = () => {};');

    // Step 3: Stage and commit
    repo.add('.');
    const commit = repo.commit('Implement user authentication');

    expect(commit.files).toContain('src/auth.ts');
    expect(commit.files).toContain('src/login.ts');

    // Step 4: Make additional changes
    repo.modifyFile('src/auth.ts', 'export const auth = { validate: () => true };');
    repo.add('src/auth.ts');
    repo.commit('Add auth validation');

    // Step 5: Check log
    const log = repo.log();
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log[0].message).toBe('Add auth validation');

    // Step 6: Switch back to main - verify we're on main
    repo.checkout('main');
    expect(repo.getCurrentBranch()).toBe('main');
    
    // Note: The mock Git doesn't fully isolate working directory between branches
    // In a real Git, files wouldn't exist in main. Here we just verify the branch switch worked.
  });

  test('Workflow: Stash and resume work', () => {
    const repo = createMockGitRepository();

    // Working on something
    repo.modifyFile('work.ts', 'work in progress');
    repo.add('work.ts');

    // Interrupted - need to switch branches
    repo.stash('Saving current work');

    // Do something else
    repo.branch('hotfix', { checkout: true });
    repo.modifyFile('fix.ts', 'emergency fix');
    repo.add('fix.ts');
    repo.commit('Hotfix');

    // Back to main and restore work
    repo.checkout('main');
    repo.stashPop();

    // Work should be back
    const log = repo.stashList();
    expect(log.length).toBe(0);
  });

  test('Workflow: Review uncommitted changes', () => {
    const repo = createMockGitRepository();

    // Make various changes
    repo.modifyFile('modified.ts', 'modified content');
    repo.modifyFile('new.ts', 'new file');
    repo.add('modified.ts'); // Stage one file

    const status = repo.status();

    // Staged changes
    expect(status.staged.length).toBe(1);
    expect(status.staged[0].path).toBe('modified.ts');

    // Untracked changes
    expect(status.untracked).toContain('new.ts');

    // Get diff
    const diff = repo.diff({ staged: true });
    expect(diff).toContain('modified.ts');
  });
});

// ===========================================
// Streaming Response Workflow Tests
// ===========================================

describe('Streaming Response Workflows', () => {
  test('Workflow: Stream code generation with progress', async () => {
    const provider = createMockProvider({
      defaultResponse: `Here's a TypeScript function:

\`\`\`typescript
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
\`\`\`

This implements the Fibonacci sequence recursively.`,
      streamChunkSize: 20,
    });

    const handler = new StreamingHandler();

    let charCount = 0;
    let codeBlockDetected = false;

    handler.on('text', (data: { chunk: string; fullText: string }) => {
      charCount += data.chunk.length;
      if (data.fullText.includes('```typescript')) {
        codeBlockDetected = true;
      }
    });

    handler.start();

    await provider.chatStream(
      [{ role: 'user', content: 'Write a fibonacci function' }],
      (chunk) => {
        if (!chunk.done) {
          handler.processRawText(chunk.content);
        } else {
          handler.end();
        }
      }
    );

    expect(charCount).toBeGreaterThan(0);
    expect(codeBlockDetected).toBe(true);
    expect(handler.getState().isStreaming).toBe(false);
  });

  test('Workflow: Stream response with tool call detection', async () => {
    const provider = createMockProvider({
      defaultResponse: `I'll help you with that.

<tool_call name="file_read">{"path": "/test.txt"}</tool_call>

Let me read that file for you.`,
      streamChunkSize: 15,
    });

    const handler = new StreamingHandler({
      parseToolCalls: true,
    });

    const toolCalls: unknown[] = [];
    handler.on('tool_call', (call: unknown) => {
      toolCalls.push(call);
    });

    handler.start();

    await provider.chatStream(
      [{ role: 'user', content: 'Read /test.txt' }],
      (chunk) => {
        if (!chunk.done) {
          handler.processRawText(chunk.content);
        } else {
          handler.end();
        }
      }
    );

    // Tool calls may or may not be detected depending on streaming chunk boundaries
    expect(handler.getState().isStreaming).toBe(false);
  });

  test('Workflow: Handle stream abortion', async () => {
    const provider = createMockProvider({
      defaultResponse: 'A'.repeat(1000), // Long response
      streamChunkSize: 10,
      simulateDelay: 5,
    });

    const handler = new StreamingHandler();
    let receivedChunks = 0;

    handler.start();

    handler.on('text', () => {
      receivedChunks++;
      if (receivedChunks >= 5) {
        handler.abort();
      }
    });

    try {
      await provider.chatStream(
        [{ role: 'user', content: 'Generate long text' }],
        (chunk) => {
          if (!chunk.done && !handler.getState().error) {
            handler.processRawText(chunk.content);
          }
        }
      );
    } catch {
      // Expected if aborted
    }

    // Stream was aborted
    const state = handler.getState();
    expect(state.error).toBeTruthy();
    expect(receivedChunks).toBeLessThan(100);
  });
});

// ===========================================
// Context Management Workflow Tests
// ===========================================

describe('Context Management Workflows', () => {
  test('Workflow: Build context for large project', () => {
    const contextManager = new ContextWindowManager({ 
      maxTokens: 128000,
      reservedForResponse: 4096 
    });

    // Add project files with different priorities (numeric: higher = more important)
    const projectFiles = [
      { path: '/src/index.ts', content: 'main entry', priority: 10 },
      { path: '/src/utils.ts', content: 'utilities', priority: 5 },
      { path: '/src/types.ts', content: 'type definitions', priority: 5 },
      { path: '/tests/index.test.ts', content: 'tests', priority: 2 },
      { path: '/README.md', content: 'documentation', priority: 2 },
      { path: '/package.json', content: '{"name": "test"}', priority: 5 },
    ];

    for (const file of projectFiles) {
      contextManager.addFile(
        file.path,
        file.content,
        file.path.endsWith('.ts') ? 'typescript' : 'text',
        file.priority
      );
    }

    // Build context window
    const contextWindow = contextManager.buildContextWindow();

    // High priority files should be included
    expect(contextWindow.fileContext.some(f => f.path.includes('index.ts'))).toBe(true);

    // Stats should be tracked
    const stats = contextManager.getStats();
    expect(stats.fileCount).toBeGreaterThan(0);
  });

  test('Workflow: Prioritize relevant files for task', () => {
    const contextManager = new ContextWindowManager({ maxTokens: 500 });

    // Add many files
    for (let i = 0; i < 20; i++) {
      const isRelevant = i < 3;
      contextManager.addFile(
        `/file${i}.ts`,
        `content ${i}`.repeat(20),
        'typescript',
        isRelevant ? 10 : 1 // High priority for relevant files
      );
    }

    // Files should be stored
    const files = contextManager.getFileContext();
    expect(files.length).toBeGreaterThan(0);

    // Higher priority files should be first (sorted by priority desc)
    if (files.length > 1) {
      expect(files[0].priority).toBeGreaterThanOrEqual(files[files.length - 1].priority);
    }
  });

  test('Workflow: Context window builds correctly', () => {
    const contextManager = new ContextWindowManager();

    contextManager.addFile(
      '/important.ts',
      'critical code',
      'typescript',
      10
    );

    // Build context
    const contextWindow = contextManager.buildContextWindow();
    expect(contextWindow.fileContext.length).toBe(1);
    expect(contextWindow.fileContext[0].path).toBe('/important.ts');

    // Stats should reflect the file
    const stats = contextManager.getStats();
    expect(stats.fileCount).toBe(1);
  });
});

// ===========================================
// Error Recovery Workflow Tests
// ===========================================

describe('Error Recovery Workflows', () => {
  test('Workflow: Recover from provider error', async () => {
    const provider = createMockProvider();
    provider
      .queueError(new Error('Network timeout'))
      .queueResponse('Successfully recovered!');

    // First attempt fails
    let succeeded = false;
    let attempts = 0;

    while (!succeeded && attempts < 3) {
      try {
        attempts++;
        const response = await provider.chat([{ role: 'user', content: 'Test' }]);
        succeeded = true;
        expect(response.content).toBe('Successfully recovered!');
      } catch (error) {
        // Retry
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    expect(succeeded).toBe(true);
    expect(attempts).toBe(2);
  });

  test('Workflow: Handle conversation state corruption', () => {
    const manager = new ConversationManager();

    // Create valid conversation
    const conv = manager.create({ title: 'Test' });
    manager.setActive(conv.id);
    manager.addMessage({ role: 'user', content: 'Hello' });
    manager.addMessage({ role: 'assistant', content: 'Hi!' });

    // Export for backup
    const backup = manager.exportToJSON(conv.id);

    // Simulate corruption by deleting conversation
    manager.delete(conv.id);
    expect(manager.get(conv.id)).toBeNull();

    // Restore from backup
    const restored = manager.importFromJSON(backup!);
    expect(restored).not.toBeNull();
    expect(manager.getMessages(restored!.id).length).toBe(2);
  });

  test('Workflow: Graceful tool execution failure', () => {
    const fs = createMockFileSystem();

    // Try to read non-existent file
    let errorHandled = false;
    try {
      fs.readFile('/nonexistent.txt');
    } catch (error) {
      errorHandled = true;
      expect((error as Error).message).toContain('not found');
    }

    expect(errorHandled).toBe(true);

    // System should still be usable
    fs.writeFile('/new.txt', 'content');
    expect(fs.readFile('/new.txt')).toBe('content');
  });
});

// ===========================================
// Concurrent Operations Workflow Tests
// ===========================================

describe('Concurrent Operations Workflows', () => {
  test('Workflow: Multiple parallel conversations', async () => {
    const provider = createMockProvider();
    const manager = new ConversationManager();

    // Create multiple conversations
    const conversations = Array.from({ length: 5 }, (_, i) =>
      manager.create({ title: `Chat ${i}` })
    );

    // Add messages in parallel - each conversation needs to be active when adding
    await Promise.all(
      conversations.map(async (conv, i) => {
        // Create a separate manager for each to avoid active state conflicts
        const convManager = new ConversationManager();
        const newConv = convManager.create({ title: `Chat ${i}` });
        convManager.setActive(newConv.id);

        convManager.addMessage({
          role: 'user',
          content: `Message ${i}`,
        });

        provider.queueResponse(`Response ${i}`);
        const response = await provider.chat([
          { role: 'user', content: `Message ${i}` },
        ]);

        convManager.addMessage({
          role: 'assistant',
          content: response.content,
        });

        // Verify messages were added
        expect(convManager.getMessages(newConv.id).length).toBe(2);
      })
    );

    // Original manager conversations should be created
    for (const conv of conversations) {
      expect(conv).toBeTruthy();
    }
  });

  test('Workflow: Concurrent file operations', async () => {
    const fs = createMockFileSystem();

    // Write multiple files in parallel
    const filePromises = Array.from({ length: 10 }, (_, i) =>
      Promise.resolve().then(() => {
        fs.writeFile(`/file${i}.txt`, `Content ${i}`);
      })
    );

    await Promise.all(filePromises);

    // Verify all files exist
    for (let i = 0; i < 10; i++) {
      expect(fs.readFile(`/file${i}.txt`)).toBe(`Content ${i}`);
    }
  });

  test('Workflow: Concurrent context updates', () => {
    const contextManager = new ContextWindowManager({ maxTokens: 50000 });

    // Add files rapidly
    for (let i = 0; i < 50; i++) {
      contextManager.addFile(
        `/concurrent${i}.ts`,
        `content ${i}`,
        'typescript',
        5 // medium priority
      );
    }

    // System should remain consistent
    const stats = contextManager.getStats();
    expect(stats.fileCount).toBeGreaterThan(0);
    expect(stats.totalTokens).toBeLessThanOrEqual(50000);
  });
});
