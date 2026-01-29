/**
 * Enhanced Gemini Provider with Function Calling
 * Supports tool/function calling with proper response handling
 */

import { GoogleGenerativeAI, type GenerativeModel, type Content, type Part, SchemaType } from '@google/generative-ai';
import { BaseProvider } from './base.js';
import type {
  ProviderConfig,
  ProviderCapabilities,
  LLMMessage,
  LLMResponse,
  StreamChunk,
  ToolCall,
  ToolResult,
} from '../types/index.js';
import { ProviderError } from '../types/index.js';
import { 
  getGeminiToolDefinitions, 
  FunctionCallResponseBuilder,
  ToolCallParser,
} from '../tools/index.js';

// ===========================================
// Types for Gemini Function Calling
// ===========================================

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: SchemaType.OBJECT;
    properties: Record<string, {
      type: SchemaType;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

interface GeminiFunctionResponse {
  name: string;
  response: Record<string, unknown>;
}

// ===========================================
// Enhanced Gemini Provider
// ===========================================

export class GeminiProviderWithTools extends BaseProvider {
  private client: GoogleGenerativeAI;
  private model!: GenerativeModel;
  private toolsEnabled = false;

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.apiKey) {
      throw new ProviderError('Gemini API key is required', 'gemini');
    }
    
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.initializeModel();
  }

  private initializeModel(): void {
    const tools = this.toolsEnabled ? this.getToolDeclarations() : undefined;
    
    this.model = this.client.getGenerativeModel({
      model: this.config.model,
      tools: tools ? [{ functionDeclarations: tools as any }] : undefined,
    });
  }

  /**
   * Enable or disable tool/function calling
   */
  setToolsEnabled(enabled: boolean): void {
    this.toolsEnabled = enabled;
    this.initializeModel();
  }

  get name() {
    return 'gemini' as const;
  }

  get capabilities(): ProviderCapabilities {
    return {
      streaming: true,
      functionCalling: true,
      vision: true,
      maxContextLength: 1000000, // Gemini 1.5/2.0 has 1M+ context
      costPerMillionTokens: {
        input: 0, // Free tier
        output: 0,
      },
    };
  }

  /**
   * Get tool declarations in Gemini format
   */
  private getToolDeclarations(): GeminiFunctionDeclaration[] {
    return getGeminiToolDefinitions() as unknown as GeminiFunctionDeclaration[];
  }

  /**
   * Standard chat without function calling
   */
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
      
      // Check for function calls
      const functionCalls = this.extractFunctionCalls(response);
      
      if (functionCalls.length > 0) {
        return {
          content: '', // No text content when function calling
          model: this.config.model,
          provider: 'gemini',
          usage: {
            promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
            completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
            totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
          },
          finishReason: 'tool_calls',
          raw: {
            response,
            functionCalls,
          },
        };
      }

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

  /**
   * Chat with function calling - executes tools and returns final response
   */
  async chatWithTools(
    messages: LLMMessage[],
    executeToolFn: (name: string, args: Record<string, unknown>) => Promise<ToolResult>,
    maxIterations = 10
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

      let currentMessage = lastMessage;
      let iterations = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      while (iterations < maxIterations) {
        iterations++;
        
        const result = await chat.sendMessage(currentMessage);
        const response = result.response;

        totalPromptTokens += response.usageMetadata?.promptTokenCount ?? 0;
        totalCompletionTokens += response.usageMetadata?.candidatesTokenCount ?? 0;

        // Check for function calls
        const functionCalls = this.extractFunctionCalls(response);

        if (functionCalls.length === 0) {
          // No more function calls, return final text response
          return {
            content: response.text(),
            model: this.config.model,
            provider: 'gemini',
            usage: {
              promptTokens: totalPromptTokens,
              completionTokens: totalCompletionTokens,
              totalTokens: totalPromptTokens + totalCompletionTokens,
            },
            finishReason: 'stop',
            raw: response,
          };
        }

        // Execute function calls and prepare responses
        const functionResponses: Array<{ functionResponse: GeminiFunctionResponse }> = [];

        for (const call of functionCalls) {
          const toolResult = await executeToolFn(call.name, call.args);
          
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: {
                success: toolResult.success,
                output: toolResult.output,
                error: toolResult.error,
                data: toolResult.data,
              },
            },
          });
        }

        // Send function responses back to the model
        currentMessage = functionResponses as unknown as string;
      }

      // Max iterations reached
      return {
        content: 'Maximum tool call iterations reached. Please try a simpler request.',
        model: this.config.model,
        provider: 'gemini',
        usage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
        },
        finishReason: 'length',
        raw: null,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Streaming chat
   */
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
      let functionCalls: GeminiFunctionCall[] = [];
      
      for await (const chunk of result.stream) {
        // Check for function calls in stream
        const calls = this.extractFunctionCalls(chunk);
        if (calls.length > 0) {
          functionCalls.push(...calls);
        }

        const text = chunk.text();
        if (text) {
          fullContent += text;
          onChunk({
            content: text,
            done: false,
          });
        }
      }

      onChunk({ content: '', done: true });

      const response = await result.response;

      // If there were function calls, include them in the response
      if (functionCalls.length > 0) {
        return {
          content: fullContent,
          model: this.config.model,
          provider: 'gemini',
          usage: {
            promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
            completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
            totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
          },
          finishReason: 'tool_calls',
          raw: {
            response,
            functionCalls,
          },
        };
      }

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

  /**
   * Streaming chat with automatic tool execution
   */
  async chatStreamWithTools(
    messages: LLMMessage[],
    onChunk: (chunk: StreamChunk) => void,
    executeToolFn: (name: string, args: Record<string, unknown>) => Promise<ToolResult>,
    onToolCall?: (name: string, args: Record<string, unknown>) => void,
    onToolResult?: (name: string, result: ToolResult) => void,
    maxIterations = 10
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

      let currentMessage: string | Array<{ functionResponse: GeminiFunctionResponse }> = lastMessage;
      let iterations = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let finalContent = '';

      while (iterations < maxIterations) {
        iterations++;
        
        const result = await chat.sendMessageStream(currentMessage);
        let chunkContent = '';
        let functionCalls: GeminiFunctionCall[] = [];

        for await (const chunk of result.stream) {
          const calls = this.extractFunctionCalls(chunk);
          if (calls.length > 0) {
            functionCalls.push(...calls);
          }

          const text = chunk.text();
          if (text) {
            chunkContent += text;
            onChunk({ content: text, done: false });
          }
        }

        const response = await result.response;
        totalPromptTokens += response.usageMetadata?.promptTokenCount ?? 0;
        totalCompletionTokens += response.usageMetadata?.candidatesTokenCount ?? 0;

        if (functionCalls.length === 0) {
          // No more function calls
          finalContent = chunkContent;
          break;
        }

        // Execute function calls
        const functionResponses: Array<{ functionResponse: GeminiFunctionResponse }> = [];

        for (const call of functionCalls) {
          onToolCall?.(call.name, call.args);
          
          const toolResult = await executeToolFn(call.name, call.args);
          
          onToolResult?.(call.name, toolResult);

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: {
                success: toolResult.success,
                output: toolResult.output,
                error: toolResult.error,
                data: toolResult.data,
              },
            },
          });
        }

        currentMessage = functionResponses;
      }

      onChunk({ content: '', done: true });

      return {
        content: finalContent,
        model: this.config.model,
        provider: 'gemini',
        usage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
        },
        finishReason: 'stop',
        raw: null,
      };
    } catch (error) {
      onChunk({ content: '', done: true, error: String(error) });
      this.handleError(error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.apiKey}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
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
    systemPrompt: Content | undefined;
    history: Content[];
    lastMessage: string;
  } {
    let systemPrompt: Content | undefined;
    const history: Content[] = [];
    let lastMessage = '';

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (msg.role === 'system') {
        systemPrompt = {
          role: 'user', // Gemini uses 'user' for system-like instructions
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

  private extractFunctionCalls(response: { candidates?: Array<{ content?: { parts?: Part[] } }> }): GeminiFunctionCall[] {
    const calls: GeminiFunctionCall[] = [];
    const parts = response.candidates?.[0]?.content?.parts || [];
    
    for (const part of parts) {
      if ('functionCall' in part && part.functionCall) {
        calls.push({
          name: part.functionCall.name,
          args: (part.functionCall.args || {}) as Record<string, unknown>,
        });
      }
    }
    
    return calls;
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

export default GeminiProviderWithTools;
