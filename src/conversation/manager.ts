/**
 * Conversation Manager
 * Handles multi-turn conversations with memory and context management
 */

import { randomUUID } from 'crypto';
import type {
  LLMMessage,
  AgentRole,
  ToolCall,
  ToolResult,
} from '../types/index.js';
import { estimateTokens } from '../context/index.js';

// ===========================================
// Types
// ===========================================

export interface ConversationMessage extends LLMMessage {
  id: string;
  timestamp: Date;
  tokenCount: number;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  metadata?: {
    model?: string;
    latency?: number;
    cached?: boolean;
    edited?: boolean;
    originalContent?: string;
    canBeSummarized?: boolean;
  };
}

export interface ConversationBranch {
  id: string;
  name: string;
  parentId: string | null;
  branchPointMessageId: string | null;
  createdAt: Date;
  messages: ConversationMessage[];
}

export interface ConversationState {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  branches: Map<string, ConversationBranch>;
  currentBranchId: string;
  agentRole: AgentRole;
  systemPrompt: string;
  metadata: Record<string, unknown>;
}

export interface ConversationConfig {
  maxContextTokens: number;
  maxHistoryMessages: number;
  summarizeThreshold: number;
  preserveSystemPrompt: boolean;
  enableBranching: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  branchCount: number;
  lastMessage: string;
  lastUpdated: Date;
  agentRole: AgentRole;
}

// ===========================================
// Conversation Manager Class
// ===========================================

export class ConversationManager {
  private config: ConversationConfig;
  private conversations: Map<string, ConversationState> = new Map();
  private activeConversationId: string | null = null;

  constructor(config: Partial<ConversationConfig> = {}) {
    this.config = {
      maxContextTokens: 100000,
      maxHistoryMessages: 100,
      summarizeThreshold: 50,
      preserveSystemPrompt: true,
      enableBranching: true,
      ...config,
    };
  }

  // ===========================================
  // Conversation CRUD
  // ===========================================

  /**
   * Create a new conversation
   */
  create(options: {
    title?: string;
    agentRole?: AgentRole;
    systemPrompt?: string;
    metadata?: Record<string, unknown>;
  } = {}): ConversationState {
    const id = randomUUID();
    const now = new Date();
    const mainBranchId = 'main';

    const mainBranch: ConversationBranch = {
      id: mainBranchId,
      name: 'Main',
      parentId: null,
      branchPointMessageId: null,
      createdAt: now,
      messages: [],
    };

    const conversation: ConversationState = {
      id,
      title: options.title || `Conversation ${now.toLocaleDateString()}`,
      createdAt: now,
      updatedAt: now,
      branches: new Map([[mainBranchId, mainBranch]]),
      currentBranchId: mainBranchId,
      agentRole: options.agentRole || 'build',
      systemPrompt: options.systemPrompt || '',
      metadata: options.metadata || {},
    };

    this.conversations.set(id, conversation);
    this.activeConversationId = id;

    return conversation;
  }

  /**
   * Get a conversation by ID
   */
  get(id: string): ConversationState | null {
    return this.conversations.get(id) || null;
  }

  /**
   * Get the active conversation
   */
  getActive(): ConversationState | null {
    if (!this.activeConversationId) return null;
    return this.get(this.activeConversationId);
  }

  /**
   * Set active conversation
   */
  setActive(id: string): boolean {
    if (!this.conversations.has(id)) return false;
    this.activeConversationId = id;
    return true;
  }

  /**
   * List all conversations
   */
  list(): ConversationSummary[] {
    const summaries: ConversationSummary[] = [];

    for (const [id, conv] of this.conversations) {
      const currentBranch = conv.branches.get(conv.currentBranchId);
      const lastMessage = currentBranch?.messages[currentBranch.messages.length - 1];

      summaries.push({
        id,
        title: conv.title,
        messageCount: this.getTotalMessageCount(conv),
        branchCount: conv.branches.size,
        lastMessage: lastMessage?.content.slice(0, 100) || '',
        lastUpdated: conv.updatedAt,
        agentRole: conv.agentRole,
      });
    }

    return summaries.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  }

  /**
   * Delete a conversation
   */
  delete(id: string): boolean {
    const deleted = this.conversations.delete(id);
    if (this.activeConversationId === id) {
      this.activeConversationId = null;
    }
    return deleted;
  }

  /**
   * Update conversation metadata
   */
  update(id: string, updates: {
    title?: string;
    agentRole?: AgentRole;
    systemPrompt?: string;
    metadata?: Record<string, unknown>;
  }): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;

    if (updates.title) conv.title = updates.title;
    if (updates.agentRole) conv.agentRole = updates.agentRole;
    if (updates.systemPrompt) conv.systemPrompt = updates.systemPrompt;
    if (updates.metadata) conv.metadata = { ...conv.metadata, ...updates.metadata };
    conv.updatedAt = new Date();

    return true;
  }

  // ===========================================
  // Message Management
  // ===========================================

  /**
   * Add a message to the active conversation
   */
  addMessage(message: Omit<ConversationMessage, 'id' | 'timestamp' | 'tokenCount'>): ConversationMessage | null {
    const conv = this.getActive();
    if (!conv) return null;

    const branch = conv.branches.get(conv.currentBranchId);
    if (!branch) return null;

    const fullMessage: ConversationMessage = {
      ...message,
      id: randomUUID(),
      timestamp: new Date(),
      tokenCount: estimateTokens(message.content),
    };

    branch.messages.push(fullMessage);
    conv.updatedAt = new Date();

    // Check if we need to summarize
    if (branch.messages.length > this.config.summarizeThreshold) {
      this.maybeSummarize(conv, branch);
    }

    return fullMessage;
  }

  /**
   * Get messages from the current branch
   */
  getMessages(conversationId?: string): ConversationMessage[] {
    const id = conversationId || this.activeConversationId;
    if (!id) return [];

    const conv = this.conversations.get(id);
    if (!conv) return [];

    const branch = conv.branches.get(conv.currentBranchId);
    return branch?.messages || [];
  }

  /**
   * Get messages formatted for LLM
   */
  getMessagesForLLM(conversationId?: string): LLMMessage[] {
    const messages = this.getMessages(conversationId);
    return messages.map(m => ({
      role: m.role,
      content: m.content,
      name: m.name,
    }));
  }

  /**
   * Edit a message (creates a new version)
   */
  editMessage(messageId: string, newContent: string): ConversationMessage | null {
    const conv = this.getActive();
    if (!conv) return null;

    const branch = conv.branches.get(conv.currentBranchId);
    if (!branch) return null;

    const messageIndex = branch.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return null;

    const originalMessage = branch.messages[messageIndex];
    const editedMessage: ConversationMessage = {
      ...originalMessage,
      content: newContent,
      tokenCount: estimateTokens(newContent),
      metadata: {
        ...originalMessage.metadata,
        edited: true,
        originalContent: originalMessage.content,
      },
    };

    branch.messages[messageIndex] = editedMessage;
    conv.updatedAt = new Date();

    return editedMessage;
  }

  /**
   * Delete messages after a certain point (for regeneration)
   */
  deleteMessagesAfter(messageId: string): number {
    const conv = this.getActive();
    if (!conv) return 0;

    const branch = conv.branches.get(conv.currentBranchId);
    if (!branch) return 0;

    const messageIndex = branch.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return 0;

    const deleted = branch.messages.length - messageIndex - 1;
    branch.messages = branch.messages.slice(0, messageIndex + 1);
    conv.updatedAt = new Date();

    return deleted;
  }

  // ===========================================
  // Branching
  // ===========================================

  /**
   * Create a new branch from a specific message
   */
  createBranch(name: string, fromMessageId?: string): ConversationBranch | null {
    if (!this.config.enableBranching) return null;

    const conv = this.getActive();
    if (!conv) return null;

    const currentBranch = conv.branches.get(conv.currentBranchId);
    if (!currentBranch) return null;

    // Find the branch point
    let branchPointIndex = currentBranch.messages.length - 1;
    if (fromMessageId) {
      branchPointIndex = currentBranch.messages.findIndex(m => m.id === fromMessageId);
      if (branchPointIndex === -1) return null;
    }

    const branchId = randomUUID();
    const newBranch: ConversationBranch = {
      id: branchId,
      name,
      parentId: conv.currentBranchId,
      branchPointMessageId: currentBranch.messages[branchPointIndex]?.id || null,
      createdAt: new Date(),
      messages: [...currentBranch.messages.slice(0, branchPointIndex + 1)],
    };

    conv.branches.set(branchId, newBranch);
    conv.currentBranchId = branchId;
    conv.updatedAt = new Date();

    return newBranch;
  }

  /**
   * Switch to a different branch
   */
  switchBranch(branchId: string): boolean {
    const conv = this.getActive();
    if (!conv) return false;

    if (!conv.branches.has(branchId)) return false;

    conv.currentBranchId = branchId;
    conv.updatedAt = new Date();
    return true;
  }

  /**
   * List branches in the active conversation
   */
  listBranches(): Array<{ id: string; name: string; messageCount: number; isCurrent: boolean }> {
    const conv = this.getActive();
    if (!conv) return [];

    return Array.from(conv.branches.values()).map(branch => ({
      id: branch.id,
      name: branch.name,
      messageCount: branch.messages.length,
      isCurrent: branch.id === conv.currentBranchId,
    }));
  }

  /**
   * Merge a branch back into parent
   */
  mergeBranch(branchId: string): boolean {
    const conv = this.getActive();
    if (!conv) return false;

    const branch = conv.branches.get(branchId);
    if (!branch || !branch.parentId) return false;

    const parentBranch = conv.branches.get(branch.parentId);
    if (!parentBranch) return false;

    // Find the branch point in parent
    const branchPointIndex = branch.branchPointMessageId
      ? parentBranch.messages.findIndex(m => m.id === branch.branchPointMessageId)
      : -1;

    // Get new messages from the branch (after branch point)
    const newMessages = branch.messages.slice(branchPointIndex + 1);

    // Append to parent
    parentBranch.messages.push(...newMessages);
    
    // Delete the merged branch
    conv.branches.delete(branchId);
    conv.currentBranchId = branch.parentId;
    conv.updatedAt = new Date();

    return true;
  }

  // ===========================================
  // Context Management
  // ===========================================

  /**
   * Get context-optimized messages for LLM
   */
  getContextOptimizedMessages(maxTokens?: number): LLMMessage[] {
    const conv = this.getActive();
    if (!conv) return [];

    const branch = conv.branches.get(conv.currentBranchId);
    if (!branch) return [];

    const targetTokens = maxTokens || this.config.maxContextTokens;
    const messages: LLMMessage[] = [];
    let currentTokens = 0;

    // Always include system prompt if set
    if (this.config.preserveSystemPrompt && conv.systemPrompt) {
      currentTokens += estimateTokens(conv.systemPrompt);
    }

    // Add messages from most recent, working backwards
    const reversedMessages = [...branch.messages].reverse();
    
    for (const msg of reversedMessages) {
      if (currentTokens + msg.tokenCount > targetTokens * 0.9) {
        break;
      }
      messages.unshift({
        role: msg.role,
        content: msg.content,
        name: msg.name,
      });
      currentTokens += msg.tokenCount;
    }

    return messages;
  }

  /**
   * Get token count for current conversation
   */
  getTokenCount(): number {
    const conv = this.getActive();
    if (!conv) return 0;

    const branch = conv.branches.get(conv.currentBranchId);
    if (!branch) return 0;

    return branch.messages.reduce((sum, m) => sum + m.tokenCount, 0);
  }

  /**
   * Maybe summarize old messages
   */
  private maybeSummarize(conv: ConversationState, branch: ConversationBranch): void {
    // Simple implementation - mark older messages for potential summarization
    // A full implementation would call LLM to create a summary
    
    const messagesOverThreshold = branch.messages.length - this.config.summarizeThreshold;
    if (messagesOverThreshold <= 0) return;

    // For now, just add metadata indicating these could be summarized
    for (let i = 0; i < messagesOverThreshold; i++) {
      branch.messages[i].metadata = {
        ...branch.messages[i].metadata,
        canBeSummarized: true,
      };
    }
  }

  // ===========================================
  // Export / Import
  // ===========================================

  /**
   * Export conversation to Markdown
   */
  exportToMarkdown(conversationId?: string): string {
    const id = conversationId || this.activeConversationId;
    if (!id) return '';

    const conv = this.conversations.get(id);
    if (!conv) return '';

    const branch = conv.branches.get(conv.currentBranchId);
    if (!branch) return '';

    let md = `# ${conv.title}\n\n`;
    md += `**Agent:** ${conv.agentRole}\n`;
    md += `**Created:** ${conv.createdAt.toISOString()}\n`;
    md += `**Updated:** ${conv.updatedAt.toISOString()}\n\n`;
    md += `---\n\n`;

    for (const msg of branch.messages) {
      const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
      md += `### ${role}\n`;
      md += `*${msg.timestamp.toLocaleString()}*\n\n`;
      md += `${msg.content}\n\n`;

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        md += `**Tool Calls:**\n`;
        for (const call of msg.toolCalls) {
          md += `- \`${call.name}\`: ${JSON.stringify(call.arguments).slice(0, 100)}...\n`;
        }
        md += `\n`;
      }

      md += `---\n\n`;
    }

    return md;
  }

  /**
   * Export conversation to JSON
   */
  exportToJSON(conversationId?: string): string {
    const id = conversationId || this.activeConversationId;
    if (!id) return '{}';

    const conv = this.conversations.get(id);
    if (!conv) return '{}';

    // Convert Map to object for JSON serialization
    const branchesObj: Record<string, ConversationBranch> = {};
    for (const [branchId, branch] of conv.branches) {
      branchesObj[branchId] = branch;
    }

    return JSON.stringify({
      ...conv,
      branches: branchesObj,
    }, null, 2);
  }

  /**
   * Import conversation from JSON
   */
  importFromJSON(jsonString: string): ConversationState | null {
    try {
      const data = JSON.parse(jsonString);
      
      // Convert branches back to Map
      const branches = new Map<string, ConversationBranch>();
      for (const [branchId, branch] of Object.entries(data.branches)) {
        const typedBranch = branch as ConversationBranch;
        typedBranch.createdAt = new Date(typedBranch.createdAt);
        typedBranch.messages = typedBranch.messages.map(m => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
        branches.set(branchId, typedBranch);
      }

      const conv: ConversationState = {
        id: data.id || randomUUID(),
        title: data.title,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        branches,
        currentBranchId: data.currentBranchId,
        agentRole: data.agentRole,
        systemPrompt: data.systemPrompt,
        metadata: data.metadata || {},
      };

      this.conversations.set(conv.id, conv);
      return conv;
    } catch {
      return null;
    }
  }

  // ===========================================
  // Utilities
  // ===========================================

  private getTotalMessageCount(conv: ConversationState): number {
    let count = 0;
    for (const branch of conv.branches.values()) {
      count += branch.messages.length;
    }
    return count;
  }

  /**
   * Clear all conversations
   */
  clear(): void {
    this.conversations.clear();
    this.activeConversationId = null;
  }
}

// ===========================================
// Factory Function
// ===========================================

export function createConversationManager(
  config?: Partial<ConversationConfig>
): ConversationManager {
  return new ConversationManager(config);
}

// ===========================================
// Singleton Export
// ===========================================

export const conversationManager = new ConversationManager();
