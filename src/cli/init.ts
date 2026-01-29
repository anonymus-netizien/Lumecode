/**
 * Lumecode Project Initialization Tool
 *
 * Single-command setup for new users:
 * - System requirements validation
 * - Dependency installation
 * - Configuration file generation
 * - Environment setup
 * - Build process
 *
 * Usage: bunx lumecode init
 *        bun ./dist/index.js init
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform, arch, release, cpus, totalmem } from 'os';
import { execSync } from 'child_process';
import readline from 'readline';

// =============================================================================
// TYPES
// =============================================================================

interface InitOptions {
  /** Skip interactive prompts, use defaults */
  yes?: boolean;
  /** Environment: 'development' or 'production' */
  env?: 'development' | 'production';
  /** Skip dependency installation */
  skipInstall?: boolean;
  /** Skip build step */
  skipBuild?: boolean;
  /** Verbose logging */
  verbose?: boolean;
  /** Force reinitialize even if already configured */
  force?: boolean;
  /** Production environment flag (alternative to env='production') */
  production?: boolean;
}

interface SystemInfo {
  os: string;
  arch: string;
  release: string;
  cpus: number;
  memory: string;
  bunVersion: string | null;
  nodeVersion: string | null;
  gitVersion: string | null;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ProviderConfig {
  name: string;
  envVar: string;
  keyUrl: string;
  freeTier: boolean;
  description: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'Gemini',
    envVar: 'GEMINI_API_KEY',
    keyUrl: 'https://aistudio.google.com/apikey',
    freeTier: true,
    description: 'Google AI - 1M context, free tier with 60 RPM',
  },
  {
    name: 'OpenRouter',
    envVar: 'OPENROUTER_API_KEY',
    keyUrl: 'https://openrouter.ai/keys',
    freeTier: true,
    description: 'Access 100+ models including free options',
  },
  {
    name: 'Groq',
    envVar: 'GROQ_API_KEY',
    keyUrl: 'https://console.groq.com/keys',
    freeTier: true,
    description: 'Ultra-fast inference, free tier available',
  },
  {
    name: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    keyUrl: 'https://platform.openai.com/api-keys',
    freeTier: false,
    description: 'GPT-4 and GPT-3.5 models (paid)',
  },
  {
    name: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    keyUrl: 'https://console.anthropic.com/keys',
    freeTier: false,
    description: 'Claude models (paid)',
  },
];

const MIN_BUN_VERSION = '1.0.0';
const DATA_DIR = process.env.LUMECODE_DATA_DIR || join(homedir(), '.lumecode');

// =============================================================================
// LOGGING UTILITIES
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

class Logger {
  private verbose: boolean;
  private logFile: string | null = null;
  private logs: string[] = [];

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  enableFileLogging(dir: string): void {
    const logDir = join(dir, 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    this.logFile = join(logDir, `init-${Date.now()}.log`);
  }

  private log(level: string, message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message} ${args.length ? JSON.stringify(args) : ''}`;
    this.logs.push(logEntry);

    if (this.logFile) {
      try {
        writeFileSync(this.logFile, this.logs.join('\n'), 'utf-8');
      } catch {
        // Ignore file write errors
      }
    }
  }

  info(message: string): void {
    this.log('INFO', message);
    console.log(`${colors.cyan}ℹ${colors.reset} ${message}`);
  }

  success(message: string): void {
    this.log('SUCCESS', message);
    console.log(`${colors.green}✓${colors.reset} ${message}`);
  }

  warn(message: string): void {
    this.log('WARN', message);
    console.log(`${colors.yellow}⚠${colors.reset} ${colors.yellow}${message}${colors.reset}`);
  }

  error(message: string): void {
    this.log('ERROR', message);
    console.log(`${colors.red}✗${colors.reset} ${colors.red}${message}${colors.reset}`);
  }

  debug(message: string): void {
    this.log('DEBUG', message);
    if (this.verbose) {
      console.log(`${colors.dim}  ${message}${colors.reset}`);
    }
  }

  step(step: number, total: number, message: string): void {
    this.log('STEP', `${step}/${total}: ${message}`);
    console.log(`\n${colors.blue}[${step}/${total}]${colors.reset} ${colors.bold}${message}${colors.reset}`);
  }

  header(message: string): void {
    const line = '─'.repeat(60);
    console.log(`\n${colors.cyan}${line}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}  ${message}${colors.reset}`);
    console.log(`${colors.cyan}${line}${colors.reset}\n`);
  }

  box(lines: string[], color: string = colors.cyan): void {
    const maxLen = Math.max(...lines.map((l) => l.length));
    const top = `╭${'─'.repeat(maxLen + 2)}╮`;
    const bottom = `╰${'─'.repeat(maxLen + 2)}╯`;

    console.log(`${color}${top}${colors.reset}`);
    for (const line of lines) {
      console.log(`${color}│${colors.reset} ${line.padEnd(maxLen)} ${color}│${colors.reset}`);
    }
    console.log(`${color}${bottom}${colors.reset}`);
  }

  getLogs(): string[] {
    return this.logs;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getSystemInfo(): SystemInfo {
  let bunVersion = null;
  let nodeVersion = null;
  let gitVersion = null;

  try {
    bunVersion = execSync('bun --version').toString().trim();
  } catch {}
  try {
    nodeVersion = execSync('node --version').toString().trim();
  } catch {}
  try {
    gitVersion = execSync('git --version').toString().trim();
  } catch {}

  return {
    os: platform(),
    arch: arch(),
    release: release(),
    cpus: cpus().length,
    memory: `${Math.round(totalmem() / 1024 / 1024 / 1024)}GB`,
    bunVersion,
    nodeVersion,
    gitVersion,
  };
}

function checkSystemRequirements(info: SystemInfo): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!info.bunVersion) {
    errors.push('Bun is not installed. Please install Bun: curl -fsSL https://bun.sh/install | bash');
  } else {
    // Simple version check (assumes semver format)
    const version = info.bunVersion.replace(/^v/, '');
    if (version < MIN_BUN_VERSION) {
      warnings.push(`Bun version ${info.bunVersion} is older than recommended ${MIN_BUN_VERSION}`);
    }
  }

  if (!info.gitVersion) {
    warnings.push('Git is not installed. Some features may be limited.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

async function promptUser(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const query = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

// =============================================================================
// MAIN INIT FUNCTION
// =============================================================================

async function runInit(options: InitOptions = {}): Promise<boolean> {
  const logger = new Logger(options.verbose);
  logger.header('Lumecode Initialization');

  // 1. System Validation
  logger.step(1, 5, 'Validating system requirements...');
  const sysInfo = getSystemInfo();
  logger.debug(`System Info: ${JSON.stringify(sysInfo, null, 2)}`);

  const validation = checkSystemRequirements(sysInfo);
  if (!validation.valid) {
    logger.error('System validation failed:');
    validation.errors.forEach((e) => console.log(`  - ${e}`));
    return false;
  }

  if (validation.warnings.length > 0) {
    logger.warn('System warnings:');
    validation.warnings.forEach((w) => console.log(`  - ${w}`));
  }
  logger.success('System requirements met');

  // 2. Environment Setup
  logger.step(2, 5, 'Setting up environment...');
  
  // Create global data directory
  if (!existsSync(DATA_DIR)) {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      logger.success(`Created data directory: ${DATA_DIR}`);
    } catch (error) {
      logger.error(`Failed to create data directory: ${error}`);
      return false;
    }
  }

  // Create default config
  const configPath = join(DATA_DIR, 'config.json');
  if (!existsSync(configPath) || options.force) {
    const defaultConfig = {
      defaultProvider: 'gemini',
      defaultAgent: 'build',
      logLevel: 'info',
      dataDir: DATA_DIR,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    logger.success('Created default configuration');
  }

  // Project .env setup
  const projectEnvPath = join(process.cwd(), '.env');
  const exampleEnvPath = join(process.cwd(), '.env.example');

  if (!existsSync(projectEnvPath) || options.force) {
    if (options.yes) {
      // Non-interactive: copy example or create minimal
      if (existsSync(exampleEnvPath)) {
        copyFileSync(exampleEnvPath, projectEnvPath);
        logger.success('Created .env from example');
      } else {
        writeFileSync(projectEnvPath, '# Lumecode Environment Variables\n');
        logger.warn('Created empty .env file');
      }
    } else {
      // Interactive setup
      console.log(colors.cyan + '\nLet\'s set up your AI providers.' + colors.reset);
      console.log('You can skip this and edit .env later.\n');

      let envContent = existsSync(exampleEnvPath) 
        ? readFileSync(exampleEnvPath, 'utf-8') 
        : '';

      for (const provider of PROVIDERS) {
        if (provider.freeTier) {
          const key = await promptUser(`Enter API Key for ${provider.name} (${provider.description})`);
          if (key) {
            const regex = new RegExp(`${provider.envVar}=.*`);
            if (envContent.match(regex)) {
              envContent = envContent.replace(regex, `${provider.envVar}=${key}`);
            } else {
              envContent += `\n${provider.envVar}=${key}`;
            }
          }
        }
      }

      writeFileSync(projectEnvPath, envContent);
      logger.success('Configured .env file');
    }
  } else {
    logger.info('.env file already exists');
  }

  // 3. Dependency Installation
  logger.step(3, 5, 'Installing dependencies...');
  if (options.skipInstall) {
    logger.info('Skipping installation as requested');
  } else {
    try {
      logger.info('Running bun install...');
      execSync('bun install', { stdio: options.verbose ? 'inherit' : 'ignore' });
      logger.success('Dependencies installed');
    } catch (error) {
      logger.error('Failed to install dependencies');
      if (options.verbose) console.error(error);
      return false;
    }
  }

  // 4. Build Project
  logger.step(4, 5, 'Building project...');
  if (options.skipBuild) {
    logger.info('Skipping build as requested');
  } else {
    try {
      logger.info('Running bun run build...');
      execSync('bun run build', { stdio: options.verbose ? 'inherit' : 'ignore' });
      logger.success('Project built successfully');
    } catch (error) {
      logger.error('Build failed');
      if (options.verbose) console.error(error);
      // Don't fail init on build error, as it might be code-related
      logger.warn('Continuing despite build error');
    }
  }

  // 5. Final Verification
  logger.step(5, 5, 'Verifying setup...');
  
  const verificationChecks = [
    { name: 'Config file', check: () => existsSync(configPath) },
    { name: '.env file', check: () => existsSync(projectEnvPath) },
    { name: 'Dependencies', check: () => existsSync(join(process.cwd(), 'node_modules')) },
  ];

  const failedChecks = verificationChecks.filter(c => !c.check());

  if (failedChecks.length === 0) {
    logger.box([
      'Lumecode Initialized Successfully! 🚀',
      '',
      'To start using Lumecode:',
      '  bun run dev',
      '',
      'To verify tools:',
      '  bun run test',
    ], colors.green);
    return true;
  } else {
    logger.error('Setup verification failed for:');
    failedChecks.forEach(c => console.log(`  - ${c.name}`));
    return false;
  }
}

// Export the main initialization function for CLI and tests
export { runInit };
