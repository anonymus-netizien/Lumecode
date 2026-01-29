/**
 * Mock File System for Testing
 * In-memory file system for isolated testing
 */

import * as path from 'path';

// ===========================================
// Types
// ===========================================

export interface MockFile {
  content: string;
  createdAt: Date;
  modifiedAt: Date;
  permissions: {
    readable: boolean;
    writable: boolean;
  };
}

export interface MockDirectory {
  files: Map<string, MockFile>;
  subdirectories: Map<string, MockDirectory>;
  createdAt: Date;
}

export interface FileSystemSnapshot {
  files: Array<{ path: string; content: string }>;
  directories: string[];
}

// ===========================================
// Mock File System Class
// ===========================================

export class MockFileSystem {
  private root: MockDirectory;
  private workingDirectory: string = '/';
  private operationLog: Array<{
    operation: string;
    path: string;
    timestamp: Date;
    details?: unknown;
  }> = [];

  constructor() {
    this.root = this.createDirectory();
  }

  // ===========================================
  // Directory Operations
  // ===========================================

  /**
   * Create a directory (mkdir -p behavior)
   */
  mkdir(dirPath: string): void {
    const normalizedPath = this.normalizePath(dirPath);
    const parts = normalizedPath.split('/').filter(Boolean);
    
    let current = this.root;
    for (const part of parts) {
      if (!current.subdirectories.has(part)) {
        current.subdirectories.set(part, this.createDirectory());
      }
      current = current.subdirectories.get(part)!;
    }

    this.logOperation('mkdir', dirPath);
  }

  /**
   * Check if directory exists
   */
  dirExists(dirPath: string): boolean {
    try {
      this.getDirectory(dirPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List directory contents
   */
  readdir(dirPath: string): string[] {
    const dir = this.getDirectory(dirPath);
    const entries: string[] = [];
    
    for (const name of dir.subdirectories.keys()) {
      entries.push(name + '/');
    }
    for (const name of dir.files.keys()) {
      entries.push(name);
    }
    
    this.logOperation('readdir', dirPath);
    return entries.sort();
  }

  /**
   * Remove directory (recursive)
   */
  rmdir(dirPath: string, recursive: boolean = false): void {
    const normalizedPath = this.normalizePath(dirPath);
    const parts = normalizedPath.split('/').filter(Boolean);
    
    if (parts.length === 0) {
      throw new Error('Cannot remove root directory');
    }

    const parentPath = '/' + parts.slice(0, -1).join('/');
    const dirName = parts[parts.length - 1];
    const parent = this.getDirectory(parentPath);
    
    if (!parent.subdirectories.has(dirName)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const dir = parent.subdirectories.get(dirName)!;
    if (!recursive && (dir.files.size > 0 || dir.subdirectories.size > 0)) {
      throw new Error(`Directory not empty: ${dirPath}`);
    }

    parent.subdirectories.delete(dirName);
    this.logOperation('rmdir', dirPath, { recursive });
  }

  // ===========================================
  // File Operations
  // ===========================================

  /**
   * Write file (creates directories if needed)
   */
  writeFile(filePath: string, content: string): void {
    const normalizedPath = this.normalizePath(filePath);
    const parts = normalizedPath.split('/').filter(Boolean);
    
    if (parts.length === 0) {
      throw new Error('Invalid file path');
    }

    const dirPath = '/' + parts.slice(0, -1).join('/');
    const fileName = parts[parts.length - 1];

    // Create parent directories
    if (parts.length > 1) {
      this.mkdir(dirPath);
    }

    const dir = parts.length > 1 ? this.getDirectory(dirPath) : this.root;
    const existingFile = dir.files.get(fileName);

    const file: MockFile = {
      content,
      createdAt: existingFile?.createdAt || new Date(),
      modifiedAt: new Date(),
      permissions: existingFile?.permissions || { readable: true, writable: true },
    };

    dir.files.set(fileName, file);
    this.logOperation('writeFile', filePath, { size: content.length });
  }

  /**
   * Read file content
   */
  readFile(filePath: string): string {
    const file = this.getFile(filePath);
    if (!file.permissions.readable) {
      throw new Error(`Permission denied: ${filePath}`);
    }
    this.logOperation('readFile', filePath);
    return file.content;
  }

  /**
   * Check if file exists
   */
  fileExists(filePath: string): boolean {
    try {
      this.getFile(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete file
   */
  unlink(filePath: string): void {
    const normalizedPath = this.normalizePath(filePath);
    const parts = normalizedPath.split('/').filter(Boolean);
    
    if (parts.length === 0) {
      throw new Error('Invalid file path');
    }

    const dirPath = '/' + parts.slice(0, -1).join('/');
    const fileName = parts[parts.length - 1];
    const dir = parts.length > 1 ? this.getDirectory(dirPath) : this.root;

    if (!dir.files.has(fileName)) {
      throw new Error(`File not found: ${filePath}`);
    }

    dir.files.delete(fileName);
    this.logOperation('unlink', filePath);
  }

  /**
   * Rename/move file
   */
  rename(oldPath: string, newPath: string): void {
    const content = this.readFile(oldPath);
    this.writeFile(newPath, content);
    this.unlink(oldPath);
    this.logOperation('rename', oldPath, { newPath });
  }

  /**
   * Copy file
   */
  copyFile(src: string, dest: string): void {
    const content = this.readFile(src);
    this.writeFile(dest, content);
    this.logOperation('copyFile', src, { dest });
  }

  /**
   * Get file stats
   */
  stat(filePath: string): {
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    createdAt: Date;
    modifiedAt: Date;
  } {
    // Try as file first
    try {
      const file = this.getFile(filePath);
      return {
        isFile: true,
        isDirectory: false,
        size: file.content.length,
        createdAt: file.createdAt,
        modifiedAt: file.modifiedAt,
      };
    } catch {
      // Try as directory
      const dir = this.getDirectory(filePath);
      return {
        isFile: false,
        isDirectory: true,
        size: 0,
        createdAt: dir.createdAt,
        modifiedAt: dir.createdAt,
      };
    }
  }

  // ===========================================
  // Working Directory
  // ===========================================

  /**
   * Get current working directory
   */
  cwd(): string {
    return this.workingDirectory;
  }

  /**
   * Change working directory
   */
  chdir(dirPath: string): void {
    const normalizedPath = this.normalizePath(dirPath);
    this.getDirectory(normalizedPath); // Verify it exists
    this.workingDirectory = normalizedPath;
    this.logOperation('chdir', dirPath);
  }

  // ===========================================
  // Utility Methods
  // ===========================================

  /**
   * Create a snapshot of the file system
   */
  snapshot(): FileSystemSnapshot {
    const files: Array<{ path: string; content: string }> = [];
    const directories: string[] = [];

    const traverse = (dir: MockDirectory, currentPath: string) => {
      for (const [name, file] of dir.files) {
        files.push({
          path: currentPath + '/' + name,
          content: file.content,
        });
      }
      for (const [name, subdir] of dir.subdirectories) {
        const subdirPath = currentPath + '/' + name;
        directories.push(subdirPath);
        traverse(subdir, subdirPath);
      }
    };

    traverse(this.root, '');
    return { files, directories };
  }

  /**
   * Restore from snapshot
   */
  restore(snapshot: FileSystemSnapshot): void {
    this.reset();
    for (const dir of snapshot.directories) {
      this.mkdir(dir);
    }
    for (const file of snapshot.files) {
      this.writeFile(file.path, file.content);
    }
  }

  /**
   * Get operation log
   */
  getOperationLog(): Array<{
    operation: string;
    path: string;
    timestamp: Date;
    details?: unknown;
  }> {
    return [...this.operationLog];
  }

  /**
   * Clear operation log
   */
  clearLog(): void {
    this.operationLog = [];
  }

  /**
   * Reset file system to empty state
   */
  reset(): void {
    this.root = this.createDirectory();
    this.workingDirectory = '/';
    this.operationLog = [];
  }

  /**
   * Populate with test files
   */
  populateTestFiles(): void {
    // Create a typical project structure
    this.writeFile('/project/package.json', JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      scripts: {
        test: 'bun test',
        build: 'bun run build',
      },
    }, null, 2));

    this.writeFile('/project/src/index.ts', `
export function main() {
  console.log('Hello, World!');
}

main();
    `.trim());

    this.writeFile('/project/src/utils.ts', `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
    `.trim());

    this.writeFile('/project/tests/index.test.ts', `
import { describe, test, expect } from 'bun:test';
import { add, multiply } from '../src/utils';

describe('Utils', () => {
  test('add', () => {
    expect(add(2, 3)).toBe(5);
  });

  test('multiply', () => {
    expect(multiply(2, 3)).toBe(6);
  });
});
    `.trim());

    this.writeFile('/project/README.md', `
# Test Project

A simple test project for testing purposes.

## Getting Started

\`\`\`bash
bun install
bun test
\`\`\`
    `.trim());

    this.writeFile('/project/.gitignore', `
node_modules/
dist/
*.log
.env
    `.trim());
  }

  // ===========================================
  // Private Methods
  // ===========================================

  private createDirectory(): MockDirectory {
    return {
      files: new Map(),
      subdirectories: new Map(),
      createdAt: new Date(),
    };
  }

  private normalizePath(p: string): string {
    // Handle relative paths
    if (!p.startsWith('/')) {
      p = path.join(this.workingDirectory, p);
    }
    // Normalize and ensure leading slash
    const normalized = path.normalize(p).replace(/\\/g, '/');
    return normalized.startsWith('/') ? normalized : '/' + normalized;
  }

  private getDirectory(dirPath: string): MockDirectory {
    const normalizedPath = this.normalizePath(dirPath);
    const parts = normalizedPath.split('/').filter(Boolean);
    
    let current = this.root;
    for (const part of parts) {
      if (!current.subdirectories.has(part)) {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      current = current.subdirectories.get(part)!;
    }
    
    return current;
  }

  private getFile(filePath: string): MockFile {
    const normalizedPath = this.normalizePath(filePath);
    const parts = normalizedPath.split('/').filter(Boolean);
    
    if (parts.length === 0) {
      throw new Error('Invalid file path');
    }

    const dirPath = '/' + parts.slice(0, -1).join('/');
    const fileName = parts[parts.length - 1];
    const dir = parts.length > 1 ? this.getDirectory(dirPath) : this.root;

    const file = dir.files.get(fileName);
    if (!file) {
      throw new Error(`File not found: ${filePath}`);
    }

    return file;
  }

  private logOperation(operation: string, path: string, details?: unknown): void {
    this.operationLog.push({
      operation,
      path,
      timestamp: new Date(),
      details,
    });
  }
}

// ===========================================
// Factory Functions
// ===========================================

/**
 * Create an empty mock file system
 */
export function createMockFileSystem(): MockFileSystem {
  return new MockFileSystem();
}

/**
 * Create a mock file system with test files
 */
export function createPopulatedMockFileSystem(): MockFileSystem {
  const fs = new MockFileSystem();
  fs.populateTestFiles();
  return fs;
}

export default MockFileSystem;
