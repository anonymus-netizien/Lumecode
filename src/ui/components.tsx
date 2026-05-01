/**
 * Lumecode Enhanced TUI Components
 * Clean, minimal, sharp terminal interface
 * Inspired by OpenCode and Warp Terminal
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp, Spacer } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { highlight } from 'cli-highlight';
import type { AgentRole, ProviderName, ChatMessage, SessionSummary } from '../types/index.js';

// ===========================================
// Design Tokens (Teal Theme - Inspired by OpenCode)
// ===========================================

export const theme = {
  // Primary accent (Teal/Cyan from spec)
  primary: '#14b8a6',
  primaryBright: 'cyan',
  
  // Secondary accent (Purple)
  secondary: '#8b5cf6',
  secondaryBright: 'magenta',
  
  // Status colors
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  
  // Neutral
  muted: 'gray',
  mutedBright: '#94a3b8',
  text: 'white',
  textDim: '#64748b',
  
  // Backgrounds (for selection)
  bgSelected: 'blue',
  bgCode: '#1e293b',
} as const;

// Agent emojis and colors
const AGENT_CONFIG: Record<AgentRole, { emoji: string; color: string; name: string }> = {
  build: { emoji: '🔨', color: 'cyan', name: 'BUILD' },
  plan: { emoji: '📋', color: 'yellow', name: 'PLAN' },
  review: { emoji: '🔍', color: 'magenta', name: 'REVIEW' },
  general: { emoji: '✨', color: 'green', name: 'GENERAL' },
};

// ===========================================
// Syntax Highlighting with Caching
// ===========================================

const highlightCache = new Map<string, string>();
const MAX_CACHE_SIZE = 100;

function getCacheKey(code: string, language: string): string {
  return `${language}:${code.slice(0, 100)}:${code.length}`;
}

export function highlightCode(code: string, language: string): string {
  const cacheKey = getCacheKey(code, language);
  
  // Check cache first
  if (highlightCache.has(cacheKey)) {
    return highlightCache.get(cacheKey)!;
  }
  
  try {
    const highlighted = highlight(code, {
      language: language || 'plaintext',
      ignoreIllegals: true,
    });
    
    // Cache result (with LRU-style eviction)
    if (highlightCache.size >= MAX_CACHE_SIZE) {
      const firstKey = highlightCache.keys().next().value;
      if (firstKey) highlightCache.delete(firstKey);
    }
    highlightCache.set(cacheKey, highlighted);
    
    return highlighted;
  } catch {
    // Fallback to plain text
    return code;
  }
}

// ===========================================
// Markdown Parsing Utils
// ===========================================

interface ParsedContent {
  type: 'text' | 'code' | 'inline-code';
  content: string;
  language?: string;
  filename?: string;
}

export function parseMarkdownContent(content: string): ParsedContent[] {
  const parts: ParsedContent[] = [];
  const codeBlockRegex = /```(\w+)?(?:\s+([^\n]+))?\n([\s\S]*?)```/g;
  const inlineCodeRegex = /`([^`]+)`/g;
  
  let lastIndex = 0;
  let match;
  
  // Extract code blocks
  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push({ type: 'text', content: textBefore });
      }
    }
    
    // Code block
    parts.push({
      type: 'code',
      language: match[1] || 'plaintext',
      filename: match[2]?.trim(),
      content: match[3].trim(),
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Remaining text
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    if (remaining.trim()) {
      parts.push({ type: 'text', content: remaining });
    }
  }
  
  return parts.length > 0 ? parts : [{ type: 'text', content }];
}

// ===========================================
// Token Usage Types
// ===========================================

export interface TokenUsage {
  used: number;
  max: number;
  cost?: number;
}

// ===========================================
// Format Utilities
// ===========================================

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString();
}

// ===========================================
// Enhanced Header Component
// ===========================================

interface HeaderProps {
  agent: AgentRole;
  provider: ProviderName;
  model: string;
  sessionName?: string;
  tokenUsage?: TokenUsage;
  fileContext?: string[];
  showCostDetails?: boolean;
  onToggleCost?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  agent,
  provider,
  model,
  sessionName,
  tokenUsage,
  fileContext = [],
  showCostDetails = false,
  onToggleCost,
}) => {
  const agentConfig = AGENT_CONFIG[agent];
  const shortModel = model.split('/').pop() || model;
  
  // Token bar visualization
  const tokenPercent = tokenUsage ? Math.min((tokenUsage.used / tokenUsage.max) * 100, 100) : 0;
  const tokenColor = tokenPercent > 80 ? 'red' : tokenPercent > 60 ? 'yellow' : 'green';

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Main Header Line */}
      <Box
        borderStyle="single"
        borderColor={theme.primaryBright}
        paddingX={1}
      >
        <Box>
          <Text color={theme.primaryBright} bold>🔮 Lumecode</Text>
          <Text color={theme.muted}> │ </Text>
          <Text color={agentConfig.color} bold>
            {agentConfig.emoji} {agentConfig.name}
          </Text>
          <Text color={theme.muted}> │ </Text>
          <Text color={theme.text}>{provider}</Text>
          <Text color={theme.muted}>:</Text>
          <Text color={theme.mutedBright}>{shortModel}</Text>
        </Box>
        
        <Spacer />
        
        {/* Token Usage */}
        {tokenUsage && (
          <Box>
            <Text color={theme.muted}>📊 </Text>
            <Text color={tokenColor}>{formatTokens(tokenUsage.used)}</Text>
            <Text color={theme.muted}>/{formatTokens(tokenUsage.max)}</Text>
            {tokenUsage.cost !== undefined && (
              <>
                <Text color={theme.muted}> │ 💰 </Text>
                <Text color={theme.warning}>{formatCost(tokenUsage.cost)}</Text>
              </>
            )}
          </Box>
        )}
      </Box>
      
      {/* Secondary Info Line */}
      <Box paddingX={1} marginTop={0}>
        <Text color={theme.muted}>
          {fileContext.length > 0 && (
            <>
              📁 {fileContext.length} file{fileContext.length > 1 ? 's' : ''} in context
              <Text color={theme.textDim}> │ </Text>
            </>
          )}
          Session: {sessionName || 'New Session'}
        </Text>
      </Box>
      
      {/* Cost Details (On-Demand) */}
      {showCostDetails && tokenUsage?.cost !== undefined && (
        <Box
          paddingX={1}
          marginTop={1}
          borderStyle="single"
          borderColor={theme.muted}
        >
          <Text color={theme.muted}>
            Cost Breakdown: Input ${(tokenUsage.cost * 0.7).toFixed(4)} │ 
            Output ${(tokenUsage.cost * 0.3).toFixed(4)} │ 
            Total {formatCost(tokenUsage.cost)}
          </Text>
        </Box>
      )}
    </Box>
  );
};

// ===========================================
// Code Block Component (Terminal Style)
// ===========================================

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
  action?: 'create' | 'update' | 'delete' | 'view';
  showLineNumbers?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  filename,
  action,
  showLineNumbers = true,
}) => {
  // Lazy highlight - only highlight visible code
  const highlightedCode = useMemo(() => {
    // Limit to first 50 lines for performance
    const lines = code.split('\n').slice(0, 50);
    return highlightCode(lines.join('\n'), language);
  }, [code, language]);
  
  const actionConfig: Record<string, { emoji: string; color: string }> = {
    create: { emoji: '+', color: 'green' },
    update: { emoji: '~', color: 'yellow' },
    delete: { emoji: '-', color: 'red' },
    view: { emoji: '•', color: 'gray' },
  };
  
  const actionStyle = action ? actionConfig[action] : actionConfig.view;
  const lines = highlightedCode.split('\n');
  const lineNumWidth = String(lines.length).length;

  return (
    <Box flexDirection="column" marginY={1}>
      {/* File Header */}
      {filename && (
        <Box>
          <Text color={actionStyle.color}>{actionStyle.emoji} </Text>
          <Text color={theme.primaryBright} bold>{filename}</Text>
          <Text color={theme.muted}> ({language})</Text>
        </Box>
      )}
      
      {/* Code Content */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.muted}
        paddingX={1}
      >
        {lines.map((line, i) => (
          <Box key={i}>
            {showLineNumbers && (
              <Text color={theme.muted}>
                {String(i + 1).padStart(lineNumWidth, ' ')} │ 
              </Text>
            )}
            <Text>{line}</Text>
          </Box>
        ))}
        {code.split('\n').length > 50 && (
          <Text color={theme.muted} italic>
            ... {code.split('\n').length - 50} more lines
          </Text>
        )}
      </Box>
    </Box>
  );
};

// ===========================================
// Message Bubble Component (Chat Style)
// ===========================================

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingPhase?: 'thinking' | 'generating' | 'tool';
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isStreaming,
  streamingPhase = 'generating',
}) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  
  // Parse content for code blocks
  const parsedContent = useMemo(
    () => parseMarkdownContent(message.content),
    [message.content]
  );

  // System messages - full width, muted
  if (isSystem) {
    return (
      <Box marginY={1} paddingX={1}>
        <Text color={theme.muted} italic>
          ℹ️ {message.content}
        </Text>
      </Box>
    );
  }

  // Streaming phase indicators
  const phaseConfig = {
    thinking: { emoji: '🧠', text: 'Thinking...', color: 'yellow' },
    generating: { emoji: '✍️', text: 'Writing...', color: 'green' },
    tool: { emoji: '🔧', text: 'Using tool...', color: 'magenta' },
  };
  const phase = phaseConfig[streamingPhase];

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Message Header */}
      <Box justifyContent={isUser ? 'flex-end' : 'flex-start'} paddingX={1}>
        <Box>
          {!isUser && (
            <Text color={theme.success} bold>
              🤖 Assistant
            </Text>
          )}
          {isUser && (
            <Text color={theme.primaryBright} bold>
              You 👤
            </Text>
          )}
          {isStreaming && (
            <Box marginLeft={1}>
              <Text color={phase.color as any}>
                <Spinner type="dots" /> {phase.emoji} {phase.text}
              </Text>
            </Box>
          )}
          <Text color={theme.muted}> • {formatRelativeTime(message.timestamp || new Date())}</Text>
        </Box>
      </Box>
      
      {/* Message Content */}
      <Box
        flexDirection="column"
        marginLeft={isUser ? 4 : 0}
        marginRight={isUser ? 0 : 4}
        paddingLeft={isUser ? 0 : 2}
        borderStyle={isUser ? undefined : 'single'}
        borderColor={isUser ? undefined : theme.muted}
        borderLeft={!isUser}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
      >
        {parsedContent.map((part, i) => {
          if (part.type === 'code') {
            return (
              <CodeBlock
                key={i}
                code={part.content}
                language={part.language || 'plaintext'}
                filename={part.filename}
                action={part.filename?.includes('created') ? 'create' : 
                        part.filename?.includes('updated') ? 'update' : 'view'}
              />
            );
          }
          
          // Text content with inline code highlighting
          return (
            <Box key={i} paddingX={1} marginY={part.type === 'text' ? 1 : 0}>
              <Text wrap="wrap" color={isUser ? theme.primaryBright : theme.text}>
                {part.content}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// ===========================================
// Tool Call Display Component
// ===========================================

interface ToolCallProps {
  tool: string;
  args?: Record<string, any>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  duration?: number;
}

export const ToolCallDisplay: React.FC<ToolCallProps> = ({
  tool,
  args,
  status,
  result,
  duration,
}) => {
  const statusConfig = {
    pending: { emoji: '⏳', color: 'gray' },
    running: { emoji: '⚙️', color: 'yellow' },
    success: { emoji: '✓', color: 'green' },
    error: { emoji: '✗', color: 'red' },
  };
  
  const config = statusConfig[status];

  return (
    <Box
      flexDirection="column"
      marginY={1}
      paddingX={1}
      borderStyle="single"
      borderColor={theme.secondaryBright}
    >
      <Box>
        <Text color={config.color as any}>{config.emoji} </Text>
        <Text color={theme.secondaryBright} bold>🔧 {tool}</Text>
        {status === 'running' && (
          <Box marginLeft={1}>
            <Spinner type="dots" />
          </Box>
        )}
        {duration !== undefined && (
          <Text color={theme.muted}> ({duration}ms)</Text>
        )}
      </Box>
      
      {args && Object.keys(args).length > 0 && (
        <Box marginLeft={2}>
          <Text color={theme.muted}>
            {JSON.stringify(args, null, 0).slice(0, 80)}
            {JSON.stringify(args).length > 80 && '...'}
          </Text>
        </Box>
      )}
      
      {result && status === 'success' && (
        <Box marginLeft={2} marginTop={1}>
          <Text color={theme.success} wrap="wrap">
            {result.slice(0, 200)}
            {result.length > 200 && '...'}
          </Text>
        </Box>
      )}
      
      {result && status === 'error' && (
        <Box marginLeft={2} marginTop={1}>
          <Text color={theme.error} wrap="wrap">
            {result}
          </Text>
        </Box>
      )}
    </Box>
  );
};

// ===========================================
// Messages List Component
// ===========================================

interface MessagesListProps {
  messages: ChatMessage[];
  streamingContent?: string;
  streamingPhase?: 'thinking' | 'generating' | 'tool';
}

export const MessagesList: React.FC<MessagesListProps> = ({
  messages,
  streamingContent,
  streamingPhase = 'generating',
}) => {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {streamingContent && (
        <MessageBubble
          message={{
            id: 'streaming',
            role: 'assistant',
            content: streamingContent,
            timestamp: new Date(),
            isStreaming: true,
          }}
          isStreaming
          streamingPhase={streamingPhase}
        />
      )}
    </Box>
  );
};

// ===========================================
// Enhanced Input Component
// ===========================================

interface InputBoxProps {
  onSubmit: (value: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  streamingPhase?: 'thinking' | 'generating' | 'tool';
}

export const InputBox: React.FC<InputBoxProps> = ({
  onSubmit,
  isLoading = false,
  placeholder = 'Type a message...',
  streamingPhase,
}) => {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    if (value.trim() && !isLoading) {
      onSubmit(value.trim());
      setValue('');
    }
  }, [value, isLoading, onSubmit]);

  const phaseConfig = {
    thinking: { emoji: '🧠', text: 'Thinking', color: 'yellow' },
    generating: { emoji: '✍️', text: 'Writing', color: 'green' },
    tool: { emoji: '🔧', text: 'Tool', color: 'magenta' },
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Loading indicator above input */}
      {isLoading && streamingPhase && (
        <Box marginBottom={1} paddingX={1}>
          <Text color={phaseConfig[streamingPhase].color as any}>
            <Spinner type="dots" /> {phaseConfig[streamingPhase].emoji} {phaseConfig[streamingPhase].text}...
          </Text>
        </Box>
      )}
      
      <Box
        borderStyle="round"
        borderColor={isLoading ? theme.muted : theme.primaryBright}
        paddingX={1}
      >
        <Box marginRight={1}>
          {isLoading ? (
            <Text color={theme.muted}>⏸</Text>
          ) : (
            <Text color={theme.primaryBright}>❯</Text>
          )}
        </Box>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={isLoading ? 'Waiting for response...' : placeholder}
        />
      </Box>
      
      {/* Input hints */}
      <Box paddingX={1} marginTop={0}>
        <Text color={theme.muted} dimColor>
          Press Enter to send • /help for commands • Tab to switch agent
        </Text>
      </Box>
    </Box>
  );
};

// ===========================================
// Enhanced Status Bar Component
// ===========================================

interface StatusBarProps {
  workingDirectory: string;
  messageCount: number;
  isConnected: boolean;
  responseTime?: number;
  provider?: ProviderName;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  workingDirectory,
  messageCount,
  isConnected,
  responseTime,
  provider,
}) => {
  const shortDir = workingDirectory.split('/').slice(-2).join('/');

  return (
    <Box
      justifyContent="space-between"
      marginTop={1}
      paddingX={1}
      borderStyle="single"
      borderColor={theme.muted}
    >
      <Text color={theme.muted}>
        📁 ~/{shortDir}
      </Text>
      <Text color={theme.muted}>
        💬 {messageCount} msgs
        {responseTime && ` │ ⏱️ ${(responseTime / 1000).toFixed(1)}s`}
        {provider && ` │ 🌐 ${provider}`}
        {' │ '}{isConnected ? '🟢 Ready' : '🔴 Offline'}
      </Text>
    </Box>
  );
};

// ===========================================
// Help Panel Component
// ===========================================

interface HelpPanelProps {
  visible: boolean;
  onClose: () => void;
}

export const HelpPanel: React.FC<HelpPanelProps> = ({ visible, onClose }) => {
  useInput((input, key) => {
    if (visible && (key.escape || input === 'q')) {
      onClose();
    }
  });

  if (!visible) return null;

  const shortcuts = [
    { key: 'Ctrl+C', desc: 'Exit Lumecode' },
    { key: 'Tab', desc: 'Switch agent' },
    { key: 'Ctrl+P', desc: 'Switch provider' },
    { key: 'Ctrl+O', desc: 'Switch model' },
    { key: 'Ctrl+R', desc: 'Session history' },
    { key: 'Ctrl+N', desc: 'New session' },
    { key: 'Ctrl+L', desc: 'Clear conversation' },
    { key: 'Ctrl+T', desc: 'Toggle cost details' },
    { key: '?', desc: 'Toggle this help' },
    { key: 'Esc', desc: 'Close panels' },
  ];

  const commands = [
    { cmd: '/help', desc: 'Show help' },
    { cmd: '/quit', desc: 'Exit chat' },
    { cmd: '/clear', desc: 'Clear history' },
    { cmd: '/history', desc: 'Open session history' },
    { cmd: '/resume <id>', desc: 'Resume a session' },
    { cmd: '/agent <type>', desc: 'Switch agent' },
    { cmd: '/provider <name>', desc: 'Switch provider' },
    { cmd: '/model [name]', desc: 'Switch model' },
    { cmd: '/models', desc: 'List models' },
    { cmd: '/status', desc: 'Show status' },
  ];

  const toolCommands = [
    { cmd: '/tools', desc: 'List available tools' },
    { cmd: '/ls [path]', desc: 'List directory' },
    { cmd: '/cat <file>', desc: 'Read file' },
    { cmd: '/search <pattern>', desc: 'Search in files' },
    { cmd: '/run <cmd>', desc: 'Execute command' },
  ];

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.secondaryBright}
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Text color={theme.secondaryBright} bold>
        ⌨️  Keyboard Shortcuts & Commands
      </Text>
      
      <Box marginTop={1}>
        {/* Shortcuts Column */}
        <Box flexDirection="column" marginRight={4}>
          <Text color={theme.primaryBright} bold underline>Shortcuts</Text>
          {shortcuts.map((s) => (
            <Box key={s.key}>
              <Text color={theme.primaryBright}>{s.key.padEnd(10)}</Text>
              <Text color={theme.muted}>{s.desc}</Text>
            </Box>
          ))}
        </Box>
        
        {/* Commands Column */}
        <Box flexDirection="column" marginRight={4}>
          <Text color={theme.primaryBright} bold underline>Commands</Text>
          {commands.map((c) => (
            <Box key={c.cmd}>
              <Text color={theme.warning}>{c.cmd.padEnd(18)}</Text>
              <Text color={theme.muted}>{c.desc}</Text>
            </Box>
          ))}
        </Box>

        {/* Tool Commands Column */}
        <Box flexDirection="column">
          <Text color={theme.primaryBright} bold underline>Tools</Text>
          {toolCommands.map((c) => (
            <Box key={c.cmd}>
              <Text color={theme.success}>{c.cmd.padEnd(18)}</Text>
              <Text color={theme.muted}>{c.desc}</Text>
            </Box>
          ))}
        </Box>
      </Box>
      
      <Box marginTop={1}>
        <Text color={theme.muted}>Press ESC or Q to close</Text>
      </Box>
    </Box>
  );
};

// ===========================================
// Agent Selector Component
// ===========================================

interface AgentSelectorProps {
  currentAgent: AgentRole;
  onSelect: (agent: AgentRole) => void;
  visible: boolean;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({
  currentAgent,
  onSelect,
  visible,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const agents: Array<{ role: AgentRole; desc: string; permissions: string }> = [
    { role: 'build', desc: 'Full implementation', permissions: 'read/write/execute' },
    { role: 'plan', desc: 'Architecture & design', permissions: 'read/confirm' },
    { role: 'review', desc: 'Code review & audit', permissions: 'read only' },
    { role: 'general', desc: 'Versatile assistant', permissions: 'read/confirm' },
  ];

  useInput((input, key) => {
    if (!visible) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => (i > 0 ? i - 1 : agents.length - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => (i < agents.length - 1 ? i + 1 : 0));
    } else if (key.return) {
      onSelect(agents[selectedIndex].role);
    }
  });

  if (!visible) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.primaryBright}
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Text color={theme.primaryBright} bold>
        Select Agent (↑↓ or j/k to navigate, Enter to select)
      </Text>
      <Box marginTop={1} flexDirection="column">
        {agents.map((agent, i) => {
          const config = AGENT_CONFIG[agent.role];
          const isSelected = i === selectedIndex;
          const isCurrent = agent.role === currentAgent;
          
          return (
            <Box key={agent.role}>
              <Text
                color={isSelected ? theme.primaryBright : theme.text}
                backgroundColor={isSelected ? theme.bgSelected : undefined}
              >
                {isSelected ? '▸ ' : '  '}
                {config.emoji} {config.name.padEnd(8)}
                <Text color={theme.muted}>{agent.desc.padEnd(20)}</Text>
                <Text color={theme.textDim}>[{agent.permissions}]</Text>
                {isCurrent && <Text color={theme.success}> ✓</Text>}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// ===========================================
// Provider Selector Component
// ===========================================

interface ProviderSelectorProps {
  currentProvider: ProviderName;
  providers: Array<{ name: ProviderName; model: string; models: string[]; available: boolean; error?: string }>;
  onSelect: (provider: ProviderName) => void;
  visible: boolean;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  currentProvider,
  providers,
  onSelect,
  visible,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (!visible) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => (i > 0 ? i - 1 : providers.length - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => (i < providers.length - 1 ? i + 1 : 0));
    } else if (key.return) {
      const provider = providers[selectedIndex];
      onSelect(provider.name);
    }
  });

  if (!visible) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.secondaryBright}
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Text color={theme.secondaryBright} bold>
        Select Provider (↑↓ to navigate, Enter to select)
      </Text>
      <Box marginTop={1} flexDirection="column">
        {providers.map((provider, i) => {
          const isSelected = i === selectedIndex;
          const isCurrent = provider.name === currentProvider;
          
          return (
            <Box key={provider.name} flexDirection="column">
              <Box>
                <Text
                  color={!provider.available ? theme.muted : isSelected ? theme.secondaryBright : theme.text}
                  backgroundColor={isSelected ? 'magenta' : undefined}
                >
                  {isSelected ? '▸ ' : '  '}
                  {provider.available ? '🟢' : '🔴'} {provider.name.padEnd(12)}
                  <Text color={theme.muted}>({provider.model})</Text>
                  {isCurrent && <Text color={theme.success}> ✓</Text>}
                </Text>
              </Box>
              {!provider.available && provider.error && (
                <Box marginLeft={4}>
                  <Text color={theme.error} dimColor>
                    └─ {provider.error}
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted} dimColor>
           Press Ctrl+O to change model • Enter to switch provider
        </Text>
      </Box>
    </Box>
  );
};

// ===========================================
// Model Selector Component
// ===========================================

interface ModelSelectorProps {
  currentModel: string;
  models: string[];
  provider: ProviderName;
  onSelect: (model: string) => void;
  visible: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModel,
  models,
  provider,
  onSelect,
  visible,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when models change
  useEffect(() => {
    const currentIndex = models.indexOf(currentModel);
    setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [models, currentModel]);

  useInput((input, key) => {
    if (!visible) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => (i > 0 ? i - 1 : models.length - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => (i < models.length - 1 ? i + 1 : 0));
    } else if (key.return) {
      if (models.length > 0) {
        onSelect(models[selectedIndex]);
      }
    }
  });

  if (!visible) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accentBright}
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Text color={theme.accentBright} bold>
        Select Model for {provider} (↑↓ to navigate, Enter to select)
      </Text>
      <Box marginTop={1} flexDirection="column">
        {models.length === 0 ? (
          <Text color={theme.muted}>No models available for this provider</Text>
        ) : (
          models.map((model, i) => {
            const isSelected = i === selectedIndex;
            const isCurrent = model === currentModel;
            
            return (
              <Box key={model}>
                <Text
                  color={isSelected ? theme.accentBright : theme.text}
                  backgroundColor={isSelected ? 'blue' : undefined}
                >
                  {isSelected ? '▸ ' : '  '}
                  {model}
                  {isCurrent && <Text color={theme.success}> (current)</Text>}
                </Text>
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted} dimColor>
          Esc to close • Enter to select model
        </Text>
      </Box>
    </Box>
  );
};

// ===========================================
// Session Selector Component
// ===========================================

interface SessionSelectorProps {
  sessions: SessionSummary[];
  currentSessionId?: string;
  onSelect: (sessionId: string) => void;
  visible: boolean;
}

export const SessionSelector: React.FC<SessionSelectorProps> = ({
  sessions,
  currentSessionId,
  onSelect,
  visible,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const currentIndex = sessions.findIndex((s) => s.id === currentSessionId);
    setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [sessions, currentSessionId, visible]);

  useInput((input, key) => {
    if (!visible) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => (i > 0 ? i - 1 : Math.max(0, sessions.length - 1)));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => (i < sessions.length - 1 ? i + 1 : 0));
    } else if (key.return && sessions.length > 0) {
      onSelect(sessions[selectedIndex].id);
    }
  });

  if (!visible) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.primaryBright}
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Text color={theme.primaryBright} bold>
        Session History (Ctrl+R, ↑↓/j/k, Enter)
      </Text>
      <Box marginTop={1} flexDirection="column">
        {sessions.length === 0 ? (
          <Text color={theme.muted}>No previous sessions found</Text>
        ) : (
          sessions.map((session, i) => {
            const isSelected = i === selectedIndex;
            const isCurrent = session.id === currentSessionId;

            return (
              <Box key={session.id}>
                <Text
                  color={isSelected ? theme.primaryBright : theme.text}
                  backgroundColor={isSelected ? theme.bgSelected : undefined}
                >
                  {isSelected ? '▸ ' : '  '}
                  {session.id.slice(0, 8)}  {session.name.slice(0, 24).padEnd(24)}
                  <Text color={theme.muted}> {session.agent} • {session.messageCount} msgs</Text>
                  {isCurrent && <Text color={theme.success}> • current</Text>}
                </Text>
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted} dimColor>
          Tip: use /resume &lt;id-prefix&gt; to switch quickly
        </Text>
      </Box>
    </Box>
  );
};

// ===========================================
// Error Display Component
// ===========================================

interface ErrorDisplayProps {
  error: string | null;
  onDismiss: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onDismiss }) => {
  useEffect(() => {
    if (error) {
      const timer = setTimeout(onDismiss, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, onDismiss]);

  if (!error) return null;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.error}
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Text color={theme.error}>
        ⚠️ {error}
      </Text>
      <Text color={theme.muted}> (auto-dismiss in 5s)</Text>
    </Box>
  );
};

// ===========================================
// Welcome Screen Component
// ===========================================

interface WelcomeScreenProps {
  agent: AgentRole;
  provider: ProviderName;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ agent, provider }) => {
  const config = AGENT_CONFIG[agent];
  
  return (
    <Box flexDirection="column" alignItems="center" marginY={2} paddingX={2}>
      <Text color={theme.primaryBright} bold>
        {`
  ╦  ╦ ╦╔╦╗╔═╗╔═╗╔═╗╔╦╗╔═╗
  ║  ║ ║║║║║╣ ║  ║ ║ ║║║╣ 
  ╩═╝╚═╝╩ ╩╚═╝╚═╝╚═╝═╩╝╚═╝
        `}
      </Text>
      <Text color={theme.muted}>
        AI-powered coding that's private, open, and beautiful
      </Text>
      
      <Box marginTop={2} flexDirection="column" alignItems="center">
        <Box>
          <Text color={theme.muted}>Active: </Text>
          <Text color={config.color} bold>{config.emoji} {config.name}</Text>
          <Text color={theme.muted}> agent with </Text>
          <Text color={theme.primaryBright}>{provider}</Text>
        </Box>
        
        <Box marginTop={1}>
          <Text color={theme.textDim}>
            Type a message to begin • Press ? for help • Tab to switch agent
          </Text>
        </Box>
      </Box>
      
      <Box marginTop={2} borderStyle="single" borderColor={theme.muted} paddingX={2} paddingY={1}>
        <Text color={theme.muted}>
          💡 Tip: Use /help for all commands, Ctrl+P to switch providers
        </Text>
      </Box>
    </Box>
  );
};

// ===========================================
// Loading/Thinking Indicator
// ===========================================

interface ThinkingIndicatorProps {
  phase: 'thinking' | 'generating' | 'tool';
  detail?: string;
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ phase, detail }) => {
  const config = {
    thinking: { emoji: '🧠', text: 'Thinking', color: 'yellow' },
    generating: { emoji: '✍️', text: 'Generating', color: 'green' },
    tool: { emoji: '🔧', text: 'Using tool', color: 'magenta' },
  };
  
  const c = config[phase];

  return (
    <Box marginY={1} paddingX={1}>
      <Text color={c.color as any}>
        <Spinner type="dots" /> {c.emoji} {c.text}
        {detail && <Text color={theme.muted}>: {detail}</Text>}
      </Text>
    </Box>
  );
};
