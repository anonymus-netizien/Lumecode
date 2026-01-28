# ⚡ CLAUDE PROMPT CARD - Quick Reference

## 🎯 Three Steps to Start Building

### STEP 1: Copy This Prompt
Copy everything below (from triple backticks to triple backticks)

### STEP 2: Prepare to Send
Before sending to Claude, add three specs:
- Replace: `[PASTE ENTIRE lumecode-spec.md HERE]` with lumecode-spec.md
- Replace: `[PASTE ENTIRE lumecode-implementation.md HERE]` with lumecode-implementation.md  
- Replace: `[PASTE ENTIRE lumecode-adr.md HERE]` with lumecode-adr.md

### STEP 3: Send to Claude Opus
Go to Claude.ai, paste entire prompt (with specs), send

---

## 🚀 THE PROMPT (Copy Everything Below)

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

**B) tsconfig.json**
- Strict mode enabled
- ES2020 target

**C) .env.example**
```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
LOG_LEVEL=info
NODE_ENV=development
```

**D) .gitignore**
- Node.js project rules

**E) Initial README.md**
- Project description
- Quick start
- Features list

### 4. SETUP INSTRUCTIONS

Copy-paste ready bash commands:
- mkdir lumecode && cd lumecode
- npm install
- tsconfig setup
- Directory creation
- All commands

### 5. BUILD ROADMAP

Week-by-week:
- Week 1: Types, Base Classes
- Week 2: Providers, Agents
- Week 3: Smart Features
- Week 4: UI
- Week 5: Launch

### 6. CRITICAL PATH

Answer:
1. What must be built first?
2. What's the minimum for MVP?
3. Which components are riskiest?
4. What are external dependencies?
5. What could go wrong?

### 7. NEXT COMPONENT

What to build Phase 1, Week 1, Day 1:
- src/types/index.ts
- src/agents/agent.base.ts
- src/providers/provider.base.ts

---

## CONSTRAINTS

✅ Match specification exactly
✅ Production-ready code
✅ Full documentation
✅ Type-safe (strict mode)
✅ Copy-paste ready
✅ No placeholders

---

**Ready? Let's initialize Lumecode! 🚀**
```

---

## ✅ That's It!

Send that prompt to Claude Opus with the three specs added.

Claude will initialize your entire project.

Then ask Claude to build the first component.

---

## 📞 Quick Help

| Question | Answer |
|----------|--------|
| Where do I paste? | Claude.ai chat box |
| Do I edit the prompt? | No, just add the 3 specs |
| What happens next? | Claude initializes project |
| How long does it take? | ~10 minutes |
| Then what? | Create project structure |
| How long to build? | 2-3 weeks |

---

**Copy the prompt. Send to Claude. Start building! 🚀**
