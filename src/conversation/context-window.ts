/**
 * Context Window Manager
 * Manages context window limits with smart pruning and summarization
 */

import type { LLMMessage, AgentRole } from '../types/index.js';
import { estimateTokens } from '../context/index.js';
import { AGENT_PROMPTS } from '../agents/prompts.js';

// ===========================================
// Types
// ===========================================

export interface ContextWindow {
  systemPrompt: string;
  messages: LLMMessage[];
  fileContext: FileContextEntry[];
  totalTokens: number;
  maxTokens: number;
}

export interface FileContextEntry {
  path: string;
  content: string;
  language: string;
  tokens: number;
  priority: number; // Higher = more important
  lastAccessed: Date;
}

export interface ContextWindowConfig {
  maxTokens: number;
  reservedForResponse: number;
  minMessageHistory: number;
  maxFileContextRatio: number;
  summarizationThreshold: number;
}

export interface ContextStats {
  systemPromptTokens: number;
  messageTokens: number;
  fileContextTokens: number;
  totalTokens: number;
  maxTokens: number;
  utilizationPercent: number;
  messageCount: number;
  fileCount: number;
}

export interface PruneResult {
  removedMessages: number;
  removedFiles: number;
  summarizedMessages: number;
  tokensSaved: number;
}

// ===========================================
// Context Window Manager Class
// ===========================================

export class ContextWindowManager {
  private config: ContextWindowConfig;
  private systemPrompt: string = '';
  private messages: LLMMessage[] = [];
  private fileContext: Map<string, FileContextEntry> = new Map();
  private messageSummaries: Map<number, string> = new Map();

  constructor(config: Partial<ContextWindowConfig> = {}) {
    this.config = {
      maxTokens: 128000, // Default for GPT-4/Claude
      reservedForResponse: 4096,
      minMessageHistory: 4,
      maxFileContextRatio: 0.4, // 40% max for file context
      summarizationThreshold: 0.8, // Summarize when 80% full
      ...config,
    };
  }

  // ===========================================
  // Configuration
  // ===========================================

  /**
   * Set the system prompt based on agent role
   */
  setAgentRole(role: AgentRole): void {
    this.systemPrompt = AGENT_PROMPTS[role] || '';
  }

  /**
   * Set custom system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * Update config
   */
  configure(config: Partial<ContextWindowConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===========================================
  // Message Management
  // ===========================================

  /**
   * Add a message to the context
   */
  addMessage(message: LLMMessage): boolean {
    const tokens = estimateTokens(message.content);
    
    // Check if we need to prune first
    if (this.wouldExceedLimit(tokens)) {
      this.autoPrune();
    }

    this.messages.push(message);
    return true;
  }

  /**
   * Add multiple messages
   */
  addMessages(messages: LLMMessage[]): void {
    for (const msg of messages) {
      this.addMessage(msg);
    }
  }

  /**
   * Get messages optimized for context window
   */
  getMessages(): LLMMessage[] {
    return [...this.messages];
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
    this.messageSummaries.clear();
  }

  // ===========================================
  // File Context Management
  // ===========================================

  /**
   * Add file to context
   */
  addFile(path: string, content: string, language: string, priority: number = 5): boolean {
    const tokens = estimateTokens(content);
    const maxFileTokens = this.config.maxTokens * this.config.maxFileContextRatio;

    // Check if this single file is too large
    if (tokens > maxFileTokens * 0.5) {
      // Truncate large files
      const truncatedContent = this.truncateContent(content, Math.floor(maxFileTokens * 0.3));
      const entry: FileContextEntry = {
        path,
        content: truncatedContent,
        language,
        tokens: estimateTokens(truncatedContent),
        priority,
        lastAccessed: new Date(),
      };
      this.fileContext.set(path, entry);
      return true;
    }

    // Check if we need to evict other files
    const currentFileTokens = this.getFileContextTokens();
    if (currentFileTokens + tokens > maxFileTokens) {
      this.evictLowPriorityFiles(tokens);
    }

    const entry: FileContextEntry = {
      path,
      content,
      language,
      tokens,
      priority,
      lastAccessed: new Date(),
    };

    this.fileContext.set(path, entry);
    return true;
  }

  /**
   * Remove file from context
   */
  removeFile(path: string): boolean {
    return this.fileContext.delete(path);
  }

  /**
   * Update file priority (higher = more important)
   */
  updateFilePriority(path: string, priority: number): void {
    const entry = this.fileContext.get(path);
    if (entry) {
      entry.priority = priority;
      entry.lastAccessed = new Date();
    }
  }

  /**
   * Get all file context entries
   */
  getFileContext(): FileContextEntry[] {
    return Array.from(this.fileContext.values()).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Clear all file context
   */
  clearFileContext(): void {
    this.fileContext.clear();
  }

  // ===========================================
  // Context Building
  // ===========================================

  /**
   * Build the full context window
   */
  buildContextWindow(): ContextWindow {
    const availableTokens = this.config.maxTokens - this.config.reservedForResponse;
    
    // Calculate system prompt tokens
    const systemTokens = estimateTokens(this.systemPrompt);
    let remainingTokens = availableTokens - systemTokens;

    // Allocate tokens for file context (up to maxFileContextRatio)
    const maxFileTokens = Math.min(
      remainingTokens * this.config.maxFileContextRatio,
      this.getFileContextTokens()
    );

    // Build file context
    const fileContext = this.buildFileContext(maxFileTokens);
    const fileTokens = fileContext.reduce((sum, f) => sum + f.tokens, 0);
    remainingTokens -= fileTokens;

    // Build message history
    const messages = this.buildMessageHistory(remainingTokens);
    const messageTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

    const totalTokens = systemTokens + fileTokens + messageTokens;

    return {
      systemPrompt: this.systemPrompt,
      messages,
      fileContext,
      totalTokens,
      maxTokens: this.config.maxTokens,
    };
  }

  /**
   * Build file context within token limit
   */
  private buildFileContext(maxTokens: number): FileContextEntry[] {
    const entries = this.getFileContext();
    const result: FileContextEntry[] = [];
    let currentTokens = 0;

    for (const entry of entries) {
      if (currentTokens + entry.tokens <= maxTokens) {
        result.push(entry);
        currentTokens += entry.tokens;
      }
    }

    return result;
  }

  /**
   * Build message history within token limit
   */
  private buildMessageHistory(maxTokens: number): LLMMessage[] {
    const result: LLMMessage[] = [];
    let currentTokens = 0;

    // Always include minimum history (most recent)
    const recentMessages = this.messages.slice(-this.config.minMessageHistory);
    for (const msg of recentMessages) {
      const tokens = estimateTokens(msg.content);
      result.push(msg);
      currentTokens += tokens;
    }

    // Add older messages if space permits
    const olderMessages = this.messages.slice(0, -this.config.minMessageHistory).reverse();
    for (const msg of olderMessages) {
      const tokens = estimateTokens(msg.content);
      if (currentTokens + tokens <= maxTokens) {
        result.unshift(msg);
        currentTokens += tokens;
      } else {
        break;
      }
    }

    return result;
  }

  // ===========================================
  // Pruning & Summarization
  // ===========================================

  /**
   * Auto-prune to fit within limits
   */
  autoPrune(): PruneResult {
    const result: PruneResult = {
      removedMessages: 0,
      removedFiles: 0,
      summarizedMessages: 0,
      tokensSaved: 0,
    };

    const stats = this.getStats();
    const targetUtilization = 0.7; // Prune down to 70%
    const targetTokens = this.config.maxTokens * targetUtilization;

    if (stats.totalTokens <= targetTokens) {
      return result;
    }

    const tokensToRemove = stats.totalTokens - targetTokens;
    let tokensSaved = 0;

    // First, evict low-priority files
    const files = Array.from(this.fileContext.entries())
      .sort(([, a], [, b]) => a.priority - b.priority);

    for (const [path, entry] of files) {
      if (tokensSaved >= tokensToRemove) break;
      
      this.fileContext.delete(path);
      tokensSaved += entry.tokens;
      result.removedFiles++;
    }

    // If still need more, remove old messages
    if (tokensSaved < tokensToRemove) {
      const minKeep = this.config.minMessageHistory;
      while (
        this.messages.length > minKeep &&
        tokensSaved < tokensToRemove
      ) {
        const removed = this.messages.shift();
        if (removed) {
          tokensSaved += estimateTokens(removed.content);
          result.removedMessages++;
        }
      }
    }

    result.tokensSaved = tokensSaved;
    return result;
  }

  /**
   * Evict low priority files to make room
   */
  private evictLowPriorityFiles(neededTokens: number): void {
    const files = Array.from(this.fileContext.entries())
      .sort(([, a], [, b]) => {
        // Sort by priority (ascending) then by last accessed (oldest first)
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.lastAccessed.getTime() - b.lastAccessed.getTime();
      });

    let freedTokens = 0;
    for (const [path, entry] of files) {
      if (freedTokens >= neededTokens) break;
      
      this.fileContext.delete(path);
      freedTokens += entry.tokens;
    }
  }

  /**
   * Truncate content to fit token limit
   */
  private truncateContent(content: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (content.length <= maxChars) return content;

    // Try to truncate at a reasonable boundary
    const truncated = content.slice(0, maxChars);
    const lastNewline = truncated.lastIndexOf('\n');
    
    if (lastNewline > maxChars * 0.8) {
      return truncated.slice(0, lastNewline) + '\n\n... (truncated)';
    }

    return truncated + '\n\n... (truncated)';
  }

  // ===========================================
  // Statistics
  // ===========================================

  /**
   * Get context statistics
   */
  getStats(): ContextStats {
    const systemPromptTokens = estimateTokens(this.systemPrompt);
    const messageTokens = this.messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0
    );
    const fileContextTokens = this.getFileContextTokens();
    const totalTokens = systemPromptTokens + messageTokens + fileContextTokens;

    return {
      systemPromptTokens,
      messageTokens,
      fileContextTokens,
      totalTokens,
      maxTokens: this.config.maxTokens,
      utilizationPercent: (totalTokens / this.config.maxTokens) * 100,
      messageCount: this.messages.length,
      fileCount: this.fileContext.size,
    };
  }

  /**
   * Get total file context tokens
   */
  private getFileContextTokens(): number {
    let total = 0;
    for (const entry of this.fileContext.values()) {
      total += entry.tokens;
    }
    return total;
  }

  /**
   * Check if adding tokens would exceed limit
   */
  private wouldExceedLimit(additionalTokens: number): boolean {
    const stats = this.getStats();
    const threshold = this.config.maxTokens * this.config.summarizationThreshold;
    return stats.totalTokens + additionalTokens > threshold;
  }

  /**
   * Get available tokens for new content
   */
  getAvailableTokens(): number {
    const stats = this.getStats();
    return this.config.maxTokens - this.config.reservedForResponse - stats.totalTokens;
  }

  // ===========================================
  // Serialization
  // ===========================================

  /**
   * Export state to JSON
   */
  toJSON(): string {
    return JSON.stringify({
      config: this.config,
      systemPrompt: this.systemPrompt,
      messages: this.messages,
      fileContext: Array.from(this.fileContext.entries()),
    });
  }

  /**
   * Import state from JSON
   */
  fromJSON(json: string): void {
    const data = JSON.parse(json);
    this.config = { ...this.config, ...data.config };
    this.systemPrompt = data.systemPrompt || '';
    this.messages = data.messages || [];
    this.fileContext = new Map(data.fileContext || []);
  }
}

// ===========================================
// Factory Function
// ===========================================

export function createContextWindowManager(
  config?: Partial<ContextWindowConfig>
): ContextWindowManager {
  return new ContextWindowManager(config);
}

// ===========================================
// Singleton Export
// ===========================================

export const contextWindowManager = new ContextWindowManager();
