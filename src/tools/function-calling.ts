/**
 * Function Calling Support
 * Unified function calling interface for different providers
 */

import type { ToolParameters, ToolResult, ToolCall } from '../types/index.js';
import { toolRegistry } from './registry.js';
import { z } from 'zod';

// ===========================================
// Function Definition Formats
// ===========================================

/**
 * OpenAI/OpenRouter function format
 */
export interface OpenAIFunction {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, OpenAIProperty>;
      required?: string[];
    };
  };
}

interface OpenAIProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: OpenAIProperty;
}

/**
 * Google Gemini function format
 */
export interface GeminiFunction {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, GeminiProperty>;
    required?: string[];
  };
}

interface GeminiProperty {
  type: 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';
  description?: string;
  enum?: string[];
  items?: GeminiProperty;
}

/**
 * Anthropic Claude tool format
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, AnthropicProperty>;
    required?: string[];
  };
}

interface AnthropicProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: AnthropicProperty;
}

// ===========================================
// Format Converters
// ===========================================

export class FunctionCallingConverter {
  /**
   * Convert internal tool format to OpenAI function format
   */
  static toOpenAI(tools: Array<{ name: string; description: string; parameters: ToolParameters }>): OpenAIFunction[] {
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object' as const,
          properties: this.convertProperties(tool.parameters.properties),
          required: tool.parameters.required,
        },
      },
    }));
  }

  /**
   * Convert internal tool format to Gemini function format
   */
  static toGemini(tools: Array<{ name: string; description: string; parameters: ToolParameters }>): GeminiFunction[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'OBJECT' as const,
        properties: this.convertPropertiesToGemini(tool.parameters.properties),
        required: tool.parameters.required,
      },
    }));
  }

  /**
   * Convert internal tool format to Anthropic tool format
   */
  static toAnthropic(tools: Array<{ name: string; description: string; parameters: ToolParameters }>): AnthropicTool[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: this.convertProperties(tool.parameters.properties),
        required: tool.parameters.required,
      },
    }));
  }

  private static convertProperties(
    properties: Record<string, { type: string; description?: string; enum?: string[]; items?: unknown }>
  ): Record<string, OpenAIProperty> {
    const result: Record<string, OpenAIProperty> = {};
    for (const [key, prop] of Object.entries(properties)) {
      result[key] = {
        type: prop.type,
        description: prop.description || '',
        enum: prop.enum,
        items: prop.items as OpenAIProperty | undefined,
      };
    }
    return result;
  }

  private static convertPropertiesToGemini(
    properties: Record<string, { type: string; description?: string; enum?: string[]; items?: unknown }>
  ): Record<string, GeminiProperty> {
    const typeMap: Record<string, GeminiProperty['type']> = {
      string: 'STRING',
      number: 'NUMBER',
      integer: 'INTEGER',
      boolean: 'BOOLEAN',
      array: 'ARRAY',
      object: 'OBJECT',
    };

    const result: Record<string, GeminiProperty> = {};
    for (const [key, prop] of Object.entries(properties)) {
      result[key] = {
        type: typeMap[prop.type] || 'STRING',
        description: prop.description || '',
        enum: prop.enum,
        items: prop.items ? this.convertPropertiesToGemini({ item: prop.items as never }).item : undefined,
      };
    }
    return result;
  }
}

// ===========================================
// Tool Call Parser
// ===========================================

export class ToolCallParser {
  /**
   * Parse OpenAI-style tool calls from response
   */
  static parseOpenAI(response: { tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }): ToolCall[] {
    if (!response.tool_calls) return [];
    
    return response.tool_calls.map(call => ({
      id: call.id,
      name: call.function.name,
      arguments: this.safeParseJSON(call.function.arguments),
    }));
  }

  /**
   * Parse Gemini-style function calls from response
   */
  static parseGemini(response: { candidates?: Array<{ content?: { parts?: Array<{ functionCall?: { name: string; args: Record<string, unknown> } }> } }> }): ToolCall[] {
    const calls: ToolCall[] = [];
    const parts = response.candidates?.[0]?.content?.parts || [];
    
    for (const part of parts) {
      if (part.functionCall) {
        calls.push({
          id: `gemini_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        });
      }
    }
    
    return calls;
  }

  /**
   * Parse tool calls from plain text (fallback for models without native function calling)
   * Looks for patterns like: <tool_call name="tool_name">{"arg": "value"}</tool_call>
   */
  static parseFromText(text: string): ToolCall[] {
    const calls: ToolCall[] = [];
    const patterns = [
      // XML-style: <tool_call name="file_read">{"path": "/file.ts"}</tool_call>
      /<tool_call\s+name="([^"]+)">\s*({[\s\S]*?})\s*<\/tool_call>/g,
      // Markdown code block with tool name: ```tool:file_read\n{"path": "/file.ts"}\n```
      /```tool:(\w+)\n({[\s\S]*?})\n```/g,
      // JSON-style: {"tool": "file_read", "arguments": {...}}
      /\{\s*"tool"\s*:\s*"(\w+)"\s*,\s*"arguments"\s*:\s*({[\s\S]*?})\s*\}/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        calls.push({
          id: `text_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: match[1],
          arguments: this.safeParseJSON(match[2]),
        });
      }
    }

    return calls;
  }

  private static safeParseJSON(str: string): Record<string, unknown> {
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  }
}

// ===========================================
// Tool Execution Handler
// ===========================================

export interface ToolExecutionOptions {
  timeout?: number;
  onStart?: (toolName: string, args: Record<string, unknown>) => void;
  onComplete?: (toolName: string, result: ToolResult) => void;
  onError?: (toolName: string, error: Error) => void;
  dryRun?: boolean;
  workingDirectory?: string;
}

export class ToolExecutor {
  private options: ToolExecutionOptions;

  constructor(options: ToolExecutionOptions = {}) {
    this.options = options;
  }

  /**
   * Execute a single tool call
   */
  async execute(call: ToolCall): Promise<ToolResult> {
    const { name, arguments: args } = call;
    
    this.options.onStart?.(name, args);

    try {
      // Set context for tools
      if (this.options.workingDirectory) {
        toolRegistry.setContext({
          workingDirectory: this.options.workingDirectory,
          dryRun: this.options.dryRun,
          timeout: this.options.timeout,
        });
      }

      const result = await toolRegistry.execute(name, args);
      
      this.options.onComplete?.(name, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(name, err);
      
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Execute multiple tool calls in sequence
   */
  async executeSequential(calls: ToolCall[]): Promise<Map<string, ToolResult>> {
    const results = new Map<string, ToolResult>();
    
    for (const call of calls) {
      const result = await this.execute(call);
      results.set(call.id, result);
    }
    
    return results;
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeParallel(calls: ToolCall[]): Promise<Map<string, ToolResult>> {
    const results = new Map<string, ToolResult>();
    
    const promises = calls.map(async (call) => {
      const result = await this.execute(call);
      results.set(call.id, result);
    });
    
    await Promise.all(promises);
    return results;
  }
}

// ===========================================
// Function Call Response Builder
// ===========================================

export class FunctionCallResponseBuilder {
  /**
   * Build OpenAI-compatible tool result message
   */
  static buildOpenAIResponse(callId: string, result: ToolResult): {
    role: 'tool';
    tool_call_id: string;
    content: string;
  } {
    return {
      role: 'tool',
      tool_call_id: callId,
      content: result.success
        ? result.output || JSON.stringify(result.data || { success: true })
        : `Error: ${result.error}`,
    };
  }

  /**
   * Build Gemini-compatible function response
   */
  static buildGeminiResponse(name: string, result: ToolResult): {
    functionResponse: {
      name: string;
      response: Record<string, unknown>;
    };
  } {
    return {
      functionResponse: {
        name,
        response: {
          success: result.success,
          output: result.output,
          error: result.error,
          data: result.data,
        },
      },
    };
  }
}

// ===========================================
// Validation
// ===========================================

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown()),
});

export const ToolResultSchema = z.object({
  success: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
  data: z.unknown().optional(),
});

export function validateToolCall(call: unknown): ToolCall {
  return ToolCallSchema.parse(call);
}

export function validateToolResult(result: unknown): ToolResult {
  return ToolResultSchema.parse(result);
}
