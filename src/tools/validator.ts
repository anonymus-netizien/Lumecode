/**
 * Tool Validator
 * Comprehensive validation for tool inputs
 */

import { z } from 'zod';
import { resolve, isAbsolute, normalize } from 'path';
import { existsSync, statSync } from 'fs';
import type { ToolParameters, ToolProperty } from '../types/index.js';
import type { ValidationResult, ValidationError, ValidationWarning } from './types.js';

// ===========================================
// Path Validation
// ===========================================

/**
 * Validate and sanitize file path
 */
export function validatePath(
  path: string,
  workingDirectory: string,
  options: {
    mustExist?: boolean;
    mustBeFile?: boolean;
    mustBeDirectory?: boolean;
    allowedPaths?: string[];
    blockedPaths?: string[];
    maxDepth?: number;
  } = {}
): { valid: boolean; resolvedPath: string; error?: string } {
  // Normalize and resolve path
  const normalized = normalize(path);
  const resolved = isAbsolute(normalized) 
    ? normalized 
    : resolve(workingDirectory, normalized);

  // Check for path traversal attacks
  if (!resolved.startsWith(workingDirectory) && !isAbsolute(path)) {
    // Path tries to escape working directory
    const isAllowed = options.allowedPaths?.some(p => resolved.startsWith(p));
    if (!isAllowed) {
      return {
        valid: false,
        resolvedPath: resolved,
        error: `Path traversal detected: ${path} resolves to ${resolved} which is outside working directory`,
      };
    }
  }

  // Check blocked paths
  if (options.blockedPaths?.some(p => resolved.startsWith(p) || resolved.includes(p))) {
    return {
      valid: false,
      resolvedPath: resolved,
      error: `Path is blocked: ${resolved}`,
    };
  }

  // Block sensitive system paths
  const systemPaths = [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers',
    '~/.ssh',
    '~/.gnupg',
    '~/.aws/credentials',
    '/root',
    '/proc',
    '/sys',
  ];
  
  const expandedSystemPaths = systemPaths.map(p => 
    p.startsWith('~') ? p.replace('~', process.env.HOME || '') : p
  );

  for (const sysPath of expandedSystemPaths) {
    if (resolved.startsWith(sysPath) || resolved === sysPath) {
      return {
        valid: false,
        resolvedPath: resolved,
        error: `Access to system path blocked: ${sysPath}`,
      };
    }
  }

  // Check existence
  if (options.mustExist && !existsSync(resolved)) {
    return {
      valid: false,
      resolvedPath: resolved,
      error: `Path does not exist: ${resolved}`,
    };
  }

  // Check file type
  if (existsSync(resolved)) {
    const stats = statSync(resolved);
    
    if (options.mustBeFile && !stats.isFile()) {
      return {
        valid: false,
        resolvedPath: resolved,
        error: `Path is not a file: ${resolved}`,
      };
    }

    if (options.mustBeDirectory && !stats.isDirectory()) {
      return {
        valid: false,
        resolvedPath: resolved,
        error: `Path is not a directory: ${resolved}`,
      };
    }
  }

  // Check depth
  if (options.maxDepth !== undefined) {
    const relPath = resolved.replace(workingDirectory, '');
    const depth = relPath.split('/').filter(Boolean).length;
    if (depth > options.maxDepth) {
      return {
        valid: false,
        resolvedPath: resolved,
        error: `Path exceeds maximum depth of ${options.maxDepth}`,
      };
    }
  }

  return { valid: true, resolvedPath: resolved };
}

// ===========================================
// Input Sanitization
// ===========================================

/**
 * Sanitize string input (remove control characters, limit length)
 */
export function sanitizeString(input: string, maxLength = 10000): string {
  // Remove null bytes and control characters (except newlines and tabs)
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize command for shell execution
 */
export function sanitizeCommand(command: string): { safe: boolean; sanitized: string; warnings: string[] } {
  const warnings: string[] = [];
  let sanitized = command;

  // Remove command injection patterns
  const injectionPatterns = [
    { pattern: /;\s*rm\s/gi, replacement: '; echo BLOCKED_RM ', warning: 'Removed potential rm injection' },
    { pattern: /\$\([^)]+\)/g, replacement: '', warning: 'Removed command substitution $()' },
    { pattern: /`[^`]+`/g, replacement: '', warning: 'Removed backtick command substitution' },
    { pattern: /\|\s*sh\b/gi, replacement: '| cat', warning: 'Changed pipe to sh to pipe to cat' },
    { pattern: /\|\s*bash\b/gi, replacement: '| cat', warning: 'Changed pipe to bash to pipe to cat' },
  ];

  for (const { pattern, replacement, warning } of injectionPatterns) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, replacement);
      warnings.push(warning);
    }
  }

  const safe = warnings.length === 0;
  return { safe, sanitized, warnings };
}

// ===========================================
// Zod Schema Generation
// ===========================================

/**
 * Convert ToolParameters to Zod schema
 */
export function createZodSchema(parameters: ToolParameters): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};

  for (const [key, prop] of Object.entries(parameters.properties)) {
    let fieldSchema = propertyToZod(prop);
    
    // Mark as optional if not required
    if (!parameters.required?.includes(key)) {
      fieldSchema = fieldSchema.optional();
    }

    shape[key] = fieldSchema;
  }

  return z.object(shape);
}

function propertyToZod(prop: ToolProperty): z.ZodTypeAny {
  switch (prop.type) {
    case 'string':
      let strSchema = z.string();
      if (prop.enum) {
        return z.enum(prop.enum as [string, ...string[]]);
      }
      return strSchema;

    case 'number':
      return z.number();

    case 'boolean':
      return z.boolean();

    case 'array':
      if (prop.items) {
        return z.array(propertyToZod(prop.items));
      }
      return z.array(z.unknown());

    case 'object':
      return z.record(z.unknown());

    default:
      return z.unknown();
  }
}

// ===========================================
// Tool Input Validator
// ===========================================

export class ToolValidator {
  private workingDirectory: string;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
  }

  /**
   * Validate tool arguments against parameters schema
   */
  validate(
    toolName: string,
    args: Record<string, unknown>,
    parameters: ToolParameters
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check required fields
    for (const required of parameters.required || []) {
      if (args[required] === undefined || args[required] === null) {
        errors.push({
          field: required,
          message: `Required field '${required}' is missing`,
          code: 'REQUIRED_FIELD_MISSING',
        });
      }
    }

    // Validate each field
    for (const [key, value] of Object.entries(args)) {
      const prop = parameters.properties[key];
      
      if (!prop) {
        warnings.push({
          field: key,
          message: `Unknown field '${key}' will be ignored`,
          suggestion: `Available fields: ${Object.keys(parameters.properties).join(', ')}`,
        });
        continue;
      }

      // Type validation
      const typeError = this.validateType(key, value, prop);
      if (typeError) {
        errors.push(typeError);
        continue;
      }

      // Path validation for file tools
      if (key === 'path' && typeof value === 'string') {
        const pathResult = validatePath(value, this.workingDirectory, { mustExist: false });
        if (!pathResult.valid) {
          errors.push({
            field: key,
            message: pathResult.error || 'Invalid path',
            code: 'INVALID_PATH',
          });
        }
      }

      // String length warnings
      if (typeof value === 'string' && value.length > 100000) {
        warnings.push({
          field: key,
          message: `Field '${key}' is very long (${value.length} chars)`,
          suggestion: 'Consider breaking into smaller chunks',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateType(
    field: string,
    value: unknown,
    prop: ToolProperty
  ): ValidationError | null {
    const actualType = typeof value;

    switch (prop.type) {
      case 'string':
        if (actualType !== 'string') {
          return {
            field,
            message: `Expected string, got ${actualType}`,
            code: 'TYPE_MISMATCH',
          };
        }
        if (prop.enum && !prop.enum.includes(value as string)) {
          return {
            field,
            message: `Value must be one of: ${prop.enum.join(', ')}`,
            code: 'INVALID_ENUM',
          };
        }
        break;

      case 'number':
        if (actualType !== 'number' || isNaN(value as number)) {
          return {
            field,
            message: `Expected number, got ${actualType}`,
            code: 'TYPE_MISMATCH',
          };
        }
        break;

      case 'boolean':
        if (actualType !== 'boolean') {
          return {
            field,
            message: `Expected boolean, got ${actualType}`,
            code: 'TYPE_MISMATCH',
          };
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return {
            field,
            message: `Expected array, got ${actualType}`,
            code: 'TYPE_MISMATCH',
          };
        }
        break;

      case 'object':
        if (actualType !== 'object' || value === null || Array.isArray(value)) {
          return {
            field,
            message: `Expected object, got ${actualType}`,
            code: 'TYPE_MISMATCH',
          };
        }
        break;
    }

    return null;
  }

  /**
   * Sanitize and validate tool arguments
   */
  sanitizeAndValidate(
    toolName: string,
    args: Record<string, unknown>,
    parameters: ToolParameters
  ): { args: Record<string, unknown>; validation: ValidationResult } {
    const sanitizedArgs: Record<string, unknown> = {};

    // Sanitize each field
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        sanitizedArgs[key] = sanitizeString(value);
      } else {
        sanitizedArgs[key] = value;
      }
    }

    // Validate
    const validation = this.validate(toolName, sanitizedArgs, parameters);

    return { args: sanitizedArgs, validation };
  }
}

// ===========================================
// Export Utility Functions
// ===========================================

export { z };
