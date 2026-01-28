# LUMECODE - Open Source AI Coding Agent

**Project Specification & Architecture Document**

---

## TABLE OF CONTENTS

1. [Project Overview](#project-overview)
2. [Core Vision & Goals](#core-vision--goals)
3. [Architecture Overview](#architecture-overview)
4. [Technology Stack](#technology-stack)
5. [UI/UX Design System](#uiux-design-system)
6. [Core Components](#core-components)
7. [Directory Structure](#directory-structure)
8. [Feature Specifications](#feature-specifications)
9. [Agent System](#agent-system)
10. [Configuration & Installation](#configuration--installation)
11. [Data Flow & Interactions](#data-flow--interactions)
12. [Implementation Roadmap](#implementation-roadmap)

---

## 1. PROJECT OVERVIEW

### What is Lumecode?

**Lumecode** is an open-source AI coding agent that combines:
- **OpenCode's** rich minimal UI, LSP integration, and multi-session architecture
- **Crush's** elegant TUI components (Bubble Tea, Lip Gloss), seamless model provider integration, and modular design philosophy

### Key Differentiators

1. **Privacy-First Design** - No code or context stored on servers
2. **Provider-Agnostic** - Works with Claude, GPT, Gemini, Groq, Ollama (local models), and 75+ LLM providers
3. **Multi-Modal UI** - Terminal (TUI), Desktop App (Electron), IDE Extensions (VS Code, Neovim)
4. **Agent-Based System** - Role-based agents (Build, Plan, Review, General)
5. **LSP Native** - Auto-loads Language Server Protocol for intelligent code assistance
6. **Session Management** - Multi-session support with session sharing via unique links
7. **Minimal & Simple** - Glamorous but not bloated terminal interface

### Target Users

- Solo developers & teams
- System administrators
- AI developers exploring agentic workflows
- Privacy-conscious developers
- Users with local/self-hosted LLMs

---

## 2. CORE VISION & GOALS

### Vision Statement
*"AI-powered coding that's private, open, and beautiful in your terminal."*

### Primary Goals

1. **User Experience** 
   - Minimal, intuitive UI with zero learning curve
   - Rich terminal aesthetics using Charm's design language
   - Fast response times and smooth interactions

2. **Developer Experience**
   - Well-documented, modular codebase
   - Easy to extend (add agents, providers, commands)
   - Strong test coverage and CI/CD pipeline

3. **Technical Excellence**
   - Production-ready code quality
   - Security and privacy by design
   - Performance optimized for resource-constrained environments

4. **Community**
   - OSS-first approach (MIT License)
   - Welcoming contribution guidelines
   - Active Discord/community engagement

---

## 3. ARCHITECTURE OVERVIEW

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LUMECODE PLATFORM                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          USER INTERFACE LAYER                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │  │
│  │  │ TUI (BubbleTea)│ │Desktop (Electron) │IDE Extensions│  │  │
│  │  └─────────────┘  └─────────────┘  └──────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          CLIENT/SERVER COMMUNICATION                 │  │
│  │    (WebSocket, IPC, HTTP for remote sessions)        │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          CORE ENGINE LAYER                           │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │ Agent System (Build/Plan/Review/General)        │ │  │
│  │  │ - Request Processing                            │ │  │
│  │  │ - Context Management                            │ │  │
│  │  │ - Multi-turn Conversations                      │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  │                                                        │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │ LLM Provider Abstraction Layer                  │ │  │
│  │  │ - Provider Registry (OpenAI, Anthropic, etc.)  │ │  │
│  │  │ - Model Selector & Validation                  │ │  │
│  │  │ - Request/Response Transformation              │ │  │
│  │  │ - Rate Limiting & Error Handling               │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  │                                                        │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │ Code Analysis & LSP Integration                │ │  │
│  │  │ - Auto LSP Detection & Loading                 │ │  │
│  │  │ - Code Indexing                                │ │  │
│  │  │ - Intelligent Code Completion                  │ │  │
│  │  │ - Syntax Highlighting                          │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  │                                                        │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │ File System & Project Management               │ │  │
│  │  │ - Virtual FS Layer (read-only by default)      │ │  │
│  │  │ - Workspace Detection & Analysis               │ │  │
│  │  │ - Gitignore Support                            │ │  │
│  │  │ - Permission Handling                          │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  │                                                        │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │ Session & State Management                     │ │  │
│  │  │ - Session Persistence (SQLite)                 │ │  │
│  │  │ - Conversation History                         │ │  │
│  │  │ - Session Sharing & Remote Access              │ │  │
│  │  │ - State Serialization                          │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          EXTERNAL INTEGRATIONS                       │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │ GitHub/GitLab Integration                       │ │  │
│  │  │ Git Operations & Diff Viewing                   │ │  │
│  │  │ Issue/PR Context                                │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │ Development Tools                               │ │  │
│  │  │ Terminal/Shell Execution                        │ │  │
│  │  │ Debugger Integration                            │ │  │
│  │  │ Test Runner Support                             │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Architectural Principles

1. **Separation of Concerns** - Each layer has distinct responsibilities
2. **Provider Abstraction** - Add new LLM providers without touching core logic
3. **Agent-Based Design** - Pluggable agents with role-specific capabilities
4. **Stateless Processing** - Server can be stateless; state stored in SQLite
5. **Privacy by Default** - No data sent to external servers unless explicitly configured
6. **Composable UI** - Reusable components across different interfaces

---

## 4. TECHNOLOGY STACK

### Backend (Server/Core Engine)

```
Language: TypeScript / Node.js (v18+)
Runtime: Node.js or Bun (for speed)

Core Dependencies:
├── Framework & Runtime
│   ├── express (HTTP server, API endpoints)
│   ├── ws (WebSocket for real-time communication)
│   ├── commander (CLI argument parsing)
│   └── dotenv (environment configuration)
│
├── LLM & AI Integration
│   ├── @anthropic-ai/sdk (Claude API)
│   ├── openai (GPT models)
│   ├── @google/generative-ai (Gemini)
│   ├── groq-sdk (Groq API)
│   ├── ollama (local models)
│   ├── @huggingface/inference (HuggingFace)
│   └── openai-compatible-fetch (generic LLM provider)
│
├── Code Analysis & LSP
│   ├── vscode-languageserver (LSP server)
│   ├── vscode-languageserver-protocol (protocol types)
│   ├── @babel/parser (JavaScript/TypeScript parsing)
│   ├── tree-sitter (fast code parsing)
│   └── language-server-manager (auto LSP detection)
│
├── File & Project Management
│   ├── fs-extra (file operations)
│   ├── ignore (gitignore parsing)
│   ├── chokidar (file watching)
│   └── js-git (git operations)
│
├── Data & Storage
│   ├── sqlite3 (session persistence)
│   ├── better-sqlite3 (sync SQLite)
│   ├── zod (schema validation)
│   └── pino (structured logging)
│
└── DevOps & Testing
    ├── jest (testing framework)
    ├── vitest (modern test runner)
    ├── ts-node (run TypeScript directly)
    └── tsx (fast TypeScript execution)
```

### Frontend (TUI & Desktop)

```
Terminal UI (TUI):
├── Language: TypeScript
├── Framework: ink (React for Terminal) OR term-js
├── Components:
│   ├── @react-pdf/renderer (for markdown rendering)
│   ├── chalk (terminal colors)
│   ├── ora (loading spinners)
│   └── inquirer (interactive prompts)
│
├── Alternative (Pure Go - for performance):
│   ├── Bubble Tea (TUI framework - from Charm)
│   ├── Lip Gloss (styling - from Charm)
│   ├── glow (markdown rendering)
│   └── log (logging)

Desktop UI (Electron):
├── Language: TypeScript + React
├── Framework: Electron (main/renderer processes)
├── Components:
│   ├── React
│   ├── TailwindCSS (styling)
│   ├── Zustand (state management)
│   └── React Query (server state)

IDE Extensions:
├── VS Code Extension
│   ├── vscode API
│   ├── TypeScript
│   └── WebView (for UI)
├── Neovim Plugin
│   ├── Lua/TypeScript
│   └── Neovim RPC

### Message Presentation (Mixed Layout)

**Chat Messages** (Bubbles)
- User prompts: Right-aligned, cyan accent
- Agent responses: Left-aligned, teal bubble
- System messages: Full-width, gray background
- Quick actions: Button row below message

**Code Blocks** (Terminal-style)
- Language-specific syntax highlighting (Tree-sitter)
- Line numbers, copy button, run button
- Diff highlighting for modifications
- Left-aligned for readability

**Token Display** (Header)
- Always visible: current tokens, remaining budget
- Responsive breakpoint: "4.2k / 100k | $0.13"
- Click to expand: detailed breakdown
- Color-coded alerts: budget warnings

**Rendering**
- Lazy load: Only visible code highlighted
- Cache: Previous highlights (memory-efficient)
- Performance target: <50ms per message
 
```

### Recommended Tech Choice for Lumecode

**Backend**: TypeScript + Node.js (or Bun for faster startup)
**TUI**: Go + Bubble Tea + Lip Gloss (from Charm ecosystem) - for performance & elegance
**Desktop**: Electron + TypeScript + React + TailwindCSS
**Database**: SQLite for local storage

This hybrid approach gives you:
- Fast TUI performance (Go)
- Type-safe server logic (TypeScript)
- Rich desktop experience (Electron + React)

---

## 5. UI/UX DESIGN SYSTEM

### Design Principles

1. **Minimal** - No unnecessary UI elements
2. **Focused** - One primary action per screen
3. **Responsive** - Adapts to terminal size, handles resize gracefully
4. **Accessible** - Keyboard-first, screen reader compatible
5. **Beautiful** - Uses color, spacing, typography effectively
6. **Fast** - Instant feedback, no lag

### Color Palette (Dark Mode - Terminal)

```
Primary Colors (Teal/Cyan - inspired by OpenCode):
├── --teal-50:  #f0fdfa
├── --teal-500: #14b8a6 (Primary Action)
├── --teal-600: #0d9488 (Hover)
└── --teal-700: #0f766e (Active)

Neutral Colors:
├── --slate-200: #e2e8f0 (Borders)
├── --slate-400: #94a3b8 (Secondary Text)
├── --slate-600: #475569 (Primary Text)
└── --slate-900: #0f172a (Background)

Status Colors:
├── --green-500:  #22c55e (Success)
├── --amber-500:  #f59e0b (Warning)
├── --red-500:    #ef4444 (Error)
└── --blue-500:   #3b82f6 (Info)

Semantic Colors:
├── --accent-primary:   #14b8a6 (Teal)
├── --accent-secondary: #8b5cf6 (Purple)
├── --bg-primary:       #1e293b (Dark Slate)
├── --bg-secondary:     #0f172a (Darker)
└── --text-primary:     #f1f5f9 (Light)
```

### Typography

```
Font Stack (Terminal):
├── Monaco / Menlo / Consolas (Monospace)
├── Size: 12-14px (terminal default)
└── Line Height: 1.4

Font Stack (Desktop):
├── System Font Stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto
├── Monospace: 'Fira Code', 'Consolas'
└── Sizes: 
    ├── H1: 28px (bold)
    ├── H2: 24px (semibold)
    ├── Body: 14px (regular)
    └── Code: 13px (monospace)
```

### Layout Components

#### 1. Main Session View
```
┌──────────────────────────────────────────────────────────┐
│ lumecode v1.0.0 | Project: my-app | Agent: build [TAB]   │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  [Conversation History - Scrollable]                      │
│  ┌────────────────────────────────────────────────────┐   │
│  │ You: Build a function to calculate fibonacci       │   │
│  │ 2:45 PM                                            │   │
│  │                                                    │   │
│  │ Agent: I'll create a recursive fibonacci function │   │
│  │ with memoization for efficiency.                   │   │
│  │                                                    │   │
│  │ 📄 src/utils/fibonacci.ts (created)               │   │
│  │ ✓ Tests passed (3/3)                              │   │
│  │                                                    │   │
│  │ You: Add JSDoc comments                           │   │
│  │ 2:47 PM                                            │   │
│  │                                                    │   │
│  │ Agent: Done! Updated with comprehensive JSDoc     │   │
│  │                                                    │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
├──────────────────────────────────────────────────────────┤
│  Input: [Type your request... or /help for commands]    │
│  Agent: build | Model: claude-opus | Context: 8 files  │
└──────────────────────────────────────────────────────────┘
```

#### 2. Agent Selection View
```
┌──────────────────────────────────────────────────────────┐
│ Select Agent (↑↓ to navigate, ENTER to select, ESC back) │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ● Build (Full Access)                                   │
│    Full file read/write, run shell commands             │
│    Best for: Development work                            │
│                                                            │
│  ○ Plan (Read-Only + Confirmation)                       │
│    Can't edit files, asks before running commands       │
│    Best for: Code exploration & planning                 │
│                                                            │
│  ○ Review (Analysis Only)                               │
│    Read-only, no shell access, focused on analysis      │
│    Best for: Code reviews & security audits             │
│                                                            │
│  ○ General (Multi-step Tasks)                           │
│    Can handle complex multi-step operations             │
│    Best for: Refactoring & migrations                   │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

#### 3. Model Selection View
```
┌──────────────────────────────────────────────────────────┐
│ Select LLM Model (Filter: ____)                          │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Provider: Anthropic          [↓ Change]                │
│  ─────────────────────────────────────────────────────   │
│  ● claude-opus (Latest, Recommended)                     │
│  ○ claude-sonnet-4                                       │
│  ○ claude-haiku                                          │
│                                                            │
│  Provider: OpenAI             [↓ Change]                │
│  ─────────────────────────────────────────────────────   │
│  ○ gpt-4-turbo                                           │
│  ○ gpt-4                                                 │
│  ○ gpt-3.5-turbo                                         │
│                                                            │
│  Provider: Local (Ollama)     [↓ Change]                │
│  ─────────────────────────────────────────────────────   │
│  ○ mistral:latest                                        │
│  ○ neural-chat:latest                                    │
│                                                            │
│  [ESC to cancel] [SPACE to toggle] [ENTER to confirm]    │
└──────────────────────────────────────────────────────────┘
```

#### 4. File Explorer View
```
┌──────────────────────────────────────────────────────────┐
│ File Context (↑↓ scroll, Space to toggle, ESC back)     │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  📁 src/                                                 │
│  ├─ ☑ App.tsx (2.1 KB)                                  │
│  ├─ ☑ main.ts (1.8 KB)                                  │
│  ├─ 📁 components/                                       │
│  │  ├─ ☐ Button.tsx (0.9 KB)                            │
│  │  ├─ ☑ Header.tsx (1.2 KB)                            │
│  │  └─ ☐ Footer.tsx (0.8 KB)                            │
│  └─ 📁 utils/                                            │
│     ├─ ☑ helpers.ts (1.5 KB)                            │
│     └─ ☐ validators.ts (0.7 KB)                         │
│                                                            │
│  Selected: 6 files (7.5 KB)                             │
│  [Confirm] [Clear All] [Cancel]                         │
└──────────────────────────────────────────────────────────┘
```

### Interactive Elements

#### Form Input
```
Input: [│____________________] (active)
Input: [filled value────────] (filled)
Input: [disabled value──────] (disabled)
```

#### Progress Indicator
```
Processing: ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
Success:    ✓ Task completed
Error:      ✗ Task failed: reason
Info:       ℹ Something important
Warning:    ⚠ Be careful with this
```

#### Status Badge
```
[SUCCESS] [ERROR] [PENDING] [WARNING] [INFO]
```

### Keyboard Shortcuts

```
Navigation:
├── ↑/↓ or j/k          Scroll/Navigate
├── h/l or ←/→          Move between panes
├── Tab                 Switch agent
├── Ctrl+K              Clear screen
├── PageUp/PageDown     Scroll faster
└── Home/End            Jump to start/end

Actions:
├── Enter               Confirm selection / Send message
├── Escape              Close dialog / Back to main
├── Ctrl+C              Cancel operation / Exit
├── Ctrl+D              Exit without saving
├── Ctrl+L              Lock to latest message
└── Ctrl+R              Refresh / Retry

Commands (in input):
├── /help               Show command help
├── /exit               Exit gracefully
├── /clear              Clear conversation
├── /sessions           List all sessions
├── /settings           Open settings
├── /share              Get session share link
├── /export             Export conversation
└── /models             Change model
```

---

## 6. CORE COMPONENTS

### 6.1 Agent System

```typescript
// Agent Types & Interfaces
type AgentType = 'build' | 'plan' | 'review' | 'general';

interface Agent {
  id: AgentType;
  name: string;
  description: string;
  permissions: {
    canEditFiles: boolean;
    canRunShell: boolean;
    canAccessNetwork: boolean;
    requiresConfirmation: boolean;
  };
  systemPrompt: string;
  capabilities: string[];
  context: {
    maxContextSize: number;
    includeHistory: boolean;
    includeFiles: boolean;
  };
}

// Build Agent (Full Access)
├── Name: "Build"
├── Permissions:
│   ├── canEditFiles: true
│   ├── canRunShell: true
│   ├── canAccessNetwork: false
│   └── requiresConfirmation: false
├── System Prompt: "You are an expert AI developer. Help users build, 
│   refactor, and improve their code. You have full access to file 
│   operations and can run shell commands. Be proactive and thorough."
└── Capabilities: ["write_code", "run_tests", "execute_commands", 
    "create_files", "delete_files", "analyze_code"]

// Plan Agent (Read-Only + Confirmation)
├── Name: "Plan"
├── Permissions:
│   ├── canEditFiles: false
│   ├── canRunShell: true (with confirmation)
│   ├── canAccessNetwork: false
│   └── requiresConfirmation: true
├── System Prompt: "You are a careful code analyst. Analyze code, 
│   plan refactorings, and suggest improvements without modifying 
│   files. Ask for confirmation before running any commands."
└── Capabilities: ["analyze_code", "read_files", "plan_changes", 
    "suggest_improvements", "explain_code"]

// Review Agent (Analysis Only)
├── Name: "Review"
├── Permissions:
│   ├── canEditFiles: false
│   ├── canRunShell: false
│   ├── canAccessNetwork: false
│   └── requiresConfirmation: false
├── System Prompt: "You are a code reviewer focused on quality, security, 
│   and best practices. Analyze code and provide detailed feedback."
└── Capabilities: ["analyze_code", "read_files", "security_audit", 
    "performance_analysis", "code_review"]

// General Agent (Complex Multi-Step)
├── Name: "General"
├── Permissions:
│   ├── canEditFiles: true (with confirmation)
│   ├── canRunShell: true (with confirmation)
│   ├── canAccessNetwork: false
│   └── requiresConfirmation: true
├── System Prompt: "You are a versatile AI assistant that can handle 
│   complex multi-step tasks. Plan your approach carefully and ask 
│   for confirmation before making changes."
└── Capabilities: ["all_capabilities"]
```

### 6.2 LLM Provider Abstraction

```typescript
// Provider Registry
interface LLMProvider {
  name: string;
  id: string;
  type: 'api' | 'local';
  models: LLMModel[];
  config: {
    apiKey?: string;
    endpoint?: string;
    timeout: number;
    retries: number;
  };
  authenticate(): Promise<boolean>;
  listModels(): Promise<LLMModel[]>;
  createCompletion(request: CompletionRequest): Promise<CompletionResponse>;
  streamCompletion(request: CompletionRequest): AsyncIterable<CompletionChunk>;
}

// Built-in Providers
├── Anthropic (Claude)
│   ├── Models: claude-opus, claude-sonnet, claude-haiku
│   └── Config: ANTHROPIC_API_KEY
├── OpenAI
│   ├── Models: gpt-4-turbo, gpt-4, gpt-3.5-turbo
│   └── Config: OPENAI_API_KEY
├── Google (Gemini)
│   ├── Models: gemini-pro, gemini-vision
│   └── Config: GOOGLE_API_KEY
├── Groq
│   ├── Models: mixtral-8x7b, llama2-70b, gemma-7b
│   └── Config: GROQ_API_KEY
├── Ollama (Local)
│   ├── Models: mistral, neural-chat, dolphin-2.1
│   └── Config: OLLAMA_BASE_URL (localhost:11434)
└── HuggingFace
    ├── Models: Any HF hosted model
    └── Config: HF_TOKEN

// Provider Manager
interface ProviderManager {
  registerProvider(provider: LLMProvider): void;
  getProvider(id: string): LLMProvider;
  listProviders(): LLMProvider[];
  getProviderModels(providerId: string): LLMModel[];
  validateConfig(providerId: string): Promise<boolean>;
  switchProvider(providerId: string): void;
}
```

### 6.3 LSP Integration

```typescript
// Language Server Protocol Manager
interface LSPManager {
  // Server Detection & Initialization
  detectLanguage(filePath: string): Language;
  autoLoadLSP(filePath: string): Promise<LanguageServer>;
  initializeServer(language: Language): Promise<LanguageServer>;
  
  // Server Capabilities
  getServerCapabilities(language: Language): ServerCapabilities;
  
  // Code Operations
  getCompletion(file: string, position: Position): Promise<CompletionItem[]>;
  getDefinition(file: string, position: Position): Promise<Location>;
  getHover(file: string, position: Position): Promise<MarkupContent>;
  getReferences(file: string, position: Position): Promise<Location[]>;
  getDocumentSymbols(file: string): Promise<DocumentSymbol[]>;
  getDiagnostics(file: string): Promise<Diagnostic[]>;
  
  // Formatting & Refactoring
  formatDocument(file: string): Promise<TextEdit[]>;
  getCodeActions(file: string, range: Range): Promise<CodeAction[]>;
  getRenameEdits(file: string, position: Position, newName: string): Promise<WorkspaceEdit>;
}

// Supported Languages Out-of-Box
├── TypeScript/JavaScript
│   ├── Server: typescript-language-server
│   └── Features: Full
├── Python
│   ├── Server: pyright or pylance
│   └── Features: Full
├── Go
│   ├── Server: gopls
│   └── Features: Full
├── Rust
│   ├── Server: rust-analyzer
│   └── Features: Full
├── C/C++
│   ├── Server: clangd
│   └── Features: Full
├── Java
│   ├── Server: eclipse.jdt.ls
│   └── Features: Full
├── Ruby
│   ├── Server: solargraph
│   └── Features: Partial
└── PHP
    ├── Server: intelephense
    └── Features: Full
```

### 6.4 Session Management

```typescript
// Session Structure
interface Session {
  id: string; // UUID
  name: string;
  projectPath: string;
  createdAt: timestamp;
  lastAccessedAt: timestamp;
  agent: AgentType;
  model: string;
  provider: string;
  
  // State
  conversation: Message[];
  fileContext: FileReference[];
  workspaceContext: WorkspaceContext;
  gitContext?: GitContext;
  
  // Sharing
  isShared: boolean;
  shareToken?: string;
  shareUrl?: string; // https://lumecode.dev/s/{shareToken}
  
  // Settings
  settings: SessionSettings;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: {
    type: 'file' | 'diff' | 'error';
    value: string;
  }[];
  codeBlocks?: CodeBlock[];
  createdAt: timestamp;
  tokenCount: number;
}

interface CodeBlock {
  language: string;
  code: string;
  fileName?: string;
  action: 'create' | 'update' | 'delete' | 'view';
  lineStart?: number;
  lineEnd?: number;
}

// Session Manager
interface SessionManager {
  // CRUD Operations
  createSession(name: string, projectPath: string): Promise<Session>;
  getSession(id: string): Promise<Session>;
  listSessions(): Promise<Session[]>;
  updateSession(id: string, updates: Partial<Session>): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  
  // Conversation Management
  addMessage(sessionId: string, message: Message): Promise<void>;
  getMessages(sessionId: string, limit: number): Promise<Message[]>;
  clearConversation(sessionId: string): Promise<void>;
  
  // Sharing
  createShareLink(sessionId: string): Promise<string>;
  getSharedSession(token: string): Promise<Session>;
  revokeShareLink(sessionId: string): Promise<void>;
  
  // Persistence
  saveSession(sessionId: string): Promise<void>;
  loadSession(sessionId: string): Promise<Session>;
  exportSession(sessionId: string, format: 'json' | 'markdown'): Promise<string>;
}

// Storage: SQLite
Database Schema:
├── sessions (id, name, projectPath, agent, model, provider, createdAt, etc.)
├── messages (id, sessionId, role, content, createdAt)
├── file_references (id, sessionId, filePath, hash, context)
├── share_tokens (token, sessionId, createdAt, expiresAt)
└── settings (sessionId, key, value)
```

### 6.5 File System Abstraction

```typescript
// Virtual File System
interface VirtualFS {
  // Reading
  readFile(path: string): Promise<string>;
  readFileAsTree(path: string, options?: TreeOptions): Promise<FileTree>;
  listDirectory(path: string, options?: ListOptions): Promise<FileEntry[]>;
  getFileInfo(path: string): Promise<FileInfo>;
  
  // Analysis
  analyzeProject(projectPath: string): Promise<ProjectAnalysis>;
  findFiles(pattern: string): Promise<string[]>;
  getGitStatus(projectPath: string): Promise<GitStatus>;
  getGitDiff(filePath: string): Promise<string>;
  
  // Context Building
  buildFileContext(filePath: string, depth?: number): Promise<FileContext>;
  getSymbolIndex(projectPath: string): Promise<SymbolIndex>;
  
  // Permissions
  checkPermission(filePath: string, action: 'read' | 'write'): Promise<boolean>;
}

interface FilePermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

// Virtual FS Rules (Agent-Based)
├── Build Agent:
│   ├── Read: All files
│   ├── Write: All files (except .git, node_modules by default)
│   ├── Delete: All files
│   └── Context Size: 128KB
├── Plan Agent:
│   ├── Read: All files
│   ├── Write: Denied
│   ├── Delete: Denied
│   └── Context Size: 64KB
├── Review Agent:
│   ├── Read: Source files only
│   ├── Write: Denied
│   ├── Delete: Denied
│   └── Context Size: 64KB
└── General Agent:
    ├── Read: All files
    ├── Write: With confirmation
    ├── Delete: With confirmation
    └── Context Size: 96KB
```

### 6.6 Code Analysis Engine

```typescript
// Code Parser & Analyzer
interface CodeAnalyzer {
  // Parsing
  parseFile(filePath: string): Promise<AST>;
  extractSymbols(code: string, language: string): Promise<Symbol[]>;
  extractImports(code: string): Promise<ImportStatement[]>;
  
  // Analysis
  analyzeComplexity(code: string): Promise<ComplexityMetrics>;
  findSecurityIssues(code: string): Promise<SecurityIssue[]>;
  checkCodeQuality(code: string): Promise<QualityReport>;
  detectDependencies(projectPath: string): Promise<DependencyGraph>;
  
  // Intelligence
  suggestImprovements(code: string): Promise<Suggestion[]>;
  findDeadCode(projectPath: string): Promise<string[]>;
  detectCodeSmells(code: string): Promise<CodeSmell[]>;
}

interface Symbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'constant' | 'variable';
  range: {
    start: Position;
    end: Position;
  };
  documentation?: string;
  isExported: boolean;
}

// Supported Parsers
├── Tree-sitter (Fast, accurate for 30+ languages)
├── @babel/parser (JavaScript/TypeScript)
├── @python-parser (Python)
├── swc (Rust-based, multi-language)
└── Language-specific LSP servers for deep analysis
```

---

## 7. DIRECTORY STRUCTURE

```
lumecode/
├── README.md
├── CONTRIBUTING.md
├── LICENSE (MIT)
├── package.json
├── tsconfig.json
├── .github/
│   ├── workflows/
│   │   ├── ci.yml (tests, linting)
│   │   ├── release.yml (publish)
│   │   └── security.yml (audit)
│   └── ISSUE_TEMPLATE/
│
├── src/
│   ├── index.ts (entry point)
│   ├── cli.ts (CLI parsing)
│   │
│   ├── agents/
│   │   ├── index.ts (agent registry)
│   │   ├── agent.base.ts (base agent class)
│   │   ├── build.agent.ts (build agent implementation)
│   │   ├── plan.agent.ts (plan agent implementation)
│   │   ├── review.agent.ts (review agent implementation)
│   │   └── general.agent.ts (general agent implementation)
│   │
│   ├── providers/
│   │   ├── index.ts (provider registry)
│   │   ├── provider.base.ts (base provider class)
│   │   ├── provider.anthropic.ts (Claude)
│   │   ├── provider.openai.ts (GPT)
│   │   ├── provider.google.ts (Gemini)
│   │   ├── provider.groq.ts (Groq)
│   │   ├── provider.ollama.ts (Local models)
│   │   └── provider.huggingface.ts (HuggingFace)
│   │
│   ├── lsp/
│   │   ├── index.ts (LSP manager)
│   │   ├── manager.ts (LSP lifecycle)
│   │   ├── detector.ts (language detection)
│   │   ├── loaders/
│   │   │   ├── typescript-loader.ts
│   │   │   ├── python-loader.ts
│   │   │   ├── go-loader.ts
│   │   │   └── ... (other language loaders)
│   │   └── types.ts (LSP types)
│   │
│   ├── filesystem/
│   │   ├── index.ts (virtual FS)
│   │   ├── vfs.ts (VFS implementation)
│   │   ├── permissions.ts (permission checks)
│   │   ├── analyzer.ts (project analysis)
│   │   └── git.ts (git integration)
│   │
│   ├── analysis/
│   │   ├── code-analyzer.ts (code analysis)
│   │   ├── parser.ts (AST parsing)
│   │   ├── complexity.ts (complexity metrics)
│   │   ├── security.ts (security checks)
│   │   └── quality.ts (code quality)
│   │
│   ├── session/
│   │   ├── index.ts (session manager)
│   │   ├── manager.ts (CRUD operations)
│   │   ├── storage.ts (SQLite storage)
│   │   ├── sharing.ts (session sharing)
│   │   └── types.ts (session types)
│   │
│   ├── context/
│   │   ├── builder.ts (context building)
│   │   ├── file-context.ts (file context)
│   │   ├── workspace-context.ts (workspace context)
│   │   └── git-context.ts (git context)
│   │
│   ├── engine/
│   │   ├── index.ts (core engine)
│   │   ├── processor.ts (request processing)
│   │   ├── response-handler.ts (response handling)
│   │   ├── error-handler.ts (error handling)
│   │   └── rate-limiter.ts (rate limiting)
│   │
│   ├── ui/
│   │   ├── tui/ (Terminal UI - Go + Bubble Tea)
│   │   │   ├── main.go
│   │   │   ├── models/
│   │   │   ├── views/
│   │   │   │   ├── chat.go
│   │   │   │   ├── agent-select.go
│   │   │   │   ├── model-select.go
│   │   │   │   ├── file-explorer.go
│   │   │   │   └── settings.go
│   │   │   └── components/ (Lip Gloss components)
│   │   │
│   │   ├── desktop/ (Electron App)
│   │   │   ├── main.ts
│   │   │   ├── preload.ts
│   │   │   └── src/
│   │   │       ├── App.tsx
│   │   │       ├── pages/
│   │   │       ├── components/
│   │   │       ├── hooks/
│   │   │       └── styles/
│   │   │
│   │   └── vscode-ext/ (VS Code Extension)
│   │       ├── extension.ts
│   │       ├── views/
│   │       └── commands/
│   │
│   ├── config/
│   │   ├── default.config.ts (defaults)
│   │   ├── loader.ts (config loading)
│   │   └── types.ts (config types)
│   │
│   ├── logger/
│   │   ├── index.ts
│   │   └── pino-config.ts
│   │
│   ├── types/
│   │   ├── index.ts (main types)
│   │   ├── agent.ts (agent types)
│   │   ├── provider.ts (provider types)
│   │   ├── session.ts (session types)
│   │   └── llm.ts (LLM types)
│   │
│   └── utils/
│       ├── validators.ts
│       ├── formatters.ts
│       ├── parsers.ts
│       └── helpers.ts
│
├── test/
│   ├── unit/
│   │   ├── agents/
│   │   ├── providers/
│   │   ├── session/
│   │   └── ...
│   ├── integration/
│   │   ├── agent-provider-flow.test.ts
│   │   ├── session-persistence.test.ts
│   │   └── ...
│   └── fixtures/
│       ├── sample-projects/
│       └── mocks/
│
├── docs/
│   ├── README.md
│   ├── INSTALLATION.md
│   ├── ARCHITECTURE.md (detailed)
│   ├── API.md (API reference)
│   ├── PROVIDERS.md (provider setup)
│   ├── LSP.md (LSP configuration)
│   ├── AGENTS.md (agent details)
│   ├── SESSIONS.md (session management)
│   ├── CONTRIBUTING.md
│   └── DEVELOPMENT.md
│
├── examples/
│   ├── basic-usage.ts
│   ├── custom-agent.ts
│   ├── provider-setup.ts
│   └── session-sharing.ts
│
├── scripts/
│   ├── build.sh (build project)
│   ├── release.sh (release script)
│   ├── install-lsp.sh (install language servers)
│   └── setup-dev.sh (dev environment setup)
│
├── .env.example
├── .eslintrc.json
├── .prettier.json
└── .gitignore
```

---

## 8. FEATURE SPECIFICATIONS

### 8.1 Core Features (MVP)

#### 1. Multi-Session Support
- **Description**: Run multiple agents in parallel on different projects
- **Implementation**:
  ```typescript
  // User can have multiple sessions running
  lumecode new session --name "project-a" --agent build
  lumecode new session --name "project-b" --agent plan
  lumecode switch project-a
  ```
- **Storage**: SQLite stores session state
- **Requirements**: Session isolation, message persistence

#### 2. Multi-Agent System
- **Description**: Switch between agents with different capabilities
- **Implementation**: Tab key to switch agents in real-time
- **Requirements**: Agent registry, permission system

#### 3. Provider Abstraction
- **Description**: Support 75+ LLM providers
- **Implementation**: Plugin architecture for providers
- **Requirements**: Provider interface, authentication, error handling

#### 4. LSP Integration
- **Description**: Auto-load language servers for code intelligence
- **Implementation**: LSP manager detects language and loads appropriate server
- **Requirements**: LSP server binaries, protocol implementation

#### 5. Session Sharing
- **Description**: Share sessions via unique links for collaboration
- **Implementation**: Generate shareable tokens, host web viewer
- **Requirements**: Token generation, session encryption, web server

#### 6. File Context Management
- **Description**: Intelligently select files for context
- **Implementation**: Show file tree, allow user to select which files to include
- **Requirements**: VFS abstraction, file selection UI

### 8.2 Advanced Features (Phase 2)

#### 1. Code Analysis Dashboard
- Real-time code metrics
- Security vulnerability detection
- Code quality scores
- Dependency visualization

#### 2. IDE Extensions
- VS Code extension
- Neovim plugin
- IntelliJ IDEA plugin

#### 3. Git Integration
- Commit message generation
- PR review assistance
- Diff viewing
- Branch analysis

#### 4. Debugging Support
- Breakpoint setting
- Variable inspection
- Stack trace analysis
- Debug console

#### 5. Custom Agent Builder
- Allow users to create custom agents
- Define permissions, system prompts
- Share agents with team

---

## 9. AGENT SYSTEM DETAILS

### Agent Initialization Flow

```
User starts lumecode
    ↓
Load session configuration
    ↓
Initialize default agent (Build)
    ↓
Load agent system prompt
    ↓
Build initial context (files, workspace info)
    ↓
Connect to LLM provider
    ↓
Show chat interface
    ↓
Ready for user input
```

### Agent Context Building

```
When user sends a message:
    ↓
Parse user input
    ↓
Build agent system prompt (role, permissions)
    ↓
Gather file context (selected files + imports)
    ↓
Gather workspace context (project structure, dependencies)
    ↓
Build git context (current branch, recent commits, diffs)
    ↓
Build conversation history (recent messages)
    ↓
Construct final prompt:
    ├── System prompt (agent role)
    ├── Context (files, workspace, git)
    ├── Conversation history
    └── User message
    ↓
Send to LLM
    ↓
Stream response
    ↓
Parse response for code blocks, commands
    ↓
Display in UI
    ↓
(Build agent) Apply changes if requested
```

### Agent Capabilities Matrix

```
Feature                 | Build | Plan | Review | General
────────────────────────┼───────┼──────┼────────┼─────────
Read Files              │  ✓    │  ✓   │   ✓    │   ✓
Write Files             │  ✓    │  ✗   │   ✗    │   ✓*
Delete Files            │  ✓    │  ✗   │   ✗    │   ✗
Create Directories      │  ✓    │  ✗   │   ✗    │   ✗
Run Commands            │  ✓    │  ✓*  │   ✗    │   ✓*
Access Network          │  ✗    │  ✗   │   ✗    │   ✗
Modify Git History      │  ✓    │  ✗   │   ✗    │   ✗
Suggest Changes         │  ✓    │  ✓   │   ✓    │   ✓
Create Tests            │  ✓    │  ✗   │   ✗    │   ✓*
Performance Analysis    │  ✓    │  ✓   │   ✓    │   ✓
Security Analysis       │  ✓    │  ✓   │   ✓    │   ✓
Refactoring             │  ✓    │  ✓   │   ✗    │   ✓*

Legend: ✓ = Full permission, ✗ = No permission, * = With confirmation
```

---

## 10. CONFIGURATION & INSTALLATION

### Installation Methods

```bash
# Quick install (curled script)
curl -fsSL https://lumecode.dev/install | bash

# Package managers
npm i -g lumecode
brew install lumecode (macOS/Linux)
choco install lumecode (Windows)
pacman -S lumecode (Arch)

# From source
git clone https://github.com/yourusername/lumecode
cd lumecode
npm install
npm run build
npm link
```

### Configuration File (`~/.lumecode/config.toml`)

```toml
[core]
editor = "vim" # or "nano", "code"
theme = "dark" # or "light"
default_agent = "build"
context_size = 8192
max_sessions = 5

[providers]
# Anthropic (Claude)
[providers.anthropic]
api_key = "${ANTHROPIC_API_KEY}"
enabled = true
default = true

# OpenAI (GPT)
[providers.openai]
api_key = "${OPENAI_API_KEY}"
enabled = true

# Groq
[providers.groq]
api_key = "${GROQ_API_KEY}"
enabled = true

# Ollama (Local)
[providers.ollama]
base_url = "http://localhost:11434"
enabled = true

[ui]
# TUI Settings
tui_style = "minimal" # or "rich"
show_line_numbers = true
syntax_highlighting = true
word_wrap = true

# Desktop App Settings
window_width = 1400
window_height = 900
font_size = 14
font_family = "Fira Code"

[session]
auto_save = true
save_interval_seconds = 30
max_history_length = 1000
session_dir = "~/.lumecode/sessions"

[lsp]
auto_install = true
check_updates = true
languages = ["typescript", "python", "go", "rust"]

[privacy]
send_analytics = false
send_crash_reports = false
store_local_only = true

[dev]
debug = false
log_level = "info" # debug, info, warn, error
```

### Environment Variables

```bash
# Core
LUMECODE_HOME=~/.lumecode (custom home directory)
LUMECODE_CONFIG=/path/to/config.toml (custom config)

# Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
GROQ_API_KEY=gsk-...
HF_TOKEN=hf_...

# LLM Settings
LLM_MODEL=claude-opus (default model)
LLM_PROVIDER=anthropic (default provider)

# LSP
LSP_TIMEOUT=30000 (milliseconds)
LSP_DEBUG=false

# UI
LUMECODE_THEME=dark (dark, light)
LUMECODE_EDITOR=vim
```

### CLI Commands

```bash
# Session Management
lumecode new <name>              # Create new session
lumecode list                    # List all sessions
lumecode open <name>             # Open existing session
lumecode delete <name>           # Delete session
lumecode export <name> <file>    # Export session
lumecode share <name>            # Get share link

# Configuration
lumecode config list             # Show config
lumecode config set <key> <val>  # Set config
lumecode config edit             # Edit config file
lumecode setup                   # Interactive setup wizard

# Providers & Models
lumecode models list             # List available models
lumecode providers list          # List configured providers
lumecode providers auth <name>   # Authenticate provider
lumecode providers test <name>   # Test provider connection

# LSP
lumecode lsp list                # List installed language servers
lumecode lsp install <lang>      # Install language server
lumecode lsp update              # Update all language servers

# Development
lumecode --version               # Show version
lumecode --help                  # Show help
lumecode --debug                 # Run in debug mode
```

---

## 11. DATA FLOW & INTERACTIONS

### Message Flow Diagram

```
User Input
    ↓
┌─────────────────────────────────────────┐
│ CLI Input Handler (TUI)                 │
│ - Parse message                         │
│ - Handle special commands (/help, etc.) │
│ - Extract file selections               │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Session Manager                         │
│ - Load session context                  │
│ - Get conversation history              │
│ - Get selected files                    │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Context Builder                         │
│ - Build file context                    │
│ - Build workspace context               │
│ - Build git context                     │
│ - Validate context size                 │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Agent System                            │
│ - Load agent (build, plan, etc.)        │
│ - Build system prompt                   │
│ - Apply agent permissions               │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Request Constructor                     │
│ - Combine: system prompt                │
│           + context                     │
│           + history                     │
│           + user message                │
│ - Validate token count                  │
│ - Apply rate limiting                   │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ LLM Provider Manager                    │
│ - Select provider & model               │
│ - Authenticate                          │
│ - Format request for provider           │
│ - Stream response                       │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Response Parser                         │
│ - Parse LLM response                    │
│ - Extract code blocks                   │
│ - Extract commands                      │
│ - Extract file modifications            │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Agent Action Handler                    │
│ - Check agent permissions               │
│ - Ask for confirmation if needed        │
│ - Execute actions (file writes, etc.)   │
│ - Collect execution output              │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ UI Rendering                            │
│ - Render message in chat                │
│ - Show code blocks with syntax coloring │
│ - Show status of actions                │
│ - Update file tree if files changed     │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Session Persistence                     │
│ - Save message to DB                    │
│ - Save file context                     │
│ - Update session metadata               │
└─────────────────────────────────────────┘
    ↓
Ready for next input
```

### File Modification Flow

```
Agent decides to modify file
    ↓
Parse code block from response
    ├── Extract file path
    ├── Extract action (create/update/delete)
    └── Extract code content
    ↓
┌─────────────────────────────────────────┐
│ Permission Check                        │
│ - Check agent capabilities              │
│ - Check file permissions                │
│ - Check if path is safe                 │
└─────────────────────────────────────────┘
    ↓
    ├─ Permission denied? → Show error
    ├─ Requires confirmation? → Ask user
    └─ All clear? → Continue
    ↓
┌─────────────────────────────────────────┐
│ File Operations                         │
│ - Read existing file (if update)        │
│ - Generate diff                         │
│ - Apply changes                         │
│ - Validate syntax (if parser available) │
│ - Run formatting                        │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Post-Modification Actions               │
│ - Run LSP diagnostics                   │
│ - Run linters if available              │
│ - Run tests if specified                │
│ - Collect output                        │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ UI Update                               │
│ - Show file in chat (with diff)         │
│ - Show diagnostics/errors               │
│ - Update file tree                      │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Conversation Update                     │
│ - Add to conversation history           │
│ - Include execution results             │
│ - Ready for user response               │
└─────────────────────────────────────────┘
```

---

## 12. IMPLEMENTATION ROADMAP

### Phase 1: MVP (Months 1-2)
**Goal**: Core functionality working, basic UI, single provider support

- [ ] Core engine & agent system
- [ ] Basic TUI (chat interface, agent selection)
- [ ] Session management (create, list, open)
- [ ] Single provider (Anthropic Claude)
- [ ] File context management (read-only initially)
- [ ] Build agent (full file access)
- [ ] Plan agent (read-only)
- [ ] Basic LSP support (TypeScript/Python)
- [ ] SQLite session storage
- [ ] Installation script

**Deliverable**: Working `lumecode` CLI that can chat, read files, modify files

### Phase 2: Core Features (Months 2-3)
**Goal**: Multi-provider, more agents, better UI, sharing

- [ ] Multi-provider support (OpenAI, Google, Groq, Ollama)
- [ ] Review agent
- [ ] General agent
- [ ] Session sharing (unique links)
- [ ] Enhanced TUI (better layout, more interactions)
- [ ] File explorer in TUI
- [ ] Model selector UI
- [ ] LSP for more languages (Go, Rust, Java, C++)
- [ ] Code analysis integration
- [ ] Error recovery & retries
- [ ] Rate limiting

**Deliverable**: Feature-complete CLI with multiple agents and providers

### Phase 3: Advanced Features (Months 3-4)
**Goal**: Desktop app, IDE extensions, advanced features

- [ ] Desktop app (Electron)
- [ ] VS Code extension
- [ ] Neovim plugin
- [ ] Git integration
- [ ] Code quality metrics dashboard
- [ ] Custom agent builder
- [ ] Session analytics
- [ ] Performance optimizations
- [ ] Security audit features

**Deliverable**: Multi-interface platform (CLI, Desktop, IDE)

### Phase 4: Polish & Community (Month 4+)
**Goal**: Production-ready, great documentation, community

- [ ] Comprehensive documentation
- [ ] Tutorial videos
- [ ] Community Discord
- [ ] Contribution guidelines
- [ ] Issue templates
- [ ] CI/CD pipeline
- [ ] Pre-built binaries for all platforms
- [ ] Telemetry & analytics (optional)

**Deliverable**: Production-ready open-source project

---

## TECHNICAL NOTES FOR CLAUDE OPUS

### When Building Each Component

#### 1. **Agent System**
- Use class inheritance: `BaseAgent` → specific agents
- Implement permission checking as decorators
- Make system prompts externalized (in JSON files)
- Use TypeScript enums for agent types

#### 2. **Provider Abstraction**
- Create `ILLMProvider` interface
- Implement adapter pattern
- Handle provider-specific error codes
- Implement streaming response handling
- Add retry logic with exponential backoff

#### 3. **Session Management**
- Use SQLite with better-sqlite3 for sync operations
- Implement optimistic locking for concurrent access
- Add session migration utilities
- Compress conversation history for large sessions

#### 4. **UI Components**
- For TUI: Use Bubble Tea (Go) - more performant than Node
- For Desktop: Use React + TypeScript
- Implement keyboard navigation throughout
- Add loading states and error boundaries

#### 5. **LSP Integration**
- Cache LSP servers after first load
- Implement timeout handling
- Add fallback behavior if LSP unavailable
- Use child_process for LSP communication

#### 6. **File Operations**
- Implement proper error handling
- Add file backup before modification
- Use atomic operations where possible
- Implement undo/redo for file changes

### Code Quality Standards

```typescript
// Type Safety
├── Use strict TypeScript mode
├── Define interfaces for all APIs
├── No `any` types unless justified
└── Use discriminated unions for variants

// Error Handling
├── Custom error classes for domain errors
├── Proper error logging
├── User-friendly error messages
└── Graceful degradation

// Testing
├── Unit tests for business logic
├── Integration tests for workflows
├── E2E tests for critical paths
└── Test coverage minimum: 80%

// Documentation
├── JSDoc for all public functions
├── README in each major directory
├── Architecture decision records (ADRs)
└── Example code in docs/

// Performance
├── Monitor token usage
├── Cache expensive operations
├── Implement request batching
└── Optimize file I/O
```

### Key Implementation Files to Start With

1. **`src/types/index.ts`** - Define all types first
2. **`src/agents/agent.base.ts`** - Base agent class
3. **`src/providers/provider.base.ts`** - Base provider class
4. **`src/session/storage.ts`** - SQLite schema and operations
5. **`src/context/builder.ts`** - Context building logic
6. **`src/engine/processor.ts`** - Core message processing
7. **`src/ui/tui/main.go`** or **`src/cli.ts`** - CLI entry point

### Testing Strategy

```typescript
// Unit Tests
- Agent permission checking
- Provider request/response formatting
- Session CRUD operations
- Context building logic
- File permission validation

// Integration Tests
- Agent → Provider flow
- Session persistence
- Message streaming
- File modifications

// E2E Tests
- Full conversation flow
- File creation/modification
- Session sharing
- Multi-agent switching
```

---

## APPENDIX: COMMAND REFERENCE

### Create `lumecode` Command Catalog

```bash
# Session Commands
lumecode                          # Open last session
lumecode new <name>               # Create new session
lumecode open <name>              # Open session by name
lumecode list                     # List all sessions
lumecode delete <name>            # Delete session
lumecode rename <old> <new>       # Rename session
lumecode sessions                 # Alias for list

# Chat in Session
lumecode chat <message>           # Send message in current session
lumecode read <file>              # Load file for context
lumecode unread <file>            # Remove file from context
lumecode files                    # Show selected files
lumecode clear                    # Clear conversation

# Agent Control
lumecode agent                    # Show current agent
lumecode agent set <type>         # Switch agent (build, plan, etc.)
lumecode agents                   # List available agents

# Model Control
lumecode model                    # Show current model
lumecode model set <model>        # Change model
lumecode models                   # List available models
lumecode providers                # List providers

# Session Sharing
lumecode share                    # Generate share link
lumecode unshare                  # Revoke share link
lumecode share list               # List shared sessions

# Configuration
lumecode config                   # Show current config
lumecode config set <key> <val>   # Set config value
lumecode config edit              # Edit config file
lumecode setup                    # Initial setup wizard

# Development
lumecode --version                # Show version
lumecode --help                   # Show help
lumecode --debug                  # Debug mode
lumecode --loglevel <level>       # Set log level
```

---

## CONCLUSION

**Lumecode** combines the best practices from OpenCode (UI, architecture, LSP) and Crush (Bubble Tea elegance, provider abstraction) to create a next-generation AI coding agent.

### Key Differentiators:
1. **Beautiful TUI** using Charm's design language
2. **Provider-agnostic** with 75+ LLM support
3. **Agent-based** with role-specific capabilities
4. **Privacy-first** - all code stays local
5. **Production-ready** from day one

**Ready to build with Claude Opus!**

For detailed implementation guidance, provide Claude Opus with this specification and any specific component you want to start with.
