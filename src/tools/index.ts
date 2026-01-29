/**
 * Tools System
 * Exports all tools and the registry
 */

// Types
export * from './types.js';

// Registry (original and enhanced)
export { toolRegistry, ToolRegistry, BaseTool } from './registry.js';
export { enhancedToolRegistry, EnhancedToolRegistry } from './enhanced-registry.js';

// Function Calling Support
export {
  FunctionCallingConverter,
  ToolCallParser,
  ToolExecutor,
  FunctionCallResponseBuilder,
  validateToolCall,
  validateToolResult,
  type OpenAIFunction,
  type GeminiFunction,
  type AnthropicTool,
  type ToolExecutionOptions,
} from './function-calling.js';

// Validation
export {
  ToolValidator,
  validatePath,
  sanitizeString,
  sanitizeCommand,
  createZodSchema,
} from './validator.js';

// Individual tools
export { fileReadTool, FileReadTool } from './file-read.js';
export { fileWriteTool, FileWriteTool } from './file-write.js';
export { fileEditTool, FileEditTool } from './file-edit.js';
export { directoryListTool, DirectoryListTool } from './directory-list.js';
export { terminalExecuteTool, TerminalExecuteTool } from './terminal-execute.js';
export { searchFilesTool, SearchFilesTool } from './search-files.js';

// Enhanced tools
export { 
  enhancedTerminalTool, 
  EnhancedTerminalTool,
  processManager,
  analyzeCommand,
  detectShell,
  type CommandAnalysis,
} from './terminal-enhanced.js';

// Tool initialization
import { toolRegistry } from './registry.js';
import { enhancedToolRegistry } from './enhanced-registry.js';
import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { fileEditTool } from './file-edit.js';
import { directoryListTool } from './directory-list.js';
import { terminalExecuteTool } from './terminal-execute.js';
import { searchFilesTool } from './search-files.js';
import { enhancedTerminalTool } from './terminal-enhanced.js';

/**
 * Initialize all built-in tools (original registry)
 */
export function initializeTools(): void {
  toolRegistry.registerAll([
    fileReadTool,
    fileWriteTool,
    fileEditTool,
    directoryListTool,
    terminalExecuteTool,
    searchFilesTool,
  ]);
}

/**
 * Initialize enhanced tool registry with all tools
 */
export function initializeEnhancedTools(): void {
  enhancedToolRegistry.registerAll([
    fileReadTool,
    fileWriteTool,
    fileEditTool,
    directoryListTool,
    enhancedTerminalTool, // Use enhanced terminal tool
    searchFilesTool,
  ]);
}

/**
 * Get all available tools for LLM function calling (OpenAI format)
 */
export function getToolDefinitionsForLLM(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: import('../types/index.js').ToolParameters;
  };
}> {
  return toolRegistry.getFunctionDefinitions();
}

/**
 * Get OpenAI-compatible function definitions
 */
export function getOpenAIToolDefinitions() {
  return enhancedToolRegistry.getOpenAIFunctions();
}

/**
 * Get Gemini-compatible function definitions  
 */
export function getGeminiToolDefinitions() {
  return enhancedToolRegistry.getGeminiFunctions();
}

// Auto-initialize on import
initializeTools();
initializeEnhancedTools();
