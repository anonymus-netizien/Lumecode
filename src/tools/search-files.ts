/**
 * Search Files Tool
 * Search for patterns across files with context
 */

import { readdir, readFile, stat, access } from 'fs/promises';
import { constants } from 'fs';
import { resolve, relative, join, extname } from 'path';
import type { ToolResult, ToolParameters } from '../types/index.js';
import type { SearchFilesArgs, SearchMatch, SearchResult } from './types.js';
import { BaseTool } from './registry.js';

// Binary file extensions to skip
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.sqlite', '.db',
]);

// Directories to skip
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
  'venv',
  '.venv',
  'vendor',
]);

export class SearchFilesTool extends BaseTool {
  name = 'search_files';
  description = `Search for a pattern (text or regex) across files in the project. Returns matching lines with file paths, line numbers, and optional context. Useful for finding function definitions, usages, or specific code patterns.`;
  category = 'search' as const;
  dangerLevel = 'safe' as const;

  parameters: ToolParameters = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The search pattern (text or regex)',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (default: working directory)',
        default: '.',
      },
      filePattern: {
        type: 'string',
        description: 'Filter files by glob pattern (e.g., "*.ts", "*.{js,jsx}")',
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Case-sensitive search (default: false)',
        default: false,
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of matches to return (default: 100)',
        default: 100,
      },
      includeContext: {
        type: 'boolean',
        description: 'Include surrounding lines for context (default: true)',
        default: true,
      },
      contextLines: {
        type: 'number',
        description: 'Number of context lines before and after match (default: 2)',
        default: 2,
      },
    },
    required: ['pattern'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const {
      pattern,
      path = '.',
      filePattern,
      caseSensitive = false,
      maxResults = 100,
      includeContext = true,
      contextLines = 2,
    } = args as unknown as SearchFilesArgs;

    try {
      // Validate pattern
      if (!pattern || typeof pattern !== 'string' || !pattern.trim()) {
        return {
          success: false,
          error: 'Search pattern cannot be empty',
        };
      }

      // Resolve search directory
      const searchDir = resolve(this.context.workingDirectory, path);

      // Check if directory exists
      try {
        await access(searchDir, constants.R_OK);
        const stats = await stat(searchDir);
        if (!stats.isDirectory()) {
          return {
            success: false,
            error: `Not a directory: ${path}`,
          };
        }
      } catch {
        return {
          success: false,
          error: `Directory not found: ${path}`,
        };
      }

      // Create regex pattern
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
      } catch (e) {
        // If pattern is invalid regex, escape it and search as literal
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
      }

      // Create file pattern matcher
      const fileMatcher = filePattern ? this.createPatternMatcher(filePattern) : undefined;

      // Search files
      const matches: SearchMatch[] = [];
      let filesSearched = 0;
      let truncated = false;

      await this.searchDirectory(
        searchDir,
        regex,
        fileMatcher,
        matches,
        maxResults,
        includeContext,
        contextLines,
        () => filesSearched++,
        () => { truncated = true; }
      );

      // Format results
      const searchResult: SearchResult = {
        matches,
        totalMatches: matches.length,
        filesSearched,
        truncated,
      };

      // Generate output
      const output = this.formatResults(searchResult, pattern);

      return {
        success: true,
        output,
        data: searchResult,
      };
    } catch (error) {
      return {
        success: false,
        error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async searchDirectory(
    dirPath: string,
    regex: RegExp,
    fileMatcher: ((name: string) => boolean) | undefined,
    matches: SearchMatch[],
    maxResults: number,
    includeContext: boolean,
    contextLines: number,
    onFileSearched: () => void,
    onTruncate: () => void
  ): Promise<void> {
    if (matches.length >= maxResults) {
      onTruncate();
      return;
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (matches.length >= maxResults) {
          onTruncate();
          return;
        }

        // Skip hidden files and directories
        if (entry.name.startsWith('.')) continue;

        const entryPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip common ignored directories
          if (SKIP_DIRECTORIES.has(entry.name)) continue;

          await this.searchDirectory(
            entryPath,
            regex,
            fileMatcher,
            matches,
            maxResults,
            includeContext,
            contextLines,
            onFileSearched,
            onTruncate
          );
        } else if (entry.isFile()) {
          // Skip binary files
          const ext = extname(entry.name).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext)) continue;

          // Apply file pattern filter
          if (fileMatcher && !fileMatcher(entry.name)) continue;

          // Search file
          const fileMatches = await this.searchFile(
            entryPath,
            regex,
            includeContext,
            contextLines,
            maxResults - matches.length
          );

          onFileSearched();
          matches.push(...fileMatches);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  private async searchFile(
    filePath: string,
    regex: RegExp,
    includeContext: boolean,
    contextLines: number,
    maxMatches: number
  ): Promise<SearchMatch[]> {
    const matches: SearchMatch[] = [];

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const relativePath = relative(this.context.workingDirectory, filePath);

      for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
        const line = lines[i];
        regex.lastIndex = 0; // Reset regex state
        
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null && matches.length < maxMatches) {
          const searchMatch: SearchMatch = {
            file: relativePath,
            line: i + 1,
            column: match.index + 1,
            content: line.trim(),
          };

          if (includeContext) {
            const beforeStart = Math.max(0, i - contextLines);
            const afterEnd = Math.min(lines.length - 1, i + contextLines);
            
            searchMatch.context = {
              before: lines.slice(beforeStart, i).map(l => l.trimEnd()),
              after: lines.slice(i + 1, afterEnd + 1).map(l => l.trimEnd()),
            };
          }

          matches.push(searchMatch);

          // For non-global regex, break to avoid infinite loop
          if (!regex.global) break;
        }
      }
    } catch {
      // Skip files we can't read
    }

    return matches;
  }

  private formatResults(result: SearchResult, pattern: string): string {
    const lines: string[] = [];

    lines.push(`🔍 Search: "${pattern}"`);
    lines.push(`   Found ${result.totalMatches} match(es) in ${result.filesSearched} file(s)`);
    
    if (result.truncated) {
      lines.push(`   ⚠️ Results truncated - showing first ${result.totalMatches} matches`);
    }
    
    lines.push('');

    if (result.matches.length === 0) {
      lines.push('No matches found.');
      return lines.join('\n');
    }

    // Group by file
    const byFile = new Map<string, SearchMatch[]>();
    for (const match of result.matches) {
      const existing = byFile.get(match.file) || [];
      existing.push(match);
      byFile.set(match.file, existing);
    }

    for (const [file, fileMatches] of byFile) {
      lines.push(`📄 ${file}`);
      
      for (const match of fileMatches) {
        // Show context before
        if (match.context?.before) {
          for (let i = 0; i < match.context.before.length; i++) {
            const lineNum = match.line - match.context.before.length + i;
            lines.push(`   ${String(lineNum).padStart(4, ' ')} │ ${match.context.before[i]}`);
          }
        }

        // Highlight the matching line
        lines.push(`   ${String(match.line).padStart(4, ' ')} │ ${match.content} ◀──`);

        // Show context after
        if (match.context?.after) {
          for (let i = 0; i < match.context.after.length; i++) {
            const lineNum = match.line + i + 1;
            lines.push(`   ${String(lineNum).padStart(4, ' ')} │ ${match.context.after[i]}`);
          }
        }

        lines.push('');
      }
    }

    return lines.join('\n');
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

export const searchFilesTool = new SearchFilesTool();
