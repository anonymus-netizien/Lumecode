# LUMECODE - Quick Reference & Architecture Decisions

## ARCHITECTURE DECISION RECORD (ADR)

### ADR-001: Language Choice - TypeScript + Go Hybrid

**Decision**: Use TypeScript for backend/core engine and Go for TUI

**Reasoning**:
- TypeScript: Type-safe, rich ecosystem (OpenAI SDK, Anthropic SDK), good for complex logic
- Go: Fast startup time, small binary size, Bubble Tea is the best TUI framework

**Trade-offs**:
- Pro: Best of both worlds (type safety + performance)
- Con: Requires maintaining two codebases (mitigated by clear boundaries)

**Implementation**:
- Core engine in TypeScript
- Server (API) in TypeScript
- TUI in Go
- Desktop in Electron (TypeScript + React)
- IPC: WebSocket between core and TUI

---

### ADR-002: Agent-Based Architecture

**Decision**: Use role-based agents with capability matrix instead of monolithic agent

**Reasoning**:
- Scalable: Easy to add new agents
- Safe: Capability matrix prevents accidental damage
- User-friendly: Users can switch agents based on task

**Implementation**:
- BaseAgent interface with permission system
- Permission checks in every file operation
- Agents pluggable via registry

---

### ADR-003: Session Persistence - SQLite

**Decision**: Use SQLite for local session storage instead of JSON files or in-memory

**Reasoning**:
- ACID compliance: No data loss
- Queryable: Can filter/sort sessions
- Concurrent: Safe for parallel sessions
- No external dependencies: Works offline
- Fast: better-sqlite3 is synchronous and performant

**Schema**:
```sql
sessions (id, name, projectPath, agent, model, provider, createdAt, ...)
messages (id, sessionId, role, content, ...)
file_context (id, sessionId, filePath)
share_tokens (token, sessionId, expiresAt)
```

---

### ADR-004: Context Building Strategy

**Decision**: Build context at request time, not at session load time

**Reasoning**:
- Accuracy: Always fresh file content
- Memory efficient: Don't load all files
- Flexible: User can change file selection mid-conversation
- Smart: Can prioritize relevant files

**Implementation**:
1. User sends message
2. Gather selected files + imports
3. Build file context window (8KB-64KB depending on agent)
4. Combine with conversation history
5. Send to LLM

---

### ADR-005: Provider Abstraction Pattern

**Decision**: Use adapter pattern with shared interface for all LLM providers

**Reasoning**:
- Switching providers becomes trivial
- Testing with mocks is easy
- Future-proof: Can add/remove providers without touching core logic

**Interface**:
```typescript
interface LLMProvider {
  createCompletion(request): Promise<response>
  streamCompletion(request): AsyncIterable<string>
}
```

---

### ADR-006: Code Modification Safety

**Decision**: Always ask for confirmation before modifying files in non-Build agents

**Reasoning**:
- Safety first: Prevents accidental code corruption
- User control: Users know exactly what's being changed
- Audit trail: All modifications are logged

**Implementation**:
- Agent.requiresConfirmation property
- Show diff before applying
- Log all file operations

---

## COMPARISON: OpenCode vs Crush vs Lumecode

```
Feature                    | OpenCode | Crush | Lumecode
──────────────────────────┼──────────┼───────┼──────────
Provider Agnostic          │   ✓      │  ✓    │    ✓
LSP Integration            │   ✓      │  ✗    │    ✓
Multi-Session              │   ✓      │  ✗    │    ✓
Beautiful TUI              │   ✗      │  ✓    │    ✓
Agent System               │   ✓      │  ✗    │    ✓
Session Sharing            │   ✓      │  ✗    │    ✓
Code Quality (Go)          │   ✗      │  ✓    │    ✓
IDE Extensions             │   ✓      │  ✗    │    ✓
Privacy Focus              │   ✓      │  ✓    │    ✓
Minimal UI                 │   ✓      │  ✓    │    ✓

Lumecode = OpenCode capabilities + Crush aesthetics + Better architecture
```

---

## COMPONENT DEPENDENCY GRAPH

```
Entry Point (CLI)
    ↓
┌─────────────────────────────────────────┐
│ Configuration Manager                   │ → .env, config.toml
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Session Manager                         │ → SQLite DB
│  ├─ Session Storage                     │
│  └─ Share Token Manager                 │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Engine Processor (Core Logic)           │
│  ├─ Agent Manager (registry)            │
│  ├─ Provider Manager (registry)         │
│  ├─ Context Builder                     │
│  ├─ Request Constructor                 │
│  └─ Response Handler                    │
└─────────────────────────────────────────┘
    ↓         ↓            ↓
    ↓         ↓            ↓
┌────────┐ ┌────────┐  ┌──────────┐
│ Agents │ │Provider│  │File System│
│        │ │        │  │          │
│Build   │ │OpenAI  │  │VFS       │
│Plan    │ │Claude  │  │Analyzeor │
│Review  │ │Groq    │  │Parser    │
└────────┘ └────────┘  └──────────┘
    ↓
┌─────────────────────────────────────────┐
│ UI Layer (Multiple Frontends)           │
│  ├─ TUI (Go + Bubble Tea)               │
│  ├─ Desktop (Electron + React)          │
│  └─ IDE Extensions (VS Code, Neovim)    │
└─────────────────────────────────────────┘
```

---

## BUILD ORDER (Sequential Dependencies)

1. **Types** (`src/types/index.ts`)
   - All interfaces and types
   - No dependencies

2. **Configuration** (`src/config/`)
   - Config loader
   - Depends on: Types

3. **Providers** (`src/providers/`)
   - BaseProvider
   - Anthropic, OpenAI, Groq, Ollama, etc.
   - Depends on: Types

4. **Agents** (`src/agents/`)
   - BaseAgent
   - Build, Plan, Review, General agents
   - Depends on: Types

5. **File System** (`src/filesystem/`)
   - VirtualFS
   - Parser
   - Analyzer
   - Depends on: Types, Config

6. **LSP** (`src/lsp/`)
   - LSP Manager
   - Language loaders
   - Depends on: Types, Config, File System

7. **Session Storage** (`src/session/storage.ts`)
   - SQLite operations
   - Depends on: Types

8. **Context Builder** (`src/context/`)
   - Builds context for LLM
   - Depends on: Types, File System, LSP

9. **Engine** (`src/engine/`)
   - Core message processor
   - Depends on: All of above

10. **CLI/Server** (`src/cli.ts`, `src/server.ts`)
    - Entry points
    - Depends on: Engine, Config

11. **UI** (`src/ui/`)
    - TUI, Desktop, IDE extensions
    - Depends on: Engine, CLI/Server

---

## FILE SIZE ESTIMATES

```
Backend (TypeScript):
├── src/
│   ├── types/                    ~500 lines
│   ├── agents/                   ~800 lines
│   ├── providers/                ~2000 lines (6 providers)
│   ├── filesystem/               ~1200 lines
│   ├── lsp/                      ~1500 lines
│   ├── session/                  ~800 lines
│   ├── context/                  ~600 lines
│   ├── engine/                   ~1000 lines
│   ├── config/                   ~400 lines
│   ├── utils/                    ~300 lines
│   └── index.ts                  ~100 lines
├── test/                         ~3000 lines
└── Total TypeScript:            ~12,200 lines

TUI (Go):
├── main.go                       ~500 lines
├── models/                       ~800 lines
├── views/                        ~1500 lines
├── components/                   ~1000 lines
└── Total Go:                     ~3,800 lines

Desktop (Electron + React):
├── main/electron.ts              ~400 lines
├── renderer/App.tsx              ~200 lines
├── components/                   ~1000 lines
├── hooks/                        ~400 lines
├── pages/                        ~800 lines
└── Total Desktop:                ~2,800 lines

Documentation:
├── README.md                     ~200 lines
├── INSTALLATION.md               ~150 lines
├── API.md                        ~300 lines
├── ARCHITECTURE.md               ~500 lines
└── Total Docs:                   ~1,150 lines

TOTAL PROJECT:               ~23,950 lines
```

---

## TESTING COVERAGE TARGETS

```
Component                Coverage Target    Priority
────────────────────────┼─────────────────┼──────────
Agents                  │  95%             │  HIGH
Providers               │  90%             │  HIGH
Engine/Processor        │  90%             │  HIGH
Session Storage         │  85%             │  HIGH
Context Builder         │  80%             │  MEDIUM
File System             │  80%             │  MEDIUM
LSP Manager             │  75%             │  MEDIUM
CLI Commands            │  70%             │  LOW
UI Components           │  60%             │  LOW

Overall Target:         85%
```

---

## PERFORMANCE TARGETS

```
Metric                              Target           Notes
────────────────────────────────────┼─────────────────┼────────────
TUI Startup Time                    < 500ms          Cold start
TUI Latency (input → response)      < 100ms          Perceived responsiveness
LLM Time-to-First-Token             < 1s             Depends on provider
Context Building (8 files)          < 500ms          VFS scanning
Session Load                        < 200ms          SQLite query
Message Persistence                 < 100ms          Async write
File Modification                   < 300ms          Including syntax check
LSP Initialization                  < 2s             Per language (cached)
Memory Usage (idle TUI)             < 50MB           Go efficiency
Memory Usage (with context)         < 200MB          Depends on file size
```

---

## RELEASE CHECKLIST

### Before Each Release:

- [ ] All tests passing (>85% coverage)
- [ ] No TypeScript errors
- [ ] ESLint passes
- [ ] No security vulnerabilities (`npm audit`)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped (semantic versioning)
- [ ] Git tags created
- [ ] GitHub release created with notes

### Release Artifacts:

```
lumecode@1.0.0
├── npm package (published to npmjs.org)
├── GitHub release with binaries
│   ├── lumecode-linux-x64.tar.gz
│   ├── lumecode-macos-x64.dmg
│   ├── lumecode-macos-arm64.dmg (Apple Silicon)
│   ├── lumecode-windows-x64.exe
│   └── lumecode-windows-arm64.exe
├── Docker image (optional, later phase)
└── Homebrew tap (optional, later phase)
```

---

## COMMUNITY STRUCTURE

### Repository

```
lumecode/
├── Main branch: production-ready code
├── Develop branch: integration for features
├── Feature branches: feature/component-name
├── Hotfix branches: hotfix/issue-number
└── Release branches: release/v1.0.0
```

### Issues

```
Labels:
├── bug (critical, fixes required)
├── feature (new functionality)
├── enhancement (improvement to existing)
├── documentation (docs only)
├── good-first-issue (for new contributors)
├── help-wanted (community input needed)
└── blocked (waiting on something)

Milestones:
├── v1.0.0-MVP (Phase 1)
├── v1.5.0-Core (Phase 2)
├── v2.0.0-Advanced (Phase 3)
└── v2.5.0-Polish (Phase 4)
```

### Contributing

**In CONTRIBUTING.md**:
1. Fork the repo
2. Create feature branch
3. Follow code standards (types, tests, docs)
4. Create PR with description
5. Pass CI/CD checks
6. Code review from maintainers
7. Merge and enjoy!

---

## SECURITY CONSIDERATIONS

### Code

- [ ] No hardcoded secrets (use .env)
- [ ] Input validation on all user input
- [ ] No arbitrary code execution (only curated shell commands)
- [ ] File path traversal protection
- [ ] Rate limiting on API calls
- [ ] CORS for web endpoints

### Data

- [ ] Conversations stored locally (SQLite)
- [ ] No telemetry without explicit opt-in
- [ ] No API keys stored in logs
- [ ] Sessions encrypted if shared
- [ ] Secure session token generation (crypto.randomUUID)

### Dependencies

- [ ] Regular dependency audits
- [ ] Minimal dependencies (prefer built-in)
- [ ] Lock file committed (package-lock.json)
- [ ] CI/CD runs security checks

---

## MONITORING & OBSERVABILITY

### Logging

```typescript
// Use pino structured logging
logger.info({ sessionId, action }, 'User requested...');
logger.error({ error, code }, 'Failed to...');

// Log levels: debug, info, warn, error
// Can be configured via LOG_LEVEL env var
```

### Metrics (Future)

```
Optional analytics (with user consent):
├── Feature usage (which agents used most)
├── Provider preferences (Claude vs GPT vs others)
├── Error rates by provider
├── Session duration
└── User retention
```

### Debugging

```bash
# Enable debug logging
DEBUG=lumecode:* npm start

# Debug specific component
DEBUG=lumecode:engine npm start

# With VSCode debugger
node --inspect-brk=9229 dist/index.js
```

---

## FREQUENTLY ASKED QUESTIONS FOR USERS

### Q: Is my code stored on servers?
**A**: No. Everything stays on your computer in `~/.lumecode/`. We don't send code to any servers except the LLM provider you choose.

### Q: Which LLM should I use?
**A**: Start with Claude Opus (best quality, $20/month). For speed, use Mistral or Llama (Groq, free). For local privacy, use Ollama.

### Q: Can I run this offline?
**A**: The TUI and agents work offline. To use AI, use local models like Ollama or Mistral locally. API-based models (OpenAI, Claude) need internet.

### Q: How much does this cost?
**A**: Lumecode itself is free. You pay for the LLM provider (if using API). Local models (Ollama) are free.

### Q: Can I use this in production?
**A**: Yes, for v1.0+. For v0.x (early beta), it's research/experimental.

### Q: Can I contribute?
**A**: Absolutely! See CONTRIBUTING.md. We welcome all types of contributions.

---

## RECOMMENDED READING

### For Understanding the Codebase:
1. Start with `README.md`
2. Read `ARCHITECTURE.md` (detailed)
3. Review `src/types/index.ts` (understand data structures)
4. Study base classes: `BaseAgent`, `BaseProvider`
5. Read `src/engine/processor.ts` (main logic)

### For Understanding Design:
1. Look at OpenCode's GitHub for UI patterns
2. Look at Crush's Bubble Tea examples
3. Check out glow (markdown rendering)
4. Study lip gloss (terminal styling)

### For Understanding Agents:
1. Read OpenCode's agent documentation
2. Understand permission matrix
3. Study system prompts
4. Test different agents locally

---

## NEXT STEPS FOR YOU

### Immediate (This Week):
1. ✅ Review this specification
2. ✅ Review OpenCode and Crush codebases
3. Fork Lumecode (if public) or create new repo
4. Set up development environment
5. Create initial project structure

### Short Term (2-3 Weeks):
1. Build core types (with Claude Opus)
2. Build base agent & provider classes
3. Build session storage (SQLite)
4. Build 1-2 providers (Claude, OpenAI)
5. Build basic CLI

### Medium Term (1-2 Months):
1. Complete all agents
2. Complete LSP integration
3. Build TUI with Bubble Tea
4. Test full workflow end-to-end
5. Document everything

### Long Term (2+ Months):
1. Build desktop app
2. Build IDE extensions
3. Optimize performance
4. Community engagement
5. v1.0.0 release

---

## WHAT TO ASK CLAUDE OPUS

### Good Questions:
✅ "Build the Anthropic provider following this interface..."
✅ "Create a session manager with SQLite persistence..."
✅ "Implement the context builder to intelligently select files..."
✅ "Build the base agent class with permission system..."
✅ "Create a complete test suite for the engine processor..."

### Bad Questions:
❌ "Build the entire project at once"
❌ "Build the UI (too vague)"
❌ "Make this production-ready" (without specific requirements)
❌ "Build something cool" (no concrete spec)

### Best Approach:
1. Provide this spec
2. Ask Claude to build ONE component
3. Integrate it yourself
4. Ask Claude to build the next component
5. Repeat until complete

---

## FINAL NOTES

**This specification is:**
- Detailed enough for Claude Opus to build incrementally
- Flexible enough to adapt as you learn
- Comprehensive but not overwhelming
- Based on real, proven projects (OpenCode + Crush)

**Quality over speed:**
- Build carefully, test thoroughly
- Get feedback from early users
- Iterate on design
- Build community trust

**You've got this! 🚀**

The specification + implementation guide provides everything Claude Opus needs to build a professional, production-ready AI coding agent.

---

**Questions? Suggestions? Build it step by step with Claude Opus and you'll have an amazing project!**
