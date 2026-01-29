/**
 * LSP Manager
 * Manages multiple language server clients for a workspace
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import {
  LSPClient,
  createLSPClient,
  LanguageServerConfig,
  LANGUAGE_SERVERS,
} from './client.js';
import {
  Diagnostic,
  Position,
  Range,
  CompletionItem,
  Hover,
  Location,
  LocationLink,
  DocumentSymbol,
  SymbolInformation,
  CodeAction,
  TextEdit,
  WorkspaceEdit,
  SignatureHelp,
  DiagnosticSeverity,
} from 'vscode-languageserver-protocol';

// ===========================================
// Types
// ===========================================

export interface LSPManagerOptions {
  workspaceFolder: string;
  autoStart?: boolean;
  languages?: string[];
}

export interface DiagnosticReport {
  uri: string;
  filePath: string;
  diagnostics: FormattedDiagnostic[];
}

export interface FormattedDiagnostic {
  severity: 'error' | 'warning' | 'information' | 'hint';
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  source?: string;
  code?: string | number;
}

// ===========================================
// Language Detection
// ===========================================

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'typescript',
  '.jsx': 'typescript',
  '.mts': 'typescript',
  '.mjs': 'typescript',
  '.py': 'python',
  '.pyw': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.json': 'json',
  '.jsonc': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',
};

export function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] || null;
}

export function getLanguageId(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  const langIds: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.mts': 'typescript',
    '.mjs': 'javascript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.json': 'json',
    '.jsonc': 'jsonc',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
  };

  return langIds[ext] || 'plaintext';
}

// ===========================================
// LSP Manager
// ===========================================

export class LSPManager extends EventEmitter {
  private clients: Map<string, LSPClient> = new Map();
  private options: LSPManagerOptions;
  private openDocuments: Map<string, string> = new Map(); // uri -> language

  constructor(options: LSPManagerOptions) {
    super();
    this.options = {
      autoStart: true,
      ...options,
    };
  }

  // ===========================================
  // Client Management
  // ===========================================

  /**
   * Get or create a client for a language
   */
  async getClient(language: string): Promise<LSPClient | null> {
    // Check if client exists
    let client = this.clients.get(language);
    if (client) {
      return client;
    }

    // Check if we support this language
    const serverConfig = LANGUAGE_SERVERS[language];
    if (!serverConfig) {
      return null;
    }

    // Create new client
    client = createLSPClient({
      workspaceFolder: this.options.workspaceFolder,
      serverConfig: {
        id: language,
        ...serverConfig,
      },
      onDiagnostics: (uri, diagnostics) => {
        this.emit('diagnostics', uri, diagnostics);
      },
    });

    // Setup event forwarding
    client.on('error', (error) => this.emit('error', language, error));
    client.on('exit', (code) => {
      this.emit('exit', language, code);
      this.clients.delete(language);
    });

    this.clients.set(language, client);

    // Auto-start if configured
    if (this.options.autoStart) {
      try {
        await client.start();
        this.emit('started', language);
      } catch (error) {
        this.emit('error', language, error);
        this.clients.delete(language);
        return null;
      }
    }

    return client;
  }

  /**
   * Get client for a file
   */
  async getClientForFile(filePath: string): Promise<LSPClient | null> {
    const language = detectLanguage(filePath);
    if (!language) return null;
    return this.getClient(language);
  }

  /**
   * Start a specific language server
   */
  async startServer(language: string): Promise<boolean> {
    const client = await this.getClient(language);
    if (!client) return false;

    try {
      await client.start();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stop a specific language server
   */
  async stopServer(language: string): Promise<void> {
    const client = this.clients.get(language);
    if (client) {
      await client.stop();
      this.clients.delete(language);
    }
  }

  /**
   * Stop all language servers
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.clients.values()).map((client) =>
      client.stop()
    );
    await Promise.all(stopPromises);
    this.clients.clear();
  }

  /**
   * Get running servers
   */
  getRunningServers(): string[] {
    return Array.from(this.clients.entries())
      .filter(([_, client]) => client.isRunning())
      .map(([language]) => language);
  }

  // ===========================================
  // Document Management
  // ===========================================

  /**
   * Open a file in the appropriate language server
   */
  async openFile(filePath: string): Promise<void> {
    const client = await this.getClientForFile(filePath);
    if (!client) return;

    const uri = LSPClient.pathToUri(filePath);
    const languageId = getLanguageId(filePath);
    const content = await fs.readFile(filePath, 'utf-8');

    await client.openDocument(uri, content, languageId);
    this.openDocuments.set(uri, detectLanguage(filePath)!);
  }

  /**
   * Update file content
   */
  async updateFile(filePath: string, content: string): Promise<void> {
    const uri = LSPClient.pathToUri(filePath);
    const language = this.openDocuments.get(uri);
    if (!language) return;

    const client = this.clients.get(language);
    if (client) {
      await client.changeDocument(uri, content);
    }
  }

  /**
   * Close a file
   */
  async closeFile(filePath: string): Promise<void> {
    const uri = LSPClient.pathToUri(filePath);
    const language = this.openDocuments.get(uri);
    if (!language) return;

    const client = this.clients.get(language);
    if (client) {
      await client.closeDocument(uri);
    }
    this.openDocuments.delete(uri);
  }

  /**
   * Save notification
   */
  async saveFile(filePath: string): Promise<void> {
    const uri = LSPClient.pathToUri(filePath);
    const language = this.openDocuments.get(uri);
    if (!language) return;

    const client = this.clients.get(language);
    if (client) {
      await client.saveDocument(uri);
    }
  }

  // ===========================================
  // Code Intelligence
  // ===========================================

  /**
   * Get completions for a file at a position
   */
  async getCompletions(
    filePath: string,
    line: number,
    character: number
  ): Promise<CompletionItem[]> {
    const client = await this.getClientForFile(filePath);
    if (!client) return [];

    const uri = LSPClient.pathToUri(filePath);
    return client.getCompletions(uri, { line, character });
  }

  /**
   * Get hover information
   */
  async getHover(
    filePath: string,
    line: number,
    character: number
  ): Promise<Hover | null> {
    const client = await this.getClientForFile(filePath);
    if (!client) return null;

    const uri = LSPClient.pathToUri(filePath);
    return client.getHover(uri, { line, character });
  }

  /**
   * Go to definition
   */
  async getDefinition(
    filePath: string,
    line: number,
    character: number
  ): Promise<Location | Location[] | LocationLink[] | null> {
    const client = await this.getClientForFile(filePath);
    if (!client) return null;

    const uri = LSPClient.pathToUri(filePath);
    return client.getDefinition(uri, { line, character });
  }

  /**
   * Find references
   */
  async getReferences(
    filePath: string,
    line: number,
    character: number
  ): Promise<Location[] | null> {
    const client = await this.getClientForFile(filePath);
    if (!client) return null;

    const uri = LSPClient.pathToUri(filePath);
    return client.getReferences(uri, { line, character });
  }

  /**
   * Get document symbols
   */
  async getDocumentSymbols(
    filePath: string
  ): Promise<SymbolInformation[] | DocumentSymbol[] | null> {
    const client = await this.getClientForFile(filePath);
    if (!client) return null;

    const uri = LSPClient.pathToUri(filePath);
    return client.getDocumentSymbols(uri);
  }

  /**
   * Get signature help
   */
  async getSignatureHelp(
    filePath: string,
    line: number,
    character: number
  ): Promise<SignatureHelp | null> {
    const client = await this.getClientForFile(filePath);
    if (!client) return null;

    const uri = LSPClient.pathToUri(filePath);
    return client.getSignatureHelp(uri, { line, character });
  }

  /**
   * Rename symbol
   */
  async rename(
    filePath: string,
    line: number,
    character: number,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    const client = await this.getClientForFile(filePath);
    if (!client) return null;

    const uri = LSPClient.pathToUri(filePath);
    return client.rename(uri, { line, character }, newName);
  }

  /**
   * Get code actions
   */
  async getCodeActions(
    filePath: string,
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number
  ): Promise<CodeAction[] | null> {
    const client = await this.getClientForFile(filePath);
    if (!client) return null;

    const uri = LSPClient.pathToUri(filePath);
    const range: Range = {
      start: { line: startLine, character: startChar },
      end: { line: endLine, character: endChar },
    };
    return client.getCodeActions(uri, range);
  }

  /**
   * Format document
   */
  async formatDocument(filePath: string): Promise<TextEdit[] | null> {
    const client = await this.getClientForFile(filePath);
    if (!client) return null;

    const uri = LSPClient.pathToUri(filePath);
    return client.formatDocument(uri);
  }

  // ===========================================
  // Diagnostics
  // ===========================================

  /**
   * Get diagnostics for a file
   */
  getDiagnostics(filePath: string): FormattedDiagnostic[] {
    const uri = LSPClient.pathToUri(filePath);
    const language = this.openDocuments.get(uri);
    if (!language) return [];

    const client = this.clients.get(language);
    if (!client) return [];

    return this.formatDiagnostics(client.getDiagnostics(uri));
  }

  /**
   * Get all diagnostics
   */
  getAllDiagnostics(): DiagnosticReport[] {
    const reports: DiagnosticReport[] = [];

    for (const client of this.clients.values()) {
      for (const [uri, diagnostics] of client.getAllDiagnostics()) {
        reports.push({
          uri,
          filePath: LSPClient.uriToPath(uri),
          diagnostics: this.formatDiagnostics(diagnostics),
        });
      }
    }

    return reports;
  }

  /**
   * Format diagnostics to a readable format
   */
  private formatDiagnostics(diagnostics: Diagnostic[]): FormattedDiagnostic[] {
    return diagnostics.map((d) => ({
      severity: this.severityToString(d.severity),
      message: d.message,
      line: d.range.start.line + 1, // Convert to 1-based
      column: d.range.start.character + 1,
      endLine: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
      source: d.source,
      code: typeof d.code === 'object' ? String((d.code as { value: unknown }).value) : d.code,
    }));
  }

  /**
   * Convert severity to string
   */
  private severityToString(
    severity?: DiagnosticSeverity
  ): FormattedDiagnostic['severity'] {
    switch (severity) {
      case DiagnosticSeverity.Error:
        return 'error';
      case DiagnosticSeverity.Warning:
        return 'warning';
      case DiagnosticSeverity.Information:
        return 'information';
      case DiagnosticSeverity.Hint:
        return 'hint';
      default:
        return 'information';
    }
  }

  // ===========================================
  // Utilities
  // ===========================================

  /**
   * Check if a language server is available
   */
  isLanguageSupported(language: string): boolean {
    return language in LANGUAGE_SERVERS;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return Object.keys(LANGUAGE_SERVERS);
  }
}

// ===========================================
// Factory Function
// ===========================================

export function createLSPManager(options: LSPManagerOptions): LSPManager {
  return new LSPManager(options);
}
