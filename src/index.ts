/**
 * Lumecode - AI-powered coding that's private, open, and beautiful
 * Main entry point
 */

// Export all modules
export * from './types/index.js';
export * from './config/index.js';
export * from './providers/index.js';
export * from './agents/index.js';
export * from './session/index.js';
export * from './filesystem/index.js';
export * from './context/index.js';
export * from './engine/index.js';
export * from './utils/index.js';

// Export UI for programmatic use
export { startTUI } from './ui/index.js';
