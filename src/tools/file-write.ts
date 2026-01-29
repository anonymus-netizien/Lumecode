/**
 * File Write Tool
 * Write or create files with optional backup
 */

import { writeFile, mkdir, copyFile, access, readFile } from 'fs/promises';
import { constants } from 'fs';
import { resolve, relative, dirname, basename, extname } from 'path';
import type { ToolResult, ToolParameters } from '../types/index.js';
import type { FileWriteArgs } from './types.js';
import { BaseTool } from './registry.js';

export class FileWriteTool extends BaseTool {
  name = 'file_write';
  description = 'Write content to a file. Creates the file if it doesn\'t exist. Can optionally create parent directories and backup existing files.';
  category = 'file_write' as const;
  dangerLevel = 'moderate' as const;
  requiresConfirmation = true;

  parameters: ToolParameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write (relative to working directory or absolute)',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
      createDirectories: {
        type: 'boolean',
        description: 'Create parent directories if they don\'t exist (default: true)',
        default: true,
      },
      backup: {
        type: 'boolean',
        description: 'Create a backup of existing file before overwriting (default: false)',
        default: false,
      },
    },
    required: ['path', 'content'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const { 
      path, 
      content, 
      createDirectories = true, 
      backup = false 
    } = args as unknown as FileWriteArgs;

    try {
      // Resolve path relative to working directory
      const fullPath = resolve(this.context.workingDirectory, path);
      const relativePath = relative(this.context.workingDirectory, fullPath);
      const dir = dirname(fullPath);

      // Check if file already exists
      let fileExists = false;
      let previousSize = 0;
      try {
        await access(fullPath, constants.F_OK);
        fileExists = true;
        const existingContent = await readFile(fullPath, 'utf-8');
        previousSize = Buffer.byteLength(existingContent, 'utf-8');
      } catch {
        // File doesn't exist, that's fine
      }

      // Create backup if requested and file exists
      if (backup && fileExists) {
        const backupPath = `${fullPath}.backup.${Date.now()}`;
        await copyFile(fullPath, backupPath);
      }

      // Create parent directories if needed
      if (createDirectories) {
        await mkdir(dir, { recursive: true });
      }

      // Check if directory exists (if not creating)
      if (!createDirectories) {
        try {
          await access(dir, constants.W_OK);
        } catch {
          return {
            success: false,
            error: `Directory does not exist: ${dirname(relativePath)}`,
          };
        }
      }

      // Perform dry run check
      if (this.context.dryRun) {
        return {
          success: true,
          output: `[DRY RUN] Would write ${content.length} characters to ${relativePath}`,
          data: {
            path: relativePath,
            fullPath,
            dryRun: true,
            wouldCreate: !fileExists,
          },
        };
      }

      // Write the file
      await writeFile(fullPath, content, 'utf-8');

      const newSize = Buffer.byteLength(content, 'utf-8');
      const lineCount = content.split('\n').length;
      const ext = extname(path);

      const output = [
        fileExists ? `✏️  Updated: ${relativePath}` : `✨ Created: ${relativePath}`,
        `   Lines: ${lineCount}`,
        `   Size: ${(newSize / 1024).toFixed(2)} KB`,
        fileExists ? `   Previous: ${(previousSize / 1024).toFixed(2)} KB` : '',
      ].filter(Boolean).join('\n');

      return {
        success: true,
        output,
        data: {
          path: relativePath,
          fullPath,
          created: !fileExists,
          updated: fileExists,
          lines: lineCount,
          size: newSize,
          previousSize: fileExists ? previousSize : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

export const fileWriteTool = new FileWriteTool();
