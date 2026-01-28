# LUMECODE - Single Initialization Prompt for Claude Opus

**Copy and paste this entire prompt into Claude Opus:**

---

```
# LUMECODE PROJECT - Complete Initialization

You are helping me build Lumecode, an open-source AI coding agent combining OpenCode's architecture with Crush's beautiful TUI design.

## THE VISION
"AI-powered coding that's private, open, and beautiful in your terminal."

## KEY FEATURES
- Privacy-first (no external data storage)
- Multi-provider support (Claude, GPT, Groq, Ollama, etc.)
- Multi-agent system (Build, Plan, Review, General)
- LSP integration for code intelligence
- Session management with sharing
- Beautiful terminal UI

## COMPLETE SPECIFICATION PROVIDED

[PASTE ENTIRE lumecode-spec.md HERE]

[PASTE ENTIRE lumecode-implementation.md HERE]

[PASTE ENTIRE lumecode-adr.md HERE]

---

## YOUR TASK: PROJECT INITIALIZATION

I need you to provide everything needed to start building immediately.

### 1. ARCHITECTURE SUMMARY

Explain:
- What Lumecode does (2 paragraphs)
- How user input flows through the system
- How agents and providers interact
- Key design decisions (3-4 most important)

### 2. PROJECT STRUCTURE

Create the complete directory structure with descriptions:

```
lumecode/
├── src/
│   ├── types/           [Explain what goes here]
│   ├── agents/          [Explain what goes here]
│   ├── providers/       [Explain what goes here]
│   ├── lsp/             [Explain what goes here]
│   ├── filesystem/      [Explain what goes here]
│   ├── session/         [Explain what goes here]
│   ├── context/         [Explain what goes here]
│   ├── engine/          [Explain what goes here]
│   ├── ui/              [Explain what goes here]
│   ├── config/          [Explain what goes here]
│   └── index.ts
├── test/
│   ├── unit/
│   └── integration/
├── docs/
├── examples/
├── scripts/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

### 3. INITIALIZATION FILES

Create these 5 files (complete, production-ready):

**A) package.json**
- All dependencies from the spec
- All scripts (build, test, dev, lint, type-check)
- Version 0.1.0
- Proper metadata

**B) tsconfig.json**
- Strict mode enabled
- ES2020 target
- Source maps
- Correct output directory

**C) .env.example**
```
# LLM Providers
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# Development
LOG_LEVEL=info
DEBUG=false
NODE_ENV=development
```

**D) .gitignore**
Complete ignore rules for Node.js project

**E) Initial README.md**
- Project description
- Quick start (3 steps)
- Installation methods
- Features list
- Technology stack

### 4. SETUP INSTRUCTIONS

Provide copy-paste ready commands:

```bash
# 1. Initialize
mkdir lumecode && cd lumecode
git init
npm init -y

# 2. Install dependencies
npm install typescript ts-node @types/node

# 3. Setup TypeScript
npx tsc --init

# 4. Create structure
mkdir -p src/{types,agents,providers,lsp,filesystem,session,context,engine,ui,config}
mkdir -p test/{unit,integration}
mkdir -p docs examples scripts

# 5. Setup environment
cp .env.example .env
# Edit .env with your API keys

# 6. Verify setup
npm run build
npm test
```

### 5. BUILD ROADMAP

Provide week-by-week breakdown:

**Phase 1: Foundation (Week 1)**
- [ ] Types (src/types/index.ts)
- [ ] BaseAgent class
- [ ] BaseProvider class
- [ ] Unit tests

**Phase 2: Core (Week 2)**
- [ ] First provider (Anthropic)
- [ ] Session storage (SQLite)
- [ ] Build agent
- [ ] Basic CLI

**Phase 3: Features (Week 3)**
- [ ] Remaining providers
- [ ] All agents (Plan, Review, General)
- [ ] File system abstraction
- [ ] LSP integration
- [ ] Context builder

**Phase 4: Integration (Week 4)**
- [ ] Core engine
- [ ] CLI commands
- [ ] TUI (Bubble Tea)
- [ ] Desktop app (Electron)

**Phase 5: Launch (Week 5)**
- [ ] Documentation
- [ ] Security audit
- [ ] Performance tuning
- [ ] npm publish

### 6. CRITICAL PATH

Answer these questions:

1. **What must be built first and why?**
2. **What's the minimum to get a working prototype?**
3. **Which components are riskiest?**
4. **What are external dependencies?** (Node.js version, system requirements)
5. **What could go wrong and how do we prevent it?**

### 7. NEXT COMPONENT

After initialization, I'll ask you to build:

**Phase 1, Week 1, Day 1: Core Types & Base Classes**

Three files:
1. `src/types/index.ts` - All TypeScript interfaces from the spec
2. `src/agents/agent.base.ts` - Abstract BaseAgent class with permission system
3. `src/providers/provider.base.ts` - Abstract BaseProvider class

Requirements for each:
- Complete, production-ready TypeScript
- Full JSDoc comments
- Strict type safety (no `any`)
- Ready to integrate immediately
- Comprehensive error handling

---

## CONSTRAINTS

When providing deliverables:
✅ Match the specification exactly
✅ Production-ready code
✅ Full documentation
✅ Type-safe (strict mode)
✅ Copy-paste ready
✅ No placeholders
✅ Security best practices

---

## OUTPUT FORMAT

Provide:

1. **Architecture Summary** (text)
2. **Directory Structure** (with descriptions)
3. **5 Initialization Files** (complete code)
4. **Setup Instructions** (copy-paste commands)
5. **Build Roadmap** (week by week)
6. **Critical Path Analysis** (5 questions answered)
7. **Next Steps** (what to build first)

---

**Ready? Let's initialize Lumecode! 🚀**
```

---

## 📋 HOW TO USE THIS

1. **Copy the entire prompt above** (from triple backticks to triple backticks)
2. **Open Claude Opus** (claude.ai or API)
3. **Paste it in** exactly as written
4. **Add the three specs** where indicated:
   - lumecode-spec.md (full content)
   - lumecode-implementation.md (full content)
   - lumecode-adr.md (full content)
5. **Send to Claude**

Claude will deliver everything you need to start building.

---

## 🎯 WHAT YOU'LL GET

✅ Complete architecture explanation
✅ Production-ready project structure
✅ 5 initialization files (package.json, tsconfig.json, .env.example, .gitignore, README.md)
✅ Copy-paste setup instructions
✅ Week-by-week roadmap
✅ Risk analysis
✅ Clear path to first component

---

## ⚡ THEN WHAT?

After Claude provides initialization, ask:

```
"Now let's build Phase 1, Week 1, Day 1.

Build the core types and base classes:
- src/types/index.ts
- src/agents/agent.base.ts  
- src/providers/provider.base.ts

Follow the specification exactly. Include tests.
```

Then continue component by component.

---

**That's it! One prompt to initialize everything. 🚀**
