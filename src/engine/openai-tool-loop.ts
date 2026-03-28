/**
 * OpenAI-compatible chat + tool loop for providers that use the OpenAI SDK (Groq, OpenRouter).
 * Streaming chat cannot carry tools in this codebase; without this loop, models return tool_calls
 * with no visible text — which looks like "Groq not responding" — and no tools run (no real file writes).
 */

import type OpenAI from 'openai';
import type { BaseAgent } from '../agents/base.js';
import type { BaseProvider } from '../providers/base.js';
import type { FunctionDefinition, LLMResponse, ToolCall, ToolResult } from '../types/index.js';

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
  provider.setTools(toFunctionDefinitions(agent));

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

  while (iteration++ < maxIterations) {
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    lastResponse = await provider.chatCompletion(messages);

    if (!lastResponse.toolCalls?.length) {
      const text = lastResponse.content || '';
      if (text) {
        onChunk(text);
      }
      return { content: text, response: lastResponse };
    }

    onChunk(
      `\n⚙ Running ${lastResponse.toolCalls.length} tool call(s)…\n`
    );

    const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
      role: 'assistant',
      content: lastResponse.content || null,
      tool_calls: lastResponse.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments ?? {}),
        },
      })),
    };
    messages.push(assistantMsg);

    for (const tc of lastResponse.toolCalls) {
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
