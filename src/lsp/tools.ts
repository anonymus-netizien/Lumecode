/**
 * LSP Tools for LLM Function Calling
 * Exposes code intelligence as tools the AI can use
 */

import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  LSPManager,
  createLSPManager,
  FormattedDiagnostic,
  DiagnosticReport,
  detectLanguage,
} from './manager.js';
import { LSPClient } from './client.js';
import type { Tool, ToolResult, ToolCategory } from '../types/index.js';
import {
  CompletionItem,
  Hover,
  Location,
  LocationLink,
  DocumentSymbol,
  SymbolInformation,
  CodeAction,
  TextEdit,
  MarkupContent,
  SignatureHelp,
} from 'vscode-languageserver-protocol';

// ===========================================
// LSP Tools Class
// ===========================================

export class LSPTools {
  private manager: LSPManager;
  private workspaceFolder: string;

  constructor(workspaceFolder: string) {
    this.workspaceFolder = workspaceFolder;
    this.manager = createLSPManager({ workspaceFolder });
  }

  // ===========================================
  // Tool Definitions
  // ===========================================

  getTools(): Tool[] {
    return [
      this.createGetDiagnosticsTool(),
      this.createGetHoverTool(),
      this.createGoToDefinitionTool(),
      this.createFindReferencesTool(),
      this.createGetSymbolsTool(),
      this.createGetCompletionsTool(),
      this.createFormatFileTool(),
      this.createGetCodeActionsTool(),
      this.createGetSignatureHelpTool(),
      this.createRenameTool(),
    ];
  }

  // ===========================================
  // Individual Tool Creators
  // ===========================================

  private createGetDiagnosticsTool(): Tool {
    return {
      name: 'lsp_get_diagnostics',
      description: 'Get code errors, warnings, and issues for a file or all files',
      category: 'code' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path to check (optional - if not provided, returns all diagnostics)',
          },
        },
        required: [],
      },
      execute: async (params: { file?: string }): Promise<ToolResult> => {
        try {
          if (params.file) {
            const filePath = this.resolvePath(params.file);
            await this.manager.openFile(filePath);
            
            // Wait a bit for diagnostics to arrive
            await this.delay(500);
            
            const diagnostics = this.manager.getDiagnostics(filePath);
            return {
              success: true,
              data: this.formatDiagnosticsOutput(filePath, diagnostics),
            };
          }

          const reports = this.manager.getAllDiagnostics();
          if (reports.length === 0) {
            return { success: true, data: 'No diagnostics found' };
          }

          let output = '';
          for (const report of reports) {
            output += this.formatDiagnosticsOutput(report.filePath, report.diagnostics);
            output += '\n';
          }

          return { success: true, data: output.trim() };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGetHoverTool(): Tool {
    return {
      name: 'lsp_hover',
      description: 'Get type information and documentation for a symbol at a position',
      category: 'code' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path',
          },
          line: {
            type: 'number',
            description: 'Line number (1-based)',
          },
          column: {
            type: 'number',
            description: 'Column number (1-based)',
          },
        },
        required: ['file', 'line', 'column'],
      },
      execute: async (params: {
        file: string;
        line: number;
        column: number;
      }): Promise<ToolResult> => {
        try {
          const filePath = this.resolvePath(params.file);
          await this.ensureFileOpen(filePath);

          const hover = await this.manager.getHover(
            filePath,
            params.line - 1, // Convert to 0-based
            params.column - 1
          );

          if (!hover) {
            return { success: true, data: 'No hover information available' };
          }

          return {
            success: true,
            data: this.formatHover(hover),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGoToDefinitionTool(): Tool {
    return {
      name: 'lsp_definition',
      description: 'Go to the definition of a symbol',
      category: 'code' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path',
          },
          line: {
            type: 'number',
            description: 'Line number (1-based)',
          },
          column: {
            type: 'number',
            description: 'Column number (1-based)',
          },
        },
        required: ['file', 'line', 'column'],
      },
      execute: async (params: {
        file: string;
        line: number;
        column: number;
      }): Promise<ToolResult> => {
        try {
          const filePath = this.resolvePath(params.file);
          await this.ensureFileOpen(filePath);

          const definition = await this.manager.getDefinition(
            filePath,
            params.line - 1,
            params.column - 1
          );

          if (!definition) {
            return { success: true, data: 'No definition found' };
          }

          return {
            success: true,
            data: this.formatLocations(definition),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createFindReferencesTool(): Tool {
    return {
      name: 'lsp_references',
      description: 'Find all references to a symbol',
      category: 'code' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path',
          },
          line: {
            type: 'number',
            description: 'Line number (1-based)',
          },
          column: {
            type: 'number',
            description: 'Column number (1-based)',
          },
        },
        required: ['file', 'line', 'column'],
      },
      execute: async (params: {
        file: string;
        line: number;
        column: number;
      }): Promise<ToolResult> => {
        try {
          const filePath = this.resolvePath(params.file);
          await this.ensureFileOpen(filePath);

          const references = await this.manager.getReferences(
            filePath,
            params.line - 1,
            params.column - 1
          );

          if (!references || references.length === 0) {
            return { success: true, data: 'No references found' };
          }

          let output = `Found ${references.length} reference(s):\n`;
          output += this.formatLocations(references);

          return { success: true, data: output };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGetSymbolsTool(): Tool {
    return {
      name: 'lsp_symbols',
      description: 'Get all symbols (functions, classes, variables) in a file',
      category: 'code' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path',
          },
        },
        required: ['file'],
      },
      execute: async (params: { file: string }): Promise<ToolResult> => {
        try {
          const filePath = this.resolvePath(params.file);
          await this.ensureFileOpen(filePath);

          const symbols = await this.manager.getDocumentSymbols(filePath);

          if (!symbols || symbols.length === 0) {
            return { success: true, data: 'No symbols found' };
          }

          return {
            success: true,
            data: this.formatSymbols(symbols),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGetCompletionsTool(): Tool {
    return {
      name: 'lsp_completions',
      description: 'Get code completions at a position',
      category: 'code' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path',
          },
          line: {
            type: 'number',
            description: 'Line number (1-based)',
          },
          column: {
            type: 'number',
            description: 'Column number (1-based)',
          },
          maxItems: {
            type: 'number',
            description: 'Maximum number of completions to return (default: 20)',
          },
        },
        required: ['file', 'line', 'column'],
      },
      execute: async (params: {
        file: string;
        line: number;
        column: number;
        maxItems?: number;
      }): Promise<ToolResult> => {
        try {
          const filePath = this.resolvePath(params.file);
          await this.ensureFileOpen(filePath);

          const completions = await this.manager.getCompletions(
            filePath,
            params.line - 1,
            params.column - 1
          );

          if (completions.length === 0) {
            return { success: true, data: 'No completions available' };
          }

          const maxItems = params.maxItems || 20;
          const limitedCompletions = completions.slice(0, maxItems);

          return {
            success: true,
            data: this.formatCompletions(limitedCompletions, completions.length),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createFormatFileTool(): Tool {
    return {
      name: 'lsp_format',
      description: 'Format a file using the language server',
      category: 'code' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path to format',
          },
          apply: {
            type: 'boolean',
            description: 'Apply the formatting changes to the file (default: false)',
          },
        },
        required: ['file'],
      },
      execute: async (params: { file: string; apply?: boolean }): Promise<ToolResult> => {
        try {
          const filePath = this.resolvePath(params.file);
          await this.ensureFileOpen(filePath);

          const edits = await this.manager.formatDocument(filePath);

          if (!edits || edits.length === 0) {
            return { success: true, data: 'No formatting changes needed' };
          }

          if (params.apply) {
            const content = await fs.readFile(filePath, 'utf-8');
            const newContent = this.applyTextEdits(content, edits);
            await fs.writeFile(filePath, newContent, 'utf-8');
            await this.manager.updateFile(filePath, newContent);

            return {
              success: true,
              data: `Applied ${edits.length} formatting change(s)`,
            };
          }

          return {
            success: true,
            data: `Found ${edits.length} formatting change(s). Use apply: true to apply them.`,
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGetCodeActionsTool(): Tool {
    return {
      name: 'lsp_code_actions',
      description: 'Get available code actions (quick fixes, refactorings) for a range',
      category: 'code' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path',
          },
          startLine: {
            type: 'number',
            description: 'Start line (1-based)',
          },
          startColumn: {
            type: 'number',
            description: 'Start column (1-based)',
          },
          endLine: {
            type: 'number',
            description: 'End line (1-based, optional - defaults to startLine)',
          },
          endColumn: {
            type: 'number',
            description: 'End column (1-based, optional - defaults to startColumn)',
          },
        },
        required: ['file', 'startLine', 'startColumn'],
      },
      execute: async (params: {
        file: string;
        startLine: number;
        startColumn: number;
        endLine?: number;
        endColumn?: number;
      }): Promise<ToolResult> => {
        try {
          const filePath = this.resolvePath(params.file);
          await this.ensureFileOpen(filePath);

          const actions = await this.manager.getCodeActions(
            filePath,
            params.startLine - 1,
            params.startColumn - 1,
            (params.endLine || params.startLine) - 1,
            (params.endColumn || params.startColumn) - 1
          );

          if (!actions || actions.length === 0) {
            return { success: true, data: 'No code actions available' };
          }

          return {
            success: true,
            data: this.formatCodeActions(actions),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createGetSignatureHelpTool(): Tool {
    return {
      name: 'lsp_signature_help',
      description: 'Get function signature help at a position',
      category: 'code' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path',
          },
          line: {
            type: 'number',
            description: 'Line number (1-based)',
          },
          column: {
            type: 'number',
            description: 'Column number (1-based)',
          },
        },
        required: ['file', 'line', 'column'],
      },
      execute: async (params: {
        file: string;
        line: number;
        column: number;
      }): Promise<ToolResult> => {
        try {
          const filePath = this.resolvePath(params.file);
          await this.ensureFileOpen(filePath);

          const help = await this.manager.getSignatureHelp(
            filePath,
            params.line - 1,
            params.column - 1
          );

          if (!help || help.signatures.length === 0) {
            return { success: true, data: 'No signature help available' };
          }

          return {
            success: true,
            data: this.formatSignatureHelp(help),
          };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  private createRenameTool(): Tool {
    return {
      name: 'lsp_rename',
      description: 'Rename a symbol across the codebase',
      category: 'code' as ToolCategory,
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path',
          },
          line: {
            type: 'number',
            description: 'Line number (1-based)',
          },
          column: {
            type: 'number',
            description: 'Column number (1-based)',
          },
          newName: {
            type: 'string',
            description: 'New name for the symbol',
          },
          apply: {
            type: 'boolean',
            description: 'Apply the rename (default: false)',
          },
        },
        required: ['file', 'line', 'column', 'newName'],
      },
      execute: async (params: {
        file: string;
        line: number;
        column: number;
        newName: string;
        apply?: boolean;
      }): Promise<ToolResult> => {
        try {
          const filePath = this.resolvePath(params.file);
          await this.ensureFileOpen(filePath);

          const edit = await this.manager.rename(
            filePath,
            params.line - 1,
            params.column - 1,
            params.newName
          );

          if (!edit || !edit.changes) {
            return { success: true, data: 'No rename changes found' };
          }

          const totalChanges = Object.values(edit.changes).reduce(
            (sum, edits) => sum + edits.length,
            0
          );
          const fileCount = Object.keys(edit.changes).length;

          if (params.apply) {
            // Apply changes to all files
            for (const [uri, edits] of Object.entries(edit.changes)) {
              const editPath = LSPClient.uriToPath(uri);
              const content = await fs.readFile(editPath, 'utf-8');
              const newContent = this.applyTextEdits(content, edits);
              await fs.writeFile(editPath, newContent, 'utf-8');
            }

            return {
              success: true,
              data: `Applied ${totalChanges} change(s) across ${fileCount} file(s)`,
            };
          }

          let output = `Rename would affect ${totalChanges} occurrence(s) in ${fileCount} file(s):\n`;
          for (const [uri, edits] of Object.entries(edit.changes)) {
            output += `  ${LSPClient.uriToPath(uri)}: ${edits.length} change(s)\n`;
          }
          output += '\nUse apply: true to apply the changes.';

          return { success: true, data: output };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    };
  }

  // ===========================================
  // Formatting Helpers
  // ===========================================

  private formatDiagnosticsOutput(
    filePath: string,
    diagnostics: FormattedDiagnostic[]
  ): string {
    if (diagnostics.length === 0) {
      return `${path.basename(filePath)}: No issues found`;
    }

    let output = `${path.basename(filePath)} (${diagnostics.length} issue(s)):\n`;

    for (const d of diagnostics) {
      const icon = d.severity === 'error' ? '❌' : d.severity === 'warning' ? '⚠️' : 'ℹ️';
      output += `  ${icon} Line ${d.line}:${d.column}: ${d.message}`;
      if (d.source) output += ` [${d.source}]`;
      if (d.code) output += ` (${d.code})`;
      output += '\n';
    }

    return output;
  }

  private formatHover(hover: Hover): string {
    const contents = hover.contents;

    if (typeof contents === 'string') {
      return contents;
    }

    if ('kind' in contents && 'value' in contents) {
      return (contents as MarkupContent).value;
    }

    if (Array.isArray(contents)) {
      return contents
        .map((c) => (typeof c === 'string' ? c : c.value))
        .join('\n\n');
    }

    if ('language' in contents && 'value' in contents) {
      return `\`\`\`${contents.language}\n${contents.value}\n\`\`\``;
    }

    return String(contents);
  }

  private formatLocations(
    locations: Location | Location[] | LocationLink[]
  ): string {
    const locs = Array.isArray(locations) ? locations : [locations];

    return locs
      .map((loc) => {
        if ('targetUri' in loc) {
          const linkLoc = loc as LocationLink;
          const filePath = LSPClient.uriToPath(linkLoc.targetUri);
          const line = linkLoc.targetRange.start.line + 1;
          return `${filePath}:${line}`;
        } else {
          const normLoc = loc as Location;
          const filePath = LSPClient.uriToPath(normLoc.uri);
          const line = normLoc.range.start.line + 1;
          return `${filePath}:${line}`;
        }
      })
      .join('\n');
  }

  private formatSymbols(
    symbols: SymbolInformation[] | DocumentSymbol[],
    indent = ''
  ): string {
    let output = '';

    for (const sym of symbols) {
      if ('location' in sym) {
        // SymbolInformation
        const info = sym as SymbolInformation;
        output += `${indent}${this.symbolKindToString(info.kind)} ${info.name}\n`;
      } else {
        // DocumentSymbol
        const doc = sym as DocumentSymbol;
        output += `${indent}${this.symbolKindToString(doc.kind)} ${doc.name}`;
        if (doc.detail) output += ` - ${doc.detail}`;
        output += ` (line ${doc.range.start.line + 1})\n`;

        if (doc.children) {
          output += this.formatSymbols(doc.children, indent + '  ');
        }
      }
    }

    return output;
  }

  private symbolKindToString(kind: number): string {
    const kinds: Record<number, string> = {
      1: '📁', // File
      2: '📦', // Module
      3: '📦', // Namespace
      4: '📦', // Package
      5: '🔷', // Class
      6: '🔹', // Method
      7: '📝', // Property
      8: '📝', // Field
      9: '🔧', // Constructor
      10: '🔢', // Enum
      11: '🔌', // Interface
      12: '⚡', // Function
      13: '📌', // Variable
      14: '🔒', // Constant
      15: '📄', // String
      16: '🔢', // Number
      17: '✅', // Boolean
      18: '📊', // Array
      19: '📋', // Object
      20: '🔑', // Key
      21: '❌', // Null
      22: '🔢', // EnumMember
      23: '📐', // Struct
      24: '🎉', // Event
      25: '➗', // Operator
      26: '📐', // TypeParameter
    };
    return kinds[kind] || '•';
  }

  private formatCompletions(
    completions: CompletionItem[],
    total: number
  ): string {
    let output = `Completions (showing ${completions.length} of ${total}):\n`;

    for (const item of completions) {
      const kind = this.completionKindToString(item.kind);
      output += `  ${kind} ${item.label}`;
      if (item.detail) output += ` - ${item.detail}`;
      output += '\n';
    }

    return output;
  }

  private completionKindToString(kind?: number): string {
    const kinds: Record<number, string> = {
      1: '📄', // Text
      2: '🔹', // Method
      3: '⚡', // Function
      4: '🔧', // Constructor
      5: '📝', // Field
      6: '📌', // Variable
      7: '🔷', // Class
      8: '🔌', // Interface
      9: '📦', // Module
      10: '📝', // Property
      11: '📊', // Unit
      12: '💎', // Value
      13: '🔢', // Enum
      14: '🔑', // Keyword
      15: '✂️', // Snippet
      16: '🎨', // Color
      17: '📁', // File
      18: '🔗', // Reference
      19: '📂', // Folder
      20: '🔢', // EnumMember
      21: '🔒', // Constant
      22: '📐', // Struct
      23: '🎉', // Event
      24: '➗', // Operator
      25: '📐', // TypeParameter
    };
    return kinds[kind || 0] || '•';
  }

  private formatCodeActions(actions: CodeAction[]): string {
    let output = `Code actions (${actions.length}):\n`;

    for (const action of actions) {
      const kind = action.kind || 'quickfix';
      output += `  [${kind}] ${action.title}\n`;
    }

    return output;
  }

  private formatSignatureHelp(help: SignatureHelp): string {
    let output = 'Signatures:\n';

    for (let i = 0; i < help.signatures.length; i++) {
      const sig = help.signatures[i];
      const active = i === (help.activeSignature || 0) ? '→ ' : '  ';
      output += `${active}${sig.label}\n`;

      if (sig.documentation) {
        const doc =
          typeof sig.documentation === 'string'
            ? sig.documentation
            : sig.documentation.value;
        output += `    ${doc}\n`;
      }

      if (sig.parameters) {
        output += '  Parameters:\n';
        for (let j = 0; j < sig.parameters.length; j++) {
          const param = sig.parameters[j];
          const activeParam = j === (help.activeParameter || 0) ? '→ ' : '  ';
          const label = typeof param.label === 'string' ? param.label : param.label.join(', ');
          output += `    ${activeParam}${label}\n`;
        }
      }
    }

    return output;
  }

  // ===========================================
  // Utilities
  // ===========================================

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.workspaceFolder, filePath);
  }

  private async ensureFileOpen(filePath: string): Promise<void> {
    await this.manager.openFile(filePath);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private applyTextEdits(content: string, edits: TextEdit[]): string {
    // Sort edits in reverse order (from end to start)
    const sortedEdits = [...edits].sort((a, b) => {
      const lineDiff = b.range.start.line - a.range.start.line;
      if (lineDiff !== 0) return lineDiff;
      return b.range.start.character - a.range.start.character;
    });

    const lines = content.split('\n');

    for (const edit of sortedEdits) {
      const startLine = edit.range.start.line;
      const startChar = edit.range.start.character;
      const endLine = edit.range.end.line;
      const endChar = edit.range.end.character;

      // Get the content before and after the edit range
      const beforeEdit = lines[startLine].slice(0, startChar);
      const afterEdit = lines[endLine].slice(endChar);

      // Apply the edit
      const newLines = edit.newText.split('\n');
      newLines[0] = beforeEdit + newLines[0];
      newLines[newLines.length - 1] = newLines[newLines.length - 1] + afterEdit;

      // Replace the affected lines
      lines.splice(startLine, endLine - startLine + 1, ...newLines);
    }

    return lines.join('\n');
  }

  /**
   * Shutdown the LSP manager
   */
  async shutdown(): Promise<void> {
    await this.manager.stopAll();
  }
}

// ===========================================
// Factory Functions
// ===========================================

export function createLSPTools(workspaceFolder: string): LSPTools {
  return new LSPTools(workspaceFolder);
}

export function registerLSPTools(workspaceFolder: string): Tool[] {
  const lspTools = createLSPTools(workspaceFolder);
  return lspTools.getTools();
}
