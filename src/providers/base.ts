/**
 * Base Provider Abstract Class
 * All LLM providers must extend this class
 */

import type {
  ProviderConfig,
  ProviderName,
  ProviderCapabilities,
  LLMMessage,
  LLMResponse,
  StreamChunk,
} from '../types/index.js';
import { ProviderError } from '../types/index.js';

export abstract class BaseProvider {
  protected config: ProviderConfig;
  
  constructor(config: ProviderConfig) {
    this.config = config;
  }

  // ===========================================
  // Abstract Methods (must be implemented)
  // ===========================================

  /**
   * Get the provider name
   */
  abstract get name(): ProviderName;

  /**
   * Get provider capabilities
   */
  abstract get capabilities(): ProviderCapabilities;

  /**
   * Send a chat completion request
   */
  abstract chat(messages: LLMMessage[]): Promise<LLMResponse>;

  /**
   * Send a streaming chat completion request
   */
  abstract chatStream(
    messages: LLMMessage[],
    onChunk: (chunk: StreamChunk) => void
  ): Promise<LLMResponse>;

  /**
   * Check if the provider is available and configured correctly
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * List available models for this provider
   */
  abstract listModels(): Promise<string[]>;

  // ===========================================
  // Common Methods
  // ===========================================

  /**
   * Get the current model
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * Set the model to use
   */
  setModel(model: string): void {
    this.config.model = model;
  }

  /**
   * Get temperature setting
   */
  getTemperature(): number {
    return this.config.temperature ?? 0.7;
  }

  /**
   * Set temperature
   */
  setTemperature(temp: number): void {
    this.config.temperature = Math.max(0, Math.min(2, temp));
  }

  /**
   * Get max tokens setting
   */
  getMaxTokens(): number {
    return this.config.maxTokens ?? 4096;
  }

  /**
   * Set max tokens
   */
  setMaxTokens(tokens: number): void {
    this.config.maxTokens = tokens;
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return { ...this.config };
  }

  /**
   * Format messages for the specific provider
   * Override in subclasses if needed
   */
  protected formatMessages(messages: LLMMessage[]): unknown[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Handle common errors
   */
  protected handleError(error: unknown): never {
    if (error instanceof Error) {
      throw new ProviderError(error.message, this.name, error);
    }
    throw new ProviderError(String(error), this.name);
  }
}

export default BaseProvider;
