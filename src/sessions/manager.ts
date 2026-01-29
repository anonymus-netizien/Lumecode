/**
 * Chat Session Manager
 * Manages chat sessions with support for termination and lifecycle management
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { modelLogger as logger } from '../models/logger.js';

// Session status
export type SessionStatus = 'active' | 'paused' | 'terminated' | 'expired';

// Session termination reason
export type TerminationReason = 
  | 'user_requested'
  | 'timeout'
  | 'error'
  | 'rate_limit'
  | 'model_unavailable'
  | 'system';

// Chat message
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  modelId?: string;
  tokens?: number;
}

// Session metadata
export interface SessionMetadata {
  userTier: string;
  modelId: string;
  provider: string;
  clientInfo?: {
    userAgent?: string;
    ipAddress?: string;
  };
}

// Chat session
export interface ChatSession {
  id: string;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  terminatedAt?: Date;
  terminationReason?: TerminationReason;
  messages: ChatMessage[];
  metadata: SessionMetadata;
  tokenCount: number;
  messageCount: number;
}

// Session events
export interface SessionManagerEvents {
  'session:created': (session: ChatSession) => void;
  'session:updated': (session: ChatSession) => void;
  'session:terminated': (sessionId: string, reason: TerminationReason) => void;
  'session:expired': (sessionId: string) => void;
  'message:added': (sessionId: string, message: ChatMessage) => void;
}

// Session configuration
export interface SessionConfig {
  maxSessionDuration: number; // in minutes
  maxMessagesPerSession: number;
  maxTokensPerSession: number;
  cleanupIntervalMs: number;
}

// Default configuration
const DEFAULT_CONFIG: SessionConfig = {
  maxSessionDuration: 60, // 1 hour
  maxMessagesPerSession: 100,
  maxTokensPerSession: 100000,
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * SessionManager - Manages chat sessions
 */
export class SessionManager extends EventEmitter {
  private static instance: SessionManager | null = null;
  private sessions: Map<string, ChatSession> = new Map();
  private config: SessionConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  private constructor(config?: Partial<SessionConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(config?: Partial<SessionConfig>): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(config);
    }
    return SessionManager.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (SessionManager.instance) {
      SessionManager.instance.stopCleanup();
      SessionManager.instance = null;
    }
  }

  /**
   * Create a new session
   */
  public createSession(metadata: SessionMetadata): ChatSession {
    const now = new Date();
    const session: ChatSession = {
      id: randomUUID(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + this.config.maxSessionDuration * 60 * 1000),
      messages: [],
      metadata,
      tokenCount: 0,
      messageCount: 0,
    };

    this.sessions.set(session.id, session);
    this.emit('session:created', session);
    logger.info(`Session created: ${session.id}`);

    return session;
  }

  /**
   * Get a session by ID
   */
  public getSession(id: string): ChatSession | undefined {
    const session = this.sessions.get(id);
    
    // Check if session is expired
    if (session && this.isExpired(session)) {
      this.expireSession(id);
      return undefined;
    }

    return session;
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): ChatSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'active' && !this.isExpired(s));
  }

  /**
   * Get all sessions
   */
  public getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Add a message to a session
   */
  public addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    options?: { modelId?: string; tokens?: number }
  ): ChatMessage | null {
    const session = this.getSession(sessionId);
    if (!session || session.status !== 'active') {
      logger.warn(`Cannot add message to session ${sessionId}: session not active`);
      return null;
    }

    // Check limits
    if (session.messageCount >= this.config.maxMessagesPerSession) {
      this.terminateSession(sessionId, 'rate_limit');
      return null;
    }

    const message: ChatMessage = {
      id: randomUUID(),
      role,
      content,
      timestamp: new Date(),
      modelId: options?.modelId,
      tokens: options?.tokens,
    };

    session.messages.push(message);
    session.messageCount++;
    session.tokenCount += options?.tokens ?? 0;
    session.updatedAt = new Date();

    // Check token limit
    if (session.tokenCount >= this.config.maxTokensPerSession) {
      this.terminateSession(sessionId, 'rate_limit');
    }

    this.emit('message:added', sessionId, message);
    this.emit('session:updated', session);

    return message;
  }

  /**
   * Terminate a session
   */
  public terminateSession(id: string, reason: TerminationReason): boolean {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }

    session.status = 'terminated';
    session.terminatedAt = new Date();
    session.terminationReason = reason;
    session.updatedAt = new Date();

    this.emit('session:terminated', id, reason);
    logger.info(`Session terminated: ${id}, reason: ${reason}`);

    return true;
  }

  /**
   * Pause a session
   */
  public pauseSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session || session.status !== 'active') {
      return false;
    }

    session.status = 'paused';
    session.updatedAt = new Date();
    this.emit('session:updated', session);

    return true;
  }

  /**
   * Resume a session
   */
  public resumeSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session || session.status !== 'paused') {
      return false;
    }

    // Check if expired while paused
    if (this.isExpired(session)) {
      this.expireSession(id);
      return false;
    }

    session.status = 'active';
    session.updatedAt = new Date();
    this.emit('session:updated', session);

    return true;
  }

  /**
   * Expire a session
   */
  private expireSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.status = 'expired';
    session.terminatedAt = new Date();
    session.terminationReason = 'timeout';
    session.updatedAt = new Date();

    this.emit('session:expired', id);
    logger.info(`Session expired: ${id}`);
  }

  /**
   * Check if a session is expired
   */
  private isExpired(session: ChatSession): boolean {
    return new Date() > session.expiresAt;
  }

  /**
   * Delete a session
   */
  public deleteSession(id: string): boolean {
    const deleted = this.sessions.delete(id);
    if (deleted) {
      logger.info(`Session deleted: ${id}`);
    }
    return deleted;
  }

  /**
   * Clean up expired sessions
   */
  public cleanup(): number {
    let cleanedCount = 0;

    for (const [id, session] of this.sessions) {
      if (this.isExpired(session) && session.status === 'active') {
        this.expireSession(id);
        cleanedCount++;
      }
    }

    logger.debug(`Cleaned up ${cleanedCount} expired sessions`);
    return cleanedCount;
  }

  /**
   * Start automatic cleanup
   */
  public startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    logger.info('Session cleanup started');
  }

  /**
   * Stop automatic cleanup
   */
  public stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Session cleanup stopped');
    }
  }

  /**
   * Get session statistics
   */
  public getStats(): {
    total: number;
    active: number;
    paused: number;
    terminated: number;
    expired: number;
    totalMessages: number;
    totalTokens: number;
  } {
    const sessions = Array.from(this.sessions.values());
    return {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'active').length,
      paused: sessions.filter(s => s.status === 'paused').length,
      terminated: sessions.filter(s => s.status === 'terminated').length,
      expired: sessions.filter(s => s.status === 'expired').length,
      totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0),
      totalTokens: sessions.reduce((sum, s) => sum + s.tokenCount, 0),
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<SessionConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Session manager configuration updated');
  }

  /**
   * Get current configuration
   */
  public getConfig(): SessionConfig {
    return { ...this.config };
  }

  /**
   * Get session count
   */
  public get size(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions
   */
  public clear(): void {
    this.sessions.clear();
    logger.info('All sessions cleared');
  }
}

// Export singleton getter
export const getSessionManager = (config?: Partial<SessionConfig>): SessionManager => 
  SessionManager.getInstance(config);
