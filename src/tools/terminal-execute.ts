/**
 * Terminal Execute Tool
 * Execute shell commands with safety controls
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import type { ToolResult, ToolParameters } from '../types/index.js';
import type { TerminalExecuteArgs, TerminalResult } from './types.js';
import { BaseTool } from './registry.js';

// Dangerous commands that require extra confirmation
const DANGEROUS_PATTERNS = [
  /\brm\s+-rf?\s/i,
  /\bsudo\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bformat\b/i,
  /\b>\s*\/dev\//i,
  /\bchmod\s+-R\s+777/i,
  /\brm\s+.*\*/i,
  /\bkill\s+-9\s+-1/i,
  /:(){ :|:& };:/,  // Fork bomb
];

// Maximum output size (500KB)
const MAX_OUTPUT_SIZE = 500 * 1024;

export class TerminalExecuteTool extends BaseTool {
  name = 'terminal_execute';
  description = `Execute a shell command and return the output. Use for running builds, tests, git commands, package managers, etc. Commands run in a sandboxed environment with timeout protection.`;
  category = 'terminal' as const;
  dangerLevel = 'dangerous' as const;
  requiresConfirmation = true;

  parameters: ToolParameters = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command (relative to project root or absolute)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000, max: 300000)',
        default: 30000,
      },
      env: {
        type: 'object',
        description: 'Additional environment variables to set',
      },
      shell: {
        type: 'string',
        description: 'Shell to use (default: /bin/sh on Unix, cmd.exe on Windows)',
      },
    },
    required: ['command'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const {
      command,
      cwd,
      timeout = 30000,
      env = {},
      shell,
    } = args as unknown as TerminalExecuteArgs;

    // Validate command
    if (!command || typeof command !== 'string' || !command.trim()) {
      return {
        success: false,
        error: 'Command cannot be empty',
      };
    }

    // Check for dangerous commands
    const isDangerous = DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
    if (isDangerous) {
      return {
        success: false,
        error: `⚠️ Potentially dangerous command detected. This command requires explicit user confirmation: "${command}"`,
        data: { dangerous: true, command },
      };
    }

    // Resolve working directory
    const workingDir = cwd 
      ? resolve(this.context.workingDirectory, cwd)
      : this.context.workingDirectory;

    // Cap timeout at 5 minutes
    const safeTimeout = Math.min(timeout, 300000);

    // Dry run check
    if (this.context.dryRun) {
      return {
        success: true,
        output: `[DRY RUN] Would execute: ${command}\nIn directory: ${workingDir}`,
        data: { dryRun: true, command, cwd: workingDir },
      };
    }

    try {
      const result = await this.runCommand(command, {
        cwd: workingDir,
        timeout: safeTimeout,
        env: { ...process.env, ...env } as Record<string, string>,
        shell: shell || (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'),
      });

      // Format output
      const output = this.formatOutput(command, result);

      return {
        success: result.exitCode === 0,
        output,
        error: result.exitCode !== 0 ? `Command exited with code ${result.exitCode}` : undefined,
        data: {
          command,
          cwd: workingDir,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          signal: result.signal,
          timedOut: result.timedOut,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private runCommand(
    command: string,
    options: {
      cwd: string;
      timeout: number;
      env: Record<string, string>;
      shell: string;
    }
  ): Promise<TerminalResult> {
    return new Promise((resolve) => {
      const { cwd, timeout, env, shell } = options;

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn(command, [], {
        cwd,
        env,
        shell,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 1000);
      }, timeout);

      // Capture stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length < MAX_OUTPUT_SIZE) {
          stdout += chunk;
        } else if (!stdout.endsWith('\n... (output truncated)')) {
          stdout += '\n... (output truncated)';
        }
      });

      // Capture stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length < MAX_OUTPUT_SIZE) {
          stderr += chunk;
        } else if (!stderr.endsWith('\n... (output truncated)')) {
          stderr += '\n... (output truncated)';
        }
      });

      // Handle completion
      proc.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? (timedOut ? 124 : 1),
          signal: signal ?? undefined,
          timedOut,
        });
      });

      // Handle errors
      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: 1,
          timedOut: false,
        });
      });
    });
  }

  private formatOutput(command: string, result: TerminalResult): string {
    const lines: string[] = [];
    
    // Command header
    lines.push(`$ ${command}`);
    lines.push('─'.repeat(60));

    // Status indicator
    if (result.timedOut) {
      lines.push('⏱️  Command timed out');
    } else if (result.exitCode === 0) {
      lines.push('✅ Command completed successfully');
    } else {
      lines.push(`❌ Command failed (exit code: ${result.exitCode})`);
    }

    // Signal info if killed
    if (result.signal) {
      lines.push(`⚡ Terminated by signal: ${result.signal}`);
    }

    lines.push('');

    // Standard output
    if (result.stdout) {
      lines.push('📤 stdout:');
      lines.push(result.stdout);
    }

    // Standard error
    if (result.stderr) {
      if (result.stdout) lines.push('');
      lines.push('📥 stderr:');
      lines.push(result.stderr);
    }

    // Empty output message
    if (!result.stdout && !result.stderr) {
      lines.push('(no output)');
    }

    return lines.join('\n');
  }
}

export const terminalExecuteTool = new TerminalExecuteTool();
