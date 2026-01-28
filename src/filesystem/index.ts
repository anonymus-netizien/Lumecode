/**
 * File System Abstraction
 * Provides safe file operations with permission checking
 */

import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  readdir,
  stat,
  mkdir,
  unlink,
  access,
  constants,
} from 'fs/promises';
import { join, resolve, dirname, extname, basename } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import type { DirectoryTree, FileContext, GitInfo, GitDiff } from '../types/index.js';
import { FileSystemError } from '../types/index.js';

// ===========================================
// Language Detection
// ===========================================

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.html': 'html',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.r': 'r',
  '.R': 'r',
  '.lua': 'lua',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.ml': 'ocaml',
  '.fs': 'fsharp',
  '.clj': 'clojure',
  '.dart': 'dart',
  '.zig': 'zig',
  '.nim': 'nim',
  '.v': 'v',
  '.dockerfile': 'dockerfile',
  '.Dockerfile': 'dockerfile',
};

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const name = basename(filePath).toLowerCase();

  // Check by filename first
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile') return 'makefile';
  if (name === '.gitignore') return 'gitignore';
  if (name === '.env' || name.startsWith('.env.')) return 'dotenv';

  return EXTENSION_TO_LANGUAGE[ext] || 'plaintext';
}

// ===========================================
// File System Class
// ===========================================

class FileSystem {
  private workingDirectory: string = process.cwd();

  /**
   * Set the working directory
   */
  setWorkingDirectory(dir: string): void {
    this.workingDirectory = resolve(dir);
  }

  /**
   * Get the current working directory
   */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  /**
   * Resolve a path relative to working directory
   */
  resolvePath(filePath: string): string {
    if (filePath.startsWith('/') || filePath.startsWith('~')) {
      return resolve(filePath.replace('~', process.env.HOME || ''));
    }
    return resolve(this.workingDirectory, filePath);
  }

  // ===========================================
  // File Operations
  // ===========================================

  /**
   * Read a file's contents
   */
  async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    
    try {
      await access(fullPath, constants.R_OK);
      return await fsReadFile(fullPath, 'utf-8');
    } catch (error) {
      throw new FileSystemError(`Cannot read file: ${error}`, fullPath);
    }
  }

  /**
   * Read a file with metadata
   */
  async readFileWithContext(filePath: string): Promise<FileContext> {
    const fullPath = this.resolvePath(filePath);
    const content = await this.readFile(fullPath);
    
    return {
      path: filePath,
      content,
      language: detectLanguage(filePath),
    };
  }

  /**
   * Write content to a file
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    
    try {
      // Ensure directory exists
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      
      await fsWriteFile(fullPath, content, 'utf-8');
    } catch (error) {
      throw new FileSystemError(`Cannot write file: ${error}`, fullPath);
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    
    try {
      await unlink(fullPath);
    } catch (error) {
      throw new FileSystemError(`Cannot delete file: ${error}`, fullPath);
    }
  }

  /**
   * Check if a file exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(filePath);
    return existsSync(fullPath);
  }

  /**
   * Create a directory
   */
  async createDirectory(dirPath: string): Promise<void> {
    const fullPath = this.resolvePath(dirPath);
    
    try {
      await mkdir(fullPath, { recursive: true });
    } catch (error) {
      throw new FileSystemError(`Cannot create directory: ${error}`, fullPath);
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string): Promise<Array<{
    name: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: Date;
  }>> {
    const fullPath = this.resolvePath(dirPath);
    
    try {
      const entries = await readdir(fullPath);
      const results = await Promise.all(
        entries.map(async (name) => {
          const entryPath = join(fullPath, name);
          try {
            const stats = await stat(entryPath);
            return {
              name,
              type: stats.isDirectory() ? 'directory' : 'file',
              size: stats.isFile() ? stats.size : undefined,
              modified: stats.mtime,
            } as const;
          } catch {
            return { name, type: 'file' as const };
          }
        })
      );
      
      // Sort: directories first, then alphabetically
      return results.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      throw new FileSystemError(`Cannot list directory: ${error}`, fullPath);
    }
  }

  /**
   * Get directory tree
   */
  async getDirectoryTree(
    dirPath: string,
    options: {
      maxDepth?: number;
      includeHidden?: boolean;
      excludePatterns?: string[];
    } = {}
  ): Promise<DirectoryTree> {
    const { maxDepth = 5, includeHidden = false, excludePatterns = [] } = options;
    const fullPath = this.resolvePath(dirPath);

    const defaultExcludes = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      '__pycache__',
      '.venv',
      'venv',
      '.DS_Store',
    ];
    const allExcludes = [...defaultExcludes, ...excludePatterns];

    const buildTree = async (
      currentPath: string,
      depth: number
    ): Promise<DirectoryTree> => {
      const name = basename(currentPath);
      const stats = await stat(currentPath);

      if (stats.isFile()) {
        return {
          name,
          path: currentPath,
          type: 'file',
          size: stats.size,
          modified: stats.mtime,
        };
      }

      const tree: DirectoryTree = {
        name,
        path: currentPath,
        type: 'directory',
        children: [],
      };

      if (depth >= maxDepth) {
        return tree;
      }

      try {
        const entries = await readdir(currentPath);
        
        for (const entry of entries) {
          // Skip hidden files if not included
          if (!includeHidden && entry.startsWith('.')) {
            continue;
          }

          // Skip excluded patterns
          if (allExcludes.some((pattern) => entry.includes(pattern))) {
            continue;
          }

          const entryPath = join(currentPath, entry);
          try {
            const childTree = await buildTree(entryPath, depth + 1);
            tree.children!.push(childTree);
          } catch {
            // Skip entries we can't access
          }
        }

        // Sort children
        tree.children!.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      } catch {
        // Directory not readable
      }

      return tree;
    };

    return buildTree(fullPath, 0);
  }

  /**
   * Search for files matching a glob pattern
   */
  async searchFiles(pattern: string, directory?: string): Promise<string[]> {
    const dir = directory ? this.resolvePath(directory) : this.workingDirectory;
    
    // Simple glob matching for now
    const results: string[] = [];
    
    const search = async (currentDir: string): Promise<void> => {
      try {
        const entries = await readdir(currentDir);
        
        for (const entry of entries) {
          // Skip common ignored directories
          if (['node_modules', '.git', 'dist', 'build'].includes(entry)) {
            continue;
          }

          const entryPath = join(currentDir, entry);
          const stats = await stat(entryPath);

          if (stats.isDirectory()) {
            await search(entryPath);
          } else if (this.matchGlob(entry, pattern)) {
            results.push(entryPath);
          }
        }
      } catch {
        // Skip directories we can't access
      }
    };

    await search(dir);
    return results;
  }

  /**
   * Simple glob matching
   */
  private matchGlob(name: string, pattern: string): boolean {
    // Convert glob to regex
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$',
      'i'
    );
    return regex.test(name);
  }

  // ===========================================
  // Command Execution
  // ===========================================

  /**
   * Execute a shell command
   */
  async executeCommand(
    command: string,
    cwd?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const workDir = cwd || this.workingDirectory;

    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      
      const proc = spawn(cmd, args, {
        cwd: workDir,
        shell: true,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      });

      proc.on('error', (error) => {
        resolve({
          stdout,
          stderr: error.message,
          exitCode: 1,
        });
      });
    });
  }

  // ===========================================
  // Git Operations
  // ===========================================

  /**
   * Get git information for a directory
   */
  async getGitInfo(directory?: string): Promise<GitInfo | null> {
    const dir = directory || this.workingDirectory;

    try {
      // Check if it's a git repository
      const gitDir = join(dir, '.git');
      if (!existsSync(gitDir)) {
        return null;
      }

      // Get branch
      const branchResult = await this.executeCommand(
        'git rev-parse --abbrev-ref HEAD',
        dir
      );
      const branch = branchResult.stdout.trim();

      // Get remote URL
      const remoteResult = await this.executeCommand(
        'git config --get remote.origin.url',
        dir
      );
      const remoteUrl = remoteResult.stdout.trim() || undefined;

      // Check for uncommitted changes
      const statusResult = await this.executeCommand('git status --porcelain', dir);
      const isDirty = statusResult.stdout.trim().length > 0;
      const uncommittedFiles = isDirty
        ? statusResult.stdout
            .trim()
            .split('\n')
            .map((line) => line.slice(3))
        : undefined;

      // Get last commit
      const logResult = await this.executeCommand(
        'git log -1 --format="%H|%s|%an|%aI"',
        dir
      );
      let lastCommit: GitInfo['lastCommit'];
      
      if (logResult.exitCode === 0 && logResult.stdout.trim()) {
        const [hash, message, author, date] = logResult.stdout.trim().split('|');
        lastCommit = {
          hash,
          message,
          author,
          date: new Date(date),
        };
      }

      return {
        branch,
        remoteUrl,
        isDirty,
        uncommittedFiles,
        lastCommit,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get git diff for uncommitted changes
   */
  async getGitDiff(directory?: string): Promise<GitDiff[]> {
    const dir = directory || this.workingDirectory;
    const diffs: GitDiff[] = [];

    try {
      const result = await this.executeCommand('git diff --stat', dir);
      if (result.exitCode !== 0) return diffs;

      // Parse diff stat output
      const lines = result.stdout.trim().split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([+-]*)/);
        if (match) {
          const [, file, changes, plusMinus] = match;
          const additions = (plusMinus.match(/\+/g) || []).length;
          const deletions = (plusMinus.match(/-/g) || []).length;
          
          diffs.push({
            file: file.trim(),
            additions,
            deletions,
            hunks: [], // Would need full diff parsing for hunks
          });
        }
      }
    } catch {
      // Git not available or not a repo
    }

    return diffs;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const fileSystem = new FileSystem();
export { FileSystem, detectLanguage, EXTENSION_TO_LANGUAGE };
