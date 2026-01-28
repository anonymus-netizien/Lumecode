/**
 * Ollama Provider
 * Local-first provider - always available, completely private
 */

import { BaseProvider } from './base.js';
import type {
  ProviderConfig,
  ProviderCapabilities,
  LLMMessage,
  LLMResponse,
  StreamChunk,
} from '../types/index.js';
import { ProviderError } from '../types/index.js';

// Common Ollama models
export const OLLAMA_MODELS = [
  'llama3.2',
  'llama3.2:1b',
  'llama3.1',
  'llama3.1:70b',
  'codellama',
  'codellama:34b',
  'deepseek-coder-v2',
  'qwen2.5-coder',
  'qwen2.5-coder:32b',
  'mistral',
  'mixtral',
  'phi3',
  'gemma2',
  'gemma2:27b',
];

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaProvider extends BaseProvider {
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  get name() {
    return 'ollama' as const;
  }

  get capabilities(): ProviderCapabilities {
    return {
      streaming: true,
      functionCalling: false, // Limited support
      vision: true, // With llava models
      maxContextLength: 32768, // Varies by model
      costPerMillionTokens: {
        input: 0, // Always free (local)
        output: 0,
      },
    };
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: this.formatMessages(messages),
          stream: false,
          options: {
            num_predict: this.config.maxTokens,
            temperature: this.config.temperature,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama error: ${error}`);
      }

      const data = (await response.json()) as OllamaChatResponse;

      return {
        content: data.message.content,
        model: data.model,
        provider: 'ollama',
        usage: {
          promptTokens: data.prompt_eval_count ?? 0,
          completionTokens: data.eval_count ?? 0,
          totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        },
        finishReason: 'stop',
        raw: data,
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
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: this.formatMessages(messages),
          stream: true,
          options: {
            num_predict: this.config.maxTokens,
            temperature: this.config.temperature,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama error: ${error}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let fullContent = '';
      let lastData: OllamaChatResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as OllamaChatResponse;
            lastData = data;

            if (data.message?.content) {
              fullContent += data.message.content;
              onChunk({ content: data.message.content, done: false });
            }

            if (data.done) {
              onChunk({ content: '', done: true });
            }
          } catch {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }

      return {
        content: fullContent,
        model: this.config.model,
        provider: 'ollama',
        usage: lastData
          ? {
              promptTokens: lastData.prompt_eval_count ?? 0,
              completionTokens: lastData.eval_count ?? 0,
              totalTokens: (lastData.prompt_eval_count ?? 0) + (lastData.eval_count ?? 0),
            }
          : undefined,
        finishReason: 'stop',
      };
    } catch (error) {
      onChunk({ content: '', done: true, error: String(error) });
      this.handleError(error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        return OLLAMA_MODELS;
      }

      const data = (await response.json()) as { models: Array<{ name: string }> };
      return data.models.map((m) => m.name);
    } catch {
      return OLLAMA_MODELS;
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(model: string, onProgress?: (status: string) => void): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: true }),
      });

      if (!response.ok) {
        return false;
      }

      const reader = response.body?.getReader();
      if (!reader) return false;

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as { status: string };
            onProgress?.(data.status);
          } catch {
            // Ignore parse errors
          }
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  // ===========================================
  // Private Helpers
  // ===========================================

  protected formatMessages(messages: LLMMessage[]): OllamaChatMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  protected handleError(error: unknown): never {
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        throw new ProviderError(
          'Cannot connect to Ollama. Make sure Ollama is running (ollama serve)',
          'ollama',
          error
        );
      }
      if (error.message.includes('model')) {
        throw new ProviderError(
          `Model not found. Try: ollama pull ${this.config.model}`,
          'ollama',
          error
        );
      }
      throw new ProviderError(error.message, 'ollama', error);
    }
    throw new ProviderError(String(error), 'ollama');
  }
}

export default OllamaProvider;
