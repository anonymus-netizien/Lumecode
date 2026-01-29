/**
 * Message Streaming Handler
 * Handles streaming responses from LLM providers with tool call detection
 */

import { EventEmitter } from 'events';
import type { LLMMessage, ToolCall } from '../types/index.js';

// ===========================================
// Types
// ===========================================

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  content?: string;
  toolCall?: Partial<ToolCall>;
  error?: string;
  metadata?: {
    tokenCount?: number;
    finishReason?: string;
  };
}

export interface StreamingState {
  isStreaming: boolean;
  currentText: string;
  currentToolCall: Partial<ToolCall> | null;
  pendingToolCalls: ToolCall[];
  tokenCount: number;
  startTime: number;
  error: string | null;
}

export interface StreamingConfig {
  onChunk?: (chunk: StreamChunk) => void;
  onText?: (text: string, fullText: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onComplete?: (fullText: string, toolCalls: ToolCall[]) => void;
  onError?: (error: Error) => void;
  bufferToolCalls?: boolean;
  parseToolCalls?: boolean;
}

// ===========================================
// Streaming Handler Class
// ===========================================

export class StreamingHandler extends EventEmitter {
  private state: StreamingState;
  private config: StreamingConfig;
  private textBuffer: string = '';
  private toolCallBuffer: string = '';

  constructor(config: StreamingConfig = {}) {
    super();
    this.config = {
      bufferToolCalls: true,
      parseToolCalls: true,
      ...config,
    };

    this.state = {
      isStreaming: false,
      currentText: '',
      currentToolCall: null,
      pendingToolCalls: [],
      tokenCount: 0,
      startTime: 0,
      error: null,
    };
  }

  // ===========================================
  // Stream Control
  // ===========================================

  /**
   * Start a new streaming session
   */
  start(): void {
    this.state = {
      isStreaming: true,
      currentText: '',
      currentToolCall: null,
      pendingToolCalls: [],
      tokenCount: 0,
      startTime: Date.now(),
      error: null,
    };
    this.textBuffer = '';
    this.toolCallBuffer = '';
    this.emit('start');
  }

  /**
   * Process a chunk from the stream
   */
  processChunk(chunk: StreamChunk): void {
    if (!this.state.isStreaming) return;

    switch (chunk.type) {
      case 'text':
        this.handleTextChunk(chunk);
        break;
      case 'tool_call':
        this.handleToolCallChunk(chunk);
        break;
      case 'tool_result':
        this.handleToolResultChunk(chunk);
        break;
      case 'error':
        this.handleErrorChunk(chunk);
        break;
      case 'done':
        this.handleDoneChunk(chunk);
        break;
    }

    if (this.config.onChunk) {
      this.config.onChunk(chunk);
    }
  }

  /**
   * Handle raw text from provider (parse for tool calls if enabled)
   */
  processRawText(text: string): void {
    if (!this.state.isStreaming) return;

    this.textBuffer += text;

    // Check for tool call markers if parsing enabled
    if (this.config.parseToolCalls) {
      const toolCallMatch = this.detectToolCallInBuffer();
      if (toolCallMatch) {
        // Emit text before tool call
        const preToolText = this.textBuffer.slice(0, toolCallMatch.start);
        if (preToolText) {
          this.state.currentText += preToolText;
          this.emitText(preToolText);
        }

        // Process tool call
        this.processToolCallFromText(toolCallMatch.content);
        
        // Clear processed buffer
        this.textBuffer = this.textBuffer.slice(toolCallMatch.end);
        return;
      }
    }

    // Emit text in small chunks for responsiveness
    if (this.textBuffer.length > 0) {
      this.state.currentText += this.textBuffer;
      this.emitText(this.textBuffer);
      this.textBuffer = '';
    }
  }

  /**
   * End the streaming session
   */
  end(finishReason?: string): void {
    if (!this.state.isStreaming) return;

    // Flush any remaining buffer
    if (this.textBuffer.length > 0) {
      this.emitText(this.textBuffer);
    }

    this.state.isStreaming = false;

    const duration = Date.now() - this.state.startTime;
    
    if (this.config.onComplete) {
      this.config.onComplete(this.state.currentText, this.state.pendingToolCalls);
    }

    this.emit('complete', {
      text: this.state.currentText,
      toolCalls: this.state.pendingToolCalls,
      tokenCount: this.state.tokenCount,
      duration,
      finishReason,
    });
  }

  /**
   * Abort the streaming session
   */
  abort(reason?: string): void {
    if (!this.state.isStreaming) return;

    this.state.isStreaming = false;
    this.state.error = reason || 'Aborted';

    this.emit('abort', { reason });
  }

  // ===========================================
  // Chunk Handlers
  // ===========================================

  private handleTextChunk(chunk: StreamChunk): void {
    if (!chunk.content) return;

    this.state.currentText += chunk.content;
    this.state.tokenCount += this.estimateTokens(chunk.content);

    if (this.config.onText) {
      this.config.onText(chunk.content, this.state.currentText);
    }

    this.emit('text', {
      chunk: chunk.content,
      fullText: this.state.currentText,
    });
  }

  private handleToolCallChunk(chunk: StreamChunk): void {
    if (!chunk.toolCall) return;

    if (chunk.toolCall.id && !this.state.currentToolCall) {
      // New tool call starting
      this.state.currentToolCall = {
        id: chunk.toolCall.id,
        name: chunk.toolCall.name || '',
        arguments: {},
      };
    } else if (this.state.currentToolCall) {
      // Continue building current tool call
      if (chunk.toolCall.name) {
        this.state.currentToolCall.name = chunk.toolCall.name;
      }
      if (chunk.toolCall.arguments) {
        this.state.currentToolCall.arguments = {
          ...this.state.currentToolCall.arguments,
          ...chunk.toolCall.arguments,
        };
      }
    }

    // Check if tool call is complete
    if (this.isToolCallComplete(this.state.currentToolCall)) {
      const completedCall = this.state.currentToolCall as ToolCall;
      
      if (this.config.bufferToolCalls) {
        this.state.pendingToolCalls.push(completedCall);
      }

      if (this.config.onToolCall) {
        this.config.onToolCall(completedCall);
      }

      this.emit('tool_call', completedCall);
      this.state.currentToolCall = null;
    }
  }

  private handleToolResultChunk(chunk: StreamChunk): void {
    this.emit('tool_result', chunk.content);
  }

  private handleErrorChunk(chunk: StreamChunk): void {
    this.state.error = chunk.error || 'Unknown error';

    if (this.config.onError) {
      this.config.onError(new Error(this.state.error));
    }

    this.emit('error', new Error(this.state.error));
  }

  private handleDoneChunk(chunk: StreamChunk): void {
    this.end(chunk.metadata?.finishReason);
  }

  // ===========================================
  // Tool Call Detection
  // ===========================================

  private detectToolCallInBuffer(): { start: number; end: number; content: string } | null {
    // Detect various tool call formats
    
    // Format 1: JSON function call
    const jsonMatch = this.textBuffer.match(/\{"name":\s*"([^"]+)",\s*"arguments":\s*(\{[^}]+\})\}/);
    if (jsonMatch) {
      return {
        start: jsonMatch.index || 0,
        end: (jsonMatch.index || 0) + jsonMatch[0].length,
        content: jsonMatch[0],
      };
    }

    // Format 2: XML-style tool call
    const xmlMatch = this.textBuffer.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
    if (xmlMatch) {
      return {
        start: xmlMatch.index || 0,
        end: (xmlMatch.index || 0) + xmlMatch[0].length,
        content: xmlMatch[1],
      };
    }

    // Format 3: Markdown code block with function call
    const codeBlockMatch = this.textBuffer.match(/```(?:json|tool)?\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1]);
        if (parsed.name && parsed.arguments) {
          return {
            start: codeBlockMatch.index || 0,
            end: (codeBlockMatch.index || 0) + codeBlockMatch[0].length,
            content: codeBlockMatch[1],
          };
        }
      } catch {
        // Not a valid tool call
      }
    }

    return null;
  }

  private processToolCallFromText(content: string): void {
    try {
      let toolCall: ToolCall;

      // Try JSON parse first
      try {
        const parsed = JSON.parse(content);
        toolCall = {
          id: parsed.id || `tool-${Date.now()}`,
          name: parsed.name,
          arguments: parsed.arguments || parsed.params || {},
        };
      } catch {
        // Try XML-style parsing
        const nameMatch = content.match(/name[=:]\s*["']?([^"'\s]+)/);
        const argsMatch = content.match(/arguments[=:]\s*(\{[^}]+\})/);
        
        if (nameMatch) {
          toolCall = {
            id: `tool-${Date.now()}`,
            name: nameMatch[1],
            arguments: argsMatch ? JSON.parse(argsMatch[1]) : {},
          };
        } else {
          return;
        }
      }

      if (this.config.bufferToolCalls) {
        this.state.pendingToolCalls.push(toolCall);
      }

      if (this.config.onToolCall) {
        this.config.onToolCall(toolCall);
      }

      this.emit('tool_call', toolCall);
    } catch {
      // Not a valid tool call
    }
  }

  private isToolCallComplete(toolCall: Partial<ToolCall> | null): toolCall is ToolCall {
    return !!(toolCall && toolCall.id && toolCall.name);
  }

  // ===========================================
  // Utilities
  // ===========================================

  private emitText(text: string): void {
    if (this.config.onText) {
      this.config.onText(text, this.state.currentText);
    }
    this.emit('text', { chunk: text, fullText: this.state.currentText });
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get current state
   */
  getState(): Readonly<StreamingState> {
    return { ...this.state };
  }

  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this.state.isStreaming;
  }

  /**
   * Get accumulated text
   */
  getText(): string {
    return this.state.currentText;
  }

  /**
   * Get pending tool calls
   */
  getToolCalls(): ToolCall[] {
    return [...this.state.pendingToolCalls];
  }
}

// ===========================================
// Stream Processor for Async Iterables
// ===========================================

export async function processStream(
  stream: AsyncIterable<string>,
  config: StreamingConfig
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const handler = new StreamingHandler(config);
  handler.start();

  try {
    for await (const chunk of stream) {
      handler.processRawText(chunk);
    }
    handler.end('stop');
  } catch (error) {
    handler.abort(String(error));
    throw error;
  }

  return {
    text: handler.getText(),
    toolCalls: handler.getToolCalls(),
  };
}

// ===========================================
// Factory Function
// ===========================================

export function createStreamingHandler(config?: StreamingConfig): StreamingHandler {
  return new StreamingHandler(config);
}
