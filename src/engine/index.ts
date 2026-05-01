/**
 * Engine Processor
 * Core message processing and orchestration
 */

import { providerRegistry, type BaseProvider } from '../providers/index.js';
import { agentRegistry, type BaseAgent, createAgent } from '../agents/index.js';
import { sessionManager } from '../session/index.js';
import { fileSystem } from '../filesystem/index.js';
import { contextBuilder } from '../context/index.js';
import { configManager } from '../config/index.js';
import { toolRegistry, initializeTools } from '../tools/index.js';
import type {
  EngineConfig,
  EngineRequest,
  EngineResponse,
  LLMMessage,
  LLMResponse,
  Session,
  AgentRole,
  ProviderName,
  ToolCall,
  ToolResult,
} from '../types/index.js';
import {
  runOpenAIToolLoop,
  supportsOpenAIToolLoop,
} from './openai-tool-loop.js';

// ===========================================
// Engine Class
// ===========================================

class Engine {
  private initialized = false;
  private currentSession: Session | null = null;
  private agent: BaseAgent | null = null;
  private provider: BaseProvider | null = null;
  private toolCallHandler: ((toolName: string, args: Record<string, unknown>, result: ToolResult) => void) | null = null;

  /**
   * Initialize the engine
   */
  async initialize(options: {
    workingDirectory?: string;
    agentRole?: AgentRole;
    providerName?: ProviderName;
    sessionId?: string;
  } = {}): Promise<void> {
    if (this.initialized) return;

    // Initialize tools system
    initializeTools();

    // Initialize providers
    await providerRegistry.initialize();

    // Set working directory
    const workingDir = options.workingDirectory || process.cwd();
    fileSystem.setWorkingDirectory(workingDir);

    // Initialize session manager
    sessionManager.initialize();

    // Set up provider
    if (options.providerName) {
      await providerRegistry.setActive(options.providerName);
    }
    this.provider = providerRegistry.getActive();

    // Set up agent
    const config = configManager.get();
    const agentRole = options.agentRole || config.defaultAgent;
    agentRegistry.initialize(agentRole, this.provider);
    this.agent = agentRegistry.getActive();

    // Load or create session
    if (options.sessionId) {
      const session = sessionManager.get(options.sessionId);
      if (session) {
        this.currentSession = session;
        this.agent.restoreHistory(
          session.messages.filter((m) => m.role !== 'system')
        );
      }
    }

    if (!this.currentSession) {
      this.currentSession = sessionManager.create({
        name: `Session ${new Date().toLocaleString()}`,
        agent: agentRole,
        provider: this.provider.name,
        model: this.provider.getModel(),
        workingDirectory: workingDir,
      });
    }

    // Set agent context
    const context = await contextBuilder.build({
      agentRole,
      workingDirectory: workingDir,
    });

    this.agent.setContext({
      workingDirectory: workingDir,
      files: context.files,
      gitInfo: context.gitInfo,
    });

    this.initialized = true;
  }

  /**
   * Process a user message
   */
  async process(request: EngineRequest): Promise<EngineResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    const agent = this.agent!;
    const session = this.currentSession!;

    // Store user message
    const userMessage: LLMMessage = {
      role: 'user',
      content: request.message,
      timestamp: new Date(),
    };
    sessionManager.addMessage(session.id, userMessage);

    // Get response from agent
    const response = await agent.process(request.message);

    // Store assistant response
    const assistantMessage: LLMMessage = {
      role: 'assistant',
      content: response.content,
      timestamp: new Date(),
    };
    sessionManager.addMessage(session.id, assistantMessage);

    return {
      message: response,
      sessionId: session.id,
    };
  }

  /**
   * Process a message with streaming and tool execution
   */
  async processStream(
    request: EngineRequest,
    onChunk: (content: string) => void,
    signal?: AbortSignal
  ): Promise<EngineResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    const agent = this.agent!;
    const session = this.currentSession!;
    const provider = this.provider!;

    // Store user message
    const userMessage: LLMMessage = {
      role: 'user',
      content: request.message,
      timestamp: new Date(),
    };
    sessionManager.addMessage(session.id, userMessage);

    // Add user message to agent history
    agent.addMessageToHistory({
      role: 'user',
      content: request.message,
    });

    let totalContent = '';

    try {
      // Groq / OpenRouter: streaming requests do not send tool schemas, so the model may
      // return tool_calls with no text (looks hung) and no tools run (no real file writes).
      if (supportsOpenAIToolLoop(provider)) {
        const { content, response } = await runOpenAIToolLoop(
          provider,
          agent,
          (call) => this.executeAgentToolCall(call),
          onChunk,
          { signal }
        );
        totalContent = content;

        agent.addMessageToHistory({
          role: 'assistant',
          content: totalContent || response.content,
        });

        const assistantMessage: LLMMessage = {
          role: 'assistant',
          content: totalContent || response.content,
          timestamp: new Date(),
        };
        sessionManager.addMessage(session.id, assistantMessage);

        return {
          message: {
            content: totalContent || response.content,
            model: provider.getModel(),
            provider: provider.name,
            finishReason: response.finishReason || 'stop',
            usage: response.usage,
          },
          sessionId: session.id,
        };
      }

      const messages = [
        { role: 'system' as const, content: agent.getSystemPrompt() },
        ...agent.getHistory(),
      ];

      const response = await provider.chatStream(messages, (chunk) => {
        if (signal?.aborted) {
          return;
        }
        if (!chunk.done && chunk.content) {
          onChunk(chunk.content);
          totalContent += chunk.content;
        }
      });

      agent.addMessageToHistory({
        role: 'assistant',
        content: totalContent || response.content,
      });

      const assistantMessage: LLMMessage = {
        role: 'assistant',
        content: totalContent || response.content,
        timestamp: new Date(),
      };
      sessionManager.addMessage(session.id, assistantMessage);

      return {
        message: {
          content: totalContent || response.content,
          model: provider.getModel(),
          provider: provider.name,
          finishReason: response.finishReason || 'stop',
          usage: response.usage,
        },
        sessionId: session.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onChunk(`\n\n❌ Error: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Run a tool call through the active agent (capabilities, confirmations) and session bookkeeping.
   */
  async executeAgentToolCall(call: ToolCall): Promise<ToolResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const workingDir = this.currentSession?.workingDirectory || process.cwd();
    toolRegistry.setContext({
      workingDirectory: workingDir,
      sessionId: this.currentSession?.id,
    });

    const result = await this.agent!.handleToolCall(call);

    if (this.toolCallHandler) {
      this.toolCallHandler(call.name, call.arguments, result);
    }

    if (this.currentSession && result.success) {
      const metadata = this.currentSession.metadata || {};
      if (call.name === 'file_write' || call.name === 'file_edit') {
        metadata.filesModified = metadata.filesModified || [];
        const p = call.arguments.path as string | undefined;
        if (p && !metadata.filesModified.includes(p)) {
          metadata.filesModified.push(p);
        }
      }
      if (call.name === 'terminal_execute') {
        metadata.commandsExecuted = metadata.commandsExecuted || [];
        metadata.commandsExecuted.push(call.arguments.command as string);
      }
      sessionManager.update(this.currentSession.id, { metadata });
    }

    return result;
  }

  /**
   * Switch to a different agent
   */
  async switchAgent(role: AgentRole): Promise<void> {
    if (!this.initialized) {
      await this.initialize({ agentRole: role });
      return;
    }

    agentRegistry.setActive(role);
    this.agent = agentRegistry.getActive();

    // Update session
    if (this.currentSession) {
      sessionManager.update(this.currentSession.id, { agent: role });
      this.currentSession.agent = role;
    }

    // Update context
    const context = await contextBuilder.build({
      agentRole: role,
      workingDirectory: fileSystem.getWorkingDirectory(),
    });

    this.agent.setContext({
      workingDirectory: fileSystem.getWorkingDirectory(),
      files: context.files,
      gitInfo: context.gitInfo,
    });
  }

  /**
   * Switch to a different provider
   */
  async switchProvider(name: ProviderName): Promise<boolean> {
    const success = await providerRegistry.setActive(name);
    if (success) {
      this.provider = providerRegistry.getActive();
      this.agent?.setProvider(this.provider);

      // Update session
      if (this.currentSession) {
        sessionManager.update(this.currentSession.id, {
          provider: name,
          model: this.provider.getModel(),
        });
      }
    }
    return success;
  }

  /**
   * Start a new session
   */
  async newSession(name?: string): Promise<Session> {
    const agent = this.agent || agentRegistry.getActive();
    const provider = this.provider || providerRegistry.getActive();
    
    this.currentSession = sessionManager.create({
      name: name || `Session ${new Date().toLocaleString()}`,
      agent: agent.role,
      provider: provider.name,
      model: provider.getModel(),
      workingDirectory: fileSystem.getWorkingDirectory(),
    });

    // Clear agent history
    agent.clearHistory();

    return this.currentSession;
  }

  /**
   * Load an existing session
   */
  async loadSession(sessionId: string): Promise<Session | null> {
    const session = sessionManager.get(sessionId);
    if (!session) return null;

    this.currentSession = session;

    // Switch to session's agent and provider
    await this.switchAgent(session.agent);
    await this.switchProvider(session.provider);

    this.agent!.restoreHistory(
      session.messages.filter((m) => m.role !== 'system')
    );

    // Update working directory
    fileSystem.setWorkingDirectory(session.workingDirectory);

    return session;
  }

  /**
   * Get current state
   */
  getState(): {
    session: Session | null;
    agent: AgentRole | null;
    provider: ProviderName | null;
    model: string | null;
    workingDirectory: string;
  } {
    return {
      session: this.currentSession,
      agent: this.agent?.role || null,
      provider: this.provider?.name || null,
      model: this.provider?.getModel() || null,
      workingDirectory: fileSystem.getWorkingDirectory(),
    };
  }

  /**
   * Clear current conversation
   */
  clearConversation(): void {
    if (this.currentSession) {
      sessionManager.clearMessages(this.currentSession.id);
      this.currentSession.messages = [];
    }
    this.agent?.clearHistory();
  }

  /**
   * Get available providers with models and status
   */
  getProviders(): Array<{
    name: ProviderName;
    model: string;
    models: string[];
    isActive: boolean;
  }> {
    return providerRegistry.getProviderInfoWithModels();
  }

  /**
   * Get recent session summaries (most recent first)
   */
  getSessionHistory(limit = 20) {
    sessionManager.initialize();
    return sessionManager.list(limit);
  }

  /**
   * Resolve a session id from full id or a unique prefix
   */
  resolveSessionId(sessionIdOrPrefix: string): string | null {
    sessionManager.initialize();

    const exact = sessionManager.get(sessionIdOrPrefix);
    if (exact) {
      return exact.id;
    }

    const matches = sessionManager
      .list(200)
      .filter((s) => s.id.startsWith(sessionIdOrPrefix));

    if (matches.length !== 1) {
      return null;
    }

    return matches[0].id;
  }

  /**
   * Get available models for a provider
   */
  async getModelsForProvider(name: ProviderName): Promise<string[]> {
    return providerRegistry.getModelsForProvider(name);
  }

  /**
   * Switch to a different model within the current provider
   */
  switchModel(model: string): void {
    if (!this.provider) return;
    this.provider.setModel(model);
    
    if (this.currentSession) {
      sessionManager.update(this.currentSession.id, { model });
    }
  }

  /**
   * Check provider connectivity and get error if any
   */
  async checkProviderStatus(name: ProviderName): Promise<{ available: boolean; error?: string }> {
    return providerRegistry.checkProviderStatus(name);
  }

  /**
   * Get available agents
   */
  getAgents(): Array<{
    role: AgentRole;
    name: string;
    isActive: boolean;
  }> {
    return agentRegistry.getInfo();
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const workingDir = this.currentSession?.workingDirectory || process.cwd();
    
    // Set tool context
    toolRegistry.setContext({
      workingDirectory: workingDir,
      sessionId: this.currentSession?.id,
    });

    const result = await toolRegistry.execute(toolName, args);

    // Notify handler if set
    if (this.toolCallHandler) {
      this.toolCallHandler(toolName, args, result);
    }

    // Log to session metadata
    if (this.currentSession && result.success) {
      const metadata = this.currentSession.metadata || {};
      if (toolName === 'file_write' || toolName === 'file_edit') {
        metadata.filesModified = metadata.filesModified || [];
        if (args.path && !metadata.filesModified.includes(args.path as string)) {
          metadata.filesModified.push(args.path as string);
        }
      }
      if (toolName === 'terminal_execute') {
        metadata.commandsExecuted = metadata.commandsExecuted || [];
        metadata.commandsExecuted.push(args.command as string);
      }
      sessionManager.update(this.currentSession.id, { metadata });
    }

    return result;
  }

  /**
   * Set a handler to be notified of tool executions
   */
  setToolCallHandler(
    handler: (toolName: string, args: Record<string, unknown>, result: ToolResult) => void
  ): void {
    this.toolCallHandler = handler;
  }

  /**
   * Get available tools for the current agent
   */
  getAvailableTools(): Array<{
    name: string;
    description: string;
    category: string;
  }> {
    return toolRegistry.getDefinitions().map(def => ({
      name: def.name,
      description: def.description,
      category: def.category,
    }));
  }

  /**
   * Get tool execution history
   */
  getToolHistory(limit?: number) {
    return toolRegistry.getHistory(limit);
  }

  /**
   * Shutdown the engine
   */
  shutdown(): void {
    sessionManager.close();
    this.initialized = false;
    this.currentSession = null;
    this.agent = null;
    this.provider = null;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const engine = new Engine();
export { Engine };
