/**
 * Command Filter
 * Filters and validates shell commands to prevent dangerous operations
 */

// ===========================================
// Types
// ===========================================

export interface CommandFilterOptions {
  /** Allow sudo commands */
  allowSudo?: boolean;
  /** Allow package manager commands */
  allowPackageManager?: boolean;
  /** Allow network commands */
  allowNetwork?: boolean;
  /** Allow system modification commands */
  allowSystemModification?: boolean;
  /** Allow file deletion commands */
  allowDeletion?: boolean;
  /** Allow recursive operations */
  allowRecursive?: boolean;
  /** Allowed commands (whitelist mode) */
  allowedCommands?: string[];
  /** Blocked commands (blacklist mode) */
  blockedCommands?: string[];
  /** Maximum command length */
  maxCommandLength?: number;
}

export interface CommandFilterResult {
  /** Whether the command is allowed */
  allowed: boolean;
  /** The command (potentially modified) */
  command: string;
  /** Blocked portions of the command */
  blockedParts: string[];
  /** Reasons why command was blocked */
  reasons: string[];
  /** Security risk level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Recommended alternatives if blocked */
  alternatives?: string[];
}

export interface ParsedCommand {
  /** Base command */
  command: string;
  /** Command arguments */
  args: string[];
  /** Environment variables */
  env: Record<string, string>;
  /** Whether command uses sudo */
  hasSudo: boolean;
  /** Whether command has pipes */
  hasPipes: boolean;
  /** Piped commands */
  pipedCommands: string[];
  /** Whether command has redirects */
  hasRedirects: boolean;
  /** Whether command runs in background */
  isBackground: boolean;
}

// ===========================================
// Constants
// ===========================================

/** Extremely dangerous commands that should never be allowed */
const CRITICAL_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf ~/*',
  ':(){:|:&};:',  // Fork bomb
  'mkfs',
  'dd if=/dev/zero',
  'dd if=/dev/random',
  '> /dev/sda',
  'chmod -R 777 /',
  'chown -R',
];

/** Dangerous command patterns */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string; risk: 'high' | 'critical' }> = [
  { pattern: /rm\s+(-[rf]+\s+)*\/($|\s)/, reason: 'Attempting to delete root filesystem', risk: 'critical' },
  { pattern: /rm\s+(-[rf]+\s+)*~($|\s)/, reason: 'Attempting to delete home directory', risk: 'critical' },
  { pattern: />\s*\/dev\/sd[a-z]/, reason: 'Attempting to overwrite disk device', risk: 'critical' },
  { pattern: /mkfs\s+/, reason: 'Filesystem formatting command', risk: 'critical' },
  { pattern: /dd\s+.*if=\/dev\/(zero|random|urandom)/, reason: 'Disk overwrite command', risk: 'critical' },
  { pattern: /:\(\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;\s*:/, reason: 'Fork bomb detected', risk: 'critical' },
  { pattern: /curl\s+.*\|\s*(bash|sh|zsh)/, reason: 'Remote script execution', risk: 'high' },
  { pattern: /wget\s+.*\|\s*(bash|sh|zsh)/, reason: 'Remote script execution', risk: 'high' },
  { pattern: /eval\s+\$\(/, reason: 'Dynamic code execution', risk: 'high' },
  { pattern: /\$\(curl/, reason: 'Command substitution with remote content', risk: 'high' },
  { pattern: /\$\(wget/, reason: 'Command substitution with remote content', risk: 'high' },
  { pattern: /sudo\s+rm\s+-rf/, reason: 'Privileged recursive deletion', risk: 'high' },
  { pattern: /chmod\s+(-R\s+)?777/, reason: 'Overly permissive permissions', risk: 'high' },
  { pattern: />\s*\/etc\//, reason: 'Overwriting system configuration', risk: 'high' },
  { pattern: /crontab\s+-r/, reason: 'Removing cron jobs', risk: 'high' },
];

/** Commands requiring confirmation */
const CONFIRMATION_COMMANDS = [
  'rm',
  'rmdir',
  'mv',
  'cp',
  'chmod',
  'chown',
  'git push --force',
  'git reset --hard',
  'npm publish',
  'yarn publish',
];

/** Safe commands (generally low risk) */
const SAFE_COMMANDS = [
  'ls', 'dir', 'pwd', 'cd', 'cat', 'head', 'tail', 'less', 'more',
  'echo', 'printf', 'date', 'cal', 'which', 'whereis', 'type',
  'grep', 'awk', 'sed', 'sort', 'uniq', 'wc', 'diff', 'file',
  'find', 'locate', 'tree', 'du', 'df',
  'git status', 'git log', 'git diff', 'git branch', 'git show',
  'npm list', 'npm info', 'yarn list', 'yarn info',
  'node --version', 'npm --version', 'yarn --version',
  'bun --version', 'deno --version',
  'python --version', 'pip list', 'pip show',
];

/** Network commands */
const NETWORK_COMMANDS = [
  'curl', 'wget', 'ssh', 'scp', 'rsync', 'ftp', 'sftp',
  'telnet', 'nc', 'netcat', 'nmap', 'ping', 'traceroute',
  'dig', 'nslookup', 'host',
];

/** Package manager commands */
const PACKAGE_MANAGER_COMMANDS = [
  'npm install', 'npm i', 'npm uninstall', 'npm update',
  'yarn add', 'yarn remove', 'yarn upgrade',
  'bun add', 'bun remove', 'bun update',
  'pip install', 'pip uninstall',
  'brew install', 'brew uninstall', 'brew upgrade',
  'apt install', 'apt remove', 'apt upgrade',
  'apt-get install', 'apt-get remove', 'apt-get upgrade',
];

// ===========================================
// Command Filter Class
// ===========================================

export class CommandFilter {
  private options: CommandFilterOptions;

  constructor(options: Partial<CommandFilterOptions> = {}) {
    this.options = {
      allowSudo: false,
      allowPackageManager: true,
      allowNetwork: true,
      allowSystemModification: false,
      allowDeletion: true,
      allowRecursive: true,
      allowedCommands: [],
      blockedCommands: [],
      maxCommandLength: 10000,
      ...options,
    };
  }

  /**
   * Parse a command string into components
   */
  parseCommand(commandStr: string): ParsedCommand {
    const trimmed = commandStr.trim();
    const hasSudo = trimmed.startsWith('sudo ');
    const commandWithoutSudo = hasSudo ? trimmed.slice(5).trim() : trimmed;
    
    // Check for pipes
    const pipedCommands = commandWithoutSudo.split(/\s*\|\s*/);
    const hasPipes = pipedCommands.length > 1;

    // Check for redirects
    const hasRedirects = /[<>]/.test(commandWithoutSudo);

    // Check for background execution
    const isBackground = commandWithoutSudo.endsWith('&');

    // Parse first command
    const firstCommand = pipedCommands[0].replace(/&$/, '').trim();
    const parts = firstCommand.split(/\s+/);
    
    // Extract environment variables
    const env: Record<string, string> = {};
    let commandStart = 0;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].includes('=') && !parts[i].startsWith('-')) {
        const [key, value] = parts[i].split('=');
        env[key] = value || '';
        commandStart = i + 1;
      } else {
        break;
      }
    }

    const command = parts[commandStart] || '';
    const args = parts.slice(commandStart + 1);

    return {
      command,
      args,
      env,
      hasSudo,
      hasPipes,
      pipedCommands,
      hasRedirects,
      isBackground,
    };
  }

  /**
   * Filter a command
   */
  filter(commandStr: string): CommandFilterResult {
    const blockedParts: string[] = [];
    const reasons: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const alternatives: string[] = [];

    // Check command length
    if (this.options.maxCommandLength && commandStr.length > this.options.maxCommandLength) {
      return {
        allowed: false,
        command: commandStr,
        blockedParts: ['entire command'],
        reasons: ['Command exceeds maximum length'],
        riskLevel: 'medium',
      };
    }

    // Check for critical commands
    for (const critical of CRITICAL_COMMANDS) {
      if (commandStr.includes(critical)) {
        return {
          allowed: false,
          command: commandStr,
          blockedParts: [critical],
          reasons: ['Critical/destructive command detected'],
          riskLevel: 'critical',
        };
      }
    }

    // Check dangerous patterns
    for (const { pattern, reason, risk } of DANGEROUS_PATTERNS) {
      if (pattern.test(commandStr)) {
        blockedParts.push(commandStr.match(pattern)?.[0] || 'pattern');
        reasons.push(reason);
        if (risk === 'critical' || (risk === 'high' && riskLevel !== 'critical')) {
          riskLevel = risk;
        }
      }
    }

    if (riskLevel === 'critical') {
      return {
        allowed: false,
        command: commandStr,
        blockedParts,
        reasons,
        riskLevel,
      };
    }

    // Parse the command
    const parsed = this.parseCommand(commandStr);

    // Check sudo
    if (parsed.hasSudo && !this.options.allowSudo) {
      blockedParts.push('sudo');
      reasons.push('Sudo commands are not allowed');
      riskLevel = 'high';
    }

    // Check blocked commands
    if (this.options.blockedCommands && this.options.blockedCommands.length > 0) {
      for (const blocked of this.options.blockedCommands) {
        if (parsed.command === blocked || commandStr.startsWith(blocked + ' ')) {
          blockedParts.push(blocked);
          reasons.push(`Command '${blocked}' is blocked`);
          riskLevel = 'medium';
        }
      }
    }

    // Check whitelist mode
    if (this.options.allowedCommands && this.options.allowedCommands.length > 0) {
      const isAllowed = this.options.allowedCommands.some(allowed => 
        parsed.command === allowed || commandStr.startsWith(allowed + ' ')
      );
      if (!isAllowed) {
        blockedParts.push(parsed.command);
        reasons.push('Command is not in allowed list');
        riskLevel = 'medium';
      }
    }

    // Check network commands
    if (!this.options.allowNetwork) {
      for (const netCmd of NETWORK_COMMANDS) {
        if (parsed.command === netCmd) {
          blockedParts.push(netCmd);
          reasons.push('Network commands are not allowed');
          riskLevel = 'medium';
        }
      }
    }

    // Check package manager commands
    if (!this.options.allowPackageManager) {
      for (const pkgCmd of PACKAGE_MANAGER_COMMANDS) {
        if (commandStr.startsWith(pkgCmd)) {
          blockedParts.push(pkgCmd);
          reasons.push('Package manager commands are not allowed');
          riskLevel = 'medium';
        }
      }
    }

    // Check deletion commands
    if (!this.options.allowDeletion) {
      if (parsed.command === 'rm' || parsed.command === 'rmdir' || parsed.command === 'unlink') {
        blockedParts.push(parsed.command);
        reasons.push('Deletion commands are not allowed');
        riskLevel = 'medium';
      }
    }

    // Check recursive operations
    if (!this.options.allowRecursive) {
      if (parsed.args.some(arg => arg === '-r' || arg === '-R' || arg === '--recursive')) {
        blockedParts.push('-r');
        reasons.push('Recursive operations are not allowed');
        riskLevel = 'medium';
      }
    }

    // Determine if command is safe
    const isSafe = SAFE_COMMANDS.some(safe => 
      commandStr === safe || commandStr.startsWith(safe + ' ')
    );

    if (isSafe && blockedParts.length === 0) {
      riskLevel = 'low';
    } else if (riskLevel === 'low' && blockedParts.length === 0) {
      // Check if it's a confirmation command
      const needsConfirmation = CONFIRMATION_COMMANDS.some(cmd =>
        parsed.command === cmd || commandStr.startsWith(cmd + ' ')
      );
      if (needsConfirmation) {
        riskLevel = 'medium';
      }
    }

    return {
      allowed: blockedParts.length === 0,
      command: commandStr,
      blockedParts,
      reasons,
      riskLevel,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  }

  /**
   * Check if a command is safe
   */
  isSafe(commandStr: string): boolean {
    const result = this.filter(commandStr);
    return result.allowed && result.riskLevel === 'low';
  }

  /**
   * Get risk level for a command
   */
  getRiskLevel(commandStr: string): 'low' | 'medium' | 'high' | 'critical' {
    return this.filter(commandStr).riskLevel;
  }

  /**
   * Check if command needs confirmation
   */
  needsConfirmation(commandStr: string): boolean {
    const parsed = this.parseCommand(commandStr);
    return CONFIRMATION_COMMANDS.some(cmd =>
      parsed.command === cmd || commandStr.startsWith(cmd + ' ')
    );
  }

  /**
   * Escape command for safe shell execution
   */
  escapeForShell(str: string): string {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }

  /**
   * Build a safe command from parts
   */
  buildCommand(command: string, args: string[]): string {
    const escapedArgs = args.map(arg => this.escapeForShell(arg));
    return `${command} ${escapedArgs.join(' ')}`;
  }

  /**
   * Update filter options
   */
  configure(options: Partial<CommandFilterOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Add command to blocklist
   */
  blockCommand(command: string): void {
    if (!this.options.blockedCommands) {
      this.options.blockedCommands = [];
    }
    if (!this.options.blockedCommands.includes(command)) {
      this.options.blockedCommands.push(command);
    }
  }

  /**
   * Add command to allowlist
   */
  allowCommand(command: string): void {
    if (!this.options.allowedCommands) {
      this.options.allowedCommands = [];
    }
    if (!this.options.allowedCommands.includes(command)) {
      this.options.allowedCommands.push(command);
    }
  }
}

// ===========================================
// Singleton & Convenience Functions
// ===========================================

export const commandFilter = new CommandFilter();

export function filterCommand(command: string): CommandFilterResult {
  return commandFilter.filter(command);
}

export function isCommandSafe(command: string): boolean {
  return commandFilter.isSafe(command);
}

export function getCommandRiskLevel(command: string): 'low' | 'medium' | 'high' | 'critical' {
  return commandFilter.getRiskLevel(command);
}

export function parseCommand(command: string): ParsedCommand {
  return commandFilter.parseCommand(command);
}
