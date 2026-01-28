/**
 * Context Builder
 * Intelligently builds context for LLM requests
 */

import { fileSystem } from '../filesystem/index.js';
import type {
  FileContext,
  GitInfo,
  ContextConfig,
  BuiltContext,
  AgentRole,
} from '../types/index.js';
import { AGENT_PROMPTS } from '../agents/prompts.js';

// ===========================================
// Token Estimation
// ===========================================

/**
 * Rough token estimation (4 chars ~= 1 token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ===========================================
// Context Builder Class
// ===========================================

class ContextBuilder {
  private config: ContextConfig = {
    maxTokens: 100000, // Default for Gemini
    includeGitInfo: true,
    includeEnvVars: false,
    filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.md'],
    excludePatterns: ['node_modules', 'dist', 'build', '.git', '*.lock'],
  };

  /**
   * Set configuration
   */
  configure(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Build context for a request
   */
  async build(options: {
    agentRole: AgentRole;
    workingDirectory: string;
    selectedFiles?: string[];
    userMessage?: string;
  }): Promise<BuiltContext> {
    const { agentRole, workingDirectory, selectedFiles, userMessage } = options;
    
    // Start with system prompt
    let systemPrompt = AGENT_PROMPTS[agentRole];
    let tokenCount = estimateTokens(systemPrompt);

    // Add working directory context
    systemPrompt += `\n\n## Working Directory\n${workingDirectory}`;

    // Get git info if enabled
    let gitInfo: GitInfo | undefined;
    if (this.config.includeGitInfo) {
      const info = await fileSystem.getGitInfo(workingDirectory);
      if (info) {
        gitInfo = info;
        systemPrompt += `\n\n## Git Status\n`;
        systemPrompt += `Branch: ${info.branch}\n`;
        systemPrompt += `Dirty: ${info.isDirty}\n`;
        if (info.lastCommit) {
          systemPrompt += `Last Commit: ${info.lastCommit.message} (${info.lastCommit.hash.slice(0, 7)})\n`;
        }
      }
    }

    // Load files
    const files: FileContext[] = [];
    const filesToLoad = selectedFiles || await this.autoSelectFiles(workingDirectory);
    
    for (const filePath of filesToLoad) {
      try {
        const fileContext = await fileSystem.readFileWithContext(filePath);
        const fileTokens = estimateTokens(fileContext.content);
        
        // Check if we have room for this file
        if (tokenCount + fileTokens < this.config.maxTokens * 0.8) {
          files.push(fileContext);
          tokenCount += fileTokens;
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Add file summaries to system prompt
    if (files.length > 0) {
      systemPrompt += `\n\n## Loaded Files (${files.length})\n`;
      for (const file of files) {
        systemPrompt += `- ${file.path} (${file.language})\n`;
      }
    }

    tokenCount = estimateTokens(systemPrompt);

    return {
      systemPrompt,
      files,
      gitInfo,
      tokenCount,
    };
  }

  /**
   * Auto-select relevant files based on project structure
   */
  async autoSelectFiles(workingDirectory: string): Promise<string[]> {
    const files: string[] = [];
    
    // Priority files to always include if they exist
    const priorityFiles = [
      'package.json',
      'tsconfig.json',
      'README.md',
      '.env.example',
      'Cargo.toml',
      'go.mod',
      'requirements.txt',
      'pyproject.toml',
      'pom.xml',
      'build.gradle',
    ];

    for (const file of priorityFiles) {
      const exists = await fileSystem.exists(
        `${workingDirectory}/${file}`
      );
      if (exists) {
        files.push(`${workingDirectory}/${file}`);
      }
    }

    // Get directory tree for more intelligent selection
    try {
      const tree = await fileSystem.getDirectoryTree(workingDirectory, {
        maxDepth: 3,
        includeHidden: false,
      });

      // Collect source files from common directories
      const sourceDirs = ['src', 'lib', 'app', 'pages', 'components'];
      
      const collectFiles = (
        node: typeof tree,
        depth: number = 0
      ): void => {
        if (depth > 2) return;
        
        if (node.type === 'file') {
          const ext = node.name.split('.').pop();
          if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go'].includes(ext || '')) {
            files.push(node.path);
          }
        } else if (node.children) {
          // Prioritize source directories
          if (sourceDirs.includes(node.name) || depth === 0) {
            for (const child of node.children.slice(0, 20)) {
              collectFiles(child, depth + 1);
            }
          }
        }
      };

      collectFiles(tree);
    } catch {
      // Directory tree not available
    }

    // Limit total files
    return files.slice(0, 50);
  }

  /**
   * Build context for a specific file focus
   */
  async buildForFile(
    filePath: string,
    agentRole: AgentRole = 'build'
  ): Promise<BuiltContext> {
    const workingDirectory = fileSystem.getWorkingDirectory();
    
    // Get the target file
    const targetFile = await fileSystem.readFileWithContext(filePath);
    
    // Find related files (imports, similar names)
    const relatedFiles = await this.findRelatedFiles(filePath);
    
    return this.build({
      agentRole,
      workingDirectory,
      selectedFiles: [filePath, ...relatedFiles],
    });
  }

  /**
   * Find files related to a given file
   */
  async findRelatedFiles(filePath: string): Promise<string[]> {
    const related: string[] = [];
    const workingDirectory = fileSystem.getWorkingDirectory();

    try {
      // Read the target file and look for imports
      const content = await fileSystem.readFile(filePath);
      
      // Simple import detection (TypeScript/JavaScript)
      const importRegex = /(?:import|from|require)\s*[('"]([^'"]+)['"]/g;
      let match;
      
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        
        // Skip node_modules imports
        if (!importPath.startsWith('.')) continue;

        // Try to resolve the import
        const basePath = filePath.replace(/[^/]+$/, '');
        const possibleExtensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
        
        for (const ext of possibleExtensions) {
          const fullPath = `${basePath}${importPath}${ext}`;
          if (await fileSystem.exists(fullPath)) {
            related.push(fullPath);
            break;
          }
        }
      }
    } catch {
      // File not readable
    }

    return related.slice(0, 10);
  }

  /**
   * Get token count for a set of files
   */
  async estimateContextSize(files: string[]): Promise<{
    totalTokens: number;
    fileTokens: Array<{ path: string; tokens: number }>;
  }> {
    const fileTokens: Array<{ path: string; tokens: number }> = [];
    let totalTokens = 0;

    for (const file of files) {
      try {
        const content = await fileSystem.readFile(file);
        const tokens = estimateTokens(content);
        fileTokens.push({ path: file, tokens });
        totalTokens += tokens;
      } catch {
        fileTokens.push({ path: file, tokens: 0 });
      }
    }

    return { totalTokens, fileTokens };
  }

  /**
   * Optimize context to fit within token limit
   */
  async optimizeContext(
    files: FileContext[],
    maxTokens: number
  ): Promise<FileContext[]> {
    // Sort files by importance (smaller files first, then by relevance)
    const sortedFiles = [...files].sort((a, b) => {
      // Prioritize config files
      const configFiles = ['package.json', 'tsconfig.json', 'README.md'];
      const aIsConfig = configFiles.some((c) => a.path.endsWith(c));
      const bIsConfig = configFiles.some((c) => b.path.endsWith(c));
      
      if (aIsConfig && !bIsConfig) return -1;
      if (!aIsConfig && bIsConfig) return 1;
      
      // Then by size
      return a.content.length - b.content.length;
    });

    const result: FileContext[] = [];
    let currentTokens = 0;

    for (const file of sortedFiles) {
      const tokens = estimateTokens(file.content);
      if (currentTokens + tokens <= maxTokens) {
        result.push(file);
        currentTokens += tokens;
      } else {
        // Try to include a truncated version
        const remainingTokens = maxTokens - currentTokens;
        if (remainingTokens > 500) {
          const truncatedContent = file.content.slice(0, remainingTokens * 4);
          result.push({
            ...file,
            content: truncatedContent + '\n\n... (truncated)',
          });
        }
        break;
      }
    }

    return result;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const contextBuilder = new ContextBuilder();
export { ContextBuilder, estimateTokens };
