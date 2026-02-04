# 🔮 Lumecode

> AI-powered coding that's private, open, and beautiful in your terminal.

Lumecode is an open-source AI coding agent that combines the best of modern terminal UIs with powerful LLM capabilities. It's designed to be **privacy-first**, **provider-agnostic**, and **developer-friendly**.

## ✨ Features

- **🎯 Multi-Agent System** - Specialized agents for different tasks:
  - **Build Agent** 🔨 - Full access for implementation (read/write/execute)
  - **Plan Agent** 📋 - Architecture planning and code exploration
  - **Review Agent** 🔍 - Code review and security analysis
  - **General Agent** ✨ - Versatile assistant for any task

- **🌐 Multiple LLM Providers** - Priority-ordered free providers:
  1. **Google Gemini** (Primary) - Free tier with 1M context
  2. **OpenRouter** - Access to 100+ models, many free
  3. **Groq** - Ultra-fast inference, free tier
  4. **Ollama** - Local-first, completely private

- **💾 Session Persistence** - SQLite-backed chat history with search
- **📁 Intelligent Context** - Auto-selects relevant files for context
- **🎨 Beautiful TUI** - React-based terminal interface with Ink
- **⚡ Bun Runtime** - Fast startup and execution

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+ (`curl -fsSL https://bun.sh/install | bash`)
- At least one API key (Gemini recommended for free tier)

### Installation

You can run Lumecode directly with `bunx` (recommended) or install it globally.

#### Option 1: Run with bunx (No install required)

```bash
# Initialize a new project
bunx lumecode init

# Start chat in current directory
bunx lumecode
```

#### Option 2: Global Installation

```bash
# Clone and link locally
git clone https://github.com/yourusername/lumecode.git
cd lumecode
bun install
bun run build
bun link

# Now you can use 'lumecode' or 'lc' anywhere
lumecode init
lumecode chat
```

### Auto-Completion

Lumecode supports shell auto-completion for Zsh and Bash.

```bash
# Zsh (add to ~/.zshrc)
source <(lumecode completion)

# Bash (add to ~/.bashrc)
source <(lumecode completion)
```

### Project Initialization

Use the `init` command to set up a new project environment:

```bash
lumecode init
```

This will:
1. Validate system requirements
2. Set up configuration
3. Configure API keys
4. Install dependencies
5. Build the project

### Manual Setup

If you prefer manual setup:

```bash
# Clone the repository
git clone https://github.com/yourusername/lumecode.git
cd lumecode

# Install dependencies
bun install

# Copy and configure environment
cp .env.example .env
# Edit .env and add your API keys
```

### API Keys

Lumecode uses **free-tier providers only**; no paid API keys are required. Add the keys you want to use to `.env`.

| Provider | Env variable | Get key (free) | Free tier |
|----------|--------------|----------------|-----------|
| **Gemini** | `GOOGLE_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | 60 RPM, 1M tokens/min |
| **OpenRouter** | `OPENROUTER_API_KEY` | [OpenRouter](https://openrouter.ai/keys) | Free models (e.g. `google/gemini-2.0-flash-exp:free`) |
| **Groq** | `GROQ_API_KEY` | [Groq Console](https://console.groq.com/keys) | 30 RPM, 15K tokens/min |
| **Ollama** | (none) | Run [Ollama](https://ollama.ai) locally | Always free, local |

**Provider setup:** Set at least one of `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, or `GROQ_API_KEY` in `.env`. If a provider does not appear in `lumecode config --show` or `lumecode providers`, the corresponding env variable is missing—add it and restart the app.

### Usage

```bash
# Start interactive chat
bun run dev

# Or with specific options
bun run dev -- --agent build --provider gemini

# List sessions
bun run dev -- session list

# Check configuration
bun run dev -- config --show

# Check provider availability
bun run dev -- providers --check
```

## 📖 Commands

### Chat Commands (Interactive Mode)

| Command | Description |
|---------|-------------|
| `/help` or `/h` | Show help message |
| `/quit` or `/q` | Exit the chat |
| `/clear` | Clear conversation history |
| `/new [name]` | Start a new session |
| `/agent <role>` | Switch agent (build, plan, review, general) |
| `/provider <name>` | Switch provider (gemini, openrouter, groq, ollama) |
| `/status` | Show current status |

### CLI Commands

```bash
# Start chat (default)
lumecode chat --agent build --provider gemini

# Manage sessions
lumecode session list
lumecode session show <id>
lumecode session delete <id>

# Configuration
lumecode config --show
lumecode config --provider gemini
lumecode config --agent build

# Provider info
lumecode providers --check
```

## 🏗 Architecture

```
lumecode/
├── src/
│   ├── types/          # TypeScript interfaces
│   ├── config/         # Configuration management
│   ├── providers/      # LLM provider adapters
│   │   ├── base.ts     # Base provider class
│   │   ├── gemini.ts   # Google Gemini
│   │   ├── openrouter.ts # OpenRouter
│   │   ├── groq.ts     # Groq
│   │   └── ollama.ts   # Ollama (local)
│   ├── agents/         # Agent system
│   │   ├── base.ts     # Base agent class
│   │   ├── build.ts    # Build agent
│   │   └── prompts.ts  # System prompts
│   ├── session/        # SQLite session storage
│   ├── filesystem/     # File operations & git
│   ├── context/        # Context builder
│   ├── engine/         # Core processor
│   ├── cli/            # CLI interface
│   ├── ui/             # TUI components (Ink/React)
│   └── utils/          # Helper functions
```

## 🔧 Configuration

### Environment Variables

```bash
# Provider API Keys (in priority order)
GOOGLE_API_KEY=your_gemini_key
OPENROUTER_API_KEY=your_openrouter_key
GROQ_API_KEY=your_groq_key

# Optional
OLLAMA_BASE_URL=http://localhost:11434

# App Settings
LUMECODE_DEFAULT_PROVIDER=gemini
LUMECODE_LOG_LEVEL=info
LUMECODE_DATA_DIR=~/.lumecode
```

### Config File

Settings are stored in `~/.lumecode/config.json`. API keys are NOT stored in the config file for security.

## 🧩 Agent Capabilities

| Agent | Read Files | Write Files | Execute Commands | Network |
|-------|------------|-------------|------------------|---------|
| **Build** | ✅ | ✅ | ✅ | ✅ |
| **Plan** | ✅ | ❌ (confirm) | ✅ (confirm) | ✅ |
| **Review** | ✅ | ❌ | ❌ | ❌ |
| **General** | ✅ | ✅ (confirm) | ✅ (confirm) | ✅ |

## 🎨 TUI Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+C` | Exit |
| `Tab` | Switch agent |
| `Ctrl+N` | New session |
| `Ctrl+L` | Clear screen |
| `Ctrl+P` | Switch provider |
| `Ctrl+M` | Switch model |
| `?` | Toggle help |
| `Esc` | Close panels |

## 🛠 Development

```bash
# Run in development mode
bun run dev

# Type check
bun run typecheck

# Build
bun run build

# Run tests
bun test
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Inspired by [OpenCode](https://github.com/opencode) and [Crush](https://github.com/charmbracelet)
- Built with [Ink](https://github.com/vadimdemedes/ink) for terminal UI
- Uses [Bun](https://bun.sh) for fast JavaScript runtime

---

<p align="center">
  Made with 💜 by the Lumecode community
</p>
