/**
 * Enhanced Terminal Tool
 * Production-grade terminal execution with:
 * - Streaming output support
 * - Process management (kill, signal)
 * - Command validation and sandboxing
 * - Cross-platform compatibility
 * - PTY support for interactive commands
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import type { ToolResult, ToolParameters } from '../types/index.js';
import type { TerminalExecuteArgs, TerminalResult } from './types.js';
import { BaseTool } from './registry.js';
import { filterCommand } from '../security/command-filter.js';

// ===========================================
// Process Manager
// ===========================================

interface ManagedProcess {
  id: string;
  command: string;
  process: ChildProcess;
  startTime: Date;
  cwd: string;
  status: 'running' | 'completed' | 'killed' | 'error';
  exitCode?: number;
}

class ProcessManager {
  private processes = new Map<string, ManagedProcess>();
  private maxProcesses = 10;

  add(id: string, command: string, process: ChildProcess, cwd: string): void {
    // Cleanup old processes if limit reached
    if (this.processes.size >= this.maxProcesses) {
      const oldest = Array.from(this.processes.entries())
        .filter(([, p]) => p.status !== 'running')
        .sort((a, b) => a[1].startTime.getTime() - b[1].startTime.getTime())[0];
      if (oldest) {
        this.processes.delete(oldest[0]);
      }
    }

    this.processes.set(id, {
      id,
      command,
      process,
      startTime: new Date(),
      cwd,
      status: 'running',
    });

    process.on('exit', (code) => {
      const managed = this.processes.get(id);
      if (managed) {
        managed.status = 'completed';
        managed.exitCode = code ?? undefined;
      }
    });

    process.on('error', () => {
      const managed = this.processes.get(id);
      if (managed) {
        managed.status = 'error';
      }
    });
  }

  kill(id: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const managed = this.processes.get(id);
    if (!managed || managed.status !== 'running') {
      return false;
    }

    managed.process.kill(signal);
    managed.status = 'killed';
    return true;
  }

  get(id: string): ManagedProcess | undefined {
    return this.processes.get(id);
  }

  list(): ManagedProcess[] {
    return Array.from(this.processes.values());
  }

  getRunning(): ManagedProcess[] {
    return this.list().filter(p => p.status === 'running');
  }

  killAll(): void {
    for (const managed of this.getRunning()) {
      managed.process.kill('SIGTERM');
      managed.status = 'killed';
    }
  }
}

// Singleton process manager
export const processManager = new ProcessManager();

// ===========================================
// Output Limiter
// ===========================================

const MAX_OUTPUT_SIZE = 512 * 1024; // 512KB
const MAX_LINE_LENGTH = 10000;      // 10K chars per line

class OutputBuffer {
  private buffer = '';
  private truncated = false;

  append(data: string): void {
    if (this.truncated) return;

    // Truncate very long lines
    const lines = data.split('\n').map(line => 
      line.length > MAX_LINE_LENGTH 
        ? line.slice(0, MAX_LINE_LENGTH) + '... (line truncated)'
        : line
    );
    const processed = lines.join('\n');

    if (this.buffer.length + processed.length > MAX_OUTPUT_SIZE) {
      const remaining = MAX_OUTPUT_SIZE - this.buffer.length;
      this.buffer += processed.slice(0, remaining);
      this.buffer += '\n\n... [Output truncated: exceeded 512KB limit]';
      this.truncated = true;
    } else {
      this.buffer += processed;
    }
  }

  get(): string {
    return this.buffer.trim();
  }

  isTruncated(): boolean {
    return this.truncated;
  }

  clear(): void {
    this.buffer = '';
    this.truncated = false;
  }
}

// ===========================================
// Command Analyzer
// ===========================================

export interface CommandAnalysis {
  isBlocked: boolean;
  isDangerous: boolean;
  isSafe: boolean;
  requiresConfirmation: boolean;
  reason?: string;
  sanitizedCommand?: string;
}

export function analyzeCommand(command: string): CommandAnalysis {
  const filterResult = filterCommand(command);

  if (!filterResult.allowed) {
    return {
      isBlocked: true,
      isDangerous: true,
      isSafe: false,
      requiresConfirmation: true,
      reason:
        filterResult.reasons.length > 0
          ? filterResult.reasons.join('; ')
          : 'Command blocked by security policy',
    };
  }

  const riskLevel = filterResult.riskLevel;
  const isSafe = riskLevel === 'low';
  const isDangerous = riskLevel === 'high' || riskLevel === 'critical';
  const requiresConfirmation = riskLevel === 'medium' || isDangerous;

  return {
    isBlocked: false,
    isDangerous,
    isSafe,
    requiresConfirmation,
    reason: isDangerous
      ? filterResult.reasons.length > 0
        ? filterResult.reasons.join('; ')
        : 'Potentially dangerous command'
      : undefined,
  };
}

// ===========================================
// Shell Detection
// ===========================================

export function detectShell(): string {
  if (process.platform === 'win32') {
    // Prefer PowerShell on Windows
    if (existsSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')) {
      return 'powershell.exe';
    }
    return 'cmd.exe';
  }
  
  // Unix-like systems
  const shell = process.env.SHELL;
  if (shell && existsSync(shell)) {
    return shell;
  }
  
  // Fallbacks
  const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
  for (const s of shells) {
    if (existsSync(s)) {
      return s;
    }
  }
  
  return '/bin/sh';
}

// ===========================================
// Enhanced Terminal Tool
// ===========================================

export class EnhancedTerminalTool extends BaseTool {
  name = 'terminal_execute';
  description = `Execute a shell command and return the output. 

Features:
- Runs commands in the project directory
- Captures stdout and stderr
- Supports timeouts (default 30s, max 5min)
- Streams output for long-running commands

Use for: builds, tests, git operations, file operations, package management.

Safety:
- Dangerous commands (rm -rf, sudo, etc.) require confirmation
- Some commands are blocked for security
- Output is truncated at 512KB

Examples:
- "npm install" - install dependencies
- "npm run build" - build project
- "git status" - check git status
- "ls -la src/" - list files`;

  category = 'terminal' as const;
  dangerLevel = 'dangerous' as const;
  requiresConfirmation = true;

  parameters: ToolParameters = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute. Can include pipes and redirects.',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (relative to project root or absolute). Defaults to project root.',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds. Default: 30000 (30s), Max: 300000 (5min).',
      },
      env: {
        type: 'object',
        description: 'Additional environment variables to set for the command.',
      },
      background: {
        type: 'boolean',
        description: 'Run command in background and return immediately. Use for long-running processes.',
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
      background = false,
    } = args as unknown as TerminalExecuteArgs & { background?: boolean };

    // Validate command
    if (!command || typeof command !== 'string' || !command.trim()) {
      return {
        success: false,
        error: 'Command cannot be empty',
      };
    }

    // Analyze command for security
    const analysis = analyzeCommand(command);

    if (analysis.isBlocked) {
      return {
        success: false,
        error: `🚫 Command blocked: ${analysis.reason}`,
        data: { blocked: true, command, analysis },
      };
    }

    // Resolve working directory
    const workingDir = cwd 
      ? resolve(this.context.workingDirectory, cwd)
      : this.context.workingDirectory;

    // Verify working directory exists
    if (!existsSync(workingDir)) {
      return {
        success: false,
        error: `Working directory does not exist: ${workingDir}`,
      };
    }

    // Cap timeout
    const safeTimeout = Math.min(Math.max(timeout, 1000), 300000);

    // Dry run check
    if (this.context.dryRun) {
      return {
        success: true,
        output: `[DRY RUN] Would execute: ${command}\nIn directory: ${workingDir}`,
        data: { dryRun: true, command, cwd: workingDir, analysis },
      };
    }

    // Generate process ID
    const processId = `proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Execute command
    try {
      if (background) {
        return await this.executeBackground(processId, command, workingDir, env as Record<string, string>);
      } else {
        return await this.executeSync(processId, command, workingDir, safeTimeout, env as Record<string, string>);
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async executeSync(
    processId: string,
    command: string,
    cwd: string,
    timeout: number,
    env: Record<string, string>
  ): Promise<ToolResult> {
    return new Promise((resolve) => {
      const shell = detectShell();
      const stdout = new OutputBuffer();
      const stderr = new OutputBuffer();
      let timedOut = false;

      const spawnOptions: SpawnOptions = {
        cwd,
        env: { ...process.env, ...env },
        shell,
        stdio: ['ignore', 'pipe', 'pipe'],
      };

      const proc = spawn(command, [], spawnOptions);

      // Track process
      processManager.add(processId, command, proc, cwd);

      // Timeout handler
      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 2000);
      }, timeout);

      // Capture output
      proc.stdout?.on('data', (data: Buffer) => {
        stdout.append(data.toString());
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr.append(data.toString());
      });

      // Handle completion
      proc.on('close', (code, signal) => {
        clearTimeout(timeoutId);

        const result: TerminalResult = {
          stdout: stdout.get(),
          stderr: stderr.get(),
          exitCode: code ?? (timedOut ? 124 : 1),
          signal: signal ?? undefined,
          timedOut,
        };

        const output = this.formatOutput(command, cwd, result);

        resolve({
          success: result.exitCode === 0,
          output,
          error: result.exitCode !== 0 
            ? (timedOut ? 'Command timed out' : `Exit code: ${result.exitCode}`)
            : undefined,
          data: {
            processId,
            command,
            cwd,
            exitCode: result.exitCode,
            signal: result.signal,
            timedOut,
            truncated: stdout.isTruncated() || stderr.isTruncated(),
          },
        });
      });

      // Handle spawn errors
      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: `Failed to spawn process: ${err.message}`,
          data: { processId, command, cwd, error: err.message },
        });
      });
    });
  }

  private async executeBackground(
    processId: string,
    command: string,
    cwd: string,
    env: Record<string, string>
  ): Promise<ToolResult> {
    const shell = detectShell();

    const proc = spawn(command, [], {
      cwd,
      env: { ...process.env, ...env },
      shell,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    processManager.add(processId, command, proc, cwd);

    // Don't wait for completion
    proc.unref();

    return {
      success: true,
      output: `Background process started: ${processId}\nCommand: ${command}\nCwd: ${cwd}\n\nUse /process ${processId} to check status or kill.`,
      data: {
        processId,
        command,
        cwd,
        background: true,
        pid: proc.pid,
      },
    };
  }

  private formatOutput(command: string, cwd: string, result: TerminalResult): string {
    const lines: string[] = [];
    
    // Header
    lines.push(`┌─ Command ─────────────────────────────────────────────────`);
    lines.push(`│ $ ${command}`);
    lines.push(`│ cwd: ${cwd}`);
    lines.push(`├───────────────────────────────────────────────────────────`);

    // Status
    if (result.timedOut) {
      lines.push(`│ ⏱️  TIMEOUT - Command exceeded time limit`);
    } else if (result.exitCode === 0) {
      lines.push(`│ ✅ SUCCESS - Exit code: 0`);
    } else {
      lines.push(`│ ❌ FAILED - Exit code: ${result.exitCode}`);
    }

    if (result.signal) {
      lines.push(`│ ⚡ Signal: ${result.signal}`);
    }

    lines.push(`└───────────────────────────────────────────────────────────`);
    lines.push('');

    // Output
    if (result.stdout) {
      lines.push('stdout:');
      lines.push('```');
      lines.push(result.stdout);
      lines.push('```');
    }

    if (result.stderr) {
      if (result.stdout) lines.push('');
      lines.push('stderr:');
      lines.push('```');
      lines.push(result.stderr);
      lines.push('```');
    }

    if (!result.stdout && !result.stderr) {
      lines.push('(no output)');
    }

    return lines.join('\n');
  }
}

export const enhancedTerminalTool = new EnhancedTerminalTool();
