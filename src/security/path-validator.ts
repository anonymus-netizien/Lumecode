/**
 * Path Validator
 * Validates and normalizes file paths to prevent directory traversal attacks
 */

import { resolve, normalize, relative, isAbsolute, dirname, basename } from 'path';
import { homedir } from 'os';

// ===========================================
// Types
// ===========================================

export interface PathValidationOptions {
  /** Allowed base directories (paths must be within these) */
  allowedRoots?: string[];
  /** Explicitly blocked paths */
  blockedPaths?: string[];
  /** Allow symlinks */
  allowSymlinks?: boolean;
  /** Allow hidden files (starting with .) */
  allowHidden?: boolean;
  /** Maximum path depth from root */
  maxDepth?: number;
  /** Allowed file extensions (empty = all allowed) */
  allowedExtensions?: string[];
  /** Blocked file extensions */
  blockedExtensions?: string[];
  /** Allow absolute paths */
  allowAbsolute?: boolean;
}

export interface PathValidationResult {
  /** Whether the path is valid */
  valid: boolean;
  /** Normalized/resolved path */
  normalizedPath: string;
  /** Validation errors */
  errors: string[];
  /** Security warnings (non-blocking) */
  warnings: string[];
  /** Path components */
  components: {
    directory: string;
    filename: string;
    extension: string;
  };
}

// ===========================================
// Constants
// ===========================================

/** Sensitive system paths that should never be accessed */
const SENSITIVE_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/private/etc',
  '~/.ssh',
  '~/.gnupg',
  '~/.aws/credentials',
  '~/.config/gcloud',
  '/proc',
  '/sys',
  '/dev',
];

/** Dangerous file patterns */
const DANGEROUS_PATTERNS = [
  /\.env$/i,
  /\.env\.[^/]+$/i,
  /id_rsa$/i,
  /id_ed25519$/i,
  /\.pem$/i,
  /\.key$/i,
  /password/i,
  /secret/i,
  /credential/i,
  /token\.json$/i,
];

/** Default blocked extensions for executable files */
const DEFAULT_BLOCKED_EXTENSIONS = [
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.bat',
  '.cmd',
];

// ===========================================
// Path Validator Class
// ===========================================

export class PathValidator {
  private defaultOptions: PathValidationOptions;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, defaultOptions: Partial<PathValidationOptions> = {}) {
    this.workspaceRoot = resolve(workspaceRoot);
    this.defaultOptions = {
      allowedRoots: [this.workspaceRoot],
      blockedPaths: [],
      allowSymlinks: false,
      allowHidden: true,
      maxDepth: 50,
      allowedExtensions: [],
      blockedExtensions: [],
      allowAbsolute: true,
      ...defaultOptions,
    };
  }

  /**
   * Validate a file path
   */
  validate(inputPath: string, options: Partial<PathValidationOptions> = {}): PathValidationResult {
    const opts = { ...this.defaultOptions, ...options };
    const errors: string[] = [];
    const warnings: string[] = [];

    // Handle empty input
    if (!inputPath || inputPath.trim() === '') {
      return {
        valid: false,
        normalizedPath: '',
        errors: ['Path is empty'],
        warnings: [],
        components: { directory: '', filename: '', extension: '' },
      };
    }

    // Expand home directory
    let expandedPath = inputPath;
    if (expandedPath.startsWith('~')) {
      expandedPath = expandedPath.replace(/^~/, homedir());
    }

    // Check for null bytes
    if (expandedPath.includes('\0')) {
      return {
        valid: false,
        normalizedPath: '',
        errors: ['Path contains null bytes'],
        warnings: [],
        components: { directory: '', filename: '', extension: '' },
      };
    }

    // Normalize and resolve the path
    let normalizedPath: string;
    try {
      if (isAbsolute(expandedPath)) {
        if (!opts.allowAbsolute) {
          errors.push('Absolute paths are not allowed');
        }
        normalizedPath = normalize(expandedPath);
      } else {
        // Resolve relative to workspace root
        normalizedPath = resolve(this.workspaceRoot, expandedPath);
      }
    } catch (error) {
      return {
        valid: false,
        normalizedPath: '',
        errors: ['Invalid path format'],
        warnings: [],
        components: { directory: '', filename: '', extension: '' },
      };
    }

    // Extract path components
    const directory = dirname(normalizedPath);
    const filename = basename(normalizedPath);
    const extension = filename.includes('.') 
      ? '.' + filename.split('.').pop()!.toLowerCase()
      : '';

    // Check for path traversal (.. that escapes allowed roots)
    const isWithinAllowedRoots = opts.allowedRoots?.some(root => {
      const resolvedRoot = resolve(root.replace(/^~/, homedir()));
      const rel = relative(resolvedRoot, normalizedPath);
      return !rel.startsWith('..') && !isAbsolute(rel);
    });

    if (!isWithinAllowedRoots) {
      errors.push('Path is outside allowed directories');
    }

    // Check for explicitly blocked paths
    if (opts.blockedPaths) {
      for (const blocked of opts.blockedPaths) {
        const resolvedBlocked = resolve(blocked.replace(/^~/, homedir()));
        if (normalizedPath === resolvedBlocked || normalizedPath.startsWith(resolvedBlocked + '/')) {
          errors.push(`Path is explicitly blocked: ${blocked}`);
        }
      }
    }

    // Check sensitive system paths
    for (const sensitive of SENSITIVE_PATHS) {
      const resolvedSensitive = resolve(sensitive.replace(/^~/, homedir()));
      if (normalizedPath === resolvedSensitive || normalizedPath.startsWith(resolvedSensitive + '/')) {
        errors.push('Access to sensitive system path is blocked');
      }
    }

    // Check for hidden files
    if (!opts.allowHidden && filename.startsWith('.')) {
      warnings.push('Hidden file detected');
    }

    // Check path depth
    if (opts.maxDepth && opts.maxDepth > 0) {
      const depth = normalizedPath.split('/').filter(Boolean).length;
      if (depth > opts.maxDepth) {
        errors.push(`Path depth (${depth}) exceeds maximum (${opts.maxDepth})`);
      }
    }

    // Check file extension
    if (opts.allowedExtensions && opts.allowedExtensions.length > 0) {
      if (extension && !opts.allowedExtensions.includes(extension)) {
        errors.push(`File extension '${extension}' is not allowed`);
      }
    }

    if (opts.blockedExtensions && opts.blockedExtensions.length > 0) {
      if (extension && opts.blockedExtensions.includes(extension)) {
        errors.push(`File extension '${extension}' is blocked`);
      }
    }

    // Check for dangerous file patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(normalizedPath)) {
        warnings.push('File may contain sensitive information');
        break;
      }
    }

    return {
      valid: errors.length === 0,
      normalizedPath,
      errors,
      warnings,
      components: { directory, filename, extension },
    };
  }

  /**
   * Check if a path is within the workspace
   */
  isWithinWorkspace(inputPath: string): boolean {
    try {
      let expandedPath = inputPath;
      if (expandedPath.startsWith('~')) {
        expandedPath = expandedPath.replace(/^~/, homedir());
      }

      const normalizedPath = isAbsolute(expandedPath)
        ? normalize(expandedPath)
        : resolve(this.workspaceRoot, expandedPath);

      const rel = relative(this.workspaceRoot, normalizedPath);
      return !rel.startsWith('..') && !isAbsolute(rel);
    } catch {
      return false;
    }
  }

  /**
   * Get relative path from workspace root
   */
  getRelativePath(inputPath: string): string | null {
    try {
      let expandedPath = inputPath;
      if (expandedPath.startsWith('~')) {
        expandedPath = expandedPath.replace(/^~/, homedir());
      }

      const normalizedPath = isAbsolute(expandedPath)
        ? normalize(expandedPath)
        : resolve(this.workspaceRoot, expandedPath);

      const rel = relative(this.workspaceRoot, normalizedPath);
      
      if (rel.startsWith('..') || isAbsolute(rel)) {
        return null;
      }

      return rel;
    } catch {
      return null;
    }
  }

  /**
   * Sanitize a filename (remove dangerous characters)
   */
  sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Remove invalid chars
      .replace(/^\.+/, '_') // Remove leading dots
      .replace(/\.+$/, '') // Remove trailing dots
      .replace(/\s+/g, '_') // Replace spaces
      .slice(0, 255); // Limit length
  }

  /**
   * Check if path matches dangerous patterns
   */
  isDangerousPath(inputPath: string): boolean {
    const normalizedPath = normalize(inputPath);
    
    // Check sensitive paths
    for (const sensitive of SENSITIVE_PATHS) {
      const resolvedSensitive = resolve(sensitive.replace(/^~/, homedir()));
      if (normalizedPath === resolvedSensitive || normalizedPath.startsWith(resolvedSensitive + '/')) {
        return true;
      }
    }

    // Check dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(normalizedPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Update workspace root
   */
  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = resolve(root);
    if (this.defaultOptions.allowedRoots) {
      this.defaultOptions.allowedRoots = [this.workspaceRoot];
    }
  }

  /**
   * Get current workspace root
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Add an allowed root directory
   */
  addAllowedRoot(root: string): void {
    if (!this.defaultOptions.allowedRoots) {
      this.defaultOptions.allowedRoots = [];
    }
    const resolvedRoot = resolve(root.replace(/^~/, homedir()));
    if (!this.defaultOptions.allowedRoots.includes(resolvedRoot)) {
      this.defaultOptions.allowedRoots.push(resolvedRoot);
    }
  }

  /**
   * Block a specific path
   */
  blockPath(path: string): void {
    if (!this.defaultOptions.blockedPaths) {
      this.defaultOptions.blockedPaths = [];
    }
    if (!this.defaultOptions.blockedPaths.includes(path)) {
      this.defaultOptions.blockedPaths.push(path);
    }
  }
}

// ===========================================
// Convenience Functions
// ===========================================

let defaultValidator: PathValidator | null = null;

export function initPathValidator(workspaceRoot: string, options?: Partial<PathValidationOptions>): PathValidator {
  defaultValidator = new PathValidator(workspaceRoot, options);
  return defaultValidator;
}

export function getPathValidator(): PathValidator {
  if (!defaultValidator) {
    throw new Error('Path validator not initialized. Call initPathValidator first.');
  }
  return defaultValidator;
}

export function validatePath(path: string, options?: Partial<PathValidationOptions>): PathValidationResult {
  return getPathValidator().validate(path, options);
}

export function isWithinWorkspace(path: string): boolean {
  return getPathValidator().isWithinWorkspace(path);
}

export function sanitizeFilename(filename: string): string {
  return defaultValidator?.sanitizeFilename(filename) ?? filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}
