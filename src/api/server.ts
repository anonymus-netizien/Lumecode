/**
 * REST API Server
 * Provides HTTP endpoints for model management and tier operations
 * Built with Hono for Bun compatibility
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';

import { getModelRegistry } from '../models/registry.js';
import { getTierDetector } from '../tiers/detector.js';
import { getHealthMonitor } from '../health/monitor.js';
import { getSessionManager } from '../sessions/manager.js';
import { getModelTierIntegration } from '../integration/model-tier.js';
import { modelLogger as logger } from '../models/logger.js';
import type { ModelQueryFilters } from '../models/types.js';

// API response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// Create response helper
const createResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
  timestamp: new Date().toISOString(),
});

const createErrorResponse = (error: string): ApiResponse<never> => ({
  success: false,
  error,
  timestamp: new Date().toISOString(),
});

// Auth middleware type
type AuthContext = {
  userId?: string;
  tier?: string;
  apiKey?: string;
};

// Simple in-memory rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

const createRateLimiter = (windowMs: number, maxRequests: number) => {
  return async (c: Context, next: () => Promise<void>) => {
    const key = c.req.header('x-api-key') || c.req.header('x-forwarded-for') || 'anonymous';
    const now = Date.now();
    
    const record = rateLimitStore.get(key);
    if (record && now < record.resetTime) {
      if (record.count >= maxRequests) {
        return c.json(createErrorResponse('Rate limit exceeded'), 429);
      }
      record.count++;
    } else {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    }
    
    await next();
  };
};

/**
 * Create the Hono API application
 */
export const createApiApp = () => {
  const app = new Hono<{ Variables: AuthContext }>();

  // Get singleton instances
  const registry = getModelRegistry();
  const tierDetector = getTierDetector();
  const healthMonitor = getHealthMonitor();
  const sessionManager = getSessionManager();
  const integration = getModelTierIntegration();

  // Middleware
  app.use('*', cors());
  app.use('*', honoLogger());
  app.use('*', prettyJSON());

  // Rate limiting middleware - 60 requests per minute
  app.use('/api/*', createRateLimiter(60 * 1000, 60));

  // Auth middleware
  app.use('/api/*', async (c, next) => {
    const apiKey = c.req.header('x-api-key');
    const authHeader = c.req.header('authorization');

    // Simple API key validation
    if (apiKey) {
      c.set('apiKey', apiKey);
      // In production, validate API key and set user info
      c.set('userId', 'user-from-api-key');
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      c.set('apiKey', token);
      c.set('userId', 'user-from-bearer');
    }

    // Detect tier
    const tierResult = await tierDetector.detectTier();
    c.set('tier', tierResult.tier.level);

    await next();
  });

  // Error handler
  app.onError((err, c) => {
    logger.error({ error: err.message, path: c.req.path }, 'API Error');

    if (err instanceof HTTPException) {
      return c.json(createErrorResponse(err.message), err.status);
    }

    return c.json(createErrorResponse('Internal server error'), 500);
  });

  // Health check endpoint
  app.get('/health', (c) => {
    return c.json(createResponse({
      status: 'ok',
      version: '1.0.0',
    }));
  });

  // ===== MODEL ENDPOINTS =====

  // Get all models
  app.get('/api/models', async (c) => {
    try {
      const models = await integration.getModelsWithAccess();
      return c.json(createResponse({ models, count: models.length }));
    } catch (error) {
      throw new HTTPException(500, { message: 'Failed to fetch models' });
    }
  });

  // Get models with filters
  app.post('/api/models/query', async (c) => {
    try {
      const filters = await c.req.json<ModelQueryFilters>();
      const models = await integration.getModelsWithAccess(filters);
      return c.json(createResponse({ models, count: models.length }));
    } catch (error) {
      throw new HTTPException(400, { message: 'Invalid query filters' });
    }
  });

  // Get a specific model
  app.get('/api/models/:id', async (c) => {
    const id = c.req.param('id');
    const model = registry.getModel(id);

    if (!model) {
      throw new HTTPException(404, { message: 'Model not found' });
    }

    const accessInfo = await integration.canAccessModel(id);
    return c.json(createResponse({ model, access: accessInfo }));
  });

  // Get free models
  app.get('/api/models/free', async (c) => {
    const models = await integration.getFreeModelsDetailed();
    return c.json(createResponse({ models, count: models.length }));
  });

  // Get model availability summary
  app.get('/api/models/summary', async (c) => {
    const summary = await integration.getAvailabilitySummary();
    return c.json(createResponse(summary));
  });

  // Check model access
  app.get('/api/models/:id/access', async (c) => {
    const id = c.req.param('id');
    const accessInfo = await integration.canAccessModel(id);
    return c.json(createResponse(accessInfo));
  });

  // ===== TIER ENDPOINTS =====

  // Get current user tier
  app.get('/api/tier', async (c) => {
    const tierResult = await tierDetector.detectTier();
    return c.json(createResponse(tierResult));
  });

  // Get tier-model mapping
  app.get('/api/tier/models', async (c) => {
    const mapping = await integration.getTierModelMapping();
    return c.json(createResponse(mapping));
  });

  // ===== HEALTH ENDPOINTS =====

  // Get health summary
  app.get('/api/health/summary', (c) => {
    const summary = healthMonitor.getHealthSummary();
    return c.json(createResponse(summary));
  });

  // Get health for a specific model
  app.get('/api/health/:modelId', (c) => {
    const modelId = c.req.param('modelId');
    const health = healthMonitor.getHealth(modelId);

    if (!health) {
      throw new HTTPException(404, { message: 'Model health not found' });
    }

    return c.json(createResponse(health));
  });

  // Get health history for a model
  app.get('/api/health/:modelId/history', (c) => {
    const modelId = c.req.param('modelId');
    const history = healthMonitor.getHistory(modelId);
    return c.json(createResponse({ history, count: history.length }));
  });

  // Get unhealthy models
  app.get('/api/health/unhealthy', (c) => {
    const models = healthMonitor.getUnhealthyModels();
    return c.json(createResponse({ models, count: models.length }));
  });

  // Trigger health check
  app.post('/api/health/check', async (c) => {
    const results = await healthMonitor.checkAllModels();
    return c.json(createResponse({ results, checked: results.length }));
  });

  // ===== SESSION ENDPOINTS =====

  // Create a new session
  app.post('/api/sessions', async (c) => {
    try {
      const body = await c.req.json<{
        modelId: string;
        provider: string;
      }>();

      const tier = c.get('tier') || 'free';
      const session = sessionManager.createSession({
        userTier: tier,
        modelId: body.modelId,
        provider: body.provider,
      });

      return c.json(createResponse(session), 201);
    } catch (error) {
      throw new HTTPException(400, { message: 'Invalid session data' });
    }
  });

  // Get all sessions
  app.get('/api/sessions', (c) => {
    const sessions = sessionManager.getAllSessions();
    return c.json(createResponse({ sessions, count: sessions.length }));
  });

  // Get active sessions
  app.get('/api/sessions/active', (c) => {
    const sessions = sessionManager.getActiveSessions();
    return c.json(createResponse({ sessions, count: sessions.length }));
  });

  // Get session statistics
  app.get('/api/sessions/stats', (c) => {
    const stats = sessionManager.getStats();
    return c.json(createResponse(stats));
  });

  // Get a specific session
  app.get('/api/sessions/:id', (c) => {
    const id = c.req.param('id');
    const session = sessionManager.getSession(id);

    if (!session) {
      throw new HTTPException(404, { message: 'Session not found' });
    }

    return c.json(createResponse(session));
  });

  // Add message to session
  app.post('/api/sessions/:id/messages', async (c) => {
    const id = c.req.param('id');
    
    try {
      const body = await c.req.json<{
        role: 'user' | 'assistant' | 'system';
        content: string;
        modelId?: string;
        tokens?: number;
      }>();

      const message = sessionManager.addMessage(
        id,
        body.role,
        body.content,
        { modelId: body.modelId, tokens: body.tokens }
      );

      if (!message) {
        throw new HTTPException(400, { message: 'Failed to add message' });
      }

      return c.json(createResponse(message), 201);
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(400, { message: 'Invalid message data' });
    }
  });

  // Terminate session
  app.post('/api/sessions/:id/terminate', async (c) => {
    const id = c.req.param('id');
    
    try {
      const body = await c.req.json<{
        reason?: string;
      }>();

      const success = sessionManager.terminateSession(
        id,
        (body.reason as any) || 'user_requested'
      );

      if (!success) {
        throw new HTTPException(400, { message: 'Failed to terminate session' });
      }

      return c.json(createResponse({ terminated: true }));
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(400, { message: 'Invalid termination request' });
    }
  });

  // Pause session
  app.post('/api/sessions/:id/pause', (c) => {
    const id = c.req.param('id');
    const success = sessionManager.pauseSession(id);

    if (!success) {
      throw new HTTPException(400, { message: 'Failed to pause session' });
    }

    return c.json(createResponse({ paused: true }));
  });

  // Resume session
  app.post('/api/sessions/:id/resume', (c) => {
    const id = c.req.param('id');
    const success = sessionManager.resumeSession(id);

    if (!success) {
      throw new HTTPException(400, { message: 'Failed to resume session' });
    }

    return c.json(createResponse({ resumed: true }));
  });

  // Delete session
  app.delete('/api/sessions/:id', (c) => {
    const id = c.req.param('id');
    const success = sessionManager.deleteSession(id);

    if (!success) {
      throw new HTTPException(404, { message: 'Session not found' });
    }

    return c.json(createResponse({ deleted: true }));
  });

  // ===== REGISTRY ENDPOINTS =====

  // Trigger model sync
  app.post('/api/registry/sync', async (c) => {
    // In production, this would trigger sync from actual providers
    logger.info('Manual sync triggered');
    return c.json(createResponse({ 
      message: 'Sync triggered',
      lastSync: registry.getLastSyncTime(),
    }));
  });

  // Get registry state
  app.get('/api/registry/state', (c) => {
    const state = registry.getState();
    return c.json(createResponse({
      modelCount: state.models.size,
      lastSync: state.lastSync,
      syncInProgress: state.syncInProgress,
      errorCount: state.errors.length,
    }));
  });

  // Get sync errors
  app.get('/api/registry/errors', (c) => {
    const errors = registry.getErrors();
    return c.json(createResponse({ errors, count: errors.length }));
  });

  return app;
};

// Server configuration
export interface ServerConfig {
  port: number;
  hostname?: string;
}

// Default server config
const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 3000,
  hostname: 'localhost',
};

/**
 * Start the API server
 */
export const startApiServer = async (config?: Partial<ServerConfig>) => {
  const serverConfig = { ...DEFAULT_SERVER_CONFIG, ...config };
  const app = createApiApp();

  logger.info(`Starting API server on ${serverConfig.hostname}:${serverConfig.port}`);

  // Start background services
  getHealthMonitor().start();
  getSessionManager().startCleanup();

  // Using Bun.serve for native Bun performance
  const server = Bun.serve({
    port: serverConfig.port,
    hostname: serverConfig.hostname,
    fetch: app.fetch,
  });

  logger.info(`API server running at http://${serverConfig.hostname}:${serverConfig.port}`);

  return server;
};

/**
 * Stop the API server
 */
export const stopApiServer = () => {
  getHealthMonitor().stop();
  getSessionManager().stopCleanup();
  logger.info('API server stopped');
};

// Export the app for testing
export { createApiApp as createApp };
