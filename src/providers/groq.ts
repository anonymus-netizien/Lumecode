/**
 * Groq Provider
 * Tertiary provider - fast inference with free tier
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

// Available Groq models
export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-groq-70b-8192-tool-use-preview',
  'llama3-groq-8b-8192-tool-use-preview',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
  'gemma-7b-it',
];

export class GroqProvider extends BaseProvider {
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new ProviderError('Groq API key is required', 'groq');
    }
    
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://api.groq.com/openai/v1',
    });
  }

  get name() {
    return 'groq' as const;
  }

  get capabilities(): ProviderCapabilities {
    return {
      streaming: true,
      functionCalling: true,
      vision: false, // Groq doesn't support vision yet
      maxContextLength: 32768, // Varies by model, 32k for mixtral
      costPerMillionTokens: {
        input: 0, // Free tier
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
        provider: 'groq',
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
      let usage: LLMResponse['usage'];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullContent += delta;
        
        if (delta) {
          onChunk({ content: delta, done: false });
        }

        if (chunk.choices[0]?.finish_reason) {
          finishReason = this.mapFinishReason(chunk.choices[0].finish_reason);
        }

        // Groq includes usage in the last chunk
        if ((chunk as any).x_groq?.usage) {
          const groqUsage = (chunk as any).x_groq.usage;
          usage = {
            promptTokens: groqUsage.prompt_tokens,
            completionTokens: groqUsage.completion_tokens,
            totalTokens: groqUsage.total_tokens,
          };
        }
      }

      onChunk({ content: '', done: true });

      return {
        content: fullContent,
        model: this.config.model,
        provider: 'groq',
        usage,
        finishReason,
      };
    } catch (error) {
      onChunk({ content: '', done: true, error: String(error) });
      this.handleError(error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
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
      const response = await this.client.models.list();
      return response.data.map((m) => m.id);
    } catch {
      return GROQ_MODELS;
    }
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
        throw new ProviderError('Invalid Groq API key', 'groq', error);
      }
      if (error.status === 429) {
        throw new ProviderError('Groq rate limit exceeded. Try again later.', 'groq', error);
      }
      if (error.status === 503) {
        throw new ProviderError('Groq service temporarily unavailable', 'groq', error);
      }
      throw new ProviderError(error.message, 'groq', error);
    }
    if (error instanceof Error) {
      throw new ProviderError(error.message, 'groq', error);
    }
    throw new ProviderError(String(error), 'groq');
  }
}

export default GroqProvider;
