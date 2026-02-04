/**
 * Prompt Loader Utility
 * Loads agent prompts and tool descriptions from markdown files
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load a prompt file and return its contents
 * Strips markdown for use as plain text prompts
 */
export function loadPrompt(name: string, subdir: string = 'agents/prompts'): string {
  const path = join(__dirname, `../${subdir}/${name}.md`);
  let content = readFileSync(path, 'utf-8');
  
  // Remove markdown heading markers but keep content
  content = content
    .split('\n')
    .map(line => {
      // Remove leading # symbols but keep indentation
      return line.replace(/^#+\s+/, '');
    })
    .join('\n')
    .trim();
  
  return content;
}

/**
 * Load all prompts for a given directory
 */
export function loadAllPrompts(subdir: string): Record<string, string> {
  const prompts: Record<string, string> = {};
  
  try {
    const roles = ['build', 'plan', 'review', 'general'];
    for (const role of roles) {
      prompts[role] = loadPrompt(role, subdir);
    }
  } catch (error) {
    console.error(`Failed to load prompts from ${subdir}:`, error);
  }
  
  return prompts;
}

/**
 * Cache loaded prompts to avoid repeated file I/O
 */
const promptCache = new Map<string, Record<string, string>>();

export function loadPromptsWithCache(subdir: string): Record<string, string> {
  if (promptCache.has(subdir)) {
    return promptCache.get(subdir)!;
  }
  
  const prompts = loadAllPrompts(subdir);
  promptCache.set(subdir, prompts);
  return prompts;
}

/**
 * PromptLoader Class
 * OOP interface for loading prompts with caching
 */
export class PromptLoader {
  private cache: Map<string, string> = new Map();
  private subdir: string;

  constructor(subdir: string = 'agents/prompts') {
    this.subdir = subdir;
  }

  /**
   * Load a single prompt by role/name
   */
  async load(name: string): Promise<string> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    try {
      const content = loadPrompt(name, this.subdir);
      this.cache.set(name, content);
      return content;
    } catch {
      return '';
    }
  }

  /**
   * Load all prompts
   */
  async loadAll(): Promise<Record<string, string>> {
    return loadAllPrompts(this.subdir);
  }

  /**
   * Clear cache
   */
  reload(): void {
    this.cache.clear();
  }

  /**
   * Get cached prompt without loading
   */
  get(name: string): string | undefined {
    return this.cache.get(name);
  }

  /**
   * Check if prompt is cached
   */
  has(name: string): boolean {
    return this.cache.has(name);
  }
}

