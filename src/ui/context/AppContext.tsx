/**
 * AppContext - Single source of truth for TUI state
 * Wraps the existing engine instance — no state duplication
 */

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { config as loadDotenv } from 'dotenv';
import { Text } from 'ink';
import { configManager } from '../../config/index.js';
import { engine } from '../../engine/index.js';
import { sessionManager } from '../../session/index.js';
import { useLiveSync, type FileEvent } from '../../hooks/useLiveSync.js';
import type { AgentRole, ProviderName } from '../../types/index.js';

// ===========================================
// Types
// ===========================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextSize?: number;
  free?: boolean;
}

export interface AppContextType {
  // Engine state (read from engine.getState())
  activeAgent: AgentRole;
  activeModel: string;
  activeProvider: ProviderName;
  workingDirectory: string;
  sessionId: string | null;

  // UI-only state
  streaming: boolean;
  currentTool: string | null;
  showHelp: boolean;
  showAgentMenu: boolean;
  showModelMenu: boolean;
  showProviderMenu: boolean;
  models: ModelInfo[];
  modelsLoading: boolean;
  recentChanges: FileEvent[];
  error: string | null;

  // Actions — these call engine methods directly
  sendMessage: (input: string) => Promise<void>;
  cancelStream: () => void;
  switchAgent: (agent: AgentRole) => Promise<void>;
  switchModel: (modelId: string) => void;
  switchProvider: (provider: ProviderName) => Promise<void>;
  newSession: () => Promise<void>;
  clearSession: () => void;
  setShowHelp: (v: boolean) => void;
  setShowAgentMenu: (v: boolean) => void;
  setShowModelMenu: (v: boolean) => void;
  setShowProviderMenu: (v: boolean) => void;
  dismissError: () => void;
}

// ===========================================
// Context
// ===========================================

const AppContext = createContext<AppContextType | null>(null);

// ===========================================
// Provider Component
// ===========================================

export const AppProvider: React.FC<{
  children: ReactNode;
  initialDirectory?: string;
  onStreamChunk?: (chunk: string) => void;
  onStreamStart?: () => void;
  onStreamEnd?: (content: string) => void;
  onError?: (error: string) => void;
}> = ({ children, initialDirectory, onStreamChunk, onStreamStart, onStreamEnd, onError }) => {
  const abortRef = useRef<AbortController | null>(null);

  // Session ready gate (FIX 6)
  const [sessionReady, setSessionReady] = useState(false);

  // Read initial state from engine (after init)
  const [activeAgent, setActiveAgent] = useState<AgentRole>('build');
  const [activeModel, setActiveModel] = useState('gemini-2.0-flash');
  const [activeProvider, setActiveProvider] = useState<ProviderName>('gemini');
  const [workingDirectory, setWorkingDirectory] = useState(initialDirectory || process.cwd());
  const [sessionId, setSessionId] = useState<string | null>(null);

  // UI-only state
  const [streaming, setStreaming] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [recentChanges, setRecentChanges] = useState<FileEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ===========================================
  // FIX 5 — Wire setToolCallHandler on mount
  // ===========================================
  useEffect(() => {
    engine.setToolCallHandler((toolName: string, args: Record<string, unknown>) => {
      const preview = JSON.stringify(args).slice(0, 50);
      setCurrentTool(`${toolName}(${preview}${preview.length >= 50 ? '...' : ''})`);
    });
  }, []);

  // ===========================================
  // FIX 6 — Session Restore on Startup
  // ===========================================
  useEffect(() => {
    (async () => {
      try {
        loadDotenv({ override: true });
        configManager.reinitializeProviders();

        // Initialize engine first
        await engine.initialize({
          workingDirectory: initialDirectory || process.cwd(),
        });

        // Try to load latest session
        const latest = sessionManager.getLatest();
        if (latest) {
          await engine.loadSession(latest.id);
        } else {
          await engine.newSession();
        }

        // Sync state from engine
        const state = engine.getState();
        setActiveAgent(state.agent || 'build');
        setActiveModel(state.model || 'gemini-2.0-flash');
        setActiveProvider(state.provider || 'gemini');
        setWorkingDirectory(state.workingDirectory);
        setSessionId(state.session?.id || null);

        // Load models from providers
        setModelsLoading(true);
        try {
          const providers = engine.getProviders();
          const allModels: ModelInfo[] = [];
          for (const p of providers) {
            for (const m of p.models) {
              allModels.push({
                id: m,
                name: m,
                provider: p.name,
                free: true,
              });
            }
          }
          setModels(allModels);
        } catch {
          // Models loading failed, use empty list
        }
        setModelsLoading(false);

        setSessionReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize');
        setSessionReady(true);
      }
    })();

    return () => {
      engine.shutdown();
    };
  }, [initialDirectory]);

  // ===========================================
  // FIX 3 — LiveSync file watcher
  // ===========================================
  useLiveSync(workingDirectory, (event) => {
    setRecentChanges((prev) => [event, ...prev].slice(0, 10));
  });

  // ===========================================
  // sendMessage with streaming + abort
  // ===========================================
  const sendMessage = useCallback(
    async (input: string) => {
      if (!input.trim()) return;

      setStreaming(true);
      setCurrentTool(null);
      setError(null);
      onStreamStart?.();

      // FIX 2 — AbortController for cancellation
      const controller = new AbortController();
      abortRef.current = controller;

      let fullContent = '';

      try {
        await engine.processStream(
          { message: input },
          (chunk) => {
            if (controller.signal.aborted) return;
            fullContent += chunk;
            onStreamChunk?.(chunk);
          },
          controller.signal
        );

        if (!controller.signal.aborted) {
          onStreamEnd?.(fullContent);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : 'An error occurred';
          setError(msg);
          onError?.(msg);
        }
      } finally {
        if (!controller.signal.aborted) {
          setStreaming(false);
          setCurrentTool(null);
        }
        abortRef.current = null;
      }
    },
    [onStreamChunk, onStreamStart, onStreamEnd, onError]
  );

  // ===========================================
  // FIX 2 — cancelStream
  // ===========================================
  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
    setCurrentTool(null);
  }, []);

  // ===========================================
  // switchAgent
  // ===========================================
  const switchAgent = useCallback(async (agent: AgentRole) => {
    try {
      await engine.switchAgent(agent);
      setActiveAgent(agent);
      setShowAgentMenu(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch agent');
    }
  }, []);

  // ===========================================
  // switchModel
  // ===========================================
  const switchModel = useCallback((modelId: string) => {
    engine.switchModel(modelId);
    setActiveModel(modelId);
    setShowModelMenu(false);
  }, []);

  // ===========================================
  // switchProvider
  // ===========================================
  const switchProvider = useCallback(async (provider: ProviderName) => {
    try {
      const success = await engine.switchProvider(provider);
      if (success) {
        const state = engine.getState();
        setActiveProvider(provider);
        setActiveModel(state.model || activeModel);
        setShowProviderMenu(false);
      } else {
        setError(`Provider ${provider} is not available`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch provider');
    }
  }, [activeModel]);

  // ===========================================
  // newSession
  // ===========================================
  const newSession = useCallback(async () => {
    try {
      const session = await engine.newSession();
      setSessionId(session.id);
      setRecentChanges([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    }
  }, []);

  // ===========================================
  // clearSession
  // ===========================================
  const clearSession = useCallback(() => {
    engine.clearConversation();
  }, []);

  // ===========================================
  // dismissError
  // ===========================================
  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  // ===========================================
  // Gate render until session is ready (FIX 6)
  // ===========================================
  if (!sessionReady) {
    return <Text color="#374151">Loading session...</Text>;
  }

  return (
    <AppContext.Provider
      value={{
        activeAgent,
        activeModel,
        activeProvider,
        workingDirectory,
        sessionId,
        streaming,
        currentTool,
        showHelp,
        showAgentMenu,
        showModelMenu,
        showProviderMenu,
        models,
        modelsLoading,
        recentChanges,
        error,
        sendMessage,
        cancelStream,
        switchAgent,
        switchModel,
        switchProvider,
        newSession,
        clearSession,
        setShowHelp,
        setShowAgentMenu,
        setShowModelMenu,
        setShowProviderMenu,
        dismissError,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// ===========================================
// Hook
// ===========================================

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be inside AppProvider');
  return ctx;
};

export { AppContext };
export type { FileEvent };
