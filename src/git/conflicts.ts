/**
 * Git Conflict Resolution Tools
 * Helps the AI understand and resolve merge conflicts
 */

import { z } from 'zod';
import { GitRepository, createGitRepository, GitDiff } from './repository.js';
import type { Tool, ToolResult, ToolCategory } from '../types/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// ===========================================
// Types
// ===========================================

export interface ConflictInfo {
  file: string;
  conflicts: ConflictRegion[];
  totalConflicts: number;
}

export interface ConflictRegion {
  startLine: number;
  endLine: number;
  ours: string;
  theirs: string;
  base?: string;
  resolved?: string;
}

export interface ConflictResolution {
  file: string;
  regions: {
    index: number;
    resolution: 'ours' | 'theirs' | 'both' | 'custom';
    customContent?: string;
  }[];
}

// ===========================================
// Conflict Parser
// ===========================================

const CONFLICT_START = /^<<<<<<<\s*(.*)$/;
const CONFLICT_BASE = /^\|\|\|\|\|\|\|\s*(.*)$/;
const CONFLICT_MID = /^=======$/;
const CONFLICT_END = /^>>>>>>>\s*(.*)$/;

export class ConflictParser {
  /**
   * Parse a file with conflict markers
   */
  static parseConflicts(content: string): ConflictRegion[] {
    const lines = content.split('\n');
    const conflicts: ConflictRegion[] = [];
    
    let inConflict = false;
    let inBase = false;
    let inOurs = true;
    let currentConflict: Partial<ConflictRegion> = {};
    let oursLines: string[] = [];
    let theirsLines: string[] = [];
    let baseLines: string[] = [];
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (CONFLICT_START.test(line)) {
        inConflict = true;
        inOurs = true;
        inBase = false;
        startLine = i + 1;
        oursLines = [];
        theirsLines = [];
        baseLines = [];
        continue;
      }

      if (inConflict) {
        if (CONFLICT_BASE.test(line)) {
          inBase = true;
          inOurs = false;
          continue;
        }

        if (CONFLICT_MID.test(line)) {
          inOurs = false;
          inBase = false;
          continue;
        }

        if (CONFLICT_END.test(line)) {
          conflicts.push({
            startLine,
            endLine: i + 1,
            ours: oursLines.join('\n'),
            theirs: theirsLines.join('\n'),
            base: baseLines.length > 0 ? baseLines.join('\n') : undefined,
          });
          inConflict = false;
          continue;
        }

        if (inOurs && !inBase) {
          oursLines.push(line);
        } else if (inBase) {
          baseLines.push(line);
        } else {
          theirsLines.push(line);
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if content has conflict markers
   */
  static hasConflicts(content: string): boolean {
    // Use multiline patterns that work on whole content
    return /^<<<<<<<\s/m.test(content) && /^>>>>>>>\s/m.test(content);
  }

  /**
   * Generate resolved content
   */
  static resolveConflicts(
    content: string,
    resolutions: { index: number; resolution: 'ours' | 'theirs' | 'both' | 'custom'; customContent?: string }[]
  ): string {
    const lines = content.split('\n');
    const result: string[] = [];
    const conflicts = this.parseConflicts(content);
    
    let currentLine = 0;
    let conflictIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if we're at a conflict start
      if (CONFLICT_START.test(line) && conflictIndex < conflicts.length) {
        const conflict = conflicts[conflictIndex];
        const resolution = resolutions.find(r => r.index === conflictIndex);
        
        // Skip conflict marker lines
        let j = i;
        while (j < lines.length && !CONFLICT_END.test(lines[j])) {
          j++;
        }

        // Add resolution
        if (resolution) {
          switch (resolution.resolution) {
            case 'ours':
              result.push(conflict.ours);
              break;
            case 'theirs':
              result.push(conflict.theirs);
              break;
            case 'both':
              result.push(conflict.ours);
              result.push(conflict.theirs);
              break;
            case 'custom':
              if (resolution.customContent !== undefined) {
                result.push(resolution.customContent);
              }
              break;
          }
        } else {
          // Default to ours if no resolution specified
          result.push(conflict.ours);
        }

        // Skip to after conflict end marker
        i = j;
        conflictIndex++;
        continue;
      }

      result.push(line);
    }

    return result.join('\n');
  }
}

// ===========================================
// Conflict Manager
// ===========================================

export class ConflictManager {
  private repo: GitRepository;
  private workingDirectory: string;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
    this.repo = createGitRepository(workingDirectory);
  }

  /**
   * Get all files with conflicts
   */
  async getConflictedFiles(): Promise<string[]> {
    const status = await this.repo.getStatus();
    return status.conflicted;
  }

  /**
   * Get detailed conflict info for a file
   */
  async getConflictInfo(filePath: string): Promise<ConflictInfo> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.workingDirectory, filePath);

    const content = await fs.readFile(fullPath, 'utf-8');
    const conflicts = ConflictParser.parseConflicts(content);

    return {
      file: filePath,
      conflicts,
      totalConflicts: conflicts.length,
    };
  }

  /**
   * Resolve conflicts in a file
   */
  async resolveFile(
    filePath: string,
    resolutions: ConflictResolution['regions']
  ): Promise<void> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.workingDirectory, filePath);

    const content = await fs.readFile(fullPath, 'utf-8');
    const resolved = ConflictParser.resolveConflicts(content, resolutions);

    await fs.writeFile(fullPath, resolved, 'utf-8');
  }

  /**
   * Mark a file as resolved
   */
  async markResolved(filePath: string): Promise<void> {
    await this.repo.add([filePath]);
  }

  /**
   * Abort the current merge
   */
  async abortMerge(): Promise<void> {
    const git = (this.repo as any).git;
    await git.merge(['--abort']);
  }

  /**
   * Continue the merge after resolving conflicts
   */
  async continueMerge(): Promise<void> {
    const git = (this.repo as any).git;
    await git.merge(['--continue']);
  }

  /**
   * Get merge status
   */
  async getMergeStatus(): Promise<{
    inMerge: boolean;
    conflictedFiles: string[];
    resolvedFiles: string[];
  }> {
    const status = await this.repo.getStatus();
    
    // Check if we're in a merge state
    const gitDir = path.join(this.workingDirectory, '.git');
    let inMerge = false;
    
    try {
      await fs.access(path.join(gitDir, 'MERGE_HEAD'));
      inMerge = true;
    } catch {
      inMerge = false;
    }

    return {
      inMerge,
      conflictedFiles: status.conflicted,
      resolvedFiles: status.staged.map(f => f.path),
    };
  }
}

// ===========================================
// Conflict Tools for LLM
// ===========================================

export class ConflictTools {
  private manager: ConflictManager;

  constructor(workingDirectory: string) {
    this.manager = new ConflictManager(workingDirectory);
  }

  getTools(): Tool[] {
    return [
      this.createListConflictsTool(),
      this.createShowConflictTool(),
      this.createResolveConflictTool(),
      this.createMergeStatusTool(),
      this.createAbortMergeTool(),
    ];
  }

  private createListConflictsTool(): Tool {
    return {
      name: 'git_list_conflicts',
      description: 'List all files with merge conflicts',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (): Promise<ToolResult> => {
        try {
          const files = await this.manager.getConflictedFiles();

          if (files.length === 0) {
            return { success: true, data: 'No conflicts found' };
          }

          let result = `Conflicted files (${files.length}):\n`;
          for (const file of files) {
            const info = await this.manager.getConflictInfo(file);
            result += `  ${file} (${info.totalConflicts} conflict(s))\n`;
          }

          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createShowConflictTool(): Tool {
    return {
      name: 'git_show_conflict',
      description: 'Show detailed conflict information for a specific file',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path with conflicts',
          },
        },
        required: ['file'],
      },
      execute: async (params: { file: string }): Promise<ToolResult> => {
        try {
          const info = await this.manager.getConflictInfo(params.file);

          if (info.totalConflicts === 0) {
            return { success: true, data: 'No conflicts in this file' };
          }

          let result = `File: ${info.file}\n`;
          result += `Total conflicts: ${info.totalConflicts}\n\n`;

          for (let i = 0; i < info.conflicts.length; i++) {
            const conflict = info.conflicts[i];
            result += `=== Conflict ${i + 1} (lines ${conflict.startLine}-${conflict.endLine}) ===\n`;
            result += `--- OURS (current branch) ---\n`;
            result += conflict.ours + '\n';
            if (conflict.base) {
              result += `--- BASE (common ancestor) ---\n`;
              result += conflict.base + '\n';
            }
            result += `--- THEIRS (incoming changes) ---\n`;
            result += conflict.theirs + '\n';
            result += '\n';
          }

          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createResolveConflictTool(): Tool {
    return {
      name: 'git_resolve_conflict',
      description: 'Resolve a merge conflict in a file',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path with conflicts',
          },
          resolutions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: {
                  type: 'number',
                  description: 'Conflict index (0-based)',
                },
                resolution: {
                  type: 'string',
                  enum: ['ours', 'theirs', 'both', 'custom'],
                  description: 'How to resolve: ours (keep current), theirs (accept incoming), both (keep both), custom (provide content)',
                },
                customContent: {
                  type: 'string',
                  description: 'Custom content for resolution (when resolution is "custom")',
                },
              },
              required: ['index', 'resolution'],
            },
            description: 'Array of conflict resolutions',
          },
          markResolved: {
            type: 'boolean',
            description: 'Stage the file after resolving',
          },
        },
        required: ['file', 'resolutions'],
      },
      execute: async (params: {
        file: string;
        resolutions: ConflictResolution['regions'];
        markResolved?: boolean;
      }): Promise<ToolResult> => {
        try {
          await this.manager.resolveFile(params.file, params.resolutions);

          if (params.markResolved) {
            await this.manager.markResolved(params.file);
          }

          return {
            success: true,
            data: `Resolved ${params.resolutions.length} conflict(s) in ${params.file}${
              params.markResolved ? ' (staged)' : ''
            }`,
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createMergeStatusTool(): Tool {
    return {
      name: 'git_merge_status',
      description: 'Get the current merge status',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (): Promise<ToolResult> => {
        try {
          const status = await this.manager.getMergeStatus();

          let result = `Merge in progress: ${status.inMerge ? 'Yes' : 'No'}\n`;

          if (status.inMerge) {
            result += `\nConflicted files (${status.conflictedFiles.length}):\n`;
            for (const file of status.conflictedFiles) {
              result += `  ❌ ${file}\n`;
            }

            if (status.resolvedFiles.length > 0) {
              result += `\nResolved files (${status.resolvedFiles.length}):\n`;
              for (const file of status.resolvedFiles) {
                result += `  ✓ ${file}\n`;
              }
            }

            if (status.conflictedFiles.length === 0) {
              result += '\nAll conflicts resolved. Run git merge --continue or commit.';
            }
          }

          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createAbortMergeTool(): Tool {
    return {
      name: 'git_abort_merge',
      description: 'Abort the current merge operation',
      category: 'git' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (): Promise<ToolResult> => {
        try {
          await this.manager.abortMerge();
          return { success: true, data: 'Merge aborted' };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }
}

// ===========================================
// Factory Functions
// ===========================================

export function createConflictManager(workingDirectory: string): ConflictManager {
  return new ConflictManager(workingDirectory);
}

export function createConflictTools(workingDirectory: string): ConflictTools {
  return new ConflictTools(workingDirectory);
}

export function registerConflictTools(workingDirectory: string): Tool[] {
  const conflictTools = createConflictTools(workingDirectory);
  return conflictTools.getTools();
}
