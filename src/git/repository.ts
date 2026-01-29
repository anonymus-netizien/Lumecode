/**
 * Git Repository Manager
 * Core Git operations using simple-git
 */

import simpleGit, { 
  SimpleGit, 
  StatusResult, 
  LogResult, 
  DiffResult,
  BranchSummary,
  FetchResult,
  PullResult,
  PushResult,
  CommitResult,
} from 'simple-git';
import { existsSync } from 'fs';
import { resolve, join } from 'path';

// ===========================================
// Types
// ===========================================

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  tracking?: string;
  ahead: number;
  behind: number;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
  conflicted: string[];
  isDirty: boolean;
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string; // For renames
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  body: string;
  author: {
    name: string;
    email: string;
  };
  date: Date;
  refs: string[];
}

export interface GitDiff {
  files: DiffFile[];
  insertions: number;
  deletions: number;
  summary: string;
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
  binary: boolean;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'add' | 'delete';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface GitBranch {
  name: string;
  current: boolean;
  commit: string;
  label: string;
  tracking?: string;
  ahead?: number;
  behind?: number;
}

export interface GitRemote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitStash {
  index: number;
  message: string;
  date: Date;
}

// ===========================================
// Git Repository Class
// ===========================================

export class GitRepository {
  private git: SimpleGit;
  private workingDirectory: string;
  private _isRepo: boolean = false;

  constructor(workingDirectory: string) {
    this.workingDirectory = resolve(workingDirectory);
    this.git = simpleGit(this.workingDirectory);
  }

  // ===========================================
  // Initialization
  // ===========================================

  /**
   * Check if current directory is a git repository
   */
  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.status();
      this._isRepo = true;
      return true;
    } catch {
      this._isRepo = false;
      return false;
    }
  }

  /**
   * Initialize a new git repository
   */
  async init(options: { bare?: boolean; defaultBranch?: string } = {}): Promise<void> {
    const args: string[] = [];
    if (options.bare) args.push('--bare');
    if (options.defaultBranch) args.push('-b', options.defaultBranch);
    
    await this.git.init(args);
    this._isRepo = true;
  }

  /**
   * Clone a repository
   */
  async clone(
    url: string, 
    destination: string,
    options: { branch?: string; depth?: number; bare?: boolean } = {}
  ): Promise<void> {
    const cloneOptions: string[] = [];
    
    if (options.branch) {
      cloneOptions.push('-b', options.branch);
    }
    if (options.depth) {
      cloneOptions.push('--depth', String(options.depth));
    }
    if (options.bare) {
      cloneOptions.push('--bare');
    }

    await this.git.clone(url, destination, cloneOptions);
  }

  // ===========================================
  // Status & Info
  // ===========================================

  /**
   * Get comprehensive repository status
   */
  async getStatus(): Promise<GitStatus> {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      return {
        isRepo: false,
        branch: '',
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: [],
        isDirty: false,
      };
    }

    const status: StatusResult = await this.git.status();

    const staged: FileChange[] = [];
    const unstaged: FileChange[] = [];

    // Process staged files
    for (const file of status.staged) {
      staged.push({
        path: file,
        status: this.mapStatusCode(status.files.find(f => f.path === file)?.index || 'M'),
      });
    }

    // Process modified (unstaged) files
    for (const file of status.modified) {
      if (!status.staged.includes(file)) {
        unstaged.push({ path: file, status: 'modified' });
      }
    }

    // Process deleted files
    for (const file of status.deleted) {
      if (!status.staged.includes(file)) {
        unstaged.push({ path: file, status: 'deleted' });
      }
    }

    // Process renamed files
    for (const file of status.renamed) {
      staged.push({
        path: file.to,
        oldPath: file.from,
        status: 'renamed',
      });
    }

    return {
      isRepo: true,
      branch: status.current || 'HEAD',
      tracking: status.tracking || undefined,
      ahead: status.ahead,
      behind: status.behind,
      staged,
      unstaged,
      untracked: status.not_added,
      conflicted: status.conflicted,
      isDirty: !status.isClean(),
    };
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current || 'HEAD';
  }

  /**
   * Get list of remotes
   */
  async getRemotes(): Promise<GitRemote[]> {
    const remotes = await this.git.getRemotes(true);
    return remotes.map(r => ({
      name: r.name,
      fetchUrl: r.refs.fetch || '',
      pushUrl: r.refs.push || '',
    }));
  }

  // ===========================================
  // Commits & Log
  // ===========================================

  /**
   * Get commit history
   */
  async getLog(options: {
    maxCount?: number;
    from?: string;
    to?: string;
    file?: string;
    author?: string;
    grep?: string;
  } = {}): Promise<GitCommitInfo[]> {
    const logOptions: Record<string, string | number | undefined> = {};
    
    if (options.maxCount) logOptions['--max-count'] = options.maxCount;
    if (options.from && options.to) logOptions['--'] = `${options.from}..${options.to}`;
    if (options.file) logOptions['--'] = options.file;
    if (options.author) logOptions['--author'] = options.author;
    if (options.grep) logOptions['--grep'] = options.grep;

    const log: LogResult = await this.git.log(logOptions);

    return log.all.map(commit => ({
      hash: commit.hash,
      shortHash: commit.hash.slice(0, 7),
      message: commit.message,
      body: commit.body,
      author: {
        name: commit.author_name,
        email: commit.author_email,
      },
      date: new Date(commit.date),
      refs: commit.refs ? commit.refs.split(', ').filter(Boolean) : [],
    }));
  }

  /**
   * Get details of a specific commit
   */
  async getCommit(hash: string): Promise<GitCommitInfo | null> {
    try {
      const log = await this.git.log({ from: hash, to: hash, maxCount: 1 });
      if (log.all.length === 0) return null;

      const commit = log.all[0];
      return {
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        message: commit.message,
        body: commit.body,
        author: {
          name: commit.author_name,
          email: commit.author_email,
        },
        date: new Date(commit.date),
        refs: commit.refs ? commit.refs.split(', ').filter(Boolean) : [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Create a new commit
   */
  async commit(
    message: string,
    options: {
      all?: boolean;
      amend?: boolean;
      author?: string;
      allowEmpty?: boolean;
    } = {}
  ): Promise<CommitResult> {
    const commitOptions: string[] = [];
    
    if (options.all) commitOptions.push('-a');
    if (options.amend) commitOptions.push('--amend');
    if (options.author) commitOptions.push('--author', options.author);
    if (options.allowEmpty) commitOptions.push('--allow-empty');

    return this.git.commit(message, commitOptions);
  }

  // ===========================================
  // Staging
  // ===========================================

  /**
   * Stage files
   */
  async add(paths: string | string[]): Promise<void> {
    const files = Array.isArray(paths) ? paths : [paths];
    await this.git.add(files);
  }

  /**
   * Stage all changes
   */
  async addAll(): Promise<void> {
    await this.git.add('-A');
  }

  /**
   * Unstage files
   */
  async unstage(paths: string | string[]): Promise<void> {
    const files = Array.isArray(paths) ? paths : [paths];
    await this.git.reset(['HEAD', '--', ...files]);
  }

  /**
   * Unstage all files
   */
  async unstageAll(): Promise<void> {
    await this.git.reset(['HEAD']);
  }

  /**
   * Discard changes in working directory
   */
  async checkout(paths: string | string[]): Promise<void> {
    const files = Array.isArray(paths) ? paths : [paths];
    await this.git.checkout(['--', ...files]);
  }

  // ===========================================
  // Diff
  // ===========================================

  /**
   * Get diff between commits or working tree
   */
  async getDiff(options: {
    staged?: boolean;
    commit1?: string;
    commit2?: string;
    file?: string;
    nameOnly?: boolean;
  } = {}): Promise<GitDiff> {
    const args: string[] = [];
    
    if (options.staged) {
      args.push('--cached');
    }
    
    if (options.commit1) {
      args.push(options.commit1);
      if (options.commit2) {
        args.push(options.commit2);
      }
    }

    if (options.file) {
      args.push('--', options.file);
    }

    const diffSummary = await this.git.diffSummary(args);
    const rawDiff = await this.git.diff(args);

    const files: DiffFile[] = diffSummary.files.map(f => ({
      path: f.file,
      additions: 'insertions' in f ? f.insertions : 0,
      deletions: 'deletions' in f ? f.deletions : 0,
      binary: f.binary,
      hunks: [], // Will be parsed from raw diff if needed
    }));

    // Parse hunks from raw diff
    if (rawDiff) {
      this.parseDiffHunks(rawDiff, files);
    }

    return {
      files,
      insertions: diffSummary.insertions,
      deletions: diffSummary.deletions,
      summary: `${files.length} file(s) changed, ${diffSummary.insertions} insertions(+), ${diffSummary.deletions} deletions(-)`,
    };
  }

  /**
   * Get diff for a specific file
   */
  async getFileDiff(
    path: string,
    options: { staged?: boolean; commit?: string } = {}
  ): Promise<string> {
    const args: string[] = [];
    
    if (options.staged) args.push('--cached');
    if (options.commit) args.push(options.commit);
    args.push('--', path);

    return this.git.diff(args);
  }

  // ===========================================
  // Branches
  // ===========================================

  /**
   * Get list of branches
   */
  async getBranches(): Promise<GitBranch[]> {
    const branches: BranchSummary = await this.git.branch(['-a', '-v']);
    
    return Object.entries(branches.branches).map(([name, data]) => ({
      name,
      current: data.current,
      commit: data.commit,
      label: data.label,
      tracking: data.linkedWorkTree ? String(data.linkedWorkTree) : undefined,
    }));
  }

  /**
   * Create a new branch
   */
  async createBranch(
    name: string,
    options: { startPoint?: string; checkout?: boolean } = {}
  ): Promise<void> {
    if (options.checkout) {
      await this.git.checkoutLocalBranch(name);
    } else {
      const args = [name];
      if (options.startPoint) args.push(options.startPoint);
      await this.git.branch(args);
    }
  }

  /**
   * Switch to a branch
   */
  async switchBranch(name: string, options: { create?: boolean } = {}): Promise<void> {
    if (options.create) {
      await this.git.checkoutLocalBranch(name);
    } else {
      await this.git.checkout(name);
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(name: string, options: { force?: boolean } = {}): Promise<void> {
    const flag = options.force ? '-D' : '-d';
    await this.git.branch([flag, name]);
  }

  /**
   * Rename a branch
   */
  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.git.branch(['-m', oldName, newName]);
  }

  /**
   * Merge a branch into current branch
   */
  async merge(
    branch: string,
    options: { noFf?: boolean; squash?: boolean; message?: string } = {}
  ): Promise<void> {
    const args: string[] = [branch];
    
    if (options.noFf) args.unshift('--no-ff');
    if (options.squash) args.unshift('--squash');
    if (options.message) args.unshift('-m', options.message);

    await this.git.merge(args);
  }

  // ===========================================
  // Remote Operations
  // ===========================================

  /**
   * Fetch from remote
   */
  async fetch(options: {
    remote?: string;
    branch?: string;
    all?: boolean;
    prune?: boolean;
  } = {}): Promise<FetchResult> {
    const args: string[] = [];
    
    if (options.all) args.push('--all');
    if (options.prune) args.push('--prune');
    if (options.remote) args.push(options.remote);
    if (options.branch) args.push(options.branch);

    return this.git.fetch(args);
  }

  /**
   * Pull from remote
   */
  async pull(options: {
    remote?: string;
    branch?: string;
    rebase?: boolean;
  } = {}): Promise<PullResult> {
    const args: string[] = [];
    
    if (options.rebase) args.push('--rebase');
    if (options.remote) args.push(options.remote);
    if (options.branch) args.push(options.branch);

    return this.git.pull(args);
  }

  /**
   * Push to remote
   */
  async push(options: {
    remote?: string;
    branch?: string;
    force?: boolean;
    setUpstream?: boolean;
    tags?: boolean;
  } = {}): Promise<PushResult> {
    const args: string[] = [];
    
    if (options.force) args.push('--force');
    if (options.setUpstream) args.push('-u');
    if (options.tags) args.push('--tags');
    if (options.remote) args.push(options.remote);
    if (options.branch) args.push(options.branch);

    return this.git.push(args);
  }

  // ===========================================
  // Stash
  // ===========================================

  /**
   * Stash changes
   */
  async stash(options: {
    message?: string;
    includeUntracked?: boolean;
    keepIndex?: boolean;
  } = {}): Promise<void> {
    const args: string[] = ['push'];
    
    if (options.message) args.push('-m', options.message);
    if (options.includeUntracked) args.push('-u');
    if (options.keepIndex) args.push('--keep-index');

    await this.git.stash(args);
  }

  /**
   * List stashes
   */
  async listStashes(): Promise<GitStash[]> {
    const result = await this.git.stashList();
    
    return result.all.map((stash, index) => ({
      index,
      message: stash.message,
      date: new Date(stash.date),
    }));
  }

  /**
   * Apply stash
   */
  async applyStash(index?: number): Promise<void> {
    const args: string[] = ['apply'];
    if (index !== undefined) args.push(`stash@{${index}}`);
    await this.git.stash(args);
  }

  /**
   * Pop stash
   */
  async popStash(index?: number): Promise<void> {
    const args: string[] = ['pop'];
    if (index !== undefined) args.push(`stash@{${index}}`);
    await this.git.stash(args);
  }

  /**
   * Drop stash
   */
  async dropStash(index?: number): Promise<void> {
    const args: string[] = ['drop'];
    if (index !== undefined) args.push(`stash@{${index}}`);
    await this.git.stash(args);
  }

  // ===========================================
  // Reset & Revert
  // ===========================================

  /**
   * Reset to a commit
   */
  async reset(
    commit: string,
    mode: 'soft' | 'mixed' | 'hard' = 'mixed'
  ): Promise<void> {
    await this.git.reset([`--${mode}`, commit]);
  }

  /**
   * Revert a commit
   */
  async revert(commit: string, options: { noCommit?: boolean } = {}): Promise<void> {
    if (options.noCommit) {
      await this.git.raw(['revert', '--no-commit', commit]);
    } else {
      await this.git.revert(commit);
    }
  }

  // ===========================================
  // Tags
  // ===========================================

  /**
   * List tags
   */
  async getTags(): Promise<string[]> {
    const result = await this.git.tags();
    return result.all;
  }

  /**
   * Create a tag
   */
  async createTag(
    name: string,
    options: { message?: string; commit?: string } = {}
  ): Promise<void> {
    const args: string[] = [name];
    
    if (options.message) {
      args.unshift('-a', '-m', options.message);
    }
    if (options.commit) {
      args.push(options.commit);
    }

    await this.git.tag(args);
  }

  /**
   * Delete a tag
   */
  async deleteTag(name: string): Promise<void> {
    await this.git.tag(['-d', name]);
  }

  // ===========================================
  // Utilities
  // ===========================================

  /**
   * Check if a file is ignored
   */
  async isIgnored(path: string): Promise<boolean> {
    try {
      const result = await this.git.raw(['check-ignore', '-q', path]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get blame for a file
   */
  async blame(path: string): Promise<string> {
    return this.git.raw(['blame', path]);
  }

  /**
   * Show a specific commit/file
   */
  async show(ref: string): Promise<string> {
    return this.git.show([ref]);
  }

  /**
   * Raw git command
   */
  async raw(args: string[]): Promise<string> {
    return this.git.raw(args);
  }

  // ===========================================
  // Private Helpers
  // ===========================================

  private mapStatusCode(code: string): FileChange['status'] {
    switch (code) {
      case 'A': return 'added';
      case 'M': return 'modified';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      default: return 'modified';
    }
  }

  private parseDiffHunks(rawDiff: string, files: DiffFile[]): void {
    const fileRegex = /^diff --git a\/(.*) b\/(.*)$/gm;
    const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/gm;
    
    let currentFileIndex = -1;
    const lines = rawDiff.split('\n');
    let currentHunk: DiffHunk | null = null;
    let oldLineNo = 0;
    let newLineNo = 0;

    for (const line of lines) {
      // Check for new file
      if (line.startsWith('diff --git')) {
        currentFileIndex++;
        continue;
      }

      // Check for hunk header
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (hunkMatch) {
        oldLineNo = parseInt(hunkMatch[1]);
        newLineNo = parseInt(hunkMatch[3]);
        
        currentHunk = {
          oldStart: oldLineNo,
          oldLines: parseInt(hunkMatch[2] || '1'),
          newStart: newLineNo,
          newLines: parseInt(hunkMatch[4] || '1'),
          header: hunkMatch[5].trim(),
          lines: [],
        };
        
        if (currentFileIndex >= 0 && currentFileIndex < files.length) {
          files[currentFileIndex].hunks.push(currentHunk);
        }
        continue;
      }

      // Process diff lines
      if (currentHunk && currentFileIndex >= 0) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.lines.push({
            type: 'add',
            content: line.slice(1),
            newLineNo: newLineNo++,
          });
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push({
            type: 'delete',
            content: line.slice(1),
            oldLineNo: oldLineNo++,
          });
        } else if (line.startsWith(' ')) {
          currentHunk.lines.push({
            type: 'context',
            content: line.slice(1),
            oldLineNo: oldLineNo++,
            newLineNo: newLineNo++,
          });
        }
      }
    }
  }
}

// ===========================================
// Factory Function
// ===========================================

export function createGitRepository(workingDirectory: string): GitRepository {
  return new GitRepository(workingDirectory);
}

// ===========================================
// Singleton for current working directory
// ===========================================

let _gitRepo: GitRepository | null = null;

export function getGitRepository(workingDirectory?: string): GitRepository {
  const dir = workingDirectory || process.cwd();
  if (!_gitRepo || _gitRepo['workingDirectory'] !== dir) {
    _gitRepo = new GitRepository(dir);
  }
  return _gitRepo;
}
