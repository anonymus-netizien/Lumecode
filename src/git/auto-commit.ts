/**
 * Git Auto-Commit Manager
 * Automatically commits changes with intelligent commit messages
 * Inspired by Aider's auto-commit feature
 */

import { GitRepository, createGitRepository, GitStatus, GitDiff } from './repository.js';

// ===========================================
// Types
// ===========================================

export interface AutoCommitConfig {
  enabled: boolean;
  messageStyle: 'conventional' | 'descriptive' | 'simple';
  includeFileList: boolean;
  maxMessageLength: number;
  signOff: boolean;
  prefix?: string;
}

export interface CommitSuggestion {
  message: string;
  description?: string;
  type: 'feat' | 'fix' | 'refactor' | 'docs' | 'style' | 'test' | 'chore';
  scope?: string;
  breaking: boolean;
  files: string[];
}

// ===========================================
// Default Config
// ===========================================

const DEFAULT_CONFIG: AutoCommitConfig = {
  enabled: true,
  messageStyle: 'conventional',
  includeFileList: true,
  maxMessageLength: 72,
  signOff: false,
  prefix: undefined,
};

// ===========================================
// Commit Type Detection
// ===========================================

interface TypePattern {
  type: CommitSuggestion['type'];
  patterns: RegExp[];
  keywords: string[];
}

const TYPE_PATTERNS: TypePattern[] = [
  {
    type: 'feat',
    patterns: [/^src\/.*\.ts$/, /^src\/.*\.tsx$/],
    keywords: ['add', 'new', 'create', 'implement', 'feature'],
  },
  {
    type: 'fix',
    patterns: [],
    keywords: ['fix', 'bug', 'patch', 'correct', 'resolve', 'repair'],
  },
  {
    type: 'refactor',
    patterns: [],
    keywords: ['refactor', 'restructure', 'reorganize', 'rename', 'move'],
  },
  {
    type: 'docs',
    patterns: [/\.md$/, /^docs\//, /README/i, /CHANGELOG/i],
    keywords: ['doc', 'readme', 'comment', 'jsdoc'],
  },
  {
    type: 'style',
    patterns: [/\.css$/, /\.scss$/, /\.less$/],
    keywords: ['style', 'format', 'lint', 'prettier', 'eslint'],
  },
  {
    type: 'test',
    patterns: [/\.test\./, /\.spec\./, /^tests?\//, /__tests__/],
    keywords: ['test', 'spec', 'coverage'],
  },
  {
    type: 'chore',
    patterns: [/^package\.json$/, /^tsconfig/, /^\..*rc/, /config/],
    keywords: ['chore', 'build', 'config', 'ci', 'deps', 'dependency'],
  },
];

// ===========================================
// Auto-Commit Manager
// ===========================================

export class AutoCommitManager {
  private repo: GitRepository;
  private config: AutoCommitConfig;
  private lastCommitHash?: string;

  constructor(workingDirectory: string, config: Partial<AutoCommitConfig> = {}) {
    this.repo = createGitRepository(workingDirectory);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasChanges(): Promise<boolean> {
    const status = await this.repo.getStatus();
    return status.isDirty;
  }

  /**
   * Get changes since last auto-commit
   */
  async getChangesSinceLastCommit(): Promise<GitDiff> {
    if (this.lastCommitHash) {
      return this.repo.getDiff({ commit1: this.lastCommitHash });
    }
    return this.repo.getDiff();
  }

  /**
   * Generate a commit message based on changes
   */
  async generateCommitMessage(
    description?: string,
    changedFiles?: string[]
  ): Promise<CommitSuggestion> {
    const status = await this.repo.getStatus();
    const files = changedFiles || [
      ...status.staged.map(f => f.path),
      ...status.unstaged.map(f => f.path),
      ...status.untracked,
    ];

    // Detect commit type from files
    const type = this.detectCommitType(files);
    const scope = this.detectScope(files);
    
    // Generate message based on style
    let message: string;
    let messageDesc: string | undefined;

    switch (this.config.messageStyle) {
      case 'conventional':
        message = this.generateConventionalMessage(type, scope, files, description);
        break;
      case 'descriptive':
        message = this.generateDescriptiveMessage(files, description);
        break;
      case 'simple':
      default:
        message = this.generateSimpleMessage(files, description);
    }

    // Add file list to description if enabled
    if (this.config.includeFileList && files.length <= 10) {
      messageDesc = `Files changed:\n${files.map(f => `  - ${f}`).join('\n')}`;
    }

    // Apply prefix if configured
    if (this.config.prefix) {
      message = `${this.config.prefix} ${message}`;
    }

    // Truncate message if needed
    if (message.length > this.config.maxMessageLength) {
      message = message.slice(0, this.config.maxMessageLength - 3) + '...';
    }

    return {
      message,
      description: messageDesc,
      type,
      scope,
      breaking: false,
      files,
    };
  }

  /**
   * Stage and commit changes with auto-generated message
   */
  async autoCommit(
    options: {
      message?: string;
      files?: string[];
      all?: boolean;
      description?: string;
    } = {}
  ): Promise<{ success: boolean; hash?: string; message?: string; error?: string }> {
    try {
      const status = await this.repo.getStatus();
      
      if (!status.isDirty) {
        return { success: true, message: 'Nothing to commit' };
      }

      // Stage files
      if (options.files) {
        await this.repo.add(options.files);
      } else if (options.all) {
        await this.repo.addAll();
      } else {
        // Stage only tracked files that have changes
        const filesToStage = [
          ...status.unstaged.map(f => f.path),
        ];
        if (filesToStage.length > 0) {
          await this.repo.add(filesToStage);
        }
      }

      // Get staged status
      const stagedStatus = await this.repo.getStatus();
      if (stagedStatus.staged.length === 0 && !options.all) {
        // Also stage untracked files that match common patterns
        const relevantUntracked = status.untracked.filter(f => 
          f.endsWith('.ts') || 
          f.endsWith('.tsx') || 
          f.endsWith('.js') ||
          f.endsWith('.json') ||
          f.endsWith('.md')
        );
        if (relevantUntracked.length > 0) {
          await this.repo.add(relevantUntracked);
        }
      }

      // Generate or use provided message
      let commitMessage = options.message;
      if (!commitMessage) {
        const suggestion = await this.generateCommitMessage(
          options.description,
          stagedStatus.staged.map(f => f.path)
        );
        commitMessage = suggestion.message;
        if (suggestion.description) {
          commitMessage += '\n\n' + suggestion.description;
        }
      }

      // Commit
      const result = await this.repo.commit(commitMessage);
      this.lastCommitHash = result.commit;

      return {
        success: true,
        hash: result.commit,
        message: commitMessage,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Commit after a file edit operation
   */
  async commitAfterEdit(
    editedFiles: string[],
    editDescription: string
  ): Promise<{ success: boolean; hash?: string; message?: string; error?: string }> {
    if (!this.config.enabled) {
      return { success: true, message: 'Auto-commit disabled' };
    }

    return this.autoCommit({
      files: editedFiles,
      description: editDescription,
    });
  }

  /**
   * Undo the last auto-commit
   */
  async undoLastCommit(options: { soft?: boolean } = {}): Promise<boolean> {
    try {
      if (!this.lastCommitHash) {
        return false;
      }

      await this.repo.reset('HEAD~1', options.soft ? 'soft' : 'mixed');
      this.lastCommitHash = undefined;
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================
  // Message Generation Helpers
  // ===========================================

  private detectCommitType(files: string[]): CommitSuggestion['type'] {
    const typeCounts: Record<CommitSuggestion['type'], number> = {
      feat: 0,
      fix: 0,
      refactor: 0,
      docs: 0,
      style: 0,
      test: 0,
      chore: 0,
    };

    for (const file of files) {
      for (const typePattern of TYPE_PATTERNS) {
        for (const pattern of typePattern.patterns) {
          if (pattern.test(file)) {
            typeCounts[typePattern.type]++;
            break;
          }
        }
      }
    }

    // Find most common type
    let maxType: CommitSuggestion['type'] = 'feat';
    let maxCount = 0;

    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxType = type as CommitSuggestion['type'];
      }
    }

    return maxType;
  }

  private detectScope(files: string[]): string | undefined {
    // Extract common directory
    if (files.length === 0) return undefined;

    const dirs = files.map(f => {
      const parts = f.split('/');
      return parts.length > 1 ? parts[0] : undefined;
    }).filter(Boolean);

    if (dirs.length === 0) return undefined;

    // Find most common directory
    const dirCounts = new Map<string, number>();
    for (const dir of dirs) {
      dirCounts.set(dir!, (dirCounts.get(dir!) || 0) + 1);
    }

    let maxDir: string | undefined;
    let maxCount = 0;

    for (const [dir, count] of dirCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxDir = dir;
      }
    }

    // Only return scope if it covers most files
    if (maxCount >= files.length * 0.6) {
      return maxDir;
    }

    return undefined;
  }

  private generateConventionalMessage(
    type: CommitSuggestion['type'],
    scope: string | undefined,
    files: string[],
    description?: string
  ): string {
    const scopePart = scope ? `(${scope})` : '';
    
    if (description) {
      return `${type}${scopePart}: ${description}`;
    }

    // Generate description from files
    const action = this.getActionVerb(type);
    const subject = this.generateSubject(files);
    
    return `${type}${scopePart}: ${action} ${subject}`;
  }

  private generateDescriptiveMessage(files: string[], description?: string): string {
    if (description) return description;

    if (files.length === 1) {
      return `Update ${files[0]}`;
    }

    const type = this.detectCommitType(files);
    const action = this.getActionVerb(type);
    
    if (files.length <= 3) {
      return `${action} ${files.join(', ')}`;
    }

    const scope = this.detectScope(files);
    if (scope) {
      return `${action} ${files.length} files in ${scope}`;
    }

    return `${action} ${files.length} files`;
  }

  private generateSimpleMessage(files: string[], description?: string): string {
    if (description) return description;
    
    if (files.length === 1) {
      return `Update ${files[0]}`;
    }
    
    return `Update ${files.length} files`;
  }

  private getActionVerb(type: CommitSuggestion['type']): string {
    const verbs: Record<CommitSuggestion['type'], string> = {
      feat: 'Add',
      fix: 'Fix',
      refactor: 'Refactor',
      docs: 'Update docs for',
      style: 'Style',
      test: 'Add tests for',
      chore: 'Update',
    };
    return verbs[type];
  }

  private generateSubject(files: string[]): string {
    if (files.length === 1) {
      // Extract meaningful name from file path
      const file = files[0];
      const name = file.split('/').pop()?.replace(/\.[^.]+$/, '') || file;
      return name;
    }

    // Group by type/directory
    const scope = this.detectScope(files);
    if (scope) {
      return `${scope} module`;
    }

    return `${files.length} files`;
  }
}

// ===========================================
// Factory Function
// ===========================================

export function createAutoCommitManager(
  workingDirectory: string,
  config?: Partial<AutoCommitConfig>
): AutoCommitManager {
  return new AutoCommitManager(workingDirectory, config);
}
