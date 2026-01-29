/**
 * Lumecode Configuration System
 * Handles loading, validation, and management of application configuration
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { config as loadEnv } from 'dotenv';
import {
  type AppConfig,
  type ProviderConfig,
  type ProviderName,
  type AgentRole,
  AppConfigSchema,
} from '../types/index.js';

// Load environment variables
loadEnv();

// ===========================================
// Default Configuration
// ===========================================

const DEFAULT_DATA_DIR = join(homedir(), '.lumecode');

const DEFAULT_CONFIG: AppConfig = {
  defaultProvider: 'gemini',
  providers: {},
  defaultAgent: 'build',
  dataDir: DEFAULT_DATA_DIR,
  logLevel: 'info',
  theme: 'dark',
  telemetry: false,
};

// Provider-specific defaults
const PROVIDER_DEFAULTS: Record<ProviderName, Partial<ProviderConfig>> = {
  gemini: {
    model: 'gemini-2.0-flash-exp',
    maxTokens: 8192,
    temperature: 0.7,
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.0-flash-exp:free',
    maxTokens: 8192,
    temperature: 0.7,
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    maxTokens: 8192,
    temperature: 0.7,
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2',
    maxTokens: 4096,
    temperature: 0.7,
  },
};

// ===========================================
// Configuration Manager
// ===========================================

class ConfigManager {
  private config: AppConfig;
  private configPath: string;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.configPath = join(this.config.dataDir, 'config.json');
    this.initialize();
  }

  private initialize(): void {
    // Override with environment variables first
    this.loadFromEnv();

    // Ensure data directory exists
    if (!existsSync(this.config.dataDir)) {
      try {
        mkdirSync(this.config.dataDir, { recursive: true });
      } catch (error) {
        // Ignore error during initialization, will be handled when accessing specific paths
        // or when running 'init' command
      }
    }

    // Update config path based on potentially new dataDir
    this.configPath = join(this.config.dataDir, 'config.json');

    // Load from file if exists
    if (existsSync(this.configPath)) {
      try {
        const fileConfig = JSON.parse(readFileSync(this.configPath, 'utf-8'));
        this.config = { ...this.config, ...fileConfig };
      } catch (error) {
        console.warn('Failed to load config file, using defaults');
      }
    }

    // Initialize provider configs
    this.initializeProviders();
  }

  private loadFromEnv(): void {
    const env = process.env;

    if (env.LUMECODE_DEFAULT_PROVIDER) {
      this.config.defaultProvider = env.LUMECODE_DEFAULT_PROVIDER as ProviderName;
    }

    if (env.LUMECODE_LOG_LEVEL) {
      this.config.logLevel = env.LUMECODE_LOG_LEVEL as AppConfig['logLevel'];
    }

    if (env.LUMECODE_DATA_DIR) {
      this.config.dataDir = env.LUMECODE_DATA_DIR.replace('~', homedir());
    }

    if (env.LUMECODE_TELEMETRY) {
      this.config.telemetry = env.LUMECODE_TELEMETRY === 'true';
    }
  }

  private initializeProviders(): void {
    const env = process.env;

    // Gemini
    if (env.GOOGLE_API_KEY) {
      this.config.providers.gemini = {
        ...PROVIDER_DEFAULTS.gemini,
        name: 'gemini',
        apiKey: env.GOOGLE_API_KEY,
        model: env.LUMECODE_GEMINI_MODEL || PROVIDER_DEFAULTS.gemini.model!,
      } as ProviderConfig;
    }

    // OpenRouter
    if (env.OPENROUTER_API_KEY) {
      this.config.providers.openrouter = {
        ...PROVIDER_DEFAULTS.openrouter,
        name: 'openrouter',
        apiKey: env.OPENROUTER_API_KEY,
        model: env.LUMECODE_OPENROUTER_MODEL || PROVIDER_DEFAULTS.openrouter.model!,
      } as ProviderConfig;
    }

    // Groq
    if (env.GROQ_API_KEY) {
      this.config.providers.groq = {
        ...PROVIDER_DEFAULTS.groq,
        name: 'groq',
        apiKey: env.GROQ_API_KEY,
        model: env.LUMECODE_GROQ_MODEL || PROVIDER_DEFAULTS.groq.model!,
      } as ProviderConfig;
    }

    // Ollama (always available locally)
    this.config.providers.ollama = {
      ...PROVIDER_DEFAULTS.ollama,
      name: 'ollama',
      baseUrl: env.OLLAMA_BASE_URL || PROVIDER_DEFAULTS.ollama.baseUrl!,
      model: PROVIDER_DEFAULTS.ollama.model!,
    } as ProviderConfig;
  }

  // ===========================================
  // Public API
  // ===========================================

  get(): AppConfig {
    return { ...this.config };
  }

  getProvider(name?: ProviderName): ProviderConfig | undefined {
    const providerName = name || this.config.defaultProvider;
    return this.config.providers[providerName];
  }

  getAvailableProviders(): ProviderName[] {
    return Object.keys(this.config.providers) as ProviderName[];
  }

  getBestProvider(): ProviderConfig | undefined {
    // Priority: gemini > openrouter > groq > ollama
    const priority: ProviderName[] = ['gemini', 'openrouter', 'groq', 'ollama'];
    
    for (const name of priority) {
      const provider = this.config.providers[name];
      if (provider && (provider.apiKey || name === 'ollama')) {
        return provider;
      }
    }
    
    return undefined;
  }

  setProvider(name: ProviderName, config: Partial<ProviderConfig>): void {
    this.config.providers[name] = {
      ...PROVIDER_DEFAULTS[name],
      ...this.config.providers[name],
      ...config,
      name,
    } as ProviderConfig;
    this.save();
  }

  setDefaultProvider(name: ProviderName): void {
    if (!this.config.providers[name]) {
      throw new Error(`Provider ${name} is not configured`);
    }
    this.config.defaultProvider = name;
    this.save();
  }

  setDefaultAgent(role: AgentRole): void {
    this.config.defaultAgent = role;
    this.save();
  }

  update(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
    this.save();
  }

  save(): void {
    try {
      // Don't save API keys to file - keep them in env only
      const safeConfig = {
        ...this.config,
        providers: Object.fromEntries(
          Object.entries(this.config.providers).map(([key, value]) => [
            key,
            { ...value, apiKey: undefined },
          ])
        ),
      };
      writeFileSync(this.configPath, JSON.stringify(safeConfig, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.initializeProviders();
    this.save();
  }

  getDataDir(): string {
    return this.config.dataDir;
  }

  getSessionsDir(): string {
    const dir = join(this.config.dataDir, 'sessions');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getLogsDir(): string {
    const dir = join(this.config.dataDir, 'logs');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getDatabasePath(): string {
    return join(this.config.dataDir, 'lumecode.db');
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const configManager = new ConfigManager();
export { ConfigManager, DEFAULT_CONFIG, PROVIDER_DEFAULTS };
