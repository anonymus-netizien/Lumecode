/**
 * Build Agent
 * Full-access implementation agent with file read/write and command execution
 */

import { BaseAgent } from './base.js';
import type {
  LLMMessage,
  LLMResponse,
  Tool,
  ToolCall,
  ToolResult,
  DirectoryTree,
} from '../types/index.js';
import { type BaseProvider } from '../providers/index.js';
import { fileSystem } from '../filesystem/index';

export class BuildAgent extends BaseAgent {
  constructor(provider?: BaseProvider) {
    super('build', provider);
  }

  protected initializeTools(): void {
    // Read file tool
    this.registerTool({
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to read',
          },
        },
        required: ['path'],
      },
      execute: async (args) => this.readFile(args.path as string),
    });

    // Write file tool
    this.registerTool({
      name: 'write_file',
      description: 'Write content to a file (creates or overwrites)',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to write',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
      execute: async (args) => this.writeFile(args.path as string, args.content as string),
    });

    // Run command tool
    this.registerTool({
      name: 'run_command',
      description: 'Execute a shell command',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to execute',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for the command (optional)',
          },
        },
        required: ['command'],
      },
      execute: async (args) => this.runCommand(args.command as string, args.cwd as string | undefined),
    });

    // List directory tool
    this.registerTool({
      name: 'list_directory',
      description: 'List contents of a directory',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory',
          },
        },
        required: ['path'],
      },
      execute: async (args) => this.listDirectory(args.path as string),
    });

    // Create directory tool
    this.registerTool({
      name: 'create_directory',
      description: 'Create a new directory',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path of the directory to create',
          },
        },
        required: ['path'],
      },
      execute: async (args) => this.createDirectory(args.path as string),
    });

    // Delete file tool
    this.registerTool({
      name: 'delete_file',
      description: 'Delete a file',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to delete',
          },
        },
        required: ['path'],
      },
      execute: async (args) => this.deleteFile(args.path as string),
    });

    // Search files tool
    this.registerTool({
      name: 'search_files',
      description: 'Search for files matching a pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern to match files',
          },
          directory: {
            type: 'string',
            description: 'Directory to search in (optional)',
          },
        },
        required: ['pattern'],
      },
      execute: async (args) => this.searchFiles(args.pattern as string, args.directory as string | undefined),
    });
  }

  async process(message: string): Promise<LLMResponse> {
    const messages = this.buildMessages(message);
    
    // Add user message to history
    this.addToHistory({
      role: 'user',
      content: message,
    });

    // Get response from provider
    const response = await this.provider.chat(messages);

    // Add assistant response to history
    this.addToHistory({
      role: 'assistant',
      content: response.content,
    });

    return response;
  }

  async processStream(
    message: string,
    onChunk: (content: string) => void
  ): Promise<LLMResponse> {
    const messages = this.buildMessages(message);
    
    this.addToHistory({
      role: 'user',
      content: message,
    });

    const response = await this.provider.chatStream(messages, (chunk) => {
      if (!chunk.done && chunk.content) {
        onChunk(chunk.content);
      }
    });

    this.addToHistory({
      role: 'assistant',
      content: response.content,
    });

    return response;
  }

  async handleToolCall(call: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(call.name);
    
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${call.name}`,
      };
    }

    try {
      return await tool.execute(call.arguments);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================
  // Tool Implementations
  // ===========================================

  private async readFile(path: string): Promise<ToolResult> {
    try {
      const content = await fileSystem.readFile(path);
      return {
        success: true,
        output: content,
        data: { path, size: content.length },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error}`,
      };
    }
  }

  private async writeFile(path: string, content: string): Promise<ToolResult> {
    if (!this.canPerform('canWriteFiles')) {
      return {
        success: false,
        error: 'Agent does not have permission to write files',
      };
    }

    try {
      await fileSystem.writeFile(path, content);
      return {
        success: true,
        output: `File written: ${path}`,
        data: { path, size: content.length },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file: ${error}`,
      };
    }
  }

  private async runCommand(command: string, cwd?: string): Promise<ToolResult> {
    if (!this.canPerform('canExecuteCommands')) {
      return {
        success: false,
        error: 'Agent does not have permission to execute commands',
      };
    }

    try {
      const workingDir = cwd || this.context?.workingDirectory || process.cwd();
      const result = await fileSystem.executeCommand(command, workingDir);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr || undefined,
        data: { exitCode: result.exitCode },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute command: ${error}`,
      };
    }
  }

  private async listDirectory(path: string): Promise<ToolResult> {
    try {
      const entries = await fileSystem.listDirectory(path);
      const formatted = entries
        .map((e: { name: string; type: 'file' | 'directory' }) => `${e.type === 'directory' ? '📁' : '📄'} ${e.name}`)
        .join('\n');
      
      return {
        success: true,
        output: formatted,
        data: { entries },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list directory: ${error}`,
      };
    }
  }

  private async createDirectory(path: string): Promise<ToolResult> {
    if (!this.canPerform('canWriteFiles')) {
      return {
        success: false,
        error: 'Agent does not have permission to create directories',
      };
    }

    try {
      await fileSystem.createDirectory(path);
      return {
        success: true,
        output: `Directory created: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create directory: ${error}`,
      };
    }
  }

  private async deleteFile(path: string): Promise<ToolResult> {
    if (!this.canPerform('canWriteFiles')) {
      return {
        success: false,
        error: 'Agent does not have permission to delete files',
      };
    }

    try {
      await fileSystem.deleteFile(path);
      return {
        success: true,
        output: `File deleted: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete file: ${error}`,
      };
    }
  }

  private async searchFiles(pattern: string, directory?: string): Promise<ToolResult> {
    try {
      const dir = directory || this.context?.workingDirectory || process.cwd();
      const files = await fileSystem.searchFiles(pattern, dir);
      
      return {
        success: true,
        output: files.length > 0 ? files.join('\n') : 'No files found',
        data: { files, count: files.length },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to search files: ${error}`,
      };
    }
  }
}

export default BuildAgent;
