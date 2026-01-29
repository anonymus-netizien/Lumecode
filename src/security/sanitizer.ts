/**
 * Input Sanitizer
 * Sanitizes and validates user input to prevent injection attacks
 */

// ===========================================
// Types
// ===========================================

export interface SanitizeOptions {
  /** Allow HTML tags */
  allowHtml?: boolean;
  /** Allow shell metacharacters */
  allowShellMeta?: boolean;
  /** Maximum length (0 = unlimited) */
  maxLength?: number;
  /** Allow newlines */
  allowNewlines?: boolean;
  /** Allow control characters */
  allowControlChars?: boolean;
  /** Custom allowed characters pattern */
  customPattern?: RegExp;
}

export interface SanitizeResult {
  /** Sanitized string */
  value: string;
  /** Whether sanitization modified the input */
  modified: boolean;
  /** List of removed/modified content */
  removals: string[];
  /** Whether the input was valid */
  isValid: boolean;
  /** Validation errors */
  errors: string[];
}

// ===========================================
// Constants
// ===========================================

/** Shell metacharacters that could be dangerous */
const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>!\\]/g;

/** HTML/XML tags */
const HTML_TAGS = /<[^>]*>/g;

/** Control characters (except tab, newline, carriage return) */
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Path traversal patterns */
const PATH_TRAVERSAL = /\.\.[/\\]/g;

/** Null byte injection */
const NULL_BYTE = /\x00/g;

/** SQL injection patterns */
const SQL_INJECTION_PATTERNS = [
  /'\s*or\s+'?1'?\s*=\s*'?1/gi,
  /'\s*;\s*drop\s+/gi,
  /'\s*;\s*delete\s+/gi,
  /'\s*;\s*update\s+/gi,
  /'\s*;\s*insert\s+/gi,
  /union\s+select/gi,
  /--\s*$/gm,
];

/** Command injection patterns */
const COMMAND_INJECTION_PATTERNS = [
  /;\s*rm\s+-rf/gi,
  /;\s*curl\s+/gi,
  /;\s*wget\s+/gi,
  /\$\(.*\)/g,
  /`.*`/g,
  /\|\s*bash/gi,
  /\|\s*sh/gi,
];

// ===========================================
// Sanitizer Class
// ===========================================

export class InputSanitizer {
  private defaultOptions: SanitizeOptions;

  constructor(defaultOptions: Partial<SanitizeOptions> = {}) {
    this.defaultOptions = {
      allowHtml: false,
      allowShellMeta: false,
      maxLength: 10000,
      allowNewlines: true,
      allowControlChars: false,
      ...defaultOptions,
    };
  }

  /**
   * Sanitize a string input
   */
  sanitize(input: string, options: Partial<SanitizeOptions> = {}): SanitizeResult {
    const opts = { ...this.defaultOptions, ...options };
    const removals: string[] = [];
    const errors: string[] = [];
    let value = input;
    let modified = false;

    // Check for null/undefined
    if (input == null) {
      return {
        value: '',
        modified: true,
        removals: ['null input'],
        isValid: false,
        errors: ['Input is null or undefined'],
      };
    }

    // Convert to string if not already
    if (typeof input !== 'string') {
      value = String(input);
      modified = true;
      removals.push('non-string input converted');
    }

    // Remove null bytes (always dangerous)
    if (NULL_BYTE.test(value)) {
      value = value.replace(NULL_BYTE, '');
      modified = true;
      removals.push('null bytes');
      errors.push('Null bytes detected and removed');
    }

    // Remove control characters
    if (!opts.allowControlChars) {
      const controlMatches = value.match(CONTROL_CHARS);
      if (controlMatches) {
        value = value.replace(CONTROL_CHARS, '');
        modified = true;
        removals.push(`control characters (${controlMatches.length})`);
      }
    }

    // Handle newlines
    if (!opts.allowNewlines) {
      const newlineCount = (value.match(/[\r\n]/g) || []).length;
      if (newlineCount > 0) {
        value = value.replace(/[\r\n]/g, ' ');
        modified = true;
        removals.push(`newlines (${newlineCount})`);
      }
    }

    // Remove HTML tags
    if (!opts.allowHtml) {
      const htmlMatches = value.match(HTML_TAGS);
      if (htmlMatches) {
        value = value.replace(HTML_TAGS, '');
        modified = true;
        removals.push(`HTML tags (${htmlMatches.length})`);
      }
    }

    // Remove shell metacharacters
    if (!opts.allowShellMeta) {
      const shellMatches = value.match(SHELL_METACHARACTERS);
      if (shellMatches) {
        value = value.replace(SHELL_METACHARACTERS, '');
        modified = true;
        removals.push(`shell metacharacters (${shellMatches.length})`);
      }
    }

    // Enforce max length
    if (opts.maxLength && opts.maxLength > 0 && value.length > opts.maxLength) {
      const trimmed = value.length - opts.maxLength;
      value = value.slice(0, opts.maxLength);
      modified = true;
      removals.push(`excess length (${trimmed} chars)`);
    }

    // Apply custom pattern if provided
    if (opts.customPattern) {
      const originalLength = value.length;
      value = value.replace(opts.customPattern, '');
      if (value.length !== originalLength) {
        modified = true;
        removals.push('custom pattern matches');
      }
    }

    return {
      value,
      modified,
      removals,
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Sanitize for use in shell commands
   */
  sanitizeForShell(input: string): SanitizeResult {
    const result = this.sanitize(input, {
      allowHtml: false,
      allowShellMeta: false,
      allowNewlines: false,
      allowControlChars: false,
    });

    // Additional shell-specific sanitization
    let value = result.value;
    const errors = [...result.errors];
    const removals = [...result.removals];
    let modified = result.modified;

    // Check for command injection patterns
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        errors.push('Potential command injection detected');
        value = value.replace(pattern, '');
        modified = true;
        removals.push('command injection pattern');
      }
    }

    return {
      value,
      modified,
      removals,
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Sanitize for use in SQL queries (parameterized queries preferred)
   */
  sanitizeForSQL(input: string): SanitizeResult {
    const result = this.sanitize(input, {
      allowHtml: false,
      allowShellMeta: false,
    });

    let value = result.value;
    const errors = [...result.errors];
    const removals = [...result.removals];
    let modified = result.modified;

    // Check for SQL injection patterns
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        errors.push('Potential SQL injection detected');
        // Escape single quotes
        value = value.replace(/'/g, "''");
        modified = true;
        removals.push('SQL injection pattern');
      }
    }

    return {
      value,
      modified,
      removals,
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Sanitize file path
   */
  sanitizePath(input: string): SanitizeResult {
    const result = this.sanitize(input, {
      allowHtml: false,
      allowShellMeta: false,
      allowNewlines: false,
      allowControlChars: false,
    });

    let value = result.value;
    const errors = [...result.errors];
    const removals = [...result.removals];
    let modified = result.modified;

    // Check for path traversal
    if (PATH_TRAVERSAL.test(value)) {
      errors.push('Path traversal detected');
      value = value.replace(PATH_TRAVERSAL, '');
      modified = true;
      removals.push('path traversal sequences');
    }

    // Normalize path separators
    value = value.replace(/\\/g, '/');

    return {
      value,
      modified,
      removals,
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate input matches expected format
   */
  validate(input: string, pattern: RegExp): boolean {
    return pattern.test(input);
  }

  /**
   * Check if input contains dangerous patterns
   */
  containsDangerousPatterns(input: string): {
    dangerous: boolean;
    patterns: string[];
  } {
    const patterns: string[] = [];

    if (NULL_BYTE.test(input)) patterns.push('null bytes');
    if (PATH_TRAVERSAL.test(input)) patterns.push('path traversal');
    
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        patterns.push('command injection');
        break;
      }
    }

    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        patterns.push('SQL injection');
        break;
      }
    }

    return {
      dangerous: patterns.length > 0,
      patterns,
    };
  }

  /**
   * Escape string for safe display in terminal
   */
  escapeForTerminal(input: string): string {
    return input
      .replace(/\x1b/g, '\\x1b') // Escape ANSI escape codes
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
  }

  /**
   * Escape string for JSON
   */
  escapeForJSON(input: string): string {
    return JSON.stringify(input).slice(1, -1);
  }
}

// ===========================================
// Singleton Instance
// ===========================================

export const inputSanitizer = new InputSanitizer();

// ===========================================
// Convenience Functions
// ===========================================

export function sanitize(input: string, options?: Partial<SanitizeOptions>): SanitizeResult {
  return inputSanitizer.sanitize(input, options);
}

export function sanitizeForShell(input: string): SanitizeResult {
  return inputSanitizer.sanitizeForShell(input);
}

export function sanitizeForSQL(input: string): SanitizeResult {
  return inputSanitizer.sanitizeForSQL(input);
}

export function sanitizePath(input: string): SanitizeResult {
  return inputSanitizer.sanitizePath(input);
}

export function containsDangerousPatterns(input: string): { dangerous: boolean; patterns: string[] } {
  return inputSanitizer.containsDangerousPatterns(input);
}
