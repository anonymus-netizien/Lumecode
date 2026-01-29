# Model Management & User Tier System

## Overview

This module provides comprehensive model management and user tier detection capabilities for Lumecode. It enables querying AI model providers, classifying users by tier, labeling free models, managing chat sessions, monitoring model health, and exposes REST API endpoints.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           REST API Layer                             │
│                        (src/api/server.ts)                          │
├─────────────────────────────────────────────────────────────────────┤
│                      Integration Layer                               │
│                  (src/integration/model-tier.ts)                    │
├──────────────────┬──────────────────┬───────────────────────────────┤
│  Model Registry  │   Tier Detector  │    Health Monitor            │
│  (src/models/)   │   (src/tiers/)   │    (src/health/)             │
├──────────────────┴──────────────────┴───────────────────────────────┤
│                      Session Manager                                 │
│                     (src/sessions/)                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Model Registry (`src/models/`)

Central registry for managing AI model inventory across all providers.

#### Types (`types.ts`)
- `ModelInfo` - Complete model information including capabilities, health, pricing
- `ModelTier` - Model tier classification: `'free' | 'credits' | 'pro' | 'enterprise'`
- `ModelCapabilities` - Feature flags: streaming, vision, function calling, etc.
- `ModelHealth` - Health status and metrics
- `ModelQueryFilters` - Query filtering options

#### Registry (`registry.ts`)
```typescript
import { getModelRegistry, createModelInfo } from './src/models';

const registry = getModelRegistry();

// Add a model
registry.upsertModel(createModelInfo({
  id: 'gemini-1.5-flash',
  name: 'Gemini 1.5 Flash',
  provider: 'google',
  tier: 'free',
  isFree: true,
}));

// Query models
const freeModels = registry.getFreeModels();
const visionModels = registry.queryModels({ hasVision: true });
const googleModels = registry.getModelsByProvider('google');
```

### 2. Tier Detection (`src/tiers/`)

Detects and classifies user tier based on configuration and API keys.

#### Types (`types.ts`)
- `UserTierLevel` - User tier levels: `'free' | 'credits' | 'pro' | 'enterprise'`
- `UserTier` - Complete tier info with features and limits
- `TierFeatures` - Available features per tier
- `TierLimits` - Rate limits per tier

#### Detector (`detector.ts`)
```typescript
import { getTierDetector } from './src/tiers';

const detector = getTierDetector();

// Detect user tier
const result = await detector.detectTier();
console.log(result.tier.level); // 'free', 'credits', 'pro', or 'enterprise'
console.log(result.detectionMethod); // 'api_key_validation', 'environment_variable', etc.

// Check model access
const canAccess = detector.isModelAccessible('gpt-4o', 'free'); // false
const isFree = detector.isModelFree('gemini-1.5-flash'); // true
```

#### Tier Detection Methods
1. **Environment Variable**: `LUMECODE_USER_TIER=pro`
2. **API Key Validation**: Detects tier based on configured API keys
3. **Config File**: From `.lumecode` configuration
4. **Default**: Falls back to `free` tier

#### Default Tier Limits

| Tier | Requests/min | Requests/day | Tokens/day | Sessions |
|------|--------------|--------------|------------|----------|
| Free | 10 | 500 | 50,000 | 1 |
| Credits | 30 | 2,000 | 200,000 | 3 |
| Pro | 60 | 10,000 | 1,000,000 | 10 |
| Enterprise | 120 | 50,000 | 10,000,000 | 50 |

### 3. Health Monitor (`src/health/`)

Monitors the health and availability of AI models.

```typescript
import { getHealthMonitor } from './src/health';

const monitor = getHealthMonitor();

// Start monitoring
monitor.start();

// Check specific model
const result = await monitor.checkModel('gpt-4o');
console.log(result.status); // 'healthy', 'degraded', 'unhealthy', 'unknown'
console.log(result.latencyMs);

// Get health summary
const summary = monitor.getHealthSummary();
// { total: 10, healthy: 8, degraded: 1, unhealthy: 0, unknown: 1 }

// Get unhealthy models
const unhealthyModels = monitor.getUnhealthyModels();
```

### 4. Session Manager (`src/sessions/`)

Manages chat sessions with support for termination and lifecycle management.

```typescript
import { getSessionManager } from './src/sessions';

const manager = getSessionManager();

// Create session
const session = manager.createSession({
  userTier: 'pro',
  modelId: 'gpt-4o',
  provider: 'openai',
});

// Add messages
manager.addMessage(session.id, 'user', 'Hello!');
manager.addMessage(session.id, 'assistant', 'Hi there!', {
  modelId: 'gpt-4o',
  tokens: 50,
});

// Session control
manager.pauseSession(session.id);
manager.resumeSession(session.id);
manager.terminateSession(session.id, 'user_requested');

// Get statistics
const stats = manager.getStats();
// { total: 5, active: 3, paused: 1, terminated: 1, ... }
```

### 5. Integration Layer (`src/integration/`)

Combines user tier information with model availability.

```typescript
import { getModelTierIntegration } from './src/integration';

const integration = getModelTierIntegration();

// Get models with access info
const models = await integration.getModelsWithAccess();
models.forEach(m => {
  console.log(`${m.name}: ${m.isAccessible ? 'Accessible' : 'Restricted'}`);
  if (m.requiresUpgrade) {
    console.log(`  Requires: ${m.requiredTier}`);
  }
});

// Get availability summary
const summary = await integration.getAvailabilitySummary();

// Get tier-model mapping with recommendations
const mapping = await integration.getTierModelMapping();
console.log('Recommended:', mapping.recommendedModel?.name);
console.log('Upgrade options:', mapping.upgradeOptions);

// Get models with FREE label
const labeled = await integration.getModelsWithFreeLabel();
labeled.forEach(m => {
  const tag = m.freeLabel ? `[${m.freeLabel}]` : '';
  console.log(`${m.name} ${tag}`);
});
```

### 6. REST API (`src/api/`)

HTTP endpoints for model management and tier operations.

```typescript
import { startApiServer } from './src/api';

// Start server
const server = await startApiServer({ port: 3000 });
```

#### Endpoints

**Models**
- `GET /api/models` - Get all models with access info
- `POST /api/models/query` - Query models with filters
- `GET /api/models/:id` - Get specific model
- `GET /api/models/free` - Get free models
- `GET /api/models/summary` - Get availability summary
- `GET /api/models/:id/access` - Check model access

**Tiers**
- `GET /api/tier` - Get current user tier
- `GET /api/tier/models` - Get tier-model mapping

**Health**
- `GET /api/health/summary` - Get health summary
- `GET /api/health/:modelId` - Get model health
- `GET /api/health/:modelId/history` - Get health history
- `GET /api/health/unhealthy` - Get unhealthy models
- `POST /api/health/check` - Trigger health check

**Sessions**
- `POST /api/sessions` - Create session
- `GET /api/sessions` - Get all sessions
- `GET /api/sessions/active` - Get active sessions
- `GET /api/sessions/stats` - Get statistics
- `GET /api/sessions/:id` - Get session
- `POST /api/sessions/:id/messages` - Add message
- `POST /api/sessions/:id/terminate` - Terminate session
- `POST /api/sessions/:id/pause` - Pause session
- `POST /api/sessions/:id/resume` - Resume session
- `DELETE /api/sessions/:id` - Delete session

**Registry**
- `POST /api/registry/sync` - Trigger model sync
- `GET /api/registry/state` - Get registry state
- `GET /api/registry/errors` - Get sync errors

#### Authentication

Include API key in request headers:
```
x-api-key: your-api-key
```
or
```
Authorization: Bearer your-api-key
```

#### Rate Limiting

Default: 60 requests per minute per API key.

## Configuration

### Environment Variables

```bash
# User tier override
LUMECODE_USER_TIER=pro

# API keys (for tier detection)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=sk-or-...
GROQ_API_KEY=...
```

### Free Models (Default)

- `gemini-1.5-flash`
- `llama-3.1-8b-instant`
- `mixtral-8x7b-32768`
- `gemma-7b-it`

## Testing

Run tests:
```bash
bun test tests/models/
bun test tests/tiers/
bun test tests/health/
bun test tests/sessions/
bun test tests/integration/
```

## Events

### Model Registry Events
- `sync:start` - Sync started
- `sync:complete` - Sync completed
- `sync:error` - Sync error
- `model:added` - Model added
- `model:updated` - Model updated
- `model:removed` - Model removed
- `health:updated` - Health updated

### Health Monitor Events
- `check:start` - Health check started
- `check:complete` - Health check completed
- `check:error` - Health check error
- `status:changed` - Status changed
- `alert:unhealthy` - Model became unhealthy
- `alert:degraded` - Model became degraded
- `alert:recovered` - Model recovered

### Session Manager Events
- `session:created` - Session created
- `session:updated` - Session updated
- `session:terminated` - Session terminated
- `session:expired` - Session expired
- `message:added` - Message added

## File Structure

```
src/
├── models/
│   ├── index.ts          # Module exports
│   ├── types.ts          # Type definitions
│   └── registry.ts       # Model registry
├── tiers/
│   ├── index.ts          # Module exports
│   ├── types.ts          # Type definitions
│   └── detector.ts       # Tier detection
├── health/
│   ├── index.ts          # Module exports
│   └── monitor.ts        # Health monitoring
├── sessions/
│   ├── index.ts          # Module exports
│   └── manager.ts        # Session management
├── integration/
│   ├── index.ts          # Module exports
│   └── model-tier.ts     # Integration layer
└── api/
    ├── index.ts          # Module exports
    └── server.ts         # REST API server

tests/
├── models/
│   └── registry.test.ts
├── tiers/
│   └── detector.test.ts
├── health/
│   └── monitor.test.ts
├── sessions/
│   └── manager.test.ts
└── integration/
    └── model-tier.test.ts
```
