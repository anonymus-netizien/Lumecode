/**
 * Cost Tracking System
 * Tracks LLM usage and costs per provider and session
 */

import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';
import type { ProviderName, AgentRole } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ModelPricing {
  inputCostPer1M: number;    // $ per million tokens
  outputCostPer1M: number;   // $ per million tokens
}

export interface CostRecord {
  id: string;
  timestamp: Date;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  agentRole: AgentRole;
  sessionId: string;
}

export interface CostSummary {
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  byProvider: Record<ProviderName, { cost: number; tokens: number }>;
  byAgent: Record<AgentRole, { cost: number; tokens: number }>;
}

// ============================================================================
// Pricing Data
// ============================================================================

export const PROVIDER_PRICING: Record<string, Record<string, ModelPricing>> = {
  gemini: {
    'gemini-2.0-flash': {
      inputCostPer1M: 0,      // Free tier
      outputCostPer1M: 0,
    },
    'gemini-1.5-pro': {
      inputCostPer1M: 3.5,
      outputCostPer1M: 10.5,
    },
    '*': {
      inputCostPer1M: 0,
      outputCostPer1M: 0,
    },
  },
  openai: {
    'gpt-4': {
      inputCostPer1M: 30,
      outputCostPer1M: 60,
    },
    'gpt-3.5-turbo': {
      inputCostPer1M: 0.5,
      outputCostPer1M: 1.5,
    },
    '*': {
      inputCostPer1M: 0.5,
      outputCostPer1M: 1.5,
    },
  },
  groq: {
    'mixtral-8x7b-32768': {
      inputCostPer1M: 0.24,
      outputCostPer1M: 0.24,
    },
    '*': {
      inputCostPer1M: 0.24,
      outputCostPer1M: 0.24,
    },
  },
  openrouter: {
    'mistral-7b': {
      inputCostPer1M: 0.14,
      outputCostPer1M: 0.42,
    },
    '*': {
      inputCostPer1M: 0.1,
      outputCostPer1M: 0.3,
    },
  },
  ollama: {
    '*': {
      inputCostPer1M: 0,      // Local, no cost
      outputCostPer1M: 0,
    },
  },
};

// ============================================================================
// Cost Estimator
// ============================================================================

export function estimateCost(
  provider: ProviderName,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const providerPrices = PROVIDER_PRICING[provider];
  if (!providerPrices) return 0;

  const pricing = providerPrices[model] || providerPrices['*'];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1M;

  return inputCost + outputCost;
}

// ============================================================================
// Cost Tracker
// ============================================================================

export class CostTracker {
  private db: Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(homedir(), '.lumecode', 'costs.db');
    this.db = new Database(this.dbPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cost_records (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cost REAL NOT NULL,
        agent_role TEXT NOT NULL,
        session_id TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session ON cost_records(session_id);
      CREATE INDEX IF NOT EXISTS idx_provider ON cost_records(provider);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON cost_records(timestamp);
    `);
  }

  /**
   * Record a new cost entry
   */
  record(
    provider: ProviderName,
    model: string,
    inputTokens: number,
    outputTokens: number,
    agentRole: AgentRole,
    sessionId: string
  ): CostRecord {
    const cost = estimateCost(provider, model, inputTokens, outputTokens);
    const record: CostRecord = {
      id: randomUUID(),
      timestamp: new Date(),
      provider,
      model,
      inputTokens,
      outputTokens,
      cost,
      agentRole,
      sessionId,
    };

    const stmt = this.db.prepare(`
      INSERT INTO cost_records
      (id, timestamp, provider, model, input_tokens, output_tokens, cost, agent_role, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.id,
      record.timestamp.toISOString(),
      provider,
      model,
      inputTokens,
      outputTokens,
      cost,
      agentRole,
      sessionId
    );

    return record;
  }

  /**
   * Get total cost for a session
   */
  getSessionCost(sessionId: string): number {
    const result = this.db.prepare(`
      SELECT SUM(cost) as total FROM cost_records
      WHERE session_id = ?
    `).get(sessionId) as { total: number | null };

    return result.total || 0;
  }

  /**
   * Get cost breakdown by provider for a session
   */
  getCostByProvider(sessionId: string): Record<ProviderName, number> {
    const rows = this.db.prepare(`
      SELECT provider, SUM(cost) as total FROM cost_records
      WHERE session_id = ?
      GROUP BY provider
    `).all(sessionId) as Array<{ provider: ProviderName; total: number }>;

    const result: Record<ProviderName, number> = {
      gemini: 0,
      openrouter: 0,
      groq: 0,
      ollama: 0,
    };

    for (const row of rows) {
      result[row.provider] = row.total;
    }

    return result;
  }

  /**
   * Get total cost for a specific date
   */
  getDailyCost(date: string): number {
    const result = this.db.prepare(`
      SELECT SUM(cost) as total FROM cost_records
      WHERE DATE(timestamp) = ?
    `).get(date) as { total: number | null };

    return result.total || 0;
  }

  /**
   * Get comprehensive cost summary
   */
  getSummary(sessionId: string): CostSummary {
    const records = this.db.prepare(`
      SELECT * FROM cost_records WHERE session_id = ?
    `).all(sessionId) as Array<{
      provider: ProviderName;
      agent_role: AgentRole;
      input_tokens: number;
      output_tokens: number;
      cost: number;
    }>;

    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const byProvider: Record<string, { cost: number; tokens: number }> = {
      gemini: { cost: 0, tokens: 0 },
      openrouter: { cost: 0, tokens: 0 },
      groq: { cost: 0, tokens: 0 },
      ollama: { cost: 0, tokens: 0 },
    };

    const byAgent: Record<string, { cost: number; tokens: number }> = {
      build: { cost: 0, tokens: 0 },
      plan: { cost: 0, tokens: 0 },
      review: { cost: 0, tokens: 0 },
      general: { cost: 0, tokens: 0 },
    };

    for (const record of records) {
      totalCost += record.cost;
      totalInputTokens += record.input_tokens;
      totalOutputTokens += record.output_tokens;

      if (!byProvider[record.provider]) {
        byProvider[record.provider] = { cost: 0, tokens: 0 };
      }
      byProvider[record.provider].cost += record.cost;
      byProvider[record.provider].tokens += record.input_tokens + record.output_tokens;

      if (!byAgent[record.agent_role]) {
        byAgent[record.agent_role] = { cost: 0, tokens: 0 };
      }
      byAgent[record.agent_role].cost += record.cost;
      byAgent[record.agent_role].tokens += record.input_tokens + record.output_tokens;
    }

    return {
      totalCost,
      totalTokens: totalInputTokens + totalOutputTokens,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      byProvider,
      byAgent,
    };
  }

  /**
   * Get monthly costs
   */
  getMonthlyStats(year: number, month: number): CostSummary {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const records = this.db.prepare(`
      SELECT * FROM cost_records
      WHERE strftime('%Y-%m', timestamp) = ?
    `).all(monthStr) as Array<{
      provider: ProviderName;
      agent_role: AgentRole;
      input_tokens: number;
      output_tokens: number;
      cost: number;
    }>;

    // Similar aggregation as getSummary
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const byProvider: Record<ProviderName, { cost: number; tokens: number }> = {
      gemini: { cost: 0, tokens: 0 },
      openrouter: { cost: 0, tokens: 0 },
      groq: { cost: 0, tokens: 0 },
      ollama: { cost: 0, tokens: 0 },
    };

    const byAgent: Record<AgentRole, { cost: number; tokens: number }> = {
      build: { cost: 0, tokens: 0 },
      plan: { cost: 0, tokens: 0 },
      review: { cost: 0, tokens: 0 },
      general: { cost: 0, tokens: 0 },
    };

    for (const record of records) {
      totalCost += record.cost;
      totalInputTokens += record.input_tokens;
      totalOutputTokens += record.output_tokens;

      byProvider[record.provider].cost += record.cost;
      byProvider[record.provider].tokens += record.input_tokens + record.output_tokens;

      byAgent[record.agent_role].cost += record.cost;
      byAgent[record.agent_role].tokens += record.input_tokens + record.output_tokens;
    }

    return {
      totalCost,
      totalTokens: totalInputTokens + totalOutputTokens,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      byProvider,
      byAgent,
    };
  }

  /**
   * Export costs as CSV
   */
  exportCSV(sessionId: string): string {
    const records = this.db.prepare(`
      SELECT * FROM cost_records
      WHERE session_id = ?
      ORDER BY timestamp DESC
    `).all(sessionId) as CostRecord[];

    const rows = records.map(
      (r) =>
        `${r.timestamp},${r.provider},${r.model},${r.inputTokens},${r.outputTokens},${r.cost},${r.agentRole}`
    );

    return (
      'Timestamp,Provider,Model,InputTokens,OutputTokens,Cost,Agent\n' +
      rows.join('\n')
    );
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

export const costTracker = new CostTracker();
