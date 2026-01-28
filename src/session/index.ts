/**
 * Session Storage using Bun's Native SQLite
 * Handles persistent storage of chat sessions
 */

import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';
import { configManager } from '../config/index.js';
import type {
  Session,
  SessionSummary,
  LLMMessage,
  AgentRole,
  ProviderName,
} from '../types/index.js';
import { SessionError } from '../types/index.js';

// ===========================================
// Database Schema
// ===========================================

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    agent TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    working_directory TEXT NOT NULL,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    name TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
`;

// ===========================================
// Session Manager Class
// ===========================================

class SessionManager {
  private db: Database | null = null;

  /**
   * Initialize the database connection
   */
  initialize(): void {
    if (this.db) return;

    const dbPath = configManager.getDatabasePath();
    this.db = new Database(dbPath);
    
    // Enable foreign keys
    this.db.run('PRAGMA foreign_keys = ON');
    
    // Create schema - run each statement separately
    const statements = SCHEMA.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      this.db.run(stmt);
    }
  }

  /**
   * Ensure database is initialized
   */
  private ensureDb(): Database {
    if (!this.db) {
      this.initialize();
    }
    return this.db!;
  }

  // ===========================================
  // Session CRUD Operations
  // ===========================================

  /**
   * Create a new session
   */
  create(options: {
    name?: string;
    agent?: AgentRole;
    provider?: ProviderName;
    model?: string;
    workingDirectory?: string;
  } = {}): Session {
    const db = this.ensureDb();
    const now = new Date();
    
    const session: Session = {
      id: randomUUID(),
      name: options.name || `Session ${now.toLocaleDateString()}`,
      createdAt: now,
      updatedAt: now,
      agent: options.agent || 'build',
      provider: options.provider || 'gemini',
      model: options.model || 'gemini-2.0-flash-exp',
      workingDirectory: options.workingDirectory || process.cwd(),
      messages: [],
      metadata: {},
    };

    const stmt = db.prepare(`
      INSERT INTO sessions (id, name, created_at, updated_at, agent, provider, model, working_directory, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.name,
      session.createdAt.toISOString(),
      session.updatedAt.toISOString(),
      session.agent,
      session.provider,
      session.model,
      session.workingDirectory,
      JSON.stringify(session.metadata)
    );

    return session;
  }

  /**
   * Get a session by ID
   */
  get(id: string): Session | null {
    const db = this.ensureDb();
    
    const sessionRow = db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `).get(id) as any;

    if (!sessionRow) return null;

    const messages = db.prepare(`
      SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC
    `).all(id) as any[];

    return {
      id: sessionRow.id,
      name: sessionRow.name,
      createdAt: new Date(sessionRow.created_at),
      updatedAt: new Date(sessionRow.updated_at),
      agent: sessionRow.agent as AgentRole,
      provider: sessionRow.provider as ProviderName,
      model: sessionRow.model,
      workingDirectory: sessionRow.working_directory,
      messages: messages.map((m) => ({
        role: m.role as LLMMessage['role'],
        content: m.content,
        name: m.name || undefined,
        timestamp: new Date(m.timestamp),
      })),
      metadata: sessionRow.metadata ? JSON.parse(sessionRow.metadata) : {},
    };
  }

  /**
   * Update session details
   */
  update(id: string, updates: Partial<Omit<Session, 'id' | 'messages'>>): boolean {
    const db = this.ensureDb();
    
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.agent !== undefined) {
      fields.push('agent = ?');
      values.push(updates.agent);
    }
    if (updates.provider !== undefined) {
      fields.push('provider = ?');
      values.push(updates.provider);
    }
    if (updates.model !== undefined) {
      fields.push('model = ?');
      values.push(updates.model);
    }
    if (updates.workingDirectory !== undefined) {
      fields.push('working_directory = ?');
      values.push(updates.workingDirectory);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    if (fields.length === 0) return false;

    // Always update timestamp
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const result = db.prepare(`
      UPDATE sessions SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  }

  /**
   * Delete a session
   */
  delete(id: string): boolean {
    const db = this.ensureDb();
    
    // Delete messages first (due to foreign key)
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
    
    const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * List all sessions with summaries
   */
  list(limit = 50, offset = 0): SessionSummary[] {
    const db = this.ensureDb();
    
    const rows = db.prepare(`
      SELECT 
        s.id,
        s.name,
        s.created_at,
        s.updated_at,
        s.agent,
        s.provider,
        s.model,
        s.working_directory,
        COUNT(m.id) as message_count
      FROM sessions s
      LEFT JOIN messages m ON s.id = m.session_id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      agent: row.agent as AgentRole,
      provider: row.provider as ProviderName,
      model: row.model,
      workingDirectory: row.working_directory,
      messageCount: row.message_count,
    }));
  }

  /**
   * Search sessions by name or content
   */
  search(query: string, limit = 20): SessionSummary[] {
    const db = this.ensureDb();
    const searchTerm = `%${query}%`;
    
    const rows = db.prepare(`
      SELECT DISTINCT
        s.id,
        s.name,
        s.created_at,
        s.updated_at,
        s.agent,
        s.provider,
        s.model,
        s.working_directory,
        (SELECT COUNT(*) FROM messages WHERE session_id = s.id) as message_count
      FROM sessions s
      LEFT JOIN messages m ON s.id = m.session_id
      WHERE s.name LIKE ? OR m.content LIKE ?
      ORDER BY s.updated_at DESC
      LIMIT ?
    `).all(searchTerm, searchTerm, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      agent: row.agent as AgentRole,
      provider: row.provider as ProviderName,
      model: row.model,
      workingDirectory: row.working_directory,
      messageCount: row.message_count,
    }));
  }

  // ===========================================
  // Message Operations
  // ===========================================

  /**
   * Add a message to a session
   */
  addMessage(sessionId: string, message: LLMMessage): void {
    const db = this.ensureDb();
    
    const stmt = db.prepare(`
      INSERT INTO messages (session_id, role, content, name, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      sessionId,
      message.role,
      message.content,
      message.name || null,
      (message.timestamp || new Date()).toISOString()
    );

    // Update session timestamp
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), sessionId);
  }

  /**
   * Get messages for a session
   */
  getMessages(sessionId: string, limit?: number): LLMMessage[] {
    const db = this.ensureDb();
    
    let query = 'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC';
    const params: any[] = [sessionId];
    
    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    
    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((m) => ({
      role: m.role as LLMMessage['role'],
      content: m.content,
      name: m.name || undefined,
      timestamp: new Date(m.timestamp),
    }));
  }

  /**
   * Get last N messages from a session
   */
  getLastMessages(sessionId: string, count: number): LLMMessage[] {
    const db = this.ensureDb();
    
    const rows = db.prepare(`
      SELECT * FROM (
        SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?
      ) ORDER BY timestamp ASC
    `).all(sessionId, count) as any[];

    return rows.map((m) => ({
      role: m.role as LLMMessage['role'],
      content: m.content,
      name: m.name || undefined,
      timestamp: new Date(m.timestamp),
    }));
  }

  /**
   * Clear messages from a session
   */
  clearMessages(sessionId: string): void {
    const db = this.ensureDb();
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  }

  // ===========================================
  // Statistics & Utilities
  // ===========================================

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    totalMessages: number;
    oldestSession: Date | null;
    newestSession: Date | null;
  } {
    const db = this.ensureDb();
    
    const sessionCount = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any).count;
    const messageCount = (db.prepare('SELECT COUNT(*) as count FROM messages').get() as any).count;
    const oldest = db.prepare('SELECT MIN(created_at) as date FROM sessions').get() as any;
    const newest = db.prepare('SELECT MAX(created_at) as date FROM sessions').get() as any;

    return {
      totalSessions: sessionCount,
      totalMessages: messageCount,
      oldestSession: oldest.date ? new Date(oldest.date) : null,
      newestSession: newest.date ? new Date(newest.date) : null,
    };
  }

  /**
   * Get the most recent session
   */
  getLatest(): Session | null {
    const db = this.ensureDb();
    
    const row = db.prepare(`
      SELECT id FROM sessions ORDER BY updated_at DESC LIMIT 1
    `).get() as any;

    if (!row) return null;
    return this.get(row.id);
  }

  /**
   * Export a session to JSON
   */
  export(id: string): string | null {
    const session = this.get(id);
    if (!session) return null;

    return JSON.stringify(session, null, 2);
  }

  /**
   * Import a session from JSON
   */
  import(json: string): Session {
    const db = this.ensureDb();
    
    let data: Session;
    try {
      data = JSON.parse(json);
    } catch {
      throw new SessionError('Invalid JSON format', 'SESSION_IMPORT_ERROR');
    }

    // Generate new ID to avoid conflicts
    const newId = randomUUID();
    const now = new Date();

    const stmt = db.prepare(`
      INSERT INTO sessions (id, name, created_at, updated_at, agent, provider, model, working_directory, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      newId,
      data.name || 'Imported Session',
      (data.createdAt ? new Date(data.createdAt) : now).toISOString(),
      now.toISOString(),
      data.agent || 'build',
      data.provider || 'gemini',
      data.model || 'gemini-2.0-flash-exp',
      data.workingDirectory || process.cwd(),
      JSON.stringify(data.metadata || {})
    );

    // Import messages if present
    if (data.messages && Array.isArray(data.messages)) {
      const msgStmt = db.prepare(`
        INSERT INTO messages (session_id, role, content, name, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const msg of data.messages) {
        msgStmt.run(
          newId,
          msg.role,
          msg.content,
          msg.name || null,
          (msg.timestamp ? new Date(msg.timestamp) : now).toISOString()
        );
      }
    }

    return this.get(newId)!;
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Delete old sessions (cleanup)
   */
  cleanup(daysOld = 30): number {
    const db = this.ensureDb();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    // Get sessions to delete
    const sessionsToDelete = db.prepare(`
      SELECT id FROM sessions WHERE updated_at < ?
    `).all(cutoff.toISOString()) as any[];

    // Delete messages first
    for (const { id } of sessionsToDelete) {
      db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
    }

    // Delete sessions
    const result = db.prepare('DELETE FROM sessions WHERE updated_at < ?')
      .run(cutoff.toISOString());

    return result.changes;
  }
}

// ===========================================
// Export Singleton Instance
// ===========================================

export const sessionManager = new SessionManager();
export { SessionManager };
