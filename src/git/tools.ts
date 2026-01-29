/**
 * Git Tools for LLM Function Calling
 * Exposes Git operations as tools that can be called by the AI
 */

import { z } from 'zod';
import { GitRepository, createGitRepository, GitStatus, GitCommitInfo, GitDiff, GitBranch } from './repository.js';
import { AutoCommitManager, createAutoCommitManager, CommitSuggestion } from './auto-commit.js';
import type { Tool, ToolResult, ToolCategory } from '../types/index.js';

// ===========================================
// Schemas
// ===========================================

const GitStatusSchema = z.object({
  detailed: z.boolean().optional().describe('Include detailed file changes'),
});

const GitDiffSchema = z.object({
  file: z.string().optional().describe('Specific file to diff'),
  staged: z.boolean().optional().describe('Show staged changes only'),
  commit1: z.string().optional().describe('First commit to compare'),
  commit2: z.string().optional().describe('Second commit to compare'),
});

const GitLogSchema = z.object({
  maxCount: z.number().optional().describe('Maximum number of commits to show'),
  file: z.string().optional().describe('Show commits for specific file'),
  author: z.string().optional().describe('Filter by author'),
  since: z.string().optional().describe('Show commits since date'),
  until: z.string().optional().describe('Show commits until date'),
  grep: z.string().optional().describe('Search commit messages'),
});

const GitCommitSchema = z.object({
  message: z.string().describe('Commit message'),
  files: z.array(z.string()).optional().describe('Files to commit (stages and commits)'),
  all: z.boolean().optional().describe('Commit all tracked changes'),
  amend: z.boolean().optional().describe('Amend the previous commit'),
});

const GitAddSchema = z.object({
  files: z.array(z.string()).describe('Files to stage'),
  all: z.boolean().optional().describe('Stage all changes'),
});

const GitBranchSchema = z.object({
  name: z.string().optional().describe('Branch name for create/delete operations'),
  delete: z.boolean().optional().describe('Delete the branch'),
  force: z.boolean().optional().describe('Force delete'),
  all: z.boolean().optional().describe('List all branches including remote'),
});

const GitCheckoutSchema = z.object({
  target: z.string().describe('Branch name or commit to checkout'),
  createBranch: z.boolean().optional().describe('Create new branch'),
  files: z.array(z.string()).optional().describe('Checkout specific files'),
});

const GitMergeSchema = z.object({
  branch: z.string().describe('Branch to merge'),
  noFastForward: z.boolean().optional().describe('Create merge commit even if fast-forward is possible'),
  squash: z.boolean().optional().describe('Squash commits'),
});

const GitPullSchema = z.object({
  remote: z.string().optional().describe('Remote name'),
  branch: z.string().optional().describe('Branch name'),
  rebase: z.boolean().optional().describe('Rebase instead of merge'),
});

const GitPushSchema = z.object({
  remote: z.string().optional().describe('Remote name'),
  branch: z.string().optional().describe('Branch name'),
  force: z.boolean().optional().describe('Force push'),
  setUpstream: z.boolean().optional().describe('Set upstream'),
});

const GitStashSchema = z.object({
  action: z.enum(['save', 'pop', 'apply', 'list', 'drop']).describe('Stash action'),
  message: z.string().optional().describe('Stash message'),
  index: z.number().optional().describe('Stash index for pop/apply/drop'),
});

const GitResetSchema = z.object({
  target: z.string().optional().describe('Commit or HEAD~n'),
  mode: z.enum(['soft', 'mixed', 'hard']).optional().describe('Reset mode'),
  files: z.array(z.string()).optional().describe('Files to unstage'),
});

const GitShowSchema = z.object({
  commit: z.string().describe('Commit hash to show'),
  stat: z.boolean().optional().describe('Show stats only'),
});

const AutoCommitSchema = z.object({
  description: z.string().optional().describe('Description of the changes'),
  files: z.array(z.string()).optional().describe('Files to commit'),
  all: z.boolean().optional().describe('Commit all changes'),
});

// ===========================================
// Git Tool Implementations
// ===========================================

export class GitTools {
  private repo: GitRepository;
  private autoCommit: AutoCommitManager;

  constructor(workingDirectory: string) {
    this.repo = createGitRepository(workingDirectory);
    this.autoCommit = createAutoCommitManager(workingDirectory);
  }

  // ===========================================
  // Tool Definitions
  // ===========================================

  getTools(): Tool[] {
    return [
      this.createGitStatusTool(),
      this.createGitDiffTool(),
      this.createGitLogTool(),
      this.createGitCommitTool(),
      this.createGitAddTool(),
      this.createGitBranchTool(),
      this.createGitCheckoutTool(),
      this.createGitMergeTool(),
      this.createGitPullTool(),
      this.createGitPushTool(),
      this.createGitStashTool(),
      this.createGitResetTool(),
      this.createGitShowTool(),
      this.createAutoCommitTool(),
      this.createSuggestCommitTool(),
    ];
  }

  // ===========================================
  // Individual Tool Creators
  // ===========================================

  private createGitStatusTool(): Tool {
    return {
      name: 'git_status',
      description: 'Get the current git repository status including staged, unstaged, and untracked files',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          detailed: {
            type: 'boolean',
            description: 'Include detailed file changes',
          },
        },
        required: [],
      },
      execute: async (params: z.infer<typeof GitStatusSchema>): Promise<ToolResult> => {
        try {
          const status = await this.repo.getStatus();
          const branch = await this.repo.getCurrentBranch();

          let result = `Branch: ${branch}\n`;
          result += `Status: ${status.isDirty ? 'Dirty' : 'Clean'}\n\n`;

          if (status.staged.length > 0) {
            result += `Staged (${status.staged.length}):\n`;
            for (const file of status.staged) {
              result += `  ${file.status} ${file.path}\n`;
            }
            result += '\n';
          }

          if (status.unstaged.length > 0) {
            result += `Unstaged (${status.unstaged.length}):\n`;
            for (const file of status.unstaged) {
              result += `  ${file.status} ${file.path}\n`;
            }
            result += '\n';
          }

          if (status.untracked.length > 0) {
            result += `Untracked (${status.untracked.length}):\n`;
            for (const file of status.untracked) {
              result += `  ${file}\n`;
            }
          }

          if (!status.isDirty) {
            result += 'Working tree clean';
          }

          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGitDiffTool(): Tool {
    return {
      name: 'git_diff',
      description: 'Show git diff for changes. Can show staged, unstaged, or between commits',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Specific file to diff' },
          staged: { type: 'boolean', description: 'Show staged changes only' },
          commit1: { type: 'string', description: 'First commit to compare' },
          commit2: { type: 'string', description: 'Second commit to compare' },
        },
        required: [],
      },
      execute: async (params: z.infer<typeof GitDiffSchema>): Promise<ToolResult> => {
        try {
          if (params.file) {
            // getFileDiff returns string for single file
            const fileDiff = await this.repo.getFileDiff(params.file, { staged: params.staged });
            if (!fileDiff) {
              return { success: true, data: 'No changes' };
            }
            return { success: true, data: fileDiff };
          }
          
          const diff: GitDiff = await this.repo.getDiff({
            staged: params.staged,
            commit1: params.commit1,
            commit2: params.commit2,
          });

          if (diff.files.length === 0) {
            return { success: true, data: 'No changes' };
          }

          let result = `Files changed: ${diff.files.length}\n`;
          result += `+${diff.insertions} -${diff.deletions}\n\n`;

          for (const file of diff.files) {
            result += `--- ${file.oldPath || file.path}\n`;
            result += `+++ ${file.path}\n`;
            result += `+${file.additions} -${file.deletions}\n`;

            for (const hunk of file.hunks) {
              result += `\n@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
              for (const line of hunk.lines) {
                const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
                result += `${prefix}${line.content}\n`;
              }
            }
            result += '\n';
          }

          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGitLogTool(): Tool {
    return {
      name: 'git_log',
      description: 'Show git commit history with options for filtering',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          maxCount: { type: 'number', description: 'Maximum commits to show' },
          file: { type: 'string', description: 'Show commits for file' },
          author: { type: 'string', description: 'Filter by author' },
          since: { type: 'string', description: 'Since date' },
          until: { type: 'string', description: 'Until date' },
          grep: { type: 'string', description: 'Search messages' },
        },
        required: [],
      },
      execute: async (params: z.infer<typeof GitLogSchema>): Promise<ToolResult> => {
        try {
          const commits = await this.repo.getLog({
            maxCount: params.maxCount || 10,
            file: params.file,
          });

          if (commits.length === 0) {
            return { success: true, data: 'No commits found' };
          }

          let result = '';
          for (const commit of commits) {
            result += `${commit.hash.slice(0, 7)} ${commit.message}\n`;
            result += `  Author: ${commit.author.name} <${commit.author.email}>\n`;
            result += `  Date: ${commit.date.toISOString()}\n\n`;
          }

          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGitCommitTool(): Tool {
    return {
      name: 'git_commit',
      description: 'Create a git commit with the specified message',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Files to stage and commit',
          },
          all: { type: 'boolean', description: 'Commit all tracked changes' },
          amend: { type: 'boolean', description: 'Amend previous commit' },
        },
        required: ['message'],
      },
      execute: async (params: z.infer<typeof GitCommitSchema>): Promise<ToolResult> => {
        try {
          // Stage files if specified
          if (params.files && params.files.length > 0) {
            await this.repo.add(params.files);
          } else if (params.all) {
            await this.repo.addAll();
          }

          // Commit
          const result = await this.repo.commit(params.message);

          return {
            success: true,
            data: `Committed ${result.commit}\n${result.summary.changes} file(s) changed, ${result.summary.insertions} insertions(+), ${result.summary.deletions} deletions(-)`,
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGitAddTool(): Tool {
    return {
      name: 'git_add',
      description: 'Stage files for commit',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Files to stage',
          },
          all: { type: 'boolean', description: 'Stage all changes' },
        },
        required: [],
      },
      execute: async (params: z.infer<typeof GitAddSchema>): Promise<ToolResult> => {
        try {
          if (params.all) {
            await this.repo.addAll();
            return { success: true, data: 'All changes staged' };
          }

          if (params.files && params.files.length > 0) {
            await this.repo.add(params.files);
            return { success: true, data: `Staged ${params.files.length} file(s)` };
          }

          return { success: false, error: 'No files specified' };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGitBranchTool(): Tool {
    return {
      name: 'git_branch',
      description: 'List, create, or delete branches',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Branch name' },
          delete: { type: 'boolean', description: 'Delete branch' },
          force: { type: 'boolean', description: 'Force delete' },
          all: { type: 'boolean', description: 'List all branches' },
        },
        required: [],
      },
      execute: async (params: z.infer<typeof GitBranchSchema>): Promise<ToolResult> => {
        try {
          if (params.delete && params.name) {
            await this.repo.deleteBranch(params.name, { force: params.force });
            return { success: true, data: `Deleted branch ${params.name}` };
          }

          if (params.name) {
            await this.repo.createBranch(params.name);
            return { success: true, data: `Created branch ${params.name}` };
          }

          // List branches
          const branches = await this.repo.getBranches();
          const current = await this.repo.getCurrentBranch();

          let result = 'Branches:\n';
          for (const branch of branches) {
            const marker = branch.name === current ? '* ' : '  ';
            result += `${marker}${branch.name}`;
            if (branch.tracking) {
              result += ` -> ${branch.tracking}`;
            }
            result += '\n';
          }

          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGitCheckoutTool(): Tool {
    return {
      name: 'git_checkout',
      description: 'Switch branches or restore working tree files',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Branch or commit' },
          createBranch: { type: 'boolean', description: 'Create new branch' },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Files to checkout',
          },
        },
        required: ['target'],
      },
      execute: async (params: z.infer<typeof GitCheckoutSchema>): Promise<ToolResult> => {
        try {
          if (params.files && params.files.length > 0) {
            await this.repo.checkout(params.files);
            return { success: true, data: `Restored ${params.files.length} file(s)` };
          }

          if (params.createBranch) {
            await this.repo.createBranch(params.target);
          }

          await this.repo.switchBranch(params.target);
          return { success: true, data: `Switched to ${params.target}` };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGitMergeTool(): Tool {
    return {
      name: 'git_merge',
      description: 'Merge a branch into the current branch',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Branch to merge' },
          noFastForward: { type: 'boolean', description: 'No fast-forward' },
          squash: { type: 'boolean', description: 'Squash commits' },
        },
        required: ['branch'],
      },
      execute: async (params: z.infer<typeof GitMergeSchema>): Promise<ToolResult> => {
        try {
          await this.repo.merge(params.branch, {
            noFf: params.noFastForward,
            squash: params.squash,
          });

          return { success: true, data: `Merged ${params.branch}` };
        } catch (error) {
          const errorStr = String(error);
          if (errorStr.includes('conflict') || errorStr.includes('CONFLICT')) {
            return {
              success: false,
              data: 'Merge has conflicts that need to be resolved',
              error: errorStr,
            };
          }
          return { success: false, error: errorStr };
        }
      },
    };
  }

  private createGitPullTool(): Tool {
    return {
      name: 'git_pull',
      description: 'Fetch and integrate changes from remote',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          remote: { type: 'string', description: 'Remote name' },
          branch: { type: 'string', description: 'Branch name' },
          rebase: { type: 'boolean', description: 'Rebase instead of merge' },
        },
        required: [],
      },
      execute: async (params: z.infer<typeof GitPullSchema>): Promise<ToolResult> => {
        try {
          const result = await this.repo.pull({
            remote: params.remote,
            branch: params.branch,
            rebase: params.rebase,
          });

          return {
            success: true,
            data: `Pull successful`,
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGitPushTool(): Tool {
    return {
      name: 'git_push',
      description: 'Push local commits to remote repository',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          remote: { type: 'string', description: 'Remote name' },
          branch: { type: 'string', description: 'Branch name' },
          force: { type: 'boolean', description: 'Force push' },
          setUpstream: { type: 'boolean', description: 'Set upstream' },
        },
        required: [],
      },
      execute: async (params: z.infer<typeof GitPushSchema>): Promise<ToolResult> => {
        try {
          await this.repo.push({
            remote: params.remote,
            branch: params.branch,
            force: params.force,
            setUpstream: params.setUpstream,
          });

          return { success: true, data: 'Push successful' };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGitStashTool(): Tool {
    return {
      name: 'git_stash',
      description: 'Stash changes for later use',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['save', 'pop', 'apply', 'list', 'drop'],
            description: 'Stash action',
          },
          message: { type: 'string', description: 'Stash message' },
          index: { type: 'number', description: 'Stash index' },
        },
        required: ['action'],
      },
      execute: async (params: z.infer<typeof GitStashSchema>): Promise<ToolResult> => {
        try {
          switch (params.action) {
            case 'save':
              await this.repo.stash({ message: params.message });
              return { success: true, data: 'Stashed changes' };

            case 'pop':
              await this.repo.popStash(params.index);
              return { success: true, data: 'Popped stash' };

            case 'apply':
              await this.repo.applyStash(params.index);
              return { success: true, data: 'Applied stash' };

            case 'list': {
              const stashes = await this.repo.listStashes();
              if (stashes.length === 0) {
                return { success: true, data: 'No stashes' };
              }
              let result = 'Stashes:\n';
              stashes.forEach((s, i) => {
                result += `  ${i}: ${s.message}\n`;
              });
              return { success: true, data: result };
            }

            case 'drop':
              // Note: simple-git doesn't have direct drop
              return { success: false, error: 'Stash drop not implemented' };

            default:
              return { success: false, error: 'Unknown action' };
          }
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGitResetTool(): Tool {
    return {
      name: 'git_reset',
      description: 'Reset current HEAD to a specified state or unstage files',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Commit or HEAD~n' },
          mode: {
            type: 'string',
            enum: ['soft', 'mixed', 'hard'],
            description: 'Reset mode',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Files to unstage',
          },
        },
        required: [],
      },
      execute: async (params: z.infer<typeof GitResetSchema>): Promise<ToolResult> => {
        try {
          if (params.files && params.files.length > 0) {
            await this.repo.unstage(params.files);
            return { success: true, data: `Unstaged ${params.files.length} file(s)` };
          }

          if (params.target) {
            await this.repo.reset(params.target, params.mode);
            return { success: true, data: `Reset to ${params.target}` };
          }

          return { success: false, error: 'No target specified' };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGitShowTool(): Tool {
    return {
      name: 'git_show',
      description: 'Show details about a specific commit',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          commit: { type: 'string', description: 'Commit hash' },
          stat: { type: 'boolean', description: 'Show stats only' },
        },
        required: ['commit'],
      },
      execute: async (params: z.infer<typeof GitShowSchema>): Promise<ToolResult> => {
        try {
          const commit = await this.repo.getCommit(params.commit);

          if (!commit) {
            return { success: false, error: `Commit ${params.commit} not found` };
          }

          let result = `commit ${commit.hash}\n`;
          result += `Author: ${commit.author.name} <${commit.author.email}>\n`;
          result += `Date: ${commit.date.toISOString()}\n\n`;
          result += `    ${commit.message}\n`;

          if (commit.body) {
            result += `\n    ${commit.body}\n`;
          }

          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createAutoCommitTool(): Tool {
    return {
      name: 'git_auto_commit',
      description: 'Automatically stage and commit changes with an intelligently generated commit message',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Description of the changes for message generation',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific files to commit',
          },
          all: { type: 'boolean', description: 'Commit all changes' },
        },
        required: [],
      },
      execute: async (params: z.infer<typeof AutoCommitSchema>): Promise<ToolResult> => {
        try {
          const result = await this.autoCommit.autoCommit({
            description: params.description,
            files: params.files,
            all: params.all,
          });

          if (result.success) {
            return {
              success: true,
              data: result.hash
                ? `Committed ${result.hash.slice(0, 7)}: ${result.message}`
                : result.message || 'No changes to commit',
            };
          }

          return { success: false, error: result.error };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createSuggestCommitTool(): Tool {
    return {
      name: 'git_suggest_commit',
      description: 'Generate a suggested commit message based on staged/unstaged changes',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Optional description of changes',
          },
        },
        required: [],
      },
      execute: async (params: { description?: string }): Promise<ToolResult> => {
        try {
          const suggestion = await this.autoCommit.generateCommitMessage(
            params.description
          );

          let result = `Suggested commit:\n`;
          result += `Type: ${suggestion.type}\n`;
          if (suggestion.scope) {
            result += `Scope: ${suggestion.scope}\n`;
          }
          result += `Message: ${suggestion.message}\n`;
          result += `\nFiles (${suggestion.files.length}):\n`;
          for (const file of suggestion.files.slice(0, 10)) {
            result += `  - ${file}\n`;
          }
          if (suggestion.files.length > 10) {
            result += `  ... and ${suggestion.files.length - 10} more\n`;
          }

          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }
}

// ===========================================
// Factory Function
// ===========================================

export function createGitTools(workingDirectory: string): GitTools {
  return new GitTools(workingDirectory);
}

// ===========================================
// Tool Registration Helper
// ===========================================

export function registerGitTools(workingDirectory: string): Tool[] {
  const gitTools = createGitTools(workingDirectory);
  return gitTools.getTools();
}
