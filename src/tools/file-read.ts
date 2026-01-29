/**
 * File Read Tool
 * Read file contents with optional line range
 */

import { readFile, access, stat } from 'fs/promises';
import { constants } from 'fs';
import { resolve, relative, extname } from 'path';
import type { ToolResult, ToolParameters } from '../types/index.js';
import type { FileReadArgs } from './types.js';
import { BaseTool } from './registry.js';

// Language detection by extension
const LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.r': 'r',
  '.sql': 'sql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.ps1': 'powershell',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.dockerfile': 'dockerfile',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.env': 'dotenv',
};

export class FileReadTool extends BaseTool {
  name = 'file_read';
  description = 'Read the contents of a file. Can read entire file or specific line range.';
  category = 'file_read' as const;
  dangerLevel = 'safe' as const;

  parameters: ToolParameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read (relative to working directory or absolute)',
      },
      startLine: {
        type: 'number',
        description: 'Starting line number (1-based). If omitted, reads from beginning.',
      },
      endLine: {
        type: 'number',
        description: 'Ending line number (1-based, inclusive). If omitted, reads to end.',
      },
      encoding: {
        type: 'string',
        description: 'File encoding (default: utf-8)',
        default: 'utf-8',
      },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const { path, startLine, endLine, encoding = 'utf-8' } = args as unknown as FileReadArgs;

    try {
      // Resolve path relative to working directory
      const fullPath = resolve(this.context.workingDirectory, path);
      const relativePath = relative(this.context.workingDirectory, fullPath);

      // Check if file exists and is readable
      try {
        await access(fullPath, constants.R_OK);
      } catch {
        return {
          success: false,
          error: `File not found or not readable: ${relativePath}`,
        };
      }

      // Check file size
      const stats = await stat(fullPath);
      if (stats.size > 10 * 1024 * 1024) { // 10MB limit
        return {
          success: false,
          error: `File too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`,
        };
      }

      // Read file content
      const content = await readFile(fullPath, encoding as BufferEncoding);
      const lines = content.split('\n');
      const totalLines = lines.length;

      // Apply line range if specified
      let outputLines = lines;
      let actualStartLine = 1;
      let actualEndLine = totalLines;

      if (startLine !== undefined || endLine !== undefined) {
        actualStartLine = Math.max(1, startLine ?? 1);
        actualEndLine = Math.min(totalLines, endLine ?? totalLines);
        
        if (actualStartLine > totalLines) {
          return {
            success: false,
            error: `Start line ${actualStartLine} exceeds file length (${totalLines} lines)`,
          };
        }

        outputLines = lines.slice(actualStartLine - 1, actualEndLine);
      }

      // Detect language
      const ext = extname(path).toLowerCase();
      const language = LANGUAGE_MAP[ext] || 'plaintext';

      // Format output with line numbers
      const numberedContent = outputLines.map((line, i) => {
        const lineNum = actualStartLine + i;
        const padding = String(actualEndLine).length;
        return `${String(lineNum).padStart(padding, ' ')} │ ${line}`;
      }).join('\n');

      const output = [
        `File: ${relativePath}`,
        `Language: ${language}`,
        `Lines: ${actualStartLine}-${actualEndLine} of ${totalLines}`,
        `Size: ${(stats.size / 1024).toFixed(2)} KB`,
        '─'.repeat(60),
        numberedContent,
      ].join('\n');

      return {
        success: true,
        output,
        data: {
          path: relativePath,
          fullPath,
          content: outputLines.join('\n'),
          language,
          totalLines,
          startLine: actualStartLine,
          endLine: actualEndLine,
          size: stats.size,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

export const fileReadTool = new FileReadTool();
