/**
 * Provider Registry and Factory
 * Central management for all LLM providers
 */

import { BaseProvider } from './base.js';
import { GeminiProvider } from './gemini.js';
import { OpenRouterProvider, OPENROUTER_FREE_MODELS } from './openrouter.js';
import { GroqProvider, GROQ_MODELS } from './groq.js';
import { OllamaProvider, OLLAMA_MODELS } from './ollama.js';
import { configManager } from '../config/index.js';
import type { ProviderConfig, ProviderName } from '../types/index.js';
import { ProviderError } from '../types/index.js';

// ===========================================
// Provider Factory
// ===========================================

export function createProvider(config: ProviderConfig): BaseProvider {
  switch (config.name) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'openrouter':
      return new OpenRouterProvider(config);
    case 'groq':
      return new GroqProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new ProviderError(`Unknown provider: ${config.name}`, config.name);
  }
}

// ===========================================
// Provider Registry
// ===========================================

class ProviderRegistry {
  private providers: Map<ProviderName, BaseProvider> = new Map();
  private activeProvider: BaseProvider | null = null;

  /**
   * Initialize all configured providers
   */
  async initialize(): Promise<void> {
    const availableProviders = configManager.getAvailableProviders();

    for (const name of availableProviders) {
      try {
        const config = configManager.getProvider(name);
        if (config) {
          const provider = createProvider(config);
          this.providers.set(name, provider);
        }
      } catch (error) {
        console.warn(`Failed to initialize provider ${name}:`, error);
      }
    }

    // Set active provider to best available
    await this.selectBestProvider();
  }

  /**
   * Get a specific provider
   */
  get(name: ProviderName): BaseProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get the currently active provider
   */
  getActive(): BaseProvider {
    if (!this.activeProvider) {
      throw new ProviderError('No active provider. Call initialize() first.', 'gemini');
    }
    return this.activeProvider;
  }

  /**
   * Set the active provider
   */
  async setActive(name: ProviderName): Promise<boolean> {
    const provider = this.providers.get(name);
    if (!provider) {
      const config = configManager.getProvider(name);
      if (config) {
        const newProvider = createProvider(config);
        this.providers.set(name, newProvider);
        this.activeProvider = newProvider;
        return true;
      }
      return false;
    }

    this.activeProvider = provider;
    return true;
  }

  /**
   * Select the best available provider based on priority
   * Priority: gemini > openrouter > groq > ollama
   */
  async selectBestProvider(): Promise<boolean> {
    const priority: ProviderName[] = ['gemini', 'openrouter', 'groq', 'ollama'];

    for (const name of priority) {
      const provider = this.providers.get(name);
      if (provider) {
        try {
          const available = await provider.isAvailable();
          if (available) {
            this.activeProvider = provider;
            return true;
          }
        } catch {
          // Provider not available, try next
        }
      }
    }

    // Fallback to ollama even if not available (user can start it)
    const ollama = this.providers.get('ollama');
    if (ollama) {
      this.activeProvider = ollama;
      return true;
    }

    return false;
  }

  /**
   * List all registered providers
   */
  list(): ProviderName[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check availability of all providers
   */
  async checkAvailability(): Promise<Map<ProviderName, boolean>> {
    const results = new Map<ProviderName, boolean>();

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([name, provider]) => {
        try {
          results.set(name, await provider.isAvailable());
        } catch {
          results.set(name, false);
        }
      })
    );

    return results;
  }

  /**
   * Get provider info for display
   */
  getProviderInfo(): Array<{
    name: ProviderName;
    model: string;
    isActive: boolean;
  }> {
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      model: provider.getModel(),
      isActive: provider === this.activeProvider,
    }));
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const providerRegistry = new ProviderRegistry();

// Re-export providers and types
export { BaseProvider } from './base.js';
export { GeminiProvider } from './gemini.js';
export { OpenRouterProvider, OPENROUTER_FREE_MODELS } from './openrouter.js';
export { GroqProvider, GROQ_MODELS } from './groq.js';
export { OllamaProvider, OLLAMA_MODELS } from './ollama.js';
