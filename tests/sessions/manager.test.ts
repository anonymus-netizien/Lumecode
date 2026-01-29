/**
 * Session Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionManager, getSessionManager } from '../../src/sessions/manager.js';
import type { SessionMetadata } from '../../src/sessions/manager.js';

describe('SessionManager', () => {
  const defaultMetadata: SessionMetadata = {
    userTier: 'free',
    modelId: 'test-model',
    provider: 'test-provider',
  };

  beforeEach(() => {
    SessionManager.resetInstance();
  });

  afterEach(() => {
    SessionManager.resetInstance();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getSessionManager();
      const instance2 = getSessionManager();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance correctly', () => {
      const instance1 = getSessionManager();
      SessionManager.resetInstance();
      const instance2 = getSessionManager();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('session creation', () => {
    it('should create a new session', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.status).toBe('active');
      expect(session.messages).toEqual([]);
      expect(session.metadata.modelId).toBe('test-model');
    });

    it('should set correct timestamps', () => {
      const before = new Date();
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);
      const after = new Date();

      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(session.expiresAt.getTime()).toBeGreaterThan(session.createdAt.getTime());
    });

    it('should increment session count', () => {
      const manager = getSessionManager();
      
      expect(manager.size).toBe(0);
      manager.createSession(defaultMetadata);
      expect(manager.size).toBe(1);
      manager.createSession(defaultMetadata);
      expect(manager.size).toBe(2);
    });
  });

  describe('session retrieval', () => {
    it('should get session by ID', () => {
      const manager = getSessionManager();
      const created = manager.createSession(defaultMetadata);
      const retrieved = manager.getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent session', () => {
      const manager = getSessionManager();
      const session = manager.getSession('non-existent-id');
      expect(session).toBeUndefined();
    });

    it('should get all sessions', () => {
      const manager = getSessionManager();
      manager.createSession(defaultMetadata);
      manager.createSession(defaultMetadata);
      manager.createSession(defaultMetadata);

      const sessions = manager.getAllSessions();
      expect(sessions.length).toBe(3);
    });

    it('should get active sessions only', () => {
      const manager = getSessionManager();
      const session1 = manager.createSession(defaultMetadata);
      const session2 = manager.createSession(defaultMetadata);
      manager.createSession(defaultMetadata);

      manager.terminateSession(session1.id, 'user_requested');
      manager.pauseSession(session2.id);

      const active = manager.getActiveSessions();
      expect(active.length).toBe(1);
    });
  });

  describe('message handling', () => {
    it('should add message to session', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);

      const message = manager.addMessage(session.id, 'user', 'Hello!');

      expect(message).toBeDefined();
      expect(message?.role).toBe('user');
      expect(message?.content).toBe('Hello!');
    });

    it('should track message count', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);

      manager.addMessage(session.id, 'user', 'Message 1');
      manager.addMessage(session.id, 'assistant', 'Message 2');

      const updated = manager.getSession(session.id);
      expect(updated?.messageCount).toBe(2);
    });

    it('should track token count', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);

      manager.addMessage(session.id, 'user', 'Message 1', { tokens: 100 });
      manager.addMessage(session.id, 'assistant', 'Message 2', { tokens: 150 });

      const updated = manager.getSession(session.id);
      expect(updated?.tokenCount).toBe(250);
    });

    it('should not add message to terminated session', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);
      manager.terminateSession(session.id, 'user_requested');

      const message = manager.addMessage(session.id, 'user', 'Hello!');
      expect(message).toBeNull();
    });

    it('should include model ID in message', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);

      const message = manager.addMessage(session.id, 'assistant', 'Response', {
        modelId: 'gpt-4',
        tokens: 50,
      });

      expect(message?.modelId).toBe('gpt-4');
    });
  });

  describe('session termination', () => {
    it('should terminate session', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);

      const result = manager.terminateSession(session.id, 'user_requested');

      expect(result).toBe(true);
      const updated = manager.getSession(session.id);
      expect(updated?.status).toBe('terminated');
      expect(updated?.terminationReason).toBe('user_requested');
    });

    it('should set termination timestamp', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);

      manager.terminateSession(session.id, 'timeout');

      const updated = manager.getSession(session.id);
      expect(updated?.terminatedAt).toBeInstanceOf(Date);
    });

    it('should return false for non-existent session', () => {
      const manager = getSessionManager();
      const result = manager.terminateSession('non-existent', 'user_requested');
      expect(result).toBe(false);
    });
  });

  describe('session pause/resume', () => {
    it('should pause active session', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);

      const result = manager.pauseSession(session.id);

      expect(result).toBe(true);
      expect(manager.getSession(session.id)?.status).toBe('paused');
    });

    it('should resume paused session', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);
      manager.pauseSession(session.id);

      const result = manager.resumeSession(session.id);

      expect(result).toBe(true);
      expect(manager.getSession(session.id)?.status).toBe('active');
    });

    it('should not pause non-active session', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);
      manager.terminateSession(session.id, 'user_requested');

      const result = manager.pauseSession(session.id);
      expect(result).toBe(false);
    });

    it('should not resume non-paused session', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);

      const result = manager.resumeSession(session.id);
      expect(result).toBe(false);
    });
  });

  describe('session deletion', () => {
    it('should delete session', () => {
      const manager = getSessionManager();
      const session = manager.createSession(defaultMetadata);

      const result = manager.deleteSession(session.id);

      expect(result).toBe(true);
      expect(manager.getSession(session.id)).toBeUndefined();
      expect(manager.size).toBe(0);
    });

    it('should return false for non-existent session', () => {
      const manager = getSessionManager();
      const result = manager.deleteSession('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('statistics', () => {
    it('should return correct stats', () => {
      const manager = getSessionManager();
      const s1 = manager.createSession(defaultMetadata);
      const s2 = manager.createSession(defaultMetadata);
      const s3 = manager.createSession(defaultMetadata);

      manager.terminateSession(s1.id, 'user_requested');
      manager.pauseSession(s2.id);
      manager.addMessage(s3.id, 'user', 'Hello', { tokens: 100 });
      manager.addMessage(s3.id, 'assistant', 'Hi', { tokens: 50 });

      const stats = manager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(1);
      expect(stats.paused).toBe(1);
      expect(stats.terminated).toBe(1);
      expect(stats.totalMessages).toBe(2);
      expect(stats.totalTokens).toBe(150);
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      const manager = getSessionManager();
      
      manager.updateConfig({
        maxSessionDuration: 120,
        maxMessagesPerSession: 200,
      });

      const config = manager.getConfig();
      expect(config.maxSessionDuration).toBe(120);
      expect(config.maxMessagesPerSession).toBe(200);
    });

    it('should return default configuration', () => {
      const manager = getSessionManager();
      const config = manager.getConfig();

      expect(config.maxSessionDuration).toBe(60);
      expect(config.maxMessagesPerSession).toBe(100);
      expect(config.maxTokensPerSession).toBe(100000);
    });
  });

  describe('clear', () => {
    it('should clear all sessions', () => {
      const manager = getSessionManager();
      manager.createSession(defaultMetadata);
      manager.createSession(defaultMetadata);

      expect(manager.size).toBe(2);
      manager.clear();
      expect(manager.size).toBe(0);
    });
  });
});
