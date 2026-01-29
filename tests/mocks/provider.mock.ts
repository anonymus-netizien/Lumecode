/**
 * Mock Provider for Testing
 * Simulates LLM provider behavior without making actual API calls
 */

import type {
  ProviderName,
  ProviderCapabilities,
  LLMMessage,
  LLMResponse,
  StreamChunk,
} from '../../src/types/index.js';

// ===========================================
// Types
// ===========================================

export interface MockProviderConfig {
  name?: ProviderName;
  model?: string;
  responses?: Map<string, string>;
  defaultResponse?: string;
  simulateDelay?: number;
  simulateError?: Error | null;
  streamChunkSize?: number;
  toolCalls?: MockToolCall[];
}

export interface MockToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface MockCallRecord {
  method: string;
  args: unknown[];
  timestamp: Date;
}

// ===========================================
// Mock Provider Class
// ===========================================

export class MockProvider {
  private config: Required<MockProviderConfig>;
  private callHistory: MockCallRecord[] = [];
  private responseQueue: string[] = [];
  private errorQueue: Error[] = [];
  private toolCallQueue: MockToolCall[][] = [];

  constructor(config: MockProviderConfig = {}) {
    this.config = {
      name: config.name || 'gemini',
      model: config.model || 'mock-model',
      responses: config.responses || new Map(),
      defaultResponse: config.defaultResponse || 'Mock response',
      simulateDelay: config.simulateDelay || 0,
      simulateError: config.simulateError || null,
      streamChunkSize: config.streamChunkSize || 10,
      toolCalls: config.toolCalls || [],
    };
  }

  // ===========================================
  // Provider Interface Implementation
  // ===========================================

  get name(): ProviderName {
    return this.config.name;
  }

  get capabilities(): ProviderCapabilities {
    return {
      streaming: true,
      functionCalling: true,
      vision: false,
      maxContextLength: 128000,
      costPerMillionTokens: {
        input: 0,
        output: 0,
      },
    };
  }

  getModel(): string {
    return this.config.model;
  }

  setModel(model: string): void {
    this.config.model = model;
  }

  /**
   * Simulated chat completion
   */
  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    this.recordCall('chat', [messages]);

    if (this.config.simulateDelay > 0) {
      await this.delay(this.config.simulateDelay);
    }

    // Check for queued errors
    if (this.errorQueue.length > 0) {
      throw this.errorQueue.shift()!;
    }

    if (this.config.simulateError) {
      throw this.config.simulateError;
    }

    // Get response from queue or config
    const response = this.getNextResponse(messages);
    const toolCalls = this.getNextToolCalls();

    return {
      content: response,
      model: this.config.model,
      provider: this.config.name,
      usage: {
        promptTokens: this.estimateTokens(messages),
        completionTokens: this.estimateTokens([{ role: 'assistant', content: response }]),
        totalTokens: 0, // Will be calculated
      },
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      raw: toolCalls.length > 0 ? { toolCalls } : undefined,
    };
  }

  /**
   * Simulated streaming chat completion
   */
  async chatStream(
    messages: LLMMessage[],
    onChunk: (chunk: StreamChunk) => void
  ): Promise<LLMResponse> {
    this.recordCall('chatStream', [messages]);

    if (this.config.simulateDelay > 0) {
      await this.delay(this.config.simulateDelay);
    }

    // Check for queued errors
    if (this.errorQueue.length > 0) {
      throw this.errorQueue.shift()!;
    }

    if (this.config.simulateError) {
      throw this.config.simulateError;
    }

    const response = this.getNextResponse(messages);
    const chunks = this.chunkString(response, this.config.streamChunkSize);

    // Stream chunks
    for (const chunk of chunks) {
      onChunk({ content: chunk, done: false });
      if (this.config.simulateDelay > 0) {
        await this.delay(this.config.simulateDelay / chunks.length);
      }
    }

    // Final chunk
    onChunk({ content: '', done: true });

    return {
      content: response,
      model: this.config.model,
      provider: this.config.name,
      usage: {
        promptTokens: this.estimateTokens(messages),
        completionTokens: this.estimateTokens([{ role: 'assistant', content: response }]),
        totalTokens: 0,
      },
      finishReason: 'stop',
    };
  }

  /**
   * Check availability
   */
  async isAvailable(): Promise<boolean> {
    this.recordCall('isAvailable', []);
    return !this.config.simulateError;
  }

  /**
   * List models
   */
  async listModels(): Promise<string[]> {
    this.recordCall('listModels', []);
    return ['mock-model', 'mock-model-2', 'mock-model-large'];
  }

  // ===========================================
  // Mock Control Methods
  // ===========================================

  /**
   * Queue a specific response
   */
  queueResponse(response: string): this {
    this.responseQueue.push(response);
    return this;
  }

  /**
   * Queue multiple responses
   */
  queueResponses(responses: string[]): this {
    this.responseQueue.push(...responses);
    return this;
  }

  /**
   * Queue an error to throw on next call
   */
  queueError(error: Error): this {
    this.errorQueue.push(error);
    return this;
  }

  /**
   * Queue tool calls for next response
   */
  queueToolCalls(toolCalls: MockToolCall[]): this {
    this.toolCallQueue.push(toolCalls);
    return this;
  }

  /**
   * Set a pattern-based response
   */
  setPatternResponse(pattern: string | RegExp, response: string): this {
    const key = pattern instanceof RegExp ? pattern.source : pattern;
    this.config.responses.set(key, response);
    return this;
  }

  /**
   * Set default response
   */
  setDefaultResponse(response: string): this {
    this.config.defaultResponse = response;
    return this;
  }

  /**
   * Set simulation delay
   */
  setDelay(ms: number): this {
    this.config.simulateDelay = ms;
    return this;
  }

  /**
   * Set persistent error
   */
  setError(error: Error | null): this {
    this.config.simulateError = error;
    return this;
  }

  /**
   * Get call history
   */
  getCallHistory(): MockCallRecord[] {
    return [...this.callHistory];
  }

  /**
   * Get last call
   */
  getLastCall(): MockCallRecord | undefined {
    return this.callHistory[this.callHistory.length - 1];
  }

  /**
   * Get call count for a method
   */
  getCallCount(method?: string): number {
    if (method) {
      return this.callHistory.filter((c) => c.method === method).length;
    }
    return this.callHistory.length;
  }

  /**
   * Clear call history
   */
  clearHistory(): this {
    this.callHistory = [];
    return this;
  }

  /**
   * Reset all state
   */
  reset(): this {
    this.callHistory = [];
    this.responseQueue = [];
    this.errorQueue = [];
    this.toolCallQueue = [];
    this.config.simulateError = null;
    return this;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  private recordCall(method: string, args: unknown[]): void {
    this.callHistory.push({
      method,
      args,
      timestamp: new Date(),
    });
  }

  private getNextResponse(messages: LLMMessage[]): string {
    // Check queue first
    if (this.responseQueue.length > 0) {
      return this.responseQueue.shift()!;
    }

    // Check pattern responses
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      for (const [pattern, response] of this.config.responses) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(lastMessage.content)) {
          return response;
        }
      }
    }

    return this.config.defaultResponse;
  }

  private getNextToolCalls(): MockToolCall[] {
    if (this.toolCallQueue.length > 0) {
      return this.toolCallQueue.shift()!;
    }
    return [];
  }

  private estimateTokens(messages: LLMMessage[]): number {
    const text = messages.map((m) => m.content).join(' ');
    return Math.ceil(text.length / 4); // Rough estimate: 4 chars per token
  }

  private chunkString(str: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ===========================================
// Factory Functions
// ===========================================

/**
 * Create a mock provider with default settings
 */
export function createMockProvider(config?: MockProviderConfig): MockProvider {
  return new MockProvider(config);
}

/**
 * Create a mock provider that simulates tool calls
 */
export function createToolCallingMockProvider(
  toolCalls: MockToolCall[]
): MockProvider {
  const provider = new MockProvider();
  provider.queueToolCalls(toolCalls);
  return provider;
}

/**
 * Create a mock provider that simulates errors
 */
export function createErrorMockProvider(error: Error): MockProvider {
  return new MockProvider({ simulateError: error });
}

/**
 * Create a mock provider with streaming delay
 */
export function createStreamingMockProvider(
  response: string,
  delayMs: number = 10
): MockProvider {
  const provider = new MockProvider({
    simulateDelay: delayMs,
    defaultResponse: response,
    streamChunkSize: 5,
  });
  return provider;
}

export default MockProvider;
