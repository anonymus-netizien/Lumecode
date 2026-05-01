/**
 * OpenAI-compatible chat + tool loop for providers that use the OpenAI SDK (Groq, OpenRouter).
 * Streaming chat cannot carry tools in this codebase; without this loop, models return tool_calls
 * with no visible text — which looks like "Groq not responding" — and no tools run (no real file writes).
 */

import type OpenAI from 'openai';
import type { BaseAgent } from '../agents/base.js';
import type { BaseProvider } from '../providers/base.js';
import type { FunctionDefinition, LLMResponse, ToolCall, ToolResult } from '../types/index.js';

function isMalformedFunctionCallError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to call a function|failed_generation|malformed function|function call/i.test(message);
}

const TOOL_CALL_RETRY_HINT = [
  'Tool-calling validation rules:',
  '- Only call tools when needed.',
  '- Every required parameter must be present and schema-valid.',
  '- If a required value is unknown, ask a clarification question instead of guessing.',
  '- For symbol lookups, call search_files first, then call file_read with the discovered path.',
].join('\n');

function normalizeMalformedToolCall(
  call: ToolCall,
  allowedToolNames: Set<string>
): ToolCall | null {
  if (allowedToolNames.has(call.name)) {
    return call;
  }

  // Some models emit malformed names such as: file_read {"path":"..."}
  const inlineArgsMatch = call.name.match(/^([a-zA-Z0-9_-]+)\s+(\{[\s\S]*\})$/);
  if (!inlineArgsMatch) {
    return null;
  }

  const recoveredName = inlineArgsMatch[1];
  if (!allowedToolNames.has(recoveredName)) {
    return null;
  }

  let recoveredArgs: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(inlineArgsMatch[2]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      recoveredArgs = parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return {
    ...call,
    name: recoveredName,
    arguments: {
      ...recoveredArgs,
      ...(call.arguments ?? {}),
    },
  };
}

export interface ChatCompletionProvider {
  setTools(tools: FunctionDefinition[]): void;
  chatCompletion(
    messages: OpenAI.Chat.ChatCompletionMessageParam[]
  ): Promise<LLMResponse>;
}

function toFunctionDefinitions(agent: BaseAgent): FunctionDefinition[] {
  return agent.getToolDefinitionsForLLM().map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters as FunctionDefinition['parameters'],
  }));
}

function isChatCompletionProvider(p: unknown): p is ChatCompletionProvider {
  return (
    typeof p === 'object' &&
    p !== null &&
    'chatCompletion' in p &&
    typeof (p as ChatCompletionProvider).chatCompletion === 'function' &&
    'setTools' in p &&
    typeof (p as ChatCompletionProvider).setTools === 'function'
  );
}

export function supportsOpenAIToolLoop(
  provider: BaseProvider
): provider is BaseProvider & ChatCompletionProvider {
  return isChatCompletionProvider(provider);
}

/**
 * Run non-streaming chat with tool execution until the model returns text without tool calls.
 */
export async function runOpenAIToolLoop(
  provider: ChatCompletionProvider,
  agent: BaseAgent,
  executeTool: (call: ToolCall) => Promise<ToolResult>,
  onChunk: (content: string) => void,
  options: { signal?: AbortSignal; maxIterations?: number } = {}
): Promise<{ content: string; response: LLMResponse }> {
  const { signal, maxIterations = 24 } = options;
  const toolDefinitions = toFunctionDefinitions(agent);
  const allowedToolNames = new Set(toolDefinitions.map((t) => t.name));
  provider.setTools(toolDefinitions);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: agent.getSystemPrompt() },
    ...agent.getHistory().map(
      (m) =>
        ({
          role: m.role,
          content: m.content,
        }) as OpenAI.Chat.ChatCompletionMessageParam
    ),
  ];

  let lastResponse: LLMResponse | undefined;
  let iteration = 0;
  let usedMalformedCallRecovery = false;

  while (iteration++ < maxIterations) {
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    try {
      lastResponse = await provider.chatCompletion(messages);
    } catch (error) {
      if (!usedMalformedCallRecovery && isMalformedFunctionCallError(error)) {
        usedMalformedCallRecovery = true;
        messages.push({
          role: 'system',
          content: TOOL_CALL_RETRY_HINT,
        });
        lastResponse = await provider.chatCompletion(messages);
      } else {
        throw error;
      }
    }

    if (!lastResponse.toolCalls?.length) {
      const text = lastResponse.content || '';
      if (text) {
        onChunk(text);
      }
      return { content: text, response: lastResponse };
    }

    const normalizedToolCalls = lastResponse.toolCalls
      .map((call) => normalizeMalformedToolCall(call, allowedToolNames))
      .filter((call): call is ToolCall => !!call);

    if (normalizedToolCalls.length === 0) {
      messages.push({
        role: 'system',
        content: `${TOOL_CALL_RETRY_HINT}\n- Use exactly one of these tool names: ${Array.from(allowedToolNames).join(', ')}.`,
      });
      continue;
    }

    if (normalizedToolCalls.length !== lastResponse.toolCalls.length) {
      onChunk('\n⚠ Ignored malformed tool calls and retried with strict tool-name validation.\n');
    }

    onChunk(
      `\n⚙ Running ${normalizedToolCalls.length} tool call(s)…\n`
    );

    const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
      role: 'assistant',
      content: lastResponse.content || null,
      tool_calls: normalizedToolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments ?? {}),
        },
      })),
    };
    messages.push(assistantMsg);

    for (const tc of normalizedToolCalls) {
      if (signal?.aborted) {
        throw new Error('Request aborted');
      }
      const result = await executeTool(tc);
      const content = result.success
        ? (result.output ?? JSON.stringify(result.data ?? { success: true }))
        : `Error: ${result.error ?? 'Unknown error'}`;
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content,
      });
    }
  }

  throw new Error(`Tool loop stopped after ${maxIterations} iterations`);
}
