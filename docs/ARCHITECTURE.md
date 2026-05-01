# Lumecode — Architecture

## Overview

Lumecode is built as a layered terminal application using React (via Ink) for the UI, with a central Engine orchestrating communication between agents, LLM providers, and tools. The architecture separates concerns cleanly: the TUI handles user interaction, the Engine manages state and coordinates processing, and specialized subsystems handle agent selection, provider communication, tool execution, and session persistence.

---

## System Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                        TUI Layer (Ink/React)                       │
│  ┌─────────┐  ┌─────────┐  ┌───────────┐  ┌─────────────────────┐ │
│  │ Welcome │→→│  Chat   │→→│ InputBar  │  │ StatusBar · Panels  │ │
│  │ Screen  │  │ Viewport│  │ Component │  │ AgentMenu ModelMenu │ │
│  └─────────┘  └─────────┘  └───────────┘  └─────────────────────┘ │
└─────────────────────────────┬─────────────────────────────────────┘
                              │ AppContext (useApp hook)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Engine (Orchestrator)                          │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ process() · processStream() · switchAgent() · switchModel()   │ │
│  │ switchProvider() · executeTool() · setToolCallHandler()       │ │
│  │ newSession() · loadSession() · initialize() · getHistory()    │ │
│  └────────────────────────────────────────────────────────────────┘ │
└───────┬──────────────────┬───────────────────┬──────────────────────┘
        │                  │                   │
        ▼                  ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────────────────┐
│ Agent System  │  │   Provider    │  │       Tool Registry           │
│               │  │   System      │  │                               │
│ ┌───────────┐ │  │ ┌───────────┐ │  │ ┌───────────┐ ┌─────────────┐ │
│ │ Build     │ │  │ │ Gemini    │ │  │ │ file_read │ │ file_write  │ │
│ │ Agent     │ │  │ │ Provider  │ │  │ │ file_edit │ │ directory   │ │
│ ├───────────┤ │  │ ├───────────┤ │  │ │ search    │ │ terminal    │ │
│ │ Plan      │ │  │ │ OpenRouter│ │  │ └───────────┘ └─────────────┘ │
│ │ Agent     │ │  │ │ Provider  │ │  │           + MCP Tools         │
│ ├───────────┤ │  │ ├───────────┤ │  └───────────────────────────────┘
│ │ Review    │ │  │ │ Groq      │ │                │
│ │ Agent     │ │  │ │ Provider  │ │                │
│ ├───────────┤ │  │ ├───────────┤ │                ▼
│ │ General   │ │  │ │ Ollama    │ │  ┌───────────────────────────────┐
│ │ Agent     │ │  │ │ Provider  │ │  │         MCP Client            │
│ └───────────┘ │  │ └───────────┘ │  │   Stdio Transport · Tools     │
└───────────────┘  └───────────────┘  └───────────────────────────────┘
        │                  │                   │
        └──────────────────┼───────────────────┘
                           ▼
          ┌────────────────────────────────────┐
          │         Session Manager            │
          │   SQLite · Messages · Persistence  │
          └────────────────────────────────────┘
```

---

## Layer Descriptions

### TUI Layer (`src/ui/`)

**What it does:**
Renders the terminal user interface using React components with Ink. Handles keyboard input, displays streaming responses, and manages UI state like panels and menus.

**Key files:**

| File | Purpose |
|------|---------|
| `App.tsx` | Root component, keyboard handlers, slash commands, main layout |
| `AppContext.tsx` | React Context providing shared state and actions |
| `Chat.tsx` | Chat viewport displaying messages |
| `InputBar.tsx` | Text input component for user messages |
| `StatusBar.tsx` | Bottom bar with agent, provider, model, tokens display |
| `StreamingMessage.tsx` | Renders streaming LLM response with tool indicators |
| `AgentSelectorPanel.tsx` | Agent selection overlay |
| `ModelSelectorPanel.tsx` | Model selection overlay |
| `HelpPanel.tsx` | Keybindings and commands help overlay |

**State flow:**
```
AppContext (React Context)
├── References
│   ├── engine: Engine instance
│   ├── sessionManager: SessionManager instance
│   └── contextBuilder: ContextBuilder instance
├── UI State
│   ├── messages: Message[] for display
│   ├── streaming: boolean
│   ├── currentTool: string | null (active tool name)
│   ├── focus: 'input' | 'chat'
│   └── activeTab: TabType
├── Overlay State
│   ├── showHelp: boolean
│   ├── showAgentMenu: boolean
│   └── showModelMenu: boolean
├── Live Data
│   ├── models: string[] (available models)
│   ├── recentChanges: FileChange[]
│   └── tokenCount: { input, output, total, cost }
└── Actions
    ├── sendMessage(input: string)
    ├── cancelStream()
    ├── switchAgent(role: AgentRole)
    ├── switchProvider(name: string)
    ├── switchModel(model: string)
    └── clearConversation()
```

---

### Engine (`src/engine/index.ts`)

**What it does:**
Central orchestrator that coordinates all subsystems. Manages the conversation loop, dispatches tool calls, handles streaming, and maintains the current agent/provider/model state.

**Public API:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `initialize` | `(options?: InitOptions) => Promise<void>` | Initialize engine with config, loads MCP tools |
| `process` | `(input: string) => Promise<string>` | Process input and return complete response (non-streaming) |
| `processStream` | `(input: string, onChunk: ChunkCallback, signal?: AbortSignal) => Promise<StreamResult>` | Process input with streaming callback |
| `switchAgent` | `(role: AgentRole) => void` | Switch to different agent |
| `switchProvider` | `(provider: string) => Promise<void>` | Switch LLM provider |
| `switchModel` | `(model: string) => void` | Switch model within current provider |
| `executeTool` | `(name: string, args: ToolArgs) => Promise<ToolResult>` | Execute a registered tool |
| `setToolCallHandler` | `(handler: ToolCallHandler) => void` | Set callback for tool call events |
| `newSession` | `() => Promise<Session>` | Create new session |
| `loadSession` | `(sessionId: string) => Promise<Session>` | Load existing session |
| `getHistory` | `() => Message[]` | Get conversation history |
| `getTools` | `() => Tool[]` | Get available tools for current agent |
| `getCurrentAgent` | `() => Agent` | Get current agent instance |
| `getCurrentProvider` | `() => Provider` | Get current provider instance |
| `getCurrentModel` | `() => string` | Get current model name |

**Streaming internals:**

1. `processStream()` receives input and callbacks
2. Builds context using ContextBuilder
3. Adds system prompt from current agent
4. Calls provider's `streamChat()` method
5. For each chunk:
   - If text: calls `onChunk` callback
   - If tool call: calls `toolCallHandler`, executes tool, appends result
6. Continues until stream completes or signal aborted
7. Returns `StreamResult` with final message and token usage

---

### Agent System (`src/agents/`)

**How agents are selected:**
The Engine holds a current `AgentRole` which maps to an Agent instance via `AgentRegistry`. Calling `engine.switchAgent(role)` updates the internal reference.

**How system prompts differ:**
Each agent class has a `getSystemPrompt()` method returning role-specific instructions:

| Agent | System Prompt Focus |
|-------|---------------------|
| Build | Implementation, creating files, writing code, executing commands |
| Plan | Architecture analysis, read-only exploration, design decisions |
| Review | Code review, bug finding, security analysis, no modifications |
| General | Versatile assistance, balanced capabilities with confirmations |

**Tool permission model:**

Each agent defines capabilities via `AgentCapabilities`:

```typescript
interface AgentCapabilities {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canExecuteCommands: boolean;
  canSearchFiles: boolean;
  canListDirectories: boolean;
  requiresConfirmation: boolean;
}
```

**Agent → Tool Access Matrix:**

| Tool | Build | Plan | Review | General |
|------|-------|------|--------|---------|
| `file_read` | ✅ | ✅ | ✅ | ✅ |
| `file_write` | ✅ | ❌ | ❌ | ⚠️ |
| `file_edit` | ✅ | ❌ | ❌ | ⚠️ |
| `directory_list` | ✅ | ✅ | ✅ | ✅ |
| `search_files` | ✅ | ✅ | ❌ | ⚠️ |
| `terminal_execute` | ✅ | ⚠️ | ❌ | ⚠️ |

✅ = Full access | ❌ = No access | ⚠️ = Requires confirmation

---

### Provider System (`src/providers/`)

**How providers are instantiated:**
`ProviderRegistry` maintains a map of provider names to factory functions. `createProvider(name)` returns a configured provider instance.

**Provider configuration:**

| Provider | Base URL | Key Header | Required Headers |
|----------|----------|------------|------------------|
| Gemini | `https://generativelanguage.googleapis.com` | Query param `key` | — |
| OpenRouter | `https://openrouter.ai/api/v1` | `Authorization: Bearer` | `HTTP-Referer`, `X-Title` |
| Groq | `https://api.groq.com/openai/v1` | `Authorization: Bearer` | — |
| Ollama | `http://localhost:11434` | None (local) | — |

**How model switching works:**
1. User calls `/model <name>` or `Ctrl+O`
2. UI calls `engine.switchModel(name)`
3. Engine updates internal state
4. Next request uses new model

**How streaming differs:**

| Provider | Streaming Method | Format |
|----------|------------------|--------|
| Gemini | SSE via `/streamGenerateContent` | Custom JSON chunks |
| OpenRouter | SSE via `/chat/completions` | OpenAI-compatible |
| Groq | SSE via `/chat/completions` | OpenAI-compatible |
| Ollama | SSE via `/api/chat` | Ollama format |

**How `listModels()` works:**
Each provider implements `listModels(): Promise<string[]>` which fetches available models from the API or returns hardcoded lists.

---

### Tool Registry (`src/tools/`)

**How tools are registered:**
`initializeTools()` creates tool instances and registers them with the Engine. Tools implement the `Tool` interface with `name`, `description`, `parameters`, and `execute()`.

**How the Engine dispatches tool calls:**

1. Provider sends tool call in stream
2. Engine extracts tool name and arguments
3. Engine calls `toolCallHandler` if set (for UI updates)
4. Engine looks up tool in registry
5. Engine calls `tool.execute(args)`
6. Result is formatted and appended to conversation
7. Conversation continues with tool result in context

**How results are returned to the LLM:**
Tool results are formatted as messages with `role: 'tool'` and added to the conversation history before the next LLM call.

**Built-in tools:**

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `file_read` | Read file contents | `path: string`, `startLine?: number`, `endLine?: number` | File content string |
| `file_write` | Write content to file | `path: string`, `content: string`, `createBackup?: boolean` | Success message |
| `file_edit` | Edit file via line replacement or search/replace | `path: string`, `edits: EditOperation[]` | Edit result with changes |
| `directory_list` | List directory contents | `path: string`, `depth?: number`, `showHidden?: boolean` | Directory tree string |
| `terminal_execute` | Execute shell command | `command: string`, `workingDirectory?: string`, `timeout?: number` | stdout/stderr/exitCode |
| `search_files` | Search files with pattern | `pattern: string`, `path?: string`, `filePattern?: string`, `contextLines?: number` | Search results |

---

### Session Manager (`src/session/index.ts`)

**SQLite schema:**

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  agent TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  working_directory TEXT NOT NULL,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  name TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
```

**Session lifecycle:**

```
create() → Session object created, inserted to DB
    │
    ▼
addMessage() → Messages appended to DB
    │
    ▼
update() → Session metadata updated (agent, model, etc.)
    │
    ▼
finalize() → Final update timestamp
```

**File storage:**
- Database: `~/.lumecode/lumecode.db`
- Config: `~/.lumecode/config.json`

---

### Context Builder (`src/context/index.ts`)

**What context is built:**

1. **Project structure** — File tree up to configured depth
2. **Git information** — Branch, recent commits, status
3. **Open files** — Currently tracked files
4. **Working directory** — Absolute path

**When it runs:**
Before every message processing, the Engine calls `contextBuilder.build()` to generate fresh context for the system prompt.

**How it affects the system prompt:**
Context is interpolated into the agent's system prompt template. The final system prompt includes project-specific details.

---

### MCP Integration (`src/mcp/`)

**How MCP tools are discovered:**

1. At Engine initialization, `registerMCPTools()` is called
2. MCP client connects to configured servers via `StdioClientTransport`
3. Client calls `listTools()` on each server
4. Discovered tools are wrapped in Lumecode's `Tool` interface
5. Tools are added to the registry with `mcp_` prefix

**How they are registered:**
MCP tools are registered just like built-in tools. The `execute()` method calls `mcpClient.callTool()` under the hood.

**How `callTool()` works:**

```typescript
const result = await mcpClient.callTool({
  name: toolName,
  arguments: args
});
```

The MCP SDK handles JSON-RPC communication with the external tool server.

---

### LiveSync (`src/hooks/useLiveSync.ts`)

**What chokidar watches:**
The current working directory and all subdirectories.

**What is ignored:**
```javascript
ignored: [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.next/**',
  '**/bun.lockb'
]
```

**How events surface to the TUI:**

1. `chokidar.watch()` emits `add`, `change`, `unlink` events
2. `useLiveSync` hook maintains `recentChanges` state
3. Changes are shown in StatusBar
4. List is capped at recent N files

---

## Data Flow: User Sends a Message

```
1.  User types message in InputBar and presses Enter
                        │
                        ▼
2.  InputBar calls handleSubmit() → sendMessage(input)
                        │
                        ▼
3.  sendMessage() checks for slash command (/help, /model, etc.)
    └── If slash command: handle and return early
                        │
                        ▼
4.  User message appended to UI state (messages[])
                        │
                        ▼
5.  streaming = true, empty assistant message added
                        │
                        ▼
6.  AbortController created for cancellation
                        │
                        ▼
7.  ContextBuilder.build() generates project context
                        │
                        ▼
8.  engine.processStream(input, onChunk, signal) called
                        │
                        ▼
9.  Engine builds full prompt: system + history + user
                        │
                        ▼
10. Provider.streamChat() initiates SSE connection
                        │
    ┌───────────────────┴───────────────────┐
    │                                       │
    ▼                                       ▼
11a. Text chunk received              11b. Tool call received
    │                                       │
    ▼                                       ▼
12a. onChunk(text) fires              12b. toolCallHandler fires
    │                                       │
    ▼                                       ▼
13a. Token appended to                13b. Tool executes
     streaming message                      │
                                            ▼
                                      13c. Result added to context
                                            │
                                            ▼
                                      13d. Stream continues
                        │
                        ▼
14. Stream completes or signal aborted
                        │
                        ▼
15. StreamResult returned with final message + tokens
                        │
                        ▼
16. Token usage calculated, displayed in StatusBar
                        │
                        ▼
17. Message finalized in SQLite via SessionManager
                        │
                        ▼
18. streaming = false, UI updates complete
```

---

## State Management

```
AppContext (React Context via createContext)
│
├── Engine References
│   ├── engine: Engine
│   ├── sessionManager: SessionManager
│   └── contextBuilder: ContextBuilder
│
├── Conversation State
│   ├── messages: Message[]
│   ├── session: Session | null
│   └── history: Message[]
│
├── UI State
│   ├── streaming: boolean
│   ├── currentTool: string | null
│   ├── focus: FocusArea
│   ├── activeTab: TabType
│   └── inputValue: string
│
├── Overlay State
│   ├── showHelp: boolean
│   ├── showAgentMenu: boolean
│   ├── showModelMenu: boolean
│   └── showProviderMenu: boolean
│
├── Provider State
│   ├── currentProvider: string
│   ├── currentModel: string
│   ├── currentAgent: AgentRole
│   └── models: string[]
│
├── Live Data
│   ├── recentChanges: FileChange[]
│   └── tokenCount: TokenUsage
│
└── Actions (exposed via hook)
    ├── sendMessage: (input: string) => Promise<void>
    ├── cancelStream: () => void
    ├── switchAgent: (role: AgentRole) => void
    ├── switchProvider: (name: string) => Promise<void>
    ├── switchModel: (model: string) => void
    ├── clearConversation: () => void
    ├── newSession: () => Promise<void>
    └── toggleHelp: () => void
```

---

## Error Handling

| Error Type | HTTP Code | Cause | Recovery |
|------------|-----------|-------|----------|
| Invalid API Key | 401 | Wrong or missing API key | Re-enter key with `/key provider newkey` |
| User Not Found | 401 | OpenRouter missing HTTP-Referer | Update to latest Lumecode |
| Quota Exceeded | 429 | Free tier rate limit | Switch provider or wait |
| Model Not Found | 404 | Invalid model name | Use `/models` to list valid options |
| Connection Refused | — | Ollama not running | Start with `ollama serve` |
| Timeout | 504 | Slow response from provider | Retry or switch provider |
| Stream Aborted | — | User pressed Esc | Normal cancellation |
| Tool Execution Failed | — | Tool error (permission, path, etc.) | Check tool output for details |
| Session Load Failed | — | Corrupted database | Start new session |

**Error display:**
Errors are caught in `processStream()` and displayed in the chat viewport with an error indicator. The UI remains interactive.
