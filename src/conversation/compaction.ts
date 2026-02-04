/**
 * Conversation Compaction Utility
 * Prunes old messages and tool outputs to manage token usage
 */

import type { LLMMessage } from '../types/index.js';

export interface CompactionConfig {
  maxMessages?: number;           // e.g., 50
  maxTokensPerMessage?: number;   // e.g., 1000
  preserveRecent?: number;        // Keep last N messages
  pruneToolOutputs?: boolean;
  minToolOutputLength?: number;   // Min chars to preserve
}

export interface CompactionStats {
  originalMessageCount: number;
  finalMessageCount: number;
  removedMessages: number;
  estimatedTokensSaved: number;
  compactedAt: Date;
}

export class ConversationCompactor {
  private config: CompactionConfig;
  private stats: CompactionStats[] = [];

  constructor(config: CompactionConfig = {}) {
    this.config = {
      maxMessages: 50,
      maxTokensPerMessage: 1000,
      preserveRecent: 10,
      pruneToolOutputs: true,
      minToolOutputLength: 500,
      ...config,
    };
  }

  /**
   * Estimate tokens in text (rough: ~4 characters per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if compaction is needed
   */
  shouldCompact(messages: LLMMessage[]): boolean {
    return messages.length > this.config.maxMessages!;
  }

  /**
   * Compact conversation history
   */
  compact(messages: LLMMessage[]): LLMMessage[] {
    const originalCount = messages.length;
    const preserveCount = this.config.preserveRecent!;
    const maxMessages = this.config.maxMessages!;
    
    // If below threshold, return as-is
    if (originalCount <= maxMessages) {
      return messages;
    }
    
    // Keep recent messages as-is
    const recent = messages.slice(-preserveCount);
    const older = messages.slice(0, -preserveCount);

    // Calculate how many messages we need to remove
    const targetCount = Math.max(preserveCount, Math.floor(maxMessages * 0.8));
    const toRemove = originalCount - targetCount;

    // Process older messages - remove oldest ones first
    const compacted = older
      .filter((_, idx) => {
        // Remove the oldest messages until we reach target
        return idx >= toRemove;
      })
      .map((msg) => ({
        ...msg,
        // Truncate long messages
        content:
          msg.content.length > this.config.maxTokensPerMessage!
            ? msg.content.substring(0, this.config.maxTokensPerMessage!) +
              '\n... (truncated)'
            : msg.content,
      }));

    const result = [...compacted, ...recent];

    // Record statistics
    const savedTokens = messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0) -
                        result.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);

    this.stats.push({
      originalMessageCount: originalCount,
      finalMessageCount: result.length,
      removedMessages: originalCount - result.length,
      estimatedTokensSaved: Math.max(0, savedTokens),
      compactedAt: new Date(),
    });

    return result;
  }

  /**
   * Get compaction history
   */
  getStats(): CompactionStats[] {
    return this.stats;
  }

  /**
   * Get total tokens saved across all compactions
   */
  getTotalTokensSaved(): number {
    return this.stats.reduce((sum, s) => sum + s.estimatedTokensSaved, 0);
  }
}
