# LUMECODE - Implementation Guide for Claude Opus

## QUICK START FOR CLAUDE

This guide helps Claude Opus understand how to build Lumecode incrementally. Use this when prompting Claude for specific components.

---

## 1. CORE TYPE DEFINITIONS

**Start here**: These are the foundation for all other components.

### File: `src/types/index.ts`

```typescript
// Agent Types
export type AgentType = 'build' | 'plan' | 'review' | 'general';

export interface Agent {
  id: AgentType;
  name: string;
  description: string;
  permissions: {
    canEditFiles: boolean;
    canRunShell: boolean;
    canAccessNetwork: boolean;
    requiresConfirmation: boolean;
  };
  systemPrompt: string;
  capabilities: string[];
}

// LLM Provider Types
export type ProviderType = 'anthropic' | 'openai' | 'google' | 'groq' | 'ollama' | 'huggingface';

export interface CompletionRequest {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
  systemPrompt?: string;
}

export interface CompletionResponse {
  id: string;
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Session Types
export interface Session {
  id: string; // UUID
  name: string;
  projectPath: string;
  createdAt: number;
  lastAccessedAt: number;
  agent: AgentType;
  model: string;
  provider: ProviderType;
  conversation: Message[];
  fileContext: string[];
  isShared: boolean;
  shareToken?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  codeBlocks?: CodeBlock[];
  timestamp: number;
  tokenCount: number;
}

export interface CodeBlock {
  language: string;
  code: string;
  fileName?: string;
  action: 'create' | 'update' | 'delete';
}

// File Context Types
export interface FileContext {
  filePath: string;
  content: string;
  language: string;
  selected: boolean;
}

export interface ProjectAnalysis {
  name: string;
  root: string;
  languages: string[];
  totalFiles: number;
  totalLines: number;
  dependencies: string[];
}
```

### When to use:
- All your functions should have proper argument and return types
- Import these types in every service file
- Keep types close to their usage

---

## 2. BASE AGENT CLASS

**File**: `src/agents/agent.base.ts`

This is the template for all agents.

```typescript
import { Agent, AgentType, Message, CompletionRequest } from '../types';

export abstract class BaseAgent implements Agent {
  id: AgentType;
  name: string;
  description: string;
  permissions: Agent['permissions'];
  systemPrompt: string;
  capabilities: string[];

  constructor(config: Agent) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.permissions = config.permissions;
    this.systemPrompt = config.systemPrompt;
    this.capabilities = config.capabilities;
  }

  /**
   * Check if agent can perform an action
   */
  canPerformAction(action: string): boolean {
    return this.capabilities.includes(action);
  }

  /**
   * Requires confirmation?
   */
  requiresConfirmation(action: string): boolean {
    return this.permissions.requiresConfirmation;
  }

  /**
   * Build system prompt with context
   */
  buildSystemPrompt(context: string): string {
    return `${this.systemPrompt}\n\n## Current Context:\n${context}`;
  }

  /**
   * Process incoming message
   */
  abstract processMessage(message: Message, context: string): Promise<string>;

  /**
   * Validate request (can be overridden)
   */
  validateRequest(request: CompletionRequest): boolean {
    return true;
  }
}
```

### Implementing agents:

```typescript
// src/agents/build.agent.ts
import { BaseAgent } from './agent.base';
import { AGENTS_CONFIG } from '../config/agents.config';

export class BuildAgent extends BaseAgent {
  constructor() {
    super(AGENTS_CONFIG.build);
  }

  async processMessage(message: Message, context: string): Promise<string> {
    // Build agent logic - full file access, shell commands
    const systemPrompt = this.buildSystemPrompt(context);
    // ... process message
    return response;
  }
}
```

### When to use:
- When building `src/agents/*.agent.ts` files
- For permission checking
- For agent selection/switching logic

---

## 3. PROVIDER ABSTRACTION

**File**: `src/providers/provider.base.ts`

The template for all LLM providers.

```typescript
import { ProviderType, CompletionRequest, CompletionResponse } from '../types';

export interface LLMModel {
  id: string;
  name: string;
  provider: ProviderType;
  description?: string;
  maxTokens?: number;
  costPer1kTokens?: {
    input: number;
    output: number;
  };
}

export abstract class BaseProvider {
  name: string;
  type: ProviderType;
  apiKey: string;
  timeout: number = 30000;
  models: LLMModel[] = [];

  constructor(type: ProviderType, apiKey: string) {
    this.type = type;
    this.apiKey = apiKey;
  }

  /**
   * Authenticate with provider
   */
  abstract authenticate(): Promise<boolean>;

  /**
   * List available models
   */
  abstract listModels(): Promise<LLMModel[]>;

  /**
   * Create completion
   */
  abstract createCompletion(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Stream completion
   */
  abstract *streamCompletion(request: CompletionRequest): AsyncIterable<string>;

  /**
   * Validate model exists
   */
  validateModel(modelId: string): boolean {
    return this.models.some(m => m.id === modelId);
  }

  /**
   * Format error message
   */
  protected handleError(error: any): Error {
    return new Error(`[${this.name}] ${error.message}`);
  }
}
```

### Implementing providers:

```typescript
// src/providers/provider.anthropic.ts
import { BaseProvider, LLMModel } from './provider.base';
import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider extends BaseProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    super('anthropic', apiKey);
    this.client = new Anthropic({ apiKey });
    this.initModels();
  }

  private initModels(): void {
    this.models = [
      { id: 'claude-opus', name: 'Claude Opus', provider: 'anthropic', description: 'Latest, most capable' },
      { id: 'claude-sonnet', name: 'Claude Sonnet', provider: 'anthropic' },
      { id: 'claude-haiku', name: 'Claude Haiku', provider: 'anthropic', description: 'Fast, efficient' },
    ];
  }

  async authenticate(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-opus',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return !!response;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<LLMModel[]> {
    return this.models;
  }

  async createCompletion(request) {
    try {
      const response = await this.client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens || 2048,
        system: request.systemPrompt,
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      });

      return {
        id: response.id,
        content: response.content[0].type === 'text' ? response.content[0].text : '',
        model: request.model,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async *streamCompletion(request) {
    const stream = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens || 2048,
      system: request.systemPrompt,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }
}
```

### When to use:
- Adding new LLM providers
- Testing provider implementations
- Provider error handling

---

## 4. SESSION MANAGEMENT

**File**: `src/session/storage.ts`

```typescript
import Database from 'better-sqlite3';
import { Session, Message } from '../types';

export class SessionStorage {
  private db: Database.Database;

  constructor(dbPath: string = '~/.lumecode/sessions.db') {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        projectPath TEXT NOT NULL,
        agent TEXT NOT NULL,
        model TEXT NOT NULL,
        provider TEXT NOT NULL,
        isShared BOOLEAN DEFAULT 0,
        shareToken TEXT UNIQUE,
        createdAt INTEGER,
        lastAccessedAt INTEGER
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        codeBlocks TEXT,
        tokenCount INTEGER,
        timestamp INTEGER,
        FOREIGN KEY (sessionId) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS file_context (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        filePath TEXT NOT NULL,
        FOREIGN KEY (sessionId) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_session_created ON sessions(createdAt);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(sessionId);
    `);
  }

  // CRUD Operations
  saveSession(session: Session): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions 
      (id, name, projectPath, agent, model, provider, createdAt, lastAccessedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.name,
      session.projectPath,
      session.agent,
      session.model,
      session.provider,
      session.createdAt,
      session.lastAccessedAt
    );
  }

  getSession(sessionId: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(sessionId) as Session | null;
  }

  listSessions(): Session[] {
    const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY lastAccessedAt DESC');
    return stmt.all() as Session[];
  }

  deleteSession(sessionId: string): void {
    this.db.prepare('DELETE FROM messages WHERE sessionId = ?').run(sessionId);
    this.db.prepare('DELETE FROM file_context WHERE sessionId = ?').run(sessionId);
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  // Message Operations
  addMessage(sessionId: string, message: Message): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, sessionId, role, content, codeBlocks, tokenCount, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      message.id,
      sessionId,
      message.role,
      message.content,
      JSON.stringify(message.codeBlocks || []),
      message.tokenCount,
      message.timestamp
    );
  }

  getMessages(sessionId: string, limit: number = 100): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp DESC LIMIT ?
    `);
    const rows = stmt.all(sessionId, limit) as any[];
    return rows.map(row => ({
      ...row,
      codeBlocks: JSON.parse(row.codeBlocks || '[]'),
    }));
  }
}
```

### When to use:
- Session persistence
- Conversation history
- Session recovery after restart

---

## 5. CONTEXT BUILDER

**File**: `src/context/builder.ts`

Gathers all context for the LLM.

```typescript
import fs from 'fs-extra';
import path from 'path';
import { ProjectAnalysis, FileContext, Message } from '../types';

export class ContextBuilder {
  /**
   * Build system context
   */
  async buildSystemContext(projectPath: string): Promise<string> {
    const analysis = await this.analyzeProject(projectPath);
    
    return `
Project: ${analysis.name}
Languages: ${analysis.languages.join(', ')}
Total Files: ${analysis.totalFiles}
Key Dependencies: ${analysis.dependencies.slice(0, 5).join(', ')}
`;
  }

  /**
   * Build file context
   */
  async buildFileContext(filePaths: string[]): Promise<string> {
    let context = '';
    
    for (const filePath of filePaths) {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').length;
      context += `\n## File: ${filePath} (${lines} lines)\n\`\`\`\n${content}\n\`\`\`\n`;
    }

    return context;
  }

  /**
   * Build conversation context
   */
  buildConversationContext(messages: Message[], maxMessages: number = 10): string {
    const recent = messages.slice(-maxMessages);
    
    return recent
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');
  }

  /**
   * Analyze project
   */
  private async analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
    const files = await this.scanDirectory(projectPath);
    const languages = this.detectLanguages(files);
    const dependencies = this.extractDependencies(projectPath);

    return {
      name: path.basename(projectPath),
      root: projectPath,
      languages,
      totalFiles: files.length,
      totalLines: await this.countLines(files),
      dependencies,
    };
  }

  private async scanDirectory(dir: string): Promise<string[]> {
    // Implement directory scanning
    return [];
  }

  private detectLanguages(files: string[]): string[] {
    const extensions = new Set<string>();
    files.forEach(file => {
      const ext = path.extname(file);
      if (ext) extensions.add(ext);
    });
    return Array.from(extensions);
  }

  private extractDependencies(projectPath: string): string[] {
    // Parse package.json, requirements.txt, go.mod, etc.
    return [];
  }

  private async countLines(files: string[]): Promise<number> {
    let total = 0;
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      total += content.split('\n').length;
    }
    return total;
  }
}
```

### When to use:
- Building context for LLM
- Project analysis
- Intelligent file selection

---

## 6. CORE ENGINE

**File**: `src/engine/processor.ts`

The main message processing loop.

```typescript
import { Session, Message, CompletionRequest } from '../types';
import { BaseProvider } from '../providers/provider.base';
import { BaseAgent } from '../agents/agent.base';
import { SessionStorage } from '../session/storage';
import { ContextBuilder } from '../context/builder';

export class EngineProcessor {
  constructor(
    private storage: SessionStorage,
    private contextBuilder: ContextBuilder,
    private providers: Map<string, BaseProvider>,
    private agents: Map<string, BaseAgent>
  ) {}

  /**
   * Process user message
   */
  async processMessage(sessionId: string, userMessage: string): Promise<AsyncIterable<string>> {
    // 1. Load session
    const session = this.storage.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    // 2. Get agent and provider
    const agent = this.agents.get(session.agent);
    const provider = this.providers.get(session.provider);
    if (!agent || !provider) throw new Error('Agent or provider not found');

    // 3. Build context
    const systemContext = await this.contextBuilder.buildSystemContext(session.projectPath);
    const fileContext = await this.contextBuilder.buildFileContext(session.fileContext);
    const conversationContext = this.contextBuilder.buildConversationContext(session.conversation);
    
    const fullContext = `${systemContext}\n${fileContext}\n\n## Conversation:\n${conversationContext}`;

    // 4. Build system prompt
    const systemPrompt = agent.buildSystemPrompt(fullContext);

    // 5. Add user message to history
    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
      tokenCount: estimateTokens(userMessage),
    };
    
    this.storage.addMessage(sessionId, userMsg);

    // 6. Create completion request
    const request: CompletionRequest = {
      model: session.model,
      messages: [...session.conversation, userMsg],
      systemPrompt,
      stream: true,
    };

    // 7. Validate with agent
    if (!agent.validateRequest(request)) {
      throw new Error('Invalid request for this agent');
    }

    // 8. Stream response from provider
    return provider.streamCompletion(request);
  }

  /**
   * Handle response from LLM
   */
  async handleResponse(sessionId: string, response: string): Promise<void> {
    const message: Message = {
      id: generateId(),
      role: 'assistant',
      content: response,
      codeBlocks: this.extractCodeBlocks(response),
      timestamp: Date.now(),
      tokenCount: estimateTokens(response),
    };

    this.storage.addMessage(sessionId, message);

    // Process code blocks (file modifications, etc.)
    await this.processCodeBlocks(sessionId, message.codeBlocks || []);
  }

  private extractCodeBlocks(content: string) {
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      blocks.push({
        language: match[1] || 'text',
        code: match[2],
      });
    }

    return blocks;
  }

  private async processCodeBlocks(sessionId: string, blocks: any[]): Promise<void> {
    const session = this.storage.getSession(sessionId);
    if (!session) return;

    const agent = this.agents.get(session.agent);
    if (!agent) return;

    // Check permissions, apply changes, etc.
    for (const block of blocks) {
      if (agent.canPerformAction('write_code')) {
        // Write code to file
      }
    }
  }
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); // Rough estimate
}
```

### When to use:
- Main message loop
- Response handling
- Code block processing

---

## 7. CLI ENTRY POINT

**File**: `src/cli.ts`

```typescript
import { program } from 'commander';
import { SessionManager } from './session/manager';
import { EngineProcessor } from './engine/processor';

const sessionManager = new SessionManager();

program
  .version('1.0.0')
  .description('Lumecode - Open Source AI Coding Agent');

// Session commands
program
  .command('new <name>')
  .description('Create new session')
  .option('-a, --agent <type>', 'Agent type', 'build')
  .action(async (name, options) => {
    const session = await sessionManager.createSession(name, process.cwd(), options.agent);
    console.log(`Created session: ${session.id}`);
  });

program
  .command('open <name>')
  .description('Open existing session')
  .action(async (name) => {
    const session = await sessionManager.openSession(name);
    // Start TUI
    startTUI(session);
  });

program
  .command('list')
  .description('List all sessions')
  .action(async () => {
    const sessions = await sessionManager.listSessions();
    sessions.forEach(s => {
      console.log(`${s.name} (${s.agent} - ${s.model})`);
    });
  });

program.parse(process.argv);
```

---

## 8. PROMPTING CLAUDE - STEP-BY-STEP

### Prompt Template:

```
# Task: Build [Component Name]

## Context:
- You are building Lumecode, an open-source AI coding agent
- The full specification is in [link to spec]
- This component fits into the architecture like this: [diagram]

## Requirements:
1. [Requirement 1]
2. [Requirement 2]
3. [Requirement 3]

## Reference Files:
- Base class: `src/agents/agent.base.ts` (uses inheritance)
- Similar component: `src/providers/provider.base.ts` (reference pattern)

## Specific Constraints:
- Use TypeScript with strict mode
- No `any` types
- Implement proper error handling
- Include JSDoc comments
- Add unit tests

## Deliverable:
- Complete implementation of [component]
- Integration with existing services
- Error handling strategy
- Test cases
```

### Example Prompts:

**Prompt 1: Build OpenAI Provider**
```
I want to implement the OpenAI provider for Lumecode following the BaseProvider pattern.

The provider should:
1. Support models: gpt-4-turbo, gpt-4, gpt-3.5-turbo
2. Authenticate using OPENAI_API_KEY env var
3. Support streaming responses
4. Handle rate limiting gracefully
5. Transform OpenAI API format to CompletionRequest/CompletionResponse

Use src/providers/provider.anthropic.ts as reference for the structure.

Provide:
- Full implementation
- Error handling for API errors
- Retry logic
- Type definitions
- Unit tests
```

**Prompt 2: Build File System Abstraction**
```
Build the virtual file system (VFS) for Lumecode.

Requirements:
1. Read files with syntax detection
2. List directories recursively
3. Support .gitignore parsing
4. Permission checking (based on agent capabilities)
5. File change tracking

The VFS should work with src/agents/agent.base.ts permissions:
- Build agent: full read/write
- Plan agent: read-only
- Review agent: source files only

Provide:
- VirtualFS class implementation
- Permission checker
- File scanner
- .gitignore support
```

---

## 9. TESTING STRATEGY

### Unit Test Template:

```typescript
// src/agents/__tests__/build.agent.test.ts
import { BuildAgent } from '../build.agent';
import { expect } from 'chai';

describe('BuildAgent', () => {
  let agent: BuildAgent;

  beforeEach(() => {
    agent = new BuildAgent();
  });

  describe('permissions', () => {
    it('should have full file access', () => {
      expect(agent.permissions.canEditFiles).to.be.true;
      expect(agent.permissions.canRunShell).to.be.true;
    });

    it('should not require confirmation for actions', () => {
      expect(agent.permissions.requiresConfirmation).to.be.false;
    });
  });

  describe('capabilities', () => {
    it('should be able to write code', () => {
      expect(agent.canPerformAction('write_code')).to.be.true;
    });

    it('should be able to run tests', () => {
      expect(agent.canPerformAction('run_tests')).to.be.true;
    });
  });
});
```

---

## 10. DEPLOYMENT CHECKLIST

When ready to deploy to npm:

```bash
# Version bump
npm version patch  # or minor/major

# Build
npm run build

# Tests
npm run test
npm run test:coverage (must be >80%)

# Lint
npm run lint

# Security check
npm audit

# Publish
npm publish

# GitHub Release
gh release create v[version] --generate-notes
```

---

## MOST IMPORTANT REMINDERS

1. **Start with types** - Define all TypeScript interfaces first
2. **Use inheritance** - BaseAgent, BaseProvider patterns
3. **Error handling** - Every async function needs try/catch
4. **Testing** - Write tests as you build
5. **Documentation** - JSDoc on all public functions
6. **Env variables** - Use .env for secrets, never hardcode
7. **Logging** - Use structured logging (pino)
8. **Separation of concerns** - Each file has one responsibility

---

## QUICK COMMAND TO GIVE CLAUDE

**Copy and paste this when starting a new component:**

```
Build [COMPONENT NAME] for Lumecode following this spec:
[Copy relevant section from lumecode-spec.md]

Reference implementations:
- Types: [relevant types from src/types/index.ts]
- Base class: [relevant base class]
- Integration: [where this fits in the architecture]

Requirements:
- TypeScript with strict mode
- Proper error handling
- JSDoc comments
- Unit tests with >80% coverage
- No hardcoded secrets
- Follows the architecture patterns

Deliverable: Complete, production-ready implementation with tests.
```

---

## SUCCESS METRICS

After each component:
- ✅ All tests passing
- ✅ No TypeScript errors
- ✅ Linting passes
- ✅ Proper error handling
- ✅ Documentation complete
- ✅ Integrated with other components

---

**You're ready to build with Claude Opus! This spec + implementation guide = production-ready code.**
