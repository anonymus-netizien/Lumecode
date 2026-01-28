/**
 * Lumecode Enhanced TUI App
 * Clean, minimal, sharp terminal interface
 * Inspired by OpenCode and Warp Terminal
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { randomUUID } from 'crypto';
import {
  Header,
  MessagesList,
  InputBox,
  StatusBar,
  HelpPanel,
  AgentSelector,
  ProviderSelector,
  ErrorDisplay,
  WelcomeScreen,
  ThinkingIndicator,
  theme,
  type TokenUsage,
} from './components.js';
import { engine } from '../engine/index.js';
import type { AgentRole, ProviderName, ChatMessage } from '../types/index.js';

// ===========================================
// App State Interface
// ===========================================

interface AppState {
  // Core
  messages: ChatMessage[];
  isLoading: boolean;
  streamingContent: string;
  streamingPhase: 'thinking' | 'generating' | 'tool';
  error: string | null;
  
  // UI Panels
  showHelp: boolean;
  showAgentSelector: boolean;
  showProviderSelector: boolean;
  showCostDetails: boolean;
  
  // Config
  agent: AgentRole;
  provider: ProviderName;
  model: string;
  workingDirectory: string;
  sessionName: string;
  
  // Metrics
  tokenUsage: TokenUsage;
  responseTime: number | undefined;
  fileContext: string[];
  
  // State
  isInitialized: boolean;
}

// ===========================================
// Initial State
// ===========================================

const initialState: AppState = {
  messages: [],
  isLoading: false,
  streamingContent: '',
  streamingPhase: 'thinking',
  error: null,
  
  showHelp: false,
  showAgentSelector: false,
  showProviderSelector: false,
  showCostDetails: false,
  
  agent: 'build',
  provider: 'gemini',
  model: 'gemini-2.0-flash-exp',
  workingDirectory: process.cwd(),
  sessionName: 'New Session',
  
  tokenUsage: { used: 0, max: 128000, cost: 0 },
  responseTime: undefined,
  fileContext: [],
  
  isInitialized: false,
};

// ===========================================
// Cost Estimation (per 1K tokens)
// ===========================================

const PROVIDER_COSTS: Record<string, { input: number; output: number }> = {
  gemini: { input: 0.00, output: 0.00 },  // Free tier
  openrouter: { input: 0.00, output: 0.00 },  // Free models
  groq: { input: 0.00, output: 0.00 },  // Free tier
  ollama: { input: 0.00, output: 0.00 },  // Local
  openai: { input: 0.01, output: 0.03 },
  anthropic: { input: 0.003, output: 0.015 },
};

function estimateCost(provider: string, inputTokens: number, outputTokens: number): number {
  const costs = PROVIDER_COSTS[provider] || { input: 0, output: 0 };
  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}

// ===========================================
// Main App Component
// ===========================================

const App: React.FC<{ initialDirectory?: string }> = ({ initialDirectory }) => {
  const { exit } = useApp();
  const startTimeRef = useRef<number>(0);
  
  const [state, setState] = useState<AppState>({
    ...initialState,
    workingDirectory: initialDirectory || process.cwd(),
  });

  // ===========================================
  // Initialize Engine
  // ===========================================

  useEffect(() => {
    const init = async () => {
      try {
        await engine.initialize({
          workingDirectory: state.workingDirectory,
        });
        
        const engineState = engine.getState();
        setState((s) => ({
          ...s,
          agent: engineState.agent || 'build',
          provider: engineState.provider || 'groq',
          model: engineState.model || 'llama-3.3-70b-versatile',
          sessionName: engineState.session?.name || 'New Session',
          isInitialized: true,
        }));
      } catch (error) {
        setState((s) => ({
          ...s,
          error: error instanceof Error ? error.message : 'Failed to initialize',
          isInitialized: true,
        }));
      }
    };

    init();

    return () => {
      engine.shutdown();
    };
  }, []);

  // ===========================================
  // Keyboard Shortcuts
  // ===========================================

  useInput((input, key) => {
    // Global: Exit
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    // Don't process shortcuts when loading (except Ctrl+C)
    if (state.isLoading) return;

    // Toggle help (?)
    if (input === '?' && !state.showAgentSelector && !state.showProviderSelector) {
      setState((s) => ({ ...s, showHelp: !s.showHelp }));
      return;
    }

    // Tab: Agent selector
    if (key.tab && !state.showHelp && !state.showProviderSelector) {
      setState((s) => ({ ...s, showAgentSelector: !s.showAgentSelector }));
      return;
    }

    // Ctrl+P: Provider selector
    if (key.ctrl && input === 'p' && !state.showHelp && !state.showAgentSelector) {
      setState((s) => ({ ...s, showProviderSelector: !s.showProviderSelector }));
      return;
    }

    // Ctrl+N: New session
    if (key.ctrl && input === 'n') {
      handleNewSession();
      return;
    }

    // Ctrl+L: Clear
    if (key.ctrl && input === 'l') {
      handleClear();
      return;
    }

    // Ctrl+T: Toggle cost details
    if (key.ctrl && input === 't') {
      setState((s) => ({ ...s, showCostDetails: !s.showCostDetails }));
      return;
    }

    // Escape: Close panels
    if (key.escape) {
      setState((s) => ({
        ...s,
        showHelp: false,
        showAgentSelector: false,
        showProviderSelector: false,
      }));
    }
  });

  // ===========================================
  // Handle Message Submission
  // ===========================================

  const handleSubmit = useCallback(async (message: string) => {
    // Handle commands
    if (message.startsWith('/')) {
      handleCommand(message);
      return;
    }

    // Start timing
    startTimeRef.current = Date.now();

    // Add user message
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setState((s) => ({
      ...s,
      messages: [...s.messages, userMessage],
      isLoading: true,
      streamingContent: '',
      streamingPhase: 'thinking',
      error: null,
    }));

    try {
      // Simulate thinking phase briefly
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      setState((s) => ({ ...s, streamingPhase: 'generating' }));

      // Process with streaming
      let totalContent = '';
      await engine.processStream({ message }, (chunk) => {
        totalContent += chunk;
        setState((s) => ({
          ...s,
          streamingContent: totalContent,
        }));
      });

      // Calculate response time and tokens
      const responseTime = Date.now() - startTimeRef.current;
      const inputTokens = Math.ceil(message.length / 4);
      const outputTokens = Math.ceil(totalContent.length / 4);
      const cost = estimateCost(state.provider, inputTokens, outputTokens);

      // Finalize response
      setState((s) => {
        const assistantMessage: ChatMessage = {
          id: randomUUID(),
          role: 'assistant',
          content: totalContent || 'No response received.',
          timestamp: new Date(),
        };

        return {
          ...s,
          messages: [...s.messages, assistantMessage],
          isLoading: false,
          streamingContent: '',
          responseTime,
          tokenUsage: {
            used: s.tokenUsage.used + inputTokens + outputTokens,
            max: s.tokenUsage.max,
            cost: s.tokenUsage.cost! + cost,
          },
        };
      });
    } catch (error) {
      setState((s) => ({
        ...s,
        isLoading: false,
        streamingContent: '',
        error: error instanceof Error ? error.message : 'An error occurred',
      }));
    }
  }, [state.provider]);

  // ===========================================
  // Handle Commands
  // ===========================================

  const handleCommand = useCallback((command: string) => {
    const parts = command.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
      case 'h':
        setState((s) => ({ ...s, showHelp: true }));
        break;
        
      case 'quit':
      case 'q':
      case 'exit':
        exit();
        break;
        
      case 'clear':
        handleClear();
        break;
        
      case 'agent':
        if (args[0] && ['build', 'plan', 'review', 'general'].includes(args[0])) {
          handleAgentSelect(args[0] as AgentRole);
        } else {
          addSystemMessage(`Usage: /agent <build|plan|review|general>`);
        }
        break;
        
      case 'provider':
        if (args[0]) {
          handleProviderSelect(args[0] as ProviderName);
        } else {
          addSystemMessage(`Usage: /provider <gemini|openrouter|groq|ollama>`);
        }
        break;
        
      case 'status':
        addSystemMessage(
          `Agent: ${state.agent} | Provider: ${state.provider} | ` +
          `Model: ${state.model} | Tokens: ${state.tokenUsage.used}/${state.tokenUsage.max}`
        );
        break;
        
      case 'new':
        handleNewSession();
        break;
        
      default:
        addSystemMessage(`Unknown command: /${cmd}. Type /help for available commands.`);
    }
  }, [state.agent, state.provider, state.model, state.tokenUsage]);

  // ===========================================
  // Helper Functions
  // ===========================================

  const addSystemMessage = useCallback((content: string) => {
    const message: ChatMessage = {
      id: randomUUID(),
      role: 'system',
      content,
      timestamp: new Date(),
    };
    setState((s) => ({ ...s, messages: [...s.messages, message] }));
  }, []);

  const handleAgentSelect = useCallback(async (agent: AgentRole) => {
    try {
      await engine.switchAgent(agent);
      setState((s) => ({
        ...s,
        agent,
        showAgentSelector: false,
      }));
      addSystemMessage(`Switched to ${agent.toUpperCase()} agent`);
    } catch (error) {
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : 'Failed to switch agent',
        showAgentSelector: false,
      }));
    }
  }, [addSystemMessage]);

  const handleProviderSelect = useCallback(async (provider: ProviderName) => {
    try {
      const success = await engine.switchProvider(provider);
      if (success) {
        const engineState = engine.getState();
        setState((s) => ({
          ...s,
          provider,
          model: engineState.model || s.model,
          showProviderSelector: false,
        }));
        addSystemMessage(`Switched to ${provider} provider`);
      } else {
        setState((s) => ({
          ...s,
          error: `Provider ${provider} is not available`,
          showProviderSelector: false,
        }));
      }
    } catch (error) {
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : 'Failed to switch provider',
        showProviderSelector: false,
      }));
    }
  }, [addSystemMessage]);

  const handleNewSession = useCallback(async () => {
    try {
      const session = await engine.newSession();
      setState((s) => ({
        ...s,
        messages: [],
        sessionName: session.name,
        tokenUsage: { used: 0, max: s.tokenUsage.max, cost: 0 },
      }));
      addSystemMessage('Started new session');
    } catch (error) {
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : 'Failed to create session',
      }));
    }
  }, [addSystemMessage]);

  const handleClear = useCallback(() => {
    engine.clearConversation();
    setState((s) => ({
      ...s,
      messages: [],
    }));
  }, []);

  const handleDismissError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  const getProviders = useCallback(() => {
    return engine.getProviders().map((p) => ({
      name: p.name,
      model: p.model,
      available: true,
    }));
  }, []);

  // ===========================================
  // Render
  // ===========================================

  // Loading state
  if (!state.isInitialized) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.primaryBright}>
          <Text color="yellow">⏳</Text> Initializing Lumecode...
        </Text>
      </Box>
    );
  }

  // Check if any panel is open
  const isPanelOpen = state.showHelp || state.showAgentSelector || state.showProviderSelector;

  return (
    <Box flexDirection="column" padding={1} minHeight={20}>
      {/* Enhanced Header with Token Usage */}
      <Header
        agent={state.agent}
        provider={state.provider}
        model={state.model}
        sessionName={state.sessionName}
        tokenUsage={state.tokenUsage}
        fileContext={state.fileContext}
        showCostDetails={state.showCostDetails}
      />

      {/* Error Display */}
      <ErrorDisplay error={state.error} onDismiss={handleDismissError} />

      {/* Main Content Area */}
      <Box flexDirection="column" flexGrow={1}>
        {/* Overlay Panels */}
        <HelpPanel
          visible={state.showHelp}
          onClose={() => setState((s) => ({ ...s, showHelp: false }))}
        />
        
        <AgentSelector
          visible={state.showAgentSelector}
          currentAgent={state.agent}
          onSelect={handleAgentSelect}
        />
        
        <ProviderSelector
          visible={state.showProviderSelector}
          currentProvider={state.provider}
          providers={getProviders()}
          onSelect={handleProviderSelect}
        />

        {/* Messages or Welcome */}
        {!isPanelOpen && (
          state.messages.length === 0 ? (
            <WelcomeScreen agent={state.agent} provider={state.provider} />
          ) : (
            <MessagesList
              messages={state.messages}
              streamingContent={state.isLoading ? state.streamingContent : undefined}
              streamingPhase={state.streamingPhase}
            />
          )
        )}
      </Box>

      {/* Input Box */}
      {!isPanelOpen && (
        <InputBox
          onSubmit={handleSubmit}
          isLoading={state.isLoading}
          placeholder="Type a message... (/help for commands)"
          streamingPhase={state.isLoading ? state.streamingPhase : undefined}
        />
      )}

      {/* Status Bar */}
      <StatusBar
        workingDirectory={state.workingDirectory}
        messageCount={state.messages.length}
        isConnected={state.isInitialized}
        responseTime={state.responseTime}
        provider={state.provider}
      />
    </Box>
  );
};

// ===========================================
// TUI Entry Point
// ===========================================

export async function startTUI(options: {
  directory?: string;
} = {}): Promise<void> {
  // Print startup message
  console.clear();
  console.log('\n');
  
  const { waitUntilExit } = render(
    <App initialDirectory={options.directory} />
  );

  await waitUntilExit();
}

export { App };
