/**
 * Agent System Prompts
 * Prompts are now loaded from markdown files in src/agents/prompts/
 * This allows easy customization without code changes
 */

import type { AgentRole } from '../types/index.js';
import { loadPromptsWithCache } from '../utils/prompt-loader.js';

// Lazy-load prompts on first access
let cachedPrompts: Record<AgentRole, string> | null = null;

function getPrompts(): Record<AgentRole, string> {
  if (!cachedPrompts) {
    const loaded = loadPromptsWithCache('agents/prompts');
    cachedPrompts = loaded as Record<AgentRole, string>;
  }
  return cachedPrompts;
}

export const AGENT_PROMPTS: Record<AgentRole, string> = {
  get build() { return getPrompts().build; },
  get plan() { return getPrompts().plan; },
  get review() { return getPrompts().review; },
  get general() { return getPrompts().general; },
} as unknown as Record<AgentRole, string>;

export const AGENT_DESCRIPTIONS: Record<AgentRole, string> = {
  build: 'Full access implementation agent. Creates, modifies, and runs code.',
  plan: 'Architecture and planning agent. Analyzes code and creates roadmaps.',
  review: 'Code review agent. Finds issues and suggests improvements.',
  general: 'Versatile assistant. Handles any task with confirmation for changes.',
};

export const AGENT_SHORTCUTS: Record<AgentRole, string> = {
  build: 'b',
  plan: 'p',
  review: 'r',
  general: 'g',
};
