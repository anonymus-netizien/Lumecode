/**
 * OpenRouter Provider
 * Secondary provider - aggregates many models including free ones
 * Uses OpenAI-compatible API
 */

import OpenAI from 'openai';
import { BaseProvider } from './base.js';
import type {
  ProviderConfig,
  ProviderCapabilities,
  LLMMessage,
  LLMResponse,
  StreamChunk,
} from '../types/index.js';
import { ProviderError } from '../types/index.js';

// Free models available on OpenRouter
export const OPENROUTER_FREE_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-exp-1206:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.2-1b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'qwen/qwen-2-7b-instruct:free',
  'microsoft/phi-3-mini-128k-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'huggingfaceh4/zephyr-7b-beta:free',
];

export class OpenRouterProvider extends BaseProvider {
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new ProviderError('OpenRouter API key is required', 'openrouter');
    }
    
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/lumecode',
        'X-Title': 'Lumecode AI Agent',
      },
    });
  }

  get name() {
    return 'openrouter' as const;
  }

  get capabilities(): ProviderCapabilities {
    return {
      streaming: true,
      functionCalling: true, // Depends on the model
      vision: true, // Depends on the model
      maxContextLength: 128000, // Varies by model
      costPerMillionTokens: {
        input: 0, // Free models available
        output: 0,
      },
    };
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: this.formatMessages(messages) as OpenAI.Chat.ChatCompletionMessageParam[],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const choice = response.choices[0];

      return {
        content: choice.message.content || '',
        model: response.model,
        provider: 'openrouter',
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
        finishReason: this.mapFinishReason(choice.finish_reason),
        raw: response,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async chatStream(
    messages: LLMMessage[],
    onChunk: (chunk: StreamChunk) => void
  ): Promise<LLMResponse> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages: this.formatMessages(messages) as OpenAI.Chat.ChatCompletionMessageParam[],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: true,
      });

      let fullContent = '';
      let finishReason: LLMResponse['finishReason'] = 'stop';

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullContent += delta;
        
        if (delta) {
          onChunk({ content: delta, done: false });
        }

        if (chunk.choices[0]?.finish_reason) {
          finishReason = this.mapFinishReason(chunk.choices[0].finish_reason);
        }
      }

      onChunk({ content: '', done: true });

      return {
        content: fullContent,
        model: this.config.model,
        provider: 'openrouter',
        finishReason,
      };
    } catch (error) {
      onChunk({ content: '', done: true, error: String(error) });
      this.handleError(error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check API key validity with a minimal request
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      });
      return !!response.choices[0];
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      // OpenRouter has a models endpoint
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        return OPENROUTER_FREE_MODELS;
      }

      const data = (await response.json()) as { data: Array<{ id: string }> };
      return data.data.map((m) => m.id);
    } catch {
      return OPENROUTER_FREE_MODELS;
    }
  }

  /**
   * Get only free models
   */
  getFreeModels(): string[] {
    return OPENROUTER_FREE_MODELS;
  }

  // ===========================================
  // Private Helpers
  // ===========================================

  protected formatMessages(messages: LLMMessage[]): Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  private mapFinishReason(reason?: string | null): LLMResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
      case 'function_call':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }

  protected handleError(error: unknown): never {
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        throw new ProviderError('Invalid OpenRouter API key', 'openrouter', error);
      }
      if (error.status === 429) {
        throw new ProviderError('OpenRouter rate limit exceeded', 'openrouter', error);
      }
      if (error.status === 402) {
        throw new ProviderError('OpenRouter credits exhausted', 'openrouter', error);
      }
      throw new ProviderError(error.message, 'openrouter', error);
    }
    if (error instanceof Error) {
      throw new ProviderError(error.message, 'openrouter', error);
    }
    throw new ProviderError(String(error), 'openrouter');
  }
}

export default OpenRouterProvider;
