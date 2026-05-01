# Changelog

All notable changes to Lumecode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **AppContext** — Centralized React context for all TUI state management
- **Stream cancellation** — Press `Esc` to stop in-flight LLM requests via AbortController
- **LiveSync** — Real-time file watcher using chokidar to track filesystem changes
- **MCP tools** — Model Context Protocol tools integration into Tool Registry
- **Tool call badges** — Orange `[⚡ tool_name()]` indicator while streaming tool calls
- **Session restore** — Previous session loads automatically on startup
- **Agent system** — Four specialized agents: Build, Plan, Review, General
- **Provider system** — Support for Gemini, OpenRouter, Groq, and Ollama
- **SQLite persistence** — Sessions and messages stored in `~/.lumecode/lumecode.db`
- **Config management** — JSON config at `~/.lumecode/config.json`
- **Slash commands** — `/help`, `/clear`, `/agent`, `/model`, `/provider`, `/key`, `/status`, `/quit`
- **Keybindings** — `Ctrl+C` exit, `Esc` cancel, `Tab` switch focus, `a` agent menu, `m` model menu, `?` help
- **Beautiful TUI** — React/Ink terminal interface with Welcome screen, Chat view, and overlays
- **Context builder** — Automatic file tree and git info injection into system prompts

### Fixed

- **API key whitespace** — Keys are now trimmed on save to prevent auth errors
- **OpenRouter HTTP-Referer** — Added required header for OpenRouter API compliance
- **Gemini 429 retry** — Exponential backoff on rate limit errors

### Architecture

- `Engine.processStream()` now accepts `AbortSignal` for stream cancellation
- `Engine.registerMCPTools()` runs during `initialize()` to load MCP tools
- `StatusBar` reflects LiveSync file change count in real-time
- Provider interface standardized across all providers with `chat()`, `chatStream()`, `listModels()`
- Tool registry supports both built-in and MCP tools via unified `execute()` method

---

## [0.1.0] — Initial Release

### Core Features

- Multi-agent AI coding assistant in the terminal
- Provider-agnostic architecture supporting multiple LLM backends
- 6 built-in tools: file_read, file_write, file_edit, directory_list, terminal_execute, search_files
- SQLite-backed session persistence
- React/Ink terminal user interface
- Real-time streaming responses with tool call visualization
- Agent-specific system prompts and tool permissions

### Agents

| Agent | Purpose |
|-------|---------|
| Build | Full access to coding, testing, and deployment |
| Plan | Read-only analysis and planning |
| Review | Code review without modifications |
| General | Conversational with confirmation prompts |

### Providers

| Provider | Type | Authentication |
|----------|------|----------------|
| Gemini | Cloud | API Key |
| OpenRouter | Cloud | API Key |
| Groq | Cloud | API Key |
| Ollama | Local | None |

### Tools

| Tool | Description |
|------|-------------|
| `file_read` | Read file contents with optional line ranges |
| `file_write` | Write content to files with backup option |
| `file_edit` | Make targeted text replacements |
| `directory_list` | List directory contents recursively |
| `terminal_execute` | Execute shell commands |
| `search_files` | Search files with regex patterns |

### TUI Components

- `WelcomeScreen` — Initial project overview display
- `ChatView` — Main conversation interface
- `InputBar` — User input with slash command support
- `StatusBar` — Agent, model, token count display
- `AgentMenu` — Agent selection overlay
- `ModelMenu` — Model selection overlay
- `HelpOverlay` — Keybinding reference

### Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `provider` | `gemini` | Active AI provider |
| `model` | `gemini-2.5-flash` | Active model |
| `agent` | `build` | Active agent |
| `keys.gemini` | — | Gemini API key |
| `keys.openrouter` | — | OpenRouter API key |
| `keys.groq` | — | Groq API key |

### Storage

- Config: `~/.lumecode/config.json`
- Database: `~/.lumecode/lumecode.db`
- Sessions table: `id`, `name`, `created_at`, `updated_at`, `agent`, `provider`, `model`, `working_directory`, `metadata`
- Messages table: `id`, `session_id`, `role`, `content`, `name`, `timestamp`

---

## Version History

| Version | Date | Summary |
|---------|------|---------|
| 0.1.0 | 2024 | Initial release |
