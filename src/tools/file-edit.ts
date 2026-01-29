/**
 * File Edit Tool
 * Edit files with precise line-based or search-replace operations
 */

import { readFile, writeFile, copyFile, access } from 'fs/promises';
import { constants } from 'fs';
import { resolve, relative } from 'path';
import type { ToolResult, ToolParameters } from '../types/index.js';
import type { FileEditArgs, FileEdit } from './types.js';
import { BaseTool } from './registry.js';

export class FileEditTool extends BaseTool {
  name = 'file_edit';
  description = `Edit a file with precise modifications. Supports:
- replace: Replace content between line numbers
- insert: Insert content at a specific line
- delete: Delete lines from startLine to endLine
- search/replace: Find and replace text patterns`;
  category = 'file_edit' as const;
  dangerLevel = 'moderate' as const;
  requiresConfirmation = true;

  parameters: ToolParameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit (relative to working directory or absolute)',
      },
      edits: {
        type: 'array',
        description: 'Array of edit operations to apply in order',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['replace', 'insert', 'delete'],
              description: 'Type of edit operation',
            },
            startLine: {
              type: 'number',
              description: 'Starting line number (1-based)',
            },
            endLine: {
              type: 'number',
              description: 'Ending line number (1-based, inclusive) for replace/delete',
            },
            content: {
              type: 'string',
              description: 'New content for replace/insert operations',
            },
            search: {
              type: 'string',
              description: 'Text to search for (alternative to line numbers)',
            },
            replace: {
              type: 'string',
              description: 'Text to replace search matches with',
            },
          },
        },
      },
      dryRun: {
        type: 'boolean',
        description: 'Preview changes without applying them (default: false)',
        default: false,
      },
    },
    required: ['path', 'edits'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const { path, edits, dryRun = false } = args as unknown as FileEditArgs;

    try {
      // Resolve path relative to working directory
      const fullPath = resolve(this.context.workingDirectory, path);
      const relativePath = relative(this.context.workingDirectory, fullPath);

      // Check if file exists
      try {
        await access(fullPath, constants.R_OK | constants.W_OK);
      } catch {
        return {
          success: false,
          error: `File not found or not writable: ${relativePath}`,
        };
      }

      // Read current content
      const originalContent = await readFile(fullPath, 'utf-8');
      let lines = originalContent.split('\n');
      const totalLines = lines.length;

      // Track changes for output
      const changes: string[] = [];
      let editCount = 0;

      // Apply edits in order
      for (const edit of edits) {
        const result = this.applyEdit(lines, edit, totalLines);
        
        if (!result.success) {
          return {
            success: false,
            error: `Edit failed: ${result.error}`,
            data: { appliedEdits: editCount, failedAt: editCount + 1 },
          };
        }

        lines = result.lines!;
        changes.push(result.description!);
        editCount++;
      }

      const newContent = lines.join('\n');
      
      // Check if content actually changed
      if (originalContent === newContent) {
        return {
          success: true,
          output: `No changes needed in ${relativePath}`,
          data: { path: relativePath, unchanged: true },
        };
      }

      // Generate diff preview
      const diffPreview = this.generateDiff(
        originalContent.split('\n'),
        lines,
        relativePath
      );

      // Dry run - just show preview
      if (dryRun || this.context.dryRun) {
        return {
          success: true,
          output: [
            `[DRY RUN] Would apply ${editCount} edit(s) to ${relativePath}:`,
            '',
            ...changes.map((c, i) => `  ${i + 1}. ${c}`),
            '',
            'Preview:',
            diffPreview,
          ].join('\n'),
          data: {
            path: relativePath,
            dryRun: true,
            editCount,
            changes,
            preview: newContent,
          },
        };
      }

      // Create backup before editing
      const backupPath = `${fullPath}.backup`;
      await copyFile(fullPath, backupPath);

      // Write the modified content
      await writeFile(fullPath, newContent, 'utf-8');

      return {
        success: true,
        output: [
          `✏️  Edited: ${relativePath}`,
          `   Applied ${editCount} edit(s):`,
          ...changes.map((c, i) => `     ${i + 1}. ${c}`),
          '',
          diffPreview,
        ].join('\n'),
        data: {
          path: relativePath,
          fullPath,
          editCount,
          changes,
          originalLines: totalLines,
          newLines: lines.length,
          backupPath,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to edit file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private applyEdit(
    lines: string[],
    edit: FileEdit,
    totalLines: number
  ): { success: boolean; lines?: string[]; description?: string; error?: string } {
    // Handle search/replace
    if (edit.search !== undefined && edit.replace !== undefined) {
      const content = lines.join('\n');
      const regex = new RegExp(this.escapeRegex(edit.search), 'g');
      const matches = content.match(regex);
      
      if (!matches || matches.length === 0) {
        return { success: false, error: `Search pattern not found: "${edit.search}"` };
      }

      const newContent = content.replace(regex, edit.replace);
      return {
        success: true,
        lines: newContent.split('\n'),
        description: `Replaced ${matches.length} occurrence(s) of "${edit.search.substring(0, 30)}${edit.search.length > 30 ? '...' : ''}"`,
      };
    }

    // Validate line numbers
    if (edit.startLine < 1 || edit.startLine > totalLines + 1) {
      return { success: false, error: `Invalid startLine: ${edit.startLine}` };
    }

    switch (edit.type) {
      case 'insert': {
        const insertAt = edit.startLine - 1;
        const newLines = (edit.content || '').split('\n');
        const result = [
          ...lines.slice(0, insertAt),
          ...newLines,
          ...lines.slice(insertAt),
        ];
        return {
          success: true,
          lines: result,
          description: `Inserted ${newLines.length} line(s) at line ${edit.startLine}`,
        };
      }

      case 'delete': {
        const start = edit.startLine - 1;
        const end = edit.endLine ?? edit.startLine;
        
        if (end < edit.startLine || end > totalLines) {
          return { success: false, error: `Invalid endLine: ${end}` };
        }

        const result = [
          ...lines.slice(0, start),
          ...lines.slice(end),
        ];
        return {
          success: true,
          lines: result,
          description: `Deleted lines ${edit.startLine}-${end}`,
        };
      }

      case 'replace':
      default: {
        const start = edit.startLine - 1;
        const end = edit.endLine ?? edit.startLine;
        
        if (end < edit.startLine || end > totalLines) {
          return { success: false, error: `Invalid endLine: ${end}` };
        }

        const newLines = (edit.content || '').split('\n');
        const result = [
          ...lines.slice(0, start),
          ...newLines,
          ...lines.slice(end),
        ];
        return {
          success: true,
          lines: result,
          description: `Replaced lines ${edit.startLine}-${end} with ${newLines.length} line(s)`,
        };
      }
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private generateDiff(oldLines: string[], newLines: string[], filename: string): string {
    const diff: string[] = [];
    diff.push(`--- a/${filename}`);
    diff.push(`+++ b/${filename}`);

    // Simple diff - show first few changes
    const maxContext = 3;
    let shown = 0;
    const maxChanges = 10;

    for (let i = 0; i < Math.max(oldLines.length, newLines.length) && shown < maxChanges; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine !== newLine) {
        // Show context before
        const contextStart = Math.max(0, i - maxContext);
        if (contextStart < i && shown === 0) {
          diff.push(`@@ -${contextStart + 1},${maxContext} +${contextStart + 1},${maxContext} @@`);
          for (let j = contextStart; j < i; j++) {
            diff.push(` ${oldLines[j] ?? ''}`);
          }
        }

        if (oldLine !== undefined) {
          diff.push(`-${oldLine}`);
        }
        if (newLine !== undefined) {
          diff.push(`+${newLine}`);
        }
        shown++;
      }
    }

    if (shown >= maxChanges) {
      diff.push(`... (${Math.max(oldLines.length, newLines.length) - shown} more lines)`);
    }

    return diff.join('\n');
  }
}

export const fileEditTool = new FileEditTool();
