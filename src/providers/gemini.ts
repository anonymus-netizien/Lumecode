/**
 * Google Gemini Provider
 * Primary provider for Lumecode (free tier available)
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { BaseProvider } from './base.js';
import type {
  ProviderConfig,
  ProviderCapabilities,
  LLMMessage,
  LLMResponse,
  StreamChunk,
} from '../types/index.js';
import { ProviderError } from '../types/index.js';

export class GeminiProvider extends BaseProvider {
  private client: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new ProviderError('Gemini API key is required', 'gemini');
    }
    
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.model = this.client.getGenerativeModel({ model: config.model });
  }

  get name() {
    return 'gemini' as const;
  }

  get capabilities(): ProviderCapabilities {
    return {
      streaming: true,
      functionCalling: true,
      vision: true,
      maxContextLength: 1000000, // Gemini 1.5 Pro has 1M context
      costPerMillionTokens: {
        input: 0, // Free tier
        output: 0,
      },
    };
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      const { systemPrompt, history, lastMessage } = this.prepareMessages(messages);
      
      const chat = this.model.startChat({
        history,
        generationConfig: {
          maxOutputTokens: this.config.maxTokens,
          temperature: this.config.temperature,
        },
        systemInstruction: systemPrompt,
      });

      const result = await chat.sendMessage(lastMessage);
      const response = result.response;
      const text = response.text();

      return {
        content: text,
        model: this.config.model,
        provider: 'gemini',
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
          totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
        },
        finishReason: this.mapFinishReason(response.candidates?.[0]?.finishReason),
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
      const { systemPrompt, history, lastMessage } = this.prepareMessages(messages);
      
      const chat = this.model.startChat({
        history,
        generationConfig: {
          maxOutputTokens: this.config.maxTokens,
          temperature: this.config.temperature,
        },
        systemInstruction: systemPrompt,
      });

      const result = await chat.sendMessageStream(lastMessage);
      
      let fullContent = '';
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        fullContent += text;
        onChunk({
          content: text,
          done: false,
        });
      }

      onChunk({ content: '', done: true });

      const response = await result.response;

      return {
        content: fullContent,
        model: this.config.model,
        provider: 'gemini',
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
          totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
        },
        finishReason: this.mapFinishReason(response.candidates?.[0]?.finishReason),
        raw: response,
      };
    } catch (error) {
      onChunk({ content: '', done: true, error: String(error) });
      this.handleError(error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Use a lightweight models list check instead of generating content
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.apiKey}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    // Gemini API doesn't have a list models endpoint in the SDK
    // Return known models - updated to latest available models
    return [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ];
  }

  // ===========================================
  // Private Helpers
  // ===========================================

  private prepareMessages(messages: LLMMessage[]): {
    systemPrompt: { role: 'system'; parts: Array<{ text: string }> } | undefined;
    history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
    lastMessage: string;
  } {
    let systemPrompt: { role: 'system'; parts: Array<{ text: string }> } | undefined;
    const history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    let lastMessage = '';

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (msg.role === 'system') {
        // Manually format systemInstruction as Content object with role 'system'
        // This is needed because startChat doesn't format it automatically
        systemPrompt = {
          role: 'system',
          parts: [{ text: msg.content }],
        };
      } else if (i === messages.length - 1 && msg.role === 'user') {
        lastMessage = msg.content;
      } else {
        history.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return { systemPrompt, history, lastMessage };
  }

  private mapFinishReason(reason?: string): LLMResponse['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
      case 'OTHER':
        return 'error';
      default:
        return 'stop';
    }
  }

  protected handleError(error: unknown): never {
    if (error instanceof Error) {
      // Check for specific Gemini errors
      if (error.message.includes('API key')) {
        throw new ProviderError('Invalid Gemini API key', 'gemini', error);
      }
      if (error.message.includes('quota')) {
        throw new ProviderError('Gemini API quota exceeded', 'gemini', error);
      }
      if (error.message.includes('safety')) {
        throw new ProviderError('Content blocked by safety filters', 'gemini', error);
      }
      throw new ProviderError(error.message, 'gemini', error);
    }
    throw new ProviderError(String(error), 'gemini');
  }
}

export default GeminiProvider;
