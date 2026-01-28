/**
 * Engine Processor
 * Core message processing and orchestration
 */

import { providerRegistry, type BaseProvider } from '../providers/index.js';
import { agentRegistry, type BaseAgent, createAgent } from '../agents/index.js';
import { sessionManager } from '../session/index';
import { fileSystem } from '../filesystem/index';
import { contextBuilder } from '../context/index.js';
import { configManager } from '../config/index.js';
import type {
  EngineConfig,
  EngineRequest,
  EngineResponse,
  LLMMessage,
  LLMResponse,
  Session,
  AgentRole,
  ProviderName,
} from '../types/index.js';

// ===========================================
// Engine Class
// ===========================================

class Engine {
  private initialized = false;
  private currentSession: Session | null = null;
  private agent: BaseAgent | null = null;
  private provider: BaseProvider | null = null;

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
        // Restore conversation history to agent
        for (const msg of session.messages) {
          if (msg.role !== 'system') {
            this.agent.getHistory().push(msg);
          }
        }
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
   * Process a message with streaming
   */
  async processStream(
    request: EngineRequest,
    onChunk: (content: string) => void
  ): Promise<EngineResponse> {
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

    // Get streaming response
    const messages = agent['buildMessages'](request.message);
    const response = await this.provider!.chatStream(messages, (chunk) => {
      if (!chunk.done && chunk.content) {
        onChunk(chunk.content);
      }
    });

    // Add to agent history
    agent['addToHistory']({
      role: 'user',
      content: request.message,
    });
    agent['addToHistory']({
      role: 'assistant',
      content: response.content,
    });

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

    if (!this.currentSession) {
      throw new Error('Failed to create session');
    }
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

    // Restore conversation history
    this.agent!.clearHistory();
    for (const msg of session.messages) {
      if (msg.role !== 'system') {
        this.agent!.getHistory().push(msg);
      }
    }

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
   * Get available providers
   */
  getProviders(): Array<{
    name: ProviderName;
    model: string;
    isActive: boolean;
  }> {
    return providerRegistry.getProviderInfo();
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
