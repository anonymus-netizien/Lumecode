/**
 * Git Integration Module
 * Provides Git operations, auto-commit, and conflict resolution
 */

// Core repository operations
export {
  GitRepository,
  createGitRepository,
  type GitStatus,
  type FileChange,
  type GitCommitInfo,
  type GitDiff,
  type DiffFile,
  type DiffHunk,
  type GitBranch,
  type GitRemote,
  type GitStash,
} from './repository.js';

// Auto-commit functionality
export {
  AutoCommitManager,
  createAutoCommitManager,
  type AutoCommitConfig,
  type CommitSuggestion,
} from './auto-commit.js';

// LLM tools for Git operations
export {
  GitTools,
  createGitTools,
  registerGitTools,
} from './tools.js';

// Conflict resolution
export {
  ConflictParser,
  ConflictManager,
  ConflictTools,
  createConflictManager,
  createConflictTools,
  registerConflictTools,
  type ConflictInfo,
  type ConflictRegion,
  type ConflictResolution,
} from './conflicts.js';

// ===========================================
// Convenience Function: Register All Git Tools
// ===========================================

import type { Tool } from '../types/index.js';
import { registerGitTools } from './tools.js';
import { registerConflictTools } from './conflicts.js';

/**
 * Register all Git-related tools for LLM function calling
 */
export function registerAllGitTools(workingDirectory: string): Tool[] {
  return [
    ...registerGitTools(workingDirectory),
    ...registerConflictTools(workingDirectory),
  ];
}
