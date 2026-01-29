/**
 * Directory List Tool
 * List directory contents with tree structure
 */

import { readdir, stat, access } from 'fs/promises';
import { constants } from 'fs';
import { resolve, relative, join, basename, extname } from 'path';
import type { ToolResult, ToolParameters } from '../types/index.js';
import type { DirectoryListArgs } from './types.js';
import { BaseTool } from './registry.js';

// Common ignore patterns
const DEFAULT_IGNORE = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  '.eggs',
  '*.egg-info',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.nyc_output',
  '.cache',
  '.parcel-cache',
  'venv',
  '.venv',
  'env',
  '.DS_Store',
  'Thumbs.db',
]);

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: TreeNode[];
}

export class DirectoryListTool extends BaseTool {
  name = 'directory_list';
  description = 'List the contents of a directory with optional recursive traversal. Shows file tree structure with sizes.';
  category = 'directory' as const;
  dangerLevel = 'safe' as const;

  parameters: ToolParameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the directory (relative to working directory or absolute). Defaults to current directory.',
        default: '.',
      },
      recursive: {
        type: 'boolean',
        description: 'List recursively (default: true)',
        default: true,
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum depth for recursive listing (default: 4)',
        default: 4,
      },
      includeHidden: {
        type: 'boolean',
        description: 'Include hidden files and directories (default: false)',
        default: false,
      },
      pattern: {
        type: 'string',
        description: 'Filter files by glob pattern (e.g., "*.ts", "*.{js,jsx}")',
      },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const {
      path = '.',
      recursive = true,
      maxDepth = 4,
      includeHidden = false,
      pattern,
    } = args as unknown as DirectoryListArgs;

    try {
      // Resolve path relative to working directory
      const fullPath = resolve(this.context.workingDirectory, path);
      const relativePath = relative(this.context.workingDirectory, fullPath) || '.';

      // Check if directory exists
      try {
        await access(fullPath, constants.R_OK);
        const stats = await stat(fullPath);
        if (!stats.isDirectory()) {
          return {
            success: false,
            error: `Not a directory: ${relativePath}`,
          };
        }
      } catch {
        return {
          success: false,
          error: `Directory not found or not readable: ${relativePath}`,
        };
      }

      // Build tree structure
      const tree = await this.buildTree(
        fullPath,
        0,
        recursive ? maxDepth : 0,
        includeHidden,
        pattern ? this.createPatternMatcher(pattern) : undefined
      );

      // Count files and directories
      const counts = this.countNodes(tree);

      // Render tree as text
      const treeText = this.renderTree(tree, '', true);

      const output = [
        `📁 ${relativePath}/`,
        `   Files: ${counts.files} | Directories: ${counts.directories}`,
        '',
        treeText,
      ].join('\n');

      return {
        success: true,
        output,
        data: {
          path: relativePath,
          fullPath,
          tree,
          counts,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list directory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async buildTree(
    dirPath: string,
    depth: number,
    maxDepth: number,
    includeHidden: boolean,
    patternMatcher?: (name: string) => boolean
  ): Promise<TreeNode> {
    const name = basename(dirPath) || dirPath;
    const node: TreeNode = {
      name,
      path: dirPath,
      type: 'directory',
      children: [],
    };

    if (depth > maxDepth) {
      return node;
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      // Sort: directories first, then files, alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      for (const entry of entries) {
        // Skip hidden files if not requested
        if (!includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        // Skip common ignored directories
        if (entry.isDirectory() && DEFAULT_IGNORE.has(entry.name)) {
          continue;
        }

        const entryPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const child = await this.buildTree(
            entryPath,
            depth + 1,
            maxDepth,
            includeHidden,
            patternMatcher
          );
          node.children!.push(child);
        } else if (entry.isFile()) {
          // Apply pattern filter
          if (patternMatcher && !patternMatcher(entry.name)) {
            continue;
          }

          try {
            const stats = await stat(entryPath);
            node.children!.push({
              name: entry.name,
              path: entryPath,
              type: 'file',
              size: stats.size,
            });
          } catch {
            node.children!.push({
              name: entry.name,
              path: entryPath,
              type: 'file',
            });
          }
        }
      }
    } catch (error) {
      // Can't read directory, return empty
    }

    return node;
  }

  private renderTree(node: TreeNode, prefix: string, isRoot: boolean): string {
    const lines: string[] = [];
    
    if (!isRoot) {
      const icon = node.type === 'directory' ? '📁' : this.getFileIcon(node.name);
      const size = node.size !== undefined ? ` (${this.formatSize(node.size)})` : '';
      lines.push(`${prefix}${icon} ${node.name}${size}`);
    }

    if (node.children) {
      const childPrefix = isRoot ? '' : prefix + '   ';
      
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const isLast = i === node.children.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const newPrefix = childPrefix + (isLast ? '    ' : '│   ');

        if (child.type === 'directory') {
          const icon = '📁';
          lines.push(`${childPrefix}${connector}${icon} ${child.name}/`);
          if (child.children && child.children.length > 0) {
            lines.push(this.renderTree(child, newPrefix, false));
          }
        } else {
          const icon = this.getFileIcon(child.name);
          const size = child.size !== undefined ? ` (${this.formatSize(child.size)})` : '';
          lines.push(`${childPrefix}${connector}${icon} ${child.name}${size}`);
        }
      }
    }

    return lines.join('\n');
  }

  private getFileIcon(filename: string): string {
    const ext = extname(filename).toLowerCase();
    const icons: Record<string, string> = {
      '.ts': '📘',
      '.tsx': '⚛️',
      '.js': '📒',
      '.jsx': '⚛️',
      '.json': '📋',
      '.md': '📝',
      '.py': '🐍',
      '.rb': '💎',
      '.go': '🐹',
      '.rs': '🦀',
      '.java': '☕',
      '.html': '🌐',
      '.css': '🎨',
      '.scss': '🎨',
      '.yaml': '⚙️',
      '.yml': '⚙️',
      '.toml': '⚙️',
      '.env': '🔐',
      '.sh': '🖥️',
      '.sql': '🗃️',
      '.png': '🖼️',
      '.jpg': '🖼️',
      '.svg': '🎭',
      '.gif': '🎬',
      '.lock': '🔒',
    };
    return icons[ext] || '📄';
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  private countNodes(node: TreeNode): { files: number; directories: number } {
    let files = 0;
    let directories = 0;

    if (node.type === 'directory') {
      directories++;
      if (node.children) {
        for (const child of node.children) {
          const childCounts = this.countNodes(child);
          files += childCounts.files;
          directories += childCounts.directories;
        }
      }
    } else {
      files++;
    }

    return { files, directories: directories - 1 }; // Subtract root
  }

  private createPatternMatcher(pattern: string): (name: string) => boolean {
    // Simple glob pattern to regex conversion
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\{([^}]+)\}/g, (_, group) => `(${group.split(',').join('|')})`);
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return (name: string) => regex.test(name);
  }
}

export const directoryListTool = new DirectoryListTool();
