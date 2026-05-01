# Provider Setup Guide

Complete guide to configuring AI providers in Lumecode.

---

## Supported Providers

Lumecode supports 4 AI providers out of the box:

| Provider | Type | Free Tier | Best For |
|----------|------|-----------|----------|
| Gemini | Cloud | ✅ Generous | Best free option |
| OpenRouter | Cloud | ✅ Limited | Model variety |
| Groq | Cloud | ✅ Limited | Speed |
| Ollama | Local | ✅ Unlimited | Privacy, offline |

---

## Gemini

Google's Gemini models via the Generative Language API.

### API Key

**Get your key:** https://aistudio.google.com/app/apikey

**Key format:** `AIza...` (39 characters, starts with `AIza`)

### Free Tier

- 15 requests per minute (RPM)
- 1 million tokens per minute
- 1,500 requests per day
- No credit card required

### Models

| Model | Context | Speed | Best For |
|-------|---------|-------|----------|
| `gemini-2.5-flash` | 1M | ⚡ Fast | General coding |
| `gemini-2.5-pro` | 1M | 🐢 Slow | Complex reasoning |
| `gemini-2.0-flash` | 1M | ⚡ Fast | Quick tasks |
| `gemini-1.5-pro` | 2M | 🐢 Slow | Long context |
| `gemini-1.5-flash` | 1M | ⚡ Fast | Balanced |

### Setup

```bash
/key gemini AIzaSy...your-key-here
```

### Base URL

```
https://generativelanguage.googleapis.com/v1beta
```

### Notes

- Best free tier available
- Supports function calling natively
- 429 errors auto-retry with exponential backoff
- Long context window (1M-2M tokens)

---

## OpenRouter

Unified API for 100+ models from multiple providers.

### API Key

**Get your key:** https://openrouter.ai/keys

**Key format:** `sk-or-v1-...` (starts with `sk-or-v1-`)

### Free Tier

- Limited free models available
- Usage-based pricing for paid models
- Credit purchase required for paid models

### Models

**Free Models:**

| Model | Provider | Speed |
|-------|----------|-------|
| `google/gemini-2.0-flash-exp:free` | Google | ⚡ Fast |
| `meta-llama/llama-3.2-3b-instruct:free` | Meta | ⚡ Fast |
| `qwen/qwen-2-7b-instruct:free` | Alibaba | ⚡ Fast |

**Paid Models (examples):**

| Model | Provider | Price |
|-------|----------|-------|
| `anthropic/claude-3.5-sonnet` | Anthropic | $3/$15 per 1M |
| `openai/gpt-4-turbo` | OpenAI | $10/$30 per 1M |
| `google/gemini-pro` | Google | $0.50/$1.50 per 1M |

### Setup

```bash
/key openrouter sk-or-v1-...your-key-here
```

### Base URL

```
https://openrouter.ai/api/v1
```

### Notes

- Requires `HTTP-Referer` header (Lumecode sets this automatically)
- Model names include provider prefix (e.g., `google/gemini-2.0-flash-exp:free`)
- Free models have `:free` suffix
- Check https://openrouter.ai/models for current pricing

---

## Groq

Ultra-fast inference on custom LPU hardware.

### API Key

**Get your key:** https://console.groq.com/keys

**Key format:** `gsk_...` (starts with `gsk_`)

### Free Tier

- 14,400 requests per day
- Rate limits vary by model
- No credit card required

### Models

| Model | Context | Speed | Tokens/sec |
|-------|---------|-------|------------|
| `llama-3.3-70b-versatile` | 128K | ⚡⚡ | ~300 |
| `llama-3.1-70b-versatile` | 128K | ⚡⚡ | ~300 |
| `llama-3.1-8b-instant` | 128K | ⚡⚡⚡ | ~750 |
| `mixtral-8x7b-32768` | 32K | ⚡⚡ | ~450 |
| `gemma2-9b-it` | 8K | ⚡⚡⚡ | ~500 |

### Setup

```bash
/key groq gsk_...your-key-here
```

### Base URL

```
https://api.groq.com/openai/v1
```

### Notes

- Fastest inference available
- Uses OpenAI-compatible API
- Rate limits reset daily
- Best for rapid iteration

---

## Ollama

Run open-source models locally on your machine.

### Installation

**macOS:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:**
Download from https://ollama.com/download

### Start Ollama

```bash
ollama serve
```

Ollama runs on `http://localhost:11434` by default.

### Pull Models

```bash
ollama pull llama3.2
ollama pull codellama
ollama pull qwen2.5-coder
ollama pull mistral
ollama pull deepseek-coder
```

### Models

| Model | Size | VRAM | Best For |
|-------|------|------|----------|
| `llama3.2` | 3B | 4GB | Fast, general |
| `llama3.2:70b` | 70B | 48GB | High quality |
| `codellama` | 7B | 8GB | Code generation |
| `qwen2.5-coder` | 7B | 8GB | Code, Chinese |
| `mistral` | 7B | 8GB | Balanced |
| `deepseek-coder` | 6.7B | 8GB | Code-focused |

### Setup

No API key required. Just ensure Ollama is running:

```bash
ollama serve
```

Then in Lumecode:

```bash
/provider ollama
/model llama3.2
```

### Base URL

```
http://localhost:11434/v1
```

### Notes

- Completely offline, no data leaves your machine
- Quality depends on your hardware (GPU recommended)
- Models downloaded once, cached locally
- No rate limits or API costs

---

## Switching Providers

### Change Provider

```bash
/provider gemini
/provider openrouter
/provider groq
/provider ollama
```

### Change Model

```bash
/model gemini-2.5-flash
/model google/gemini-2.0-flash-exp:free
/model llama-3.3-70b-versatile
/model llama3.2
```

### View Available Models

Press `m` to open the Model Menu, or use:

```bash
/models
```

---

## Troubleshooting

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Invalid API key` | Whitespace in key or wrong format | Run `/key provider newkey` with correct key |
| `401 User not found` | Missing HTTP-Referer header (OpenRouter) | Update to latest Lumecode version |
| `403 Forbidden` | Key doesn't have access to model | Check provider dashboard for permissions |
| `429 Quota exceeded` | Free tier limit hit | Switch provider or wait for reset |
| `429 Rate limited` | Too many requests | Wait and retry (Lumecode auto-retries) |
| `Connection refused` | Ollama not running | Run `ollama serve` |
| `Model not found` | Model not pulled (Ollama) | Run `ollama pull modelname` |
| `ECONNRESET` | Network issue | Check internet connection |

### Debug Mode

Check current provider and model:

```bash
/status
```

### Reset Configuration

Delete config file to start fresh:

```bash
rm ~/.lumecode/config.json
```

### Verify API Key

Test your key directly:

**Gemini:**
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY"
```

**OpenRouter:**
```bash
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer YOUR_KEY"
```

**Groq:**
```bash
curl https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer YOUR_KEY"
```

**Ollama:**
```bash
curl http://localhost:11434/v1/models
```

---

## Provider Comparison

| Feature | Gemini | OpenRouter | Groq | Ollama |
|---------|--------|------------|------|--------|
| Free tier | ✅ Best | ✅ Limited | ✅ Good | ✅ Unlimited |
| Speed | Fast | Varies | Fastest | Depends |
| Privacy | Cloud | Cloud | Cloud | Local |
| Model variety | 5 | 100+ | 5 | 50+ |
| Context window | 1-2M | Varies | 8-128K | Varies |
| Rate limits | 15 RPM | Per model | Per model | None |
| Offline | ❌ | ❌ | ❌ | ✅ |

---

## Recommended Setup

### For Most Users

1. Start with **Gemini** (best free tier)
2. Add **Groq** for speed when needed
3. Use **Ollama** for sensitive code

### For Privacy-Focused

1. Use **Ollama** exclusively
2. Pull `qwen2.5-coder` or `deepseek-coder` for coding
3. No API keys needed, no data leaves your machine

### For Maximum Quality

1. Use **OpenRouter** with paid models
2. `anthropic/claude-3.5-sonnet` for complex tasks
3. `openai/gpt-4-turbo` for general coding
