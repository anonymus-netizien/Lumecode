```
██╗     ██╗   ██╗███╗   ███╗███████╗ ██████╗ ██████╗ ██████╗ ███████╗
██║     ██║   ██║████╗ ████║██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝
██║     ██║   ██║██╔████╔██║█████╗  ██║     ██║   ██║██║  ██║█████╗  
██║     ██║   ██║██║╚██╔╝██║██╔══╝  ██║     ██║   ██║██║  ██║██╔══╝  
███████╗╚██████╔╝██║ ╚═╝ ██║███████╗╚██████╗╚██████╔╝██████╔╝███████╗
╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
```

# Lumecode

**AI-powered coding that's private, open, and beautiful in your terminal.**

---

## What is Lumecode?

Lumecode is an open-source AI coding assistant that runs entirely in your terminal. It combines a beautiful React-based TUI with powerful LLM capabilities, giving you an intelligent pair programmer without ever leaving the command line.

Unlike cloud-dependent alternatives, Lumecode is **provider-agnostic** — you choose which LLM to use, from free cloud APIs like Gemini and Groq to fully local models via Ollama. Your code stays on your machine, and your prompts go where *you* decide.

Built for developers who live in the terminal, Lumecode features a **multi-agent system** with specialized agents for different tasks: Build for implementation, Plan for architecture, Review for code analysis, and General for everyday assistance. Each agent has calibrated tool access and system prompts optimized for its role.

---

## Features

### 🤖 Multi-Agent System
Four specialized agents with distinct capabilities:
- **Build Agent** — Full filesystem and terminal access for implementation
- **Plan Agent** — Read-only analysis for architecture planning
- **Review Agent** — Code review focused, no write access
- **General Agent** — Versatile assistant with confirmation prompts

### 🌐 Provider Agnostic
Switch between LLM providers on the fly:
- **Gemini** — Google's flagship model with 1M token context (free tier)
- **OpenRouter** — Access 100+ models including free options
- **Groq** — Ultra-fast inference with Llama models (free tier)
- **Ollama** — Fully local, completely private

### 🛠️ 6 Built-in Tools
| Category | Tools |
|----------|-------|
| File Operations | `file_read`, `file_write`, `file_edit` |
| Directory | `directory_list` |
| Search | `search_files` |
| Terminal | `terminal_execute` |

### 📡 LiveSync
Real-time file watcher powered by chokidar. See file changes reflected in the status bar as you work.

### 🔌 MCP Support
Model Context Protocol integration allows connecting external tool servers. MCP tools are discovered at startup and appear alongside built-in tools.

### 💾 SQLite Sessions
Persistent chat history with full-text search. Sessions are stored in `~/.lumecode/lumecode.db` and survive restarts.

### 🎨 Beautiful TUI
React-based terminal interface using Ink. Features streaming responses, tool call indicators, and responsive layouts.

---

## Quick Start

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Bun | ≥ 1.0.0 |
| Node.js | ≥ 18 (for some dependencies) |
| Operating System | macOS, Linux, Windows (WSL) |

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/lumecode.git
cd lumecode

# Install dependencies
bun install

# Build the project
bun run build
```

### First Run

```bash
# Development mode (recommended for first run)
bun run dev

# Or run the built version
bun run dist/index.js
```

### Set API Keys

API keys are set via environment variables. Create a `.env` file in the project root:

```bash
# Copy the example
cp .env.example .env

# Edit and add your keys
```

Or set keys interactively using slash commands:

```bash
# In the TUI, use:
/key gemini your-google-api-key-here
/key openrouter sk-or-v1-your-key-here
/key groq gsk_your-key-here
```

---

## Agents

| Agent | Shortcut | Access | Best For |
|-------|----------|--------|----------|
| **Build** | `b` | Full read/write/execute | Implementation, creating files, running commands |
| **Plan** | `p` | Read-only + confirmation | Architecture planning, code exploration |
| **Review** | `r` | Read-only | Code review, security analysis, finding bugs |
| **General** | `g` | Full with confirmation | General questions, versatile assistance |

---

## Providers

| Provider | Models | Free Tier | Speed |
|----------|--------|-----------|-------|
| **Gemini** | gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash | ✅ 60 RPM, 1M tokens/min | Fast |
| **OpenRouter** | google/gemini-2.0-flash:free, meta-llama/llama-3.2-3b-instruct:free, meta-llama/llama-3.1-405b-instruct:free, + 100s more | ✅ Free models available | Varies |
| **Groq** | llama-3.3-70b-versatile, llama-3.1-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768, gemma2-9b-it | ✅ 30 RPM | Ultra-fast |
| **Ollama** | llama3.2, codellama, deepseek-coder-v2, qwen2.5-coder, mistral, phi3 | ✅ Always free (local) | Depends on hardware |

---

## Keybindings

| Key | Action |
|-----|--------|
| `Ctrl+C` | Exit |
| `Tab` | Toggle agent selector |
| `Ctrl+P` | Toggle provider selector |
| `Ctrl+O` | Toggle model selector |
| `Ctrl+N` | New session |
| `Ctrl+L` | Clear conversation |
| `Ctrl+T` | Toggle cost details |
| `?` | Toggle help panel |
| `Esc` | Close all panels |

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/help`, `/h` | Show help panel |
| `/quit`, `/q`, `/exit` | Exit Lumecode |
| `/clear` | Clear conversation history |
| `/new` | Start a new session |
| `/agent <role>` | Switch agent (build, plan, review, general) |
| `/provider <name>` | Switch provider (gemini, openrouter, groq, ollama) |
| `/model <name>` | Switch model |
| `/models` | List available models for current provider |
| `/status` | Show current agent, provider, model, tokens |
| `/tools` | List available tools |
| `/ls [path]`, `/dir [path]` | List directory contents |
| `/cat <file>`, `/read <file>` | Read file contents |
| `/search <pattern>`, `/grep <pattern>` | Search files for pattern |
| `/run <cmd>`, `/exec <cmd>` | Execute shell command |

---

## Project Structure

```
lumecode/
├── src/
│   ├── agents/           # Agent system (build, plan, review, general)
│   ├── cli/              # Commander-based CLI
│   ├── config/           # Configuration management
│   ├── context/          # Context builder for LLM requests
│   ├── engine/           # Core orchestrator
│   ├── filesystem/       # File operations
│   ├── hooks/            # React hooks (useLiveSync)
│   ├── mcp/              # Model Context Protocol integration
│   ├── providers/        # LLM provider adapters
│   ├── security/         # Permission and command filtering
│   ├── session/          # SQLite session storage
│   ├── tools/            # Tool registry and implementations
│   ├── types/            # TypeScript interfaces
│   ├── ui/               # TUI components (Ink/React)
│   └── utils/            # Helper functions
├── config/               # Configuration files
├── tests/                # Test files
├── docs/                 # Documentation
├── dist/                 # Built output
├── package.json
├── tsconfig.json
└── bun.lock
```

---

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `defaultProvider` | `gemini` | Provider used on startup |
| `defaultAgent` | `build` | Agent used on startup |
| `dataDir` | `~/.lumecode` | Data directory for sessions and config |
| `logLevel` | `info` | Logging level (debug, info, warn, error) |
| `theme` | `dark` | UI theme |
| `telemetry` | `false` | Telemetry collection |

**Config file location:** `~/.lumecode/config.json`

**Sessions database:** `~/.lumecode/lumecode.db`

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_API_KEY` or `GEMINI_API_KEY` | Google Gemini API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `GROQ_API_KEY` | Groq API key |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `LUMECODE_DEFAULT_PROVIDER` | Override default provider |
| `LUMECODE_LOG_LEVEL` | Override log level |
| `LUMECODE_DATA_DIR` | Override data directory |
| `LUMECODE_TELEMETRY` | Enable/disable telemetry |

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code:
- Passes `bun run typecheck`
- Passes `bun test`
- Follows the existing code style

---

## License

MIT License — see [LICENSE](../LICENSE) for details.

---

<p align="center">
Made with 💜 for developers who live in the terminal
</p>
