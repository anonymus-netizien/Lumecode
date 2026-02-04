#!/usr/bin/env bun

/**
 * Lumecode CLI
 * Main entry point for the command-line interface
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { config } from 'dotenv';
import { engine } from '../engine/index.js';
import { configManager } from '../config/index.js';
import { sessionManager } from '../session/index.js';
import { providerRegistry } from '../providers/index.js';
import { startTUI } from '../ui/index.js';
import type { AgentRole, ProviderName } from '../types/index.js';

// Load environment variables
config();

const VERSION = '0.1.0';

/** Env var required for each cloud provider (null = no key, e.g. ollama) */
const PROVIDER_ENV_VARS: Record<ProviderName, string | null> = {
  gemini: 'GOOGLE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
  ollama: null,
};

const CLOUD_PROVIDER_NAMES: ProviderName[] = ['gemini', 'openrouter', 'groq', 'ollama'];

// ===========================================
// CLI Program
// ===========================================

const program = new Command();

program
  .name('lumecode')
  .alias('lc')
  .description('AI-powered coding that\'s private, open, and beautiful in your terminal')
  .version(VERSION);

// ===========================================
// Chat Command (Default)
// ===========================================

program
  .command('chat', { isDefault: true })
  .description('Start an interactive chat session')
  .option('-a, --agent <role>', 'Agent role (build, plan, review, general)', 'build')
  .option('-p, --provider <name>', 'LLM provider (gemini, openrouter, groq, ollama)')
  .option('-m, --model <name>', 'Model name')
  .option('-d, --directory <path>', 'Working directory', process.cwd())
  .option('-s, --session <id>', 'Resume a previous session')
  .option('--no-stream', 'Disable streaming responses')
  .option('--tui', 'Use enhanced TUI interface (recommended)')
  .option('--simple', 'Use simple readline interface')
  .action(async (options) => {
    try {
      // Use TUI by default, unless --simple is specified
      if (!options.simple) {
        await startTUI({ directory: options.directory });
        return;
      }

      // Simple readline mode
      console.log(chalk.cyan.bold('\n🔮 Lumecode AI Agent\n'));

      // Initialize engine
      await engine.initialize({
        workingDirectory: options.directory,
        agentRole: options.agent as AgentRole,
        providerName: options.provider as ProviderName,
        sessionId: options.session,
      });

      const state = engine.getState();
      console.log(chalk.dim(`Provider: ${state.provider} | Model: ${state.model}`));
      console.log(chalk.dim(`Agent: ${state.agent} | Directory: ${state.workingDirectory}`));
      console.log(chalk.dim('Type /help for commands, /quit to exit\n'));

      // Start interactive loop
      await interactiveLoop(options.stream !== false);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ===========================================
// Session Commands
// ===========================================

const sessionCmd = program.command('session').description('Manage chat sessions');

sessionCmd
  .command('list')
  .description('List all sessions')
  .option('-l, --limit <number>', 'Number of sessions to show', '10')
  .action((options) => {
    sessionManager.initialize();
    const sessions = sessionManager.list(parseInt(options.limit));

    if (sessions.length === 0) {
      console.log(chalk.yellow('No sessions found.'));
      return;
    }

    console.log(chalk.bold('\nRecent Sessions:\n'));
    for (const session of sessions) {
      const date = session.updatedAt.toLocaleDateString();
      const time = session.updatedAt.toLocaleTimeString();
      console.log(
        `  ${chalk.cyan(session.id.slice(0, 8))} | ${session.name} | ${session.agent} | ${session.messageCount} msgs | ${date} ${time}`
      );
    }
    console.log('');
  });

sessionCmd
  .command('show <id>')
  .description('Show session details')
  .action((id) => {
    sessionManager.initialize();
    
    // Find session by partial ID
    const sessions = sessionManager.list(100);
    const session = sessions.find((s) => s.id.startsWith(id));
    
    if (!session) {
      console.log(chalk.red('Session not found.'));
      return;
    }

    const fullSession = sessionManager.get(session.id);
    if (!fullSession) {
      console.log(chalk.red('Session not found.'));
      return;
    }

    console.log(chalk.bold('\nSession Details:\n'));
    console.log(`  ID: ${chalk.cyan(fullSession.id)}`);
    console.log(`  Name: ${fullSession.name}`);
    console.log(`  Agent: ${fullSession.agent}`);
    console.log(`  Provider: ${fullSession.provider}`);
    console.log(`  Model: ${fullSession.model}`);
    console.log(`  Directory: ${fullSession.workingDirectory}`);
    console.log(`  Created: ${fullSession.createdAt.toLocaleString()}`);
    console.log(`  Updated: ${fullSession.updatedAt.toLocaleString()}`);
    console.log(`  Messages: ${fullSession.messages.length}`);
    console.log('');
  });

sessionCmd
  .command('delete <id>')
  .description('Delete a session')
  .action((id) => {
    sessionManager.initialize();
    
    const sessions = sessionManager.list(100);
    const session = sessions.find((s) => s.id.startsWith(id));
    
    if (!session) {
      console.log(chalk.red('Session not found.'));
      return;
    }

    sessionManager.delete(session.id);
    console.log(chalk.green('Session deleted.'));
  });

// ===========================================
// Config Command
// ===========================================

program
  .command('config')
  .description('Show or modify configuration')
  .option('--show', 'Show current configuration')
  .option('--provider <name>', 'Set default provider')
  .option('--agent <role>', 'Set default agent')
  .action((options) => {
    if (options.provider) {
      configManager.setDefaultProvider(options.provider as ProviderName);
      console.log(chalk.green(`Default provider set to: ${options.provider}`));
    }

    if (options.agent) {
      configManager.setDefaultAgent(options.agent as AgentRole);
      console.log(chalk.green(`Default agent set to: ${options.agent}`));
    }

    if (options.show || (!options.provider && !options.agent)) {
      const config = configManager.get();
      console.log(chalk.bold('\nConfiguration:\n'));
      console.log(`  Default Provider: ${chalk.cyan(config.defaultProvider)}`);
      console.log(`  Default Agent: ${chalk.cyan(config.defaultAgent)}`);
      console.log(`  Data Directory: ${config.dataDir}`);
      console.log(`  Log Level: ${config.logLevel}`);
      console.log('');

      console.log(chalk.bold('Providers:'));
      for (const name of CLOUD_PROVIDER_NAMES) {
        const provider = configManager.getProvider(name);
        const envVar = PROVIDER_ENV_VARS[name];
        if (provider && (provider.apiKey || name === 'ollama')) {
          const hasKey = provider.apiKey || name === 'ollama' ? '✓' : '✗';
          console.log(`  ${hasKey === '✓' ? chalk.green(hasKey) : chalk.red(hasKey)} ${name}: ${provider.model || 'not configured'}`);
        } else {
          const hint = envVar ? ` (set ${envVar} in .env)` : '';
          console.log(`  ${chalk.red('✗')} ${name}: not configured${hint}`);
        }
      }
      console.log('');
    }
  });

// ===========================================
// Provider Command
// ===========================================

program
  .command('providers')
  .description('List and check LLM providers')
  .option('--check', 'Check provider availability')
  .action(async (options) => {
    await providerRegistry.initialize();

    console.log(chalk.bold('\nLLM Providers:\n'));

    if (options.check) {
      for (const name of CLOUD_PROVIDER_NAMES) {
        const provider = providerRegistry.get(name);
        const envVar = PROVIDER_ENV_VARS[name];
        if (!provider) {
          const hint = envVar ? ` (set ${envVar} in .env)` : '';
          console.log(`  ${name}: ${chalk.red('not configured')}${hint}`);
        } else {
          const status = await providerRegistry.checkProviderStatus(name);
          if (status.available) {
            console.log(`  ${name}: ${chalk.green('✓ Available')} (${provider.getModel()})`);
          } else {
            console.log(`  ${name}: ${chalk.red('✗ Unavailable')}${status.error ? ` - ${status.error}` : ''}`);
          }
        }
      }
    } else {
      for (const name of CLOUD_PROVIDER_NAMES) {
        const provider = providerRegistry.get(name);
        const envVar = PROVIDER_ENV_VARS[name];
        if (!provider) {
          const hint = envVar ? ` (set ${envVar} in .env)` : '';
          console.log(`  ${name}: ${chalk.red('not configured')}${hint}`);
        } else {
          const info = providerRegistry.getProviderInfo().find((p) => p.name === name);
          const active = info?.isActive ? chalk.cyan(' (active)') : '';
          console.log(`  ${name}: ${provider.getModel()}${active}`);
        }
      }
    }
    console.log('');
  });

// ===========================================
// Version Command
// ===========================================

program
  .command('version')
  .description('Show version information')
  .action(() => {
    console.log(chalk.bold(`\nLumecode v${VERSION}`));
    console.log(chalk.dim('AI-powered coding that\'s private, open, and beautiful'));
    console.log(chalk.dim('https://github.com/lumecode\n'));
  });

// ===========================================
// Completion Command
// ===========================================

program
  .command('completion')
  .description('Generate shell completion script')
  .action(() => {
    const commands = program.commands.map(cmd => cmd.name()).join(' ');
    const script = `
###-begin-lumecode-completion-###
#
# Lumecode completion script
#
# Installation: 
#   lumecode completion >> ~/.zshrc  (or ~/.bashrc)
#   source ~/.zshrc
#

if type compdef &>/dev/null; then
  _lumecode() {
    local -a commands
    commands=(
      ${program.commands.map(c => `'${c.name()}:${c.description().replace(/'/g, "'\\''")}'`).join('\n      ')}
    )
    _describe 'command' commands
  }
  compdef _lumecode lumecode
  compdef _lumecode lc
elif type complete &>/dev/null; then
  _lumecode_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    opts="${commands}"

    if [[ \${cur} == -* ]] ; then
      COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
      return 0
    fi
    
    case "\${prev}" in
      lumecode|lc)
        COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
        return 0
        ;;
      *)
        ;;
    esac
  }
  complete -F _lumecode_completion lumecode
  complete -F _lumecode_completion lc
fi
###-end-lumecode-completion-###
`;
    console.log(script.trim());
  });

// ===========================================
// Init Command
// ===========================================

program
  .command('init')
  .description('Initialize Lumecode project environment')
  .option('-y, --yes', 'Skip prompts, use defaults')
  .option('-v, --verbose', 'Verbose output')
  .option('--skip-install', 'Skip dependency installation')
  .option('--skip-build', 'Skip build step')
  .option('-f, --force', 'Force reinitialize')
  .option('--production', 'Production environment')
  .action(async (options) => {
    const { runInit } = await import('./init.js');
    await runInit(options);
  });

// ===========================================
// Interactive Loop
// ===========================================

async function interactiveLoop(stream: boolean): Promise<void> {
  const readline = await import('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    const state = engine.getState();
    const agentSymbol = {
      build: '🔨',
      plan: '📋',
      review: '🔍',
      general: '✨',
    }[state.agent || 'build'];
    
    process.stdout.write(chalk.cyan(`\n${agentSymbol} You: `));
  };

  const processInput = async (input: string): Promise<boolean> => {
    const trimmed = input.trim();
    
    if (!trimmed) {
      prompt();
      return true;
    }

    // Handle commands
    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.slice(1).split(' ');
      
      switch (cmd.toLowerCase()) {
        case 'quit':
        case 'exit':
        case 'q':
          console.log(chalk.dim('\nGoodbye! 👋\n'));
          engine.shutdown();
          return false;

        case 'help':
        case 'h':
          showHelp();
          break;

        case 'clear':
          engine.clearConversation();
          console.log(chalk.dim('Conversation cleared.'));
          break;

        case 'new':
          await engine.newSession(args.join(' ') || undefined);
          console.log(chalk.dim('New session started.'));
          break;

        case 'agent':
          if (args[0] && ['build', 'plan', 'review', 'general'].includes(args[0])) {
            await engine.switchAgent(args[0] as AgentRole);
            console.log(chalk.dim(`Switched to ${args[0]} agent.`));
          } else {
            console.log(chalk.dim('Agents: build, plan, review, general'));
          }
          break;

        case 'provider':
          if (args[0]) {
            const providerName = args[0] as ProviderName;
            const success = await engine.switchProvider(providerName);
            if (success) {
              const status = await engine.checkProviderStatus(providerName);
              if (status.available) {
                console.log(chalk.dim(`Switched to ${args[0]} provider.`));
              } else {
                console.log(chalk.dim(`Switched to ${args[0]} provider.`));
                console.log(chalk.yellow(`Warning: ${status.error || 'Provider may not respond.'}`));
              }
            } else {
              const status = await engine.checkProviderStatus(providerName);
              const envVar = PROVIDER_ENV_VARS[providerName];
              const hint = envVar && status.error?.includes('not configured')
                ? ` Set ${envVar} in .env to enable.`
                : '';
              console.log(chalk.red(`${status.error || `Provider ${args[0]} not available.`}${hint}`));
            }
          } else {
            const providersList = engine.getProviders();
            for (const name of CLOUD_PROVIDER_NAMES) {
              const p = providersList.find((x) => x.name === name);
              const envVar = PROVIDER_ENV_VARS[name];
              if (p) {
                const active = p.isActive ? chalk.cyan(' *') : '';
                console.log(`  ${p.name}: ${p.model}${active}`);
              } else {
                const hint = envVar ? ` (set ${envVar} in .env)` : '';
                console.log(`  ${chalk.red(name + ': not configured')}${hint}`);
              }
            }
          }
          break;

        case 'status':
          const state = engine.getState();
          console.log(chalk.dim(`Agent: ${state.agent}`));
          console.log(chalk.dim(`Provider: ${state.provider} (${state.model})`));
          console.log(chalk.dim(`Directory: ${state.workingDirectory}`));
          console.log(chalk.dim(`Session: ${state.session?.id.slice(0, 8)}`));
          break;

        default:
          console.log(chalk.yellow(`Unknown command: ${cmd}. Type /help for help.`));
      }

      prompt();
      return true;
    }

    // Process message
    try {
      process.stdout.write(chalk.green('\n🤖 Assistant: '));
      
      if (stream) {
        await engine.processStream({ message: trimmed }, (chunk) => {
          process.stdout.write(chunk);
        });
      } else {
        const response = await engine.process({ message: trimmed });
        process.stdout.write(response.message.content);
      }
      
      console.log('');
    } catch (error) {
      console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
    }

    prompt();
    return true;
  };

  prompt();

  rl.on('line', async (input) => {
    const shouldContinue = await processInput(input);
    if (!shouldContinue) {
      rl.close();
      process.exit(0);
    }
  });

  rl.on('close', () => {
    engine.shutdown();
    process.exit(0);
  });
}

function showHelp(): void {
  console.log(chalk.bold('\nCommands:'));
  console.log('  /help, /h        Show this help message');
  console.log('  /quit, /q        Exit the chat');
  console.log('  /clear           Clear conversation history');
  console.log('  /new [name]      Start a new session');
  console.log('  /agent <role>    Switch agent (build, plan, review, general)');
  console.log('  /provider <name> Switch provider (gemini, openrouter, groq, ollama)');
  console.log('  /status          Show current status');
  console.log('');
}

// ===========================================
// Run CLI
// ===========================================

program.parse();
