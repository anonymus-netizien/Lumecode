/**
 * Mock Git Repository for Testing
 * Simulates Git operations without actual repository
 */

// ===========================================
// Types
// ===========================================

export interface MockCommit {
  hash: string;
  message: string;
  author: string;
  email: string;
  date: Date;
  files: string[];
}

export interface MockBranch {
  name: string;
  current: boolean;
  tracking?: string;
  commits: MockCommit[];
}

export interface MockFileStatus {
  path: string;
  index: 'A' | 'M' | 'D' | '?' | ' ';
  working: 'A' | 'M' | 'D' | '?' | ' ';
}

export interface MockStash {
  index: number;
  message: string;
  branch: string;
  date: Date;
}

// ===========================================
// Mock Git Repository Class
// ===========================================

export class MockGitRepository {
  private branches: Map<string, MockBranch> = new Map();
  private currentBranch: string = 'main';
  private stagedFiles: Map<string, string> = new Map();
  private workingFiles: Map<string, string> = new Map();
  private trackedFiles: Map<string, string> = new Map();
  private stashes: MockStash[] = [];
  private remotes: Map<string, string> = new Map();
  private operationLog: Array<{ operation: string; args: unknown[]; timestamp: Date }> = [];

  constructor() {
    // Initialize with main branch
    this.branches.set('main', {
      name: 'main',
      current: true,
      commits: [],
    });

    // Add initial commit
    this.commit('Initial commit');
  }

  // ===========================================
  // Status & Info
  // ===========================================

  /**
   * Get repository status
   */
  status(): {
    current: string;
    tracking: string | null;
    staged: MockFileStatus[];
    modified: MockFileStatus[];
    untracked: string[];
    conflicted: string[];
  } {
    this.logOperation('status', []);

    const staged: MockFileStatus[] = [];
    const modified: MockFileStatus[] = [];
    const untracked: string[] = [];

    // Check staged files
    for (const [path] of this.stagedFiles) {
      staged.push({
        path,
        index: this.trackedFiles.has(path) ? 'M' : 'A',
        working: ' ',
      });
    }

    // Check working directory changes
    for (const [path, content] of this.workingFiles) {
      if (!this.stagedFiles.has(path)) {
        if (this.trackedFiles.has(path)) {
          if (this.trackedFiles.get(path) !== content) {
            modified.push({ path, index: ' ', working: 'M' });
          }
        } else {
          untracked.push(path);
        }
      }
    }

    const branch = this.branches.get(this.currentBranch)!;

    return {
      current: this.currentBranch,
      tracking: branch.tracking || null,
      staged,
      modified,
      untracked,
      conflicted: [],
    };
  }

  /**
   * Get log of commits
   */
  log(options?: { maxCount?: number; branch?: string }): MockCommit[] {
    this.logOperation('log', [options]);

    const branchName = options?.branch || this.currentBranch;
    const branch = this.branches.get(branchName);
    if (!branch) {
      throw new Error(`Branch not found: ${branchName}`);
    }

    let commits = [...branch.commits].reverse();
    if (options?.maxCount) {
      commits = commits.slice(0, options.maxCount);
    }

    return commits;
  }

  /**
   * Show diff
   */
  diff(options?: { staged?: boolean; file?: string }): string {
    this.logOperation('diff', [options]);

    const diffs: string[] = [];

    if (options?.staged) {
      for (const [path, content] of this.stagedFiles) {
        const original = this.trackedFiles.get(path) || '';
        diffs.push(this.generateDiff(path, original, content));
      }
    } else {
      for (const [path, content] of this.workingFiles) {
        const original = this.trackedFiles.get(path) || this.stagedFiles.get(path) || '';
        if (content !== original && (!options?.file || options.file === path)) {
          diffs.push(this.generateDiff(path, original, content));
        }
      }
    }

    return diffs.join('\n');
  }

  // ===========================================
  // Branch Operations
  // ===========================================

  /**
   * Create a new branch
   */
  branch(name: string, options?: { checkout?: boolean }): void {
    this.logOperation('branch', [name, options]);

    if (this.branches.has(name)) {
      throw new Error(`Branch already exists: ${name}`);
    }

    const currentBranchData = this.branches.get(this.currentBranch)!;
    this.branches.set(name, {
      name,
      current: false,
      commits: [...currentBranchData.commits],
    });

    if (options?.checkout) {
      this.checkout(name);
    }
  }

  /**
   * Checkout a branch
   */
  checkout(branchOrFile: string, options?: { create?: boolean }): void {
    this.logOperation('checkout', [branchOrFile, options]);

    if (options?.create) {
      this.branch(branchOrFile);
    }

    if (!this.branches.has(branchOrFile)) {
      // Check if it's a file
      if (this.trackedFiles.has(branchOrFile)) {
        // Restore file from tracked state
        this.workingFiles.set(branchOrFile, this.trackedFiles.get(branchOrFile)!);
        return;
      }
      throw new Error(`Branch not found: ${branchOrFile}`);
    }

    // Update current flag
    for (const [name, branch] of this.branches) {
      branch.current = name === branchOrFile;
    }

    this.currentBranch = branchOrFile;
  }

  /**
   * Delete a branch
   */
  deleteBranch(name: string, force: boolean = false): void {
    this.logOperation('deleteBranch', [name, force]);

    if (name === this.currentBranch) {
      throw new Error('Cannot delete current branch');
    }

    if (!this.branches.has(name)) {
      throw new Error(`Branch not found: ${name}`);
    }

    this.branches.delete(name);
  }

  /**
   * List branches
   */
  listBranches(): string[] {
    this.logOperation('listBranches', []);
    return Array.from(this.branches.keys());
  }

  /**
   * Get current branch
   */
  getCurrentBranch(): string {
    return this.currentBranch;
  }

  // ===========================================
  // Staging & Commit Operations
  // ===========================================

  /**
   * Stage files
   */
  add(files: string | string[]): void {
    this.logOperation('add', [files]);

    const fileList = Array.isArray(files) ? files : [files];
    for (const file of fileList) {
      if (file === '.') {
        // Stage all working files
        for (const [path, content] of this.workingFiles) {
          this.stagedFiles.set(path, content);
        }
      } else if (this.workingFiles.has(file)) {
        this.stagedFiles.set(file, this.workingFiles.get(file)!);
      }
    }
  }

  /**
   * Unstage files
   */
  reset(files?: string | string[]): void {
    this.logOperation('reset', [files]);

    if (!files) {
      this.stagedFiles.clear();
    } else {
      const fileList = Array.isArray(files) ? files : [files];
      for (const file of fileList) {
        this.stagedFiles.delete(file);
      }
    }
  }

  /**
   * Commit staged changes
   */
  commit(message: string, options?: { author?: string; email?: string }): MockCommit {
    this.logOperation('commit', [message, options]);

    const branch = this.branches.get(this.currentBranch)!;

    const commit: MockCommit = {
      hash: this.generateHash(),
      message,
      author: options?.author || 'Test User',
      email: options?.email || 'test@example.com',
      date: new Date(),
      files: Array.from(this.stagedFiles.keys()),
    };

    // Update tracked files
    for (const [path, content] of this.stagedFiles) {
      this.trackedFiles.set(path, content);
    }

    // Clear staged files
    this.stagedFiles.clear();

    // Add commit to branch
    branch.commits.push(commit);

    return commit;
  }

  /**
   * Amend last commit
   */
  amendCommit(message?: string): MockCommit {
    this.logOperation('amendCommit', [message]);

    const branch = this.branches.get(this.currentBranch)!;
    if (branch.commits.length === 0) {
      throw new Error('No commits to amend');
    }

    const lastCommit = branch.commits[branch.commits.length - 1];

    // Update tracked files with staged
    for (const [path, content] of this.stagedFiles) {
      this.trackedFiles.set(path, content);
      lastCommit.files.push(path);
    }

    if (message) {
      lastCommit.message = message;
    }

    lastCommit.date = new Date();
    lastCommit.files = [...new Set(lastCommit.files)];

    this.stagedFiles.clear();

    return lastCommit;
  }

  // ===========================================
  // Working Directory
  // ===========================================

  /**
   * Modify a file in working directory
   */
  modifyFile(path: string, content: string): void {
    this.workingFiles.set(path, content);
  }

  /**
   * Delete a file from working directory
   */
  deleteFile(path: string): void {
    this.workingFiles.delete(path);
    this.stagedFiles.delete(path);
  }

  /**
   * Get file content
   */
  getFileContent(path: string): string | undefined {
    return this.workingFiles.get(path) || this.trackedFiles.get(path);
  }

  // ===========================================
  // Remote Operations
  // ===========================================

  /**
   * Add remote
   */
  addRemote(name: string, url: string): void {
    this.logOperation('addRemote', [name, url]);
    this.remotes.set(name, url);
  }

  /**
   * Get remote URL
   */
  getRemote(name: string): string | undefined {
    return this.remotes.get(name);
  }

  /**
   * List remotes
   */
  listRemotes(): Array<{ name: string; url: string }> {
    this.logOperation('listRemotes', []);
    return Array.from(this.remotes.entries()).map(([name, url]) => ({ name, url }));
  }

  /**
   * Simulate push
   */
  push(remote: string = 'origin', branch?: string): void {
    this.logOperation('push', [remote, branch]);
    // Simulated - no actual push
  }

  /**
   * Simulate pull
   */
  pull(remote: string = 'origin', branch?: string): void {
    this.logOperation('pull', [remote, branch]);
    // Simulated - no actual pull
  }

  /**
   * Simulate fetch
   */
  fetch(remote: string = 'origin'): void {
    this.logOperation('fetch', [remote]);
    // Simulated - no actual fetch
  }

  // ===========================================
  // Stash Operations
  // ===========================================

  /**
   * Stash changes
   */
  stash(message?: string): void {
    this.logOperation('stash', [message]);

    this.stashes.push({
      index: this.stashes.length,
      message: message || `WIP on ${this.currentBranch}`,
      branch: this.currentBranch,
      date: new Date(),
    });

    // Clear working changes
    for (const path of this.workingFiles.keys()) {
      if (this.trackedFiles.has(path)) {
        this.workingFiles.set(path, this.trackedFiles.get(path)!);
      }
    }
    this.stagedFiles.clear();
  }

  /**
   * Apply stash
   */
  stashPop(index: number = 0): void {
    this.logOperation('stashPop', [index]);

    if (index >= this.stashes.length) {
      throw new Error('Stash not found');
    }

    this.stashes.splice(index, 1);
  }

  /**
   * List stashes
   */
  stashList(): MockStash[] {
    this.logOperation('stashList', []);
    return [...this.stashes];
  }

  // ===========================================
  // Utility Methods
  // ===========================================

  /**
   * Get operation log
   */
  getOperationLog(): Array<{ operation: string; args: unknown[]; timestamp: Date }> {
    return [...this.operationLog];
  }

  /**
   * Clear operation log
   */
  clearLog(): void {
    this.operationLog = [];
  }

  /**
   * Reset repository to initial state
   */
  resetRepository(): void {
    this.branches.clear();
    this.branches.set('main', {
      name: 'main',
      current: true,
      commits: [],
    });
    this.currentBranch = 'main';
    this.stagedFiles.clear();
    this.workingFiles.clear();
    this.trackedFiles.clear();
    this.stashes = [];
    this.remotes.clear();
    this.operationLog = [];
    this.commit('Initial commit');
  }

  // ===========================================
  // Private Methods
  // ===========================================

  private logOperation(operation: string, args: unknown[]): void {
    this.operationLog.push({
      operation,
      args,
      timestamp: new Date(),
    });
  }

  private generateHash(): string {
    const chars = '0123456789abcdef';
    let hash = '';
    for (let i = 0; i < 40; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  }

  private generateDiff(path: string, original: string, modified: string): string {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');

    let diff = `diff --git a/${path} b/${path}\n`;
    diff += `--- a/${path}\n`;
    diff += `+++ b/${path}\n`;
    diff += `@@ -1,${originalLines.length} +1,${modifiedLines.length} @@\n`;

    for (const line of originalLines) {
      diff += `-${line}\n`;
    }
    for (const line of modifiedLines) {
      diff += `+${line}\n`;
    }

    return diff;
  }
}

// ===========================================
// Factory Functions
// ===========================================

/**
 * Create a mock Git repository
 */
export function createMockGitRepository(): MockGitRepository {
  return new MockGitRepository();
}

/**
 * Create a repository with sample history
 */
export function createMockGitRepositoryWithHistory(): MockGitRepository {
  const repo = new MockGitRepository();

  // Add some files and commits
  repo.modifyFile('README.md', '# Project\n\nDescription');
  repo.add('README.md');
  repo.commit('Add README');

  repo.modifyFile('src/index.ts', 'console.log("Hello");');
  repo.add('src/index.ts');
  repo.commit('Add main entry point');

  repo.modifyFile('package.json', '{"name": "test"}');
  repo.add('package.json');
  repo.commit('Add package.json');

  // Create a feature branch
  repo.branch('feature/test', { checkout: true });
  repo.modifyFile('src/feature.ts', 'export const feature = true;');
  repo.add('src/feature.ts');
  repo.commit('Add feature');

  // Back to main
  repo.checkout('main');

  return repo;
}

export default MockGitRepository;
