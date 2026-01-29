/**
 * LSP Client Manager
 * Manages connections to language servers for code intelligence
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  createMessageConnection,
  MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node.js';
import {
  InitializeParams,
  InitializeResult,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  CompletionItem,
  Hover,
  Location,
  LocationLink,
  SymbolInformation,
  DocumentSymbol,
  WorkspaceEdit,
  CodeAction,
  TextEdit,
  SignatureHelp,
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Range,
  TextDocumentIdentifier,
  VersionedTextDocumentIdentifier,
  TextDocumentItem,
} from 'vscode-languageserver-protocol';

// ===========================================
// Types
// ===========================================

export interface LanguageServerConfig {
  id: string;
  name: string;
  languages: string[];
  command: string;
  args?: string[];
  rootPath?: string;
  initializationOptions?: Record<string, unknown>;
}

export interface LSPClientOptions {
  workspaceFolder: string;
  serverConfig: LanguageServerConfig;
  onDiagnostics?: (uri: string, diagnostics: Diagnostic[]) => void;
}

export interface DocumentState {
  uri: string;
  version: number;
  content: string;
  languageId: string;
}

// ===========================================
// Built-in Server Configurations
// ===========================================

export const LANGUAGE_SERVERS: Record<string, Omit<LanguageServerConfig, 'id'>> = {
  typescript: {
    name: 'TypeScript Language Server',
    languages: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    command: 'typescript-language-server',
    args: ['--stdio'],
  },
  python: {
    name: 'Pylsp',
    languages: ['python'],
    command: 'pylsp',
    args: [],
  },
  rust: {
    name: 'Rust Analyzer',
    languages: ['rust'],
    command: 'rust-analyzer',
    args: [],
  },
  go: {
    name: 'gopls',
    languages: ['go'],
    command: 'gopls',
    args: ['serve'],
  },
  json: {
    name: 'JSON Language Server',
    languages: ['json', 'jsonc'],
    command: 'vscode-json-language-server',
    args: ['--stdio'],
  },
  html: {
    name: 'HTML Language Server',
    languages: ['html', 'htm'],
    command: 'vscode-html-language-server',
    args: ['--stdio'],
  },
  css: {
    name: 'CSS Language Server',
    languages: ['css', 'scss', 'less'],
    command: 'vscode-css-language-server',
    args: ['--stdio'],
  },
  java: {
    name: 'Eclipse JDT.LS',
    languages: ['java'],
    command: 'jdtls',
    args: [],
  },
};

// ===========================================
// LSP Client
// ===========================================

export class LSPClient extends EventEmitter {
  private connection: MessageConnection | null = null;
  private process: ChildProcess | null = null;
  private serverCapabilities: InitializeResult['capabilities'] | null = null;
  private documents: Map<string, DocumentState> = new Map();
  private diagnostics: Map<string, Diagnostic[]> = new Map();
  private options: LSPClientOptions;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(options: LSPClientOptions) {
    super();
    this.options = options;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /**
   * Start the language server
   */
  async start(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._start();
    return this.initPromise;
  }

  private async _start(): Promise<void> {
    const { serverConfig, workspaceFolder } = this.options;

    // Check if server command exists
    const commandExists = await this.checkCommand(serverConfig.command);
    if (!commandExists) {
      throw new Error(`Language server not found: ${serverConfig.command}. Please install it first.`);
    }

    // Spawn the server process
    this.process = spawn(serverConfig.command, serverConfig.args || [], {
      cwd: workspaceFolder,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Failed to create language server process');
    }

    // Create JSON-RPC connection
    this.connection = createMessageConnection(
      new StreamMessageReader(this.process.stdout),
      new StreamMessageWriter(this.process.stdin)
    );

    // Handle server errors
    this.process.stderr?.on('data', (data) => {
      this.emit('error', new Error(`LSP Server Error: ${data.toString()}`));
    });

    this.process.on('exit', (code) => {
      this.emit('exit', code);
      this.initialized = false;
    });

    // Setup notification handlers
    this.setupNotificationHandlers();

    // Start listening
    this.connection.listen();

    // Initialize the server
    await this.initialize();
  }

  /**
   * Initialize the language server
   */
  private async initialize(): Promise<void> {
    if (!this.connection) throw new Error('Connection not established');

    const { workspaceFolder, serverConfig } = this.options;

    const initParams: InitializeParams = {
      processId: process.pid,
      rootUri: `file://${workspaceFolder}`,
      rootPath: workspaceFolder,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: true,
            willSave: true,
            willSaveWaitUntil: true,
            didSave: true,
          },
          completion: {
            dynamicRegistration: true,
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true,
              preselectSupport: true,
            },
            contextSupport: true,
          },
          hover: {
            dynamicRegistration: true,
            contentFormat: ['markdown', 'plaintext'],
          },
          signatureHelp: {
            dynamicRegistration: true,
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: {
                labelOffsetSupport: true,
              },
            },
            contextSupport: true,
          },
          definition: {
            dynamicRegistration: true,
            linkSupport: true,
          },
          references: {
            dynamicRegistration: true,
          },
          documentSymbol: {
            dynamicRegistration: true,
            hierarchicalDocumentSymbolSupport: true,
          },
          codeAction: {
            dynamicRegistration: true,
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [
                  'quickfix',
                  'refactor',
                  'refactor.extract',
                  'refactor.inline',
                  'refactor.rewrite',
                  'source',
                  'source.organizeImports',
                ],
              },
            },
          },
          formatting: {
            dynamicRegistration: true,
          },
          rename: {
            dynamicRegistration: true,
            prepareSupport: true,
          },
          publishDiagnostics: {
            relatedInformation: true,
            tagSupport: {
              valueSet: [1, 2], // Unnecessary, Deprecated
            },
          },
        },
        workspace: {
          workspaceFolders: true,
          didChangeConfiguration: {
            dynamicRegistration: true,
          },
          symbol: {
            dynamicRegistration: true,
          },
        },
      },
      workspaceFolders: [
        {
          uri: `file://${workspaceFolder}`,
          name: path.basename(workspaceFolder),
        },
      ],
      initializationOptions: serverConfig.initializationOptions,
    };

    const result = await this.connection.sendRequest<InitializeResult>(
      'initialize',
      initParams
    );

    this.serverCapabilities = result.capabilities;

    // Send initialized notification
    this.connection.sendNotification('initialized', {});

    this.initialized = true;
    this.emit('initialized', result);
  }

  /**
   * Stop the language server
   */
  async stop(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.sendRequest('shutdown');
        this.connection.sendNotification('exit');
      } catch {
        // Ignore errors during shutdown
      }
      this.connection.dispose();
      this.connection = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * Check if a command exists
   */
  private async checkCommand(command: string): Promise<boolean> {
    try {
      const { execSync } = await import('child_process');
      execSync(`which ${command}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Setup notification handlers
   */
  private setupNotificationHandlers(): void {
    if (!this.connection) return;

    // Handle diagnostics
    this.connection.onNotification(
      'textDocument/publishDiagnostics',
      (params: { uri: string; diagnostics: Diagnostic[] }) => {
        this.diagnostics.set(params.uri, params.diagnostics);
        this.emit('diagnostics', params.uri, params.diagnostics);
        this.options.onDiagnostics?.(params.uri, params.diagnostics);
      }
    );
  }

  // ===========================================
  // Document Management
  // ===========================================

  /**
   * Open a document in the language server
   */
  async openDocument(uri: string, content: string, languageId: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.connection) return;

    const version = 1;
    this.documents.set(uri, { uri, version, content, languageId });

    const params: TextDocumentItem = {
      uri,
      languageId,
      version,
      text: content,
    };

    this.connection.sendNotification('textDocument/didOpen', {
      textDocument: params,
    });
  }

  /**
   * Update a document's content
   */
  async changeDocument(uri: string, content: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.connection) return;

    const doc = this.documents.get(uri);
    if (!doc) {
      throw new Error(`Document not opened: ${uri}`);
    }

    doc.version++;
    doc.content = content;

    const params: VersionedTextDocumentIdentifier = {
      uri,
      version: doc.version,
    };

    this.connection.sendNotification('textDocument/didChange', {
      textDocument: params,
      contentChanges: [{ text: content }],
    });
  }

  /**
   * Close a document
   */
  async closeDocument(uri: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.connection) return;

    this.documents.delete(uri);

    const params: TextDocumentIdentifier = { uri };

    this.connection.sendNotification('textDocument/didClose', {
      textDocument: params,
    });
  }

  /**
   * Notify document save
   */
  async saveDocument(uri: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.connection) return;

    const doc = this.documents.get(uri);
    if (!doc) return;

    this.connection.sendNotification('textDocument/didSave', {
      textDocument: { uri },
      text: doc.content,
    });
  }

  // ===========================================
  // Code Intelligence
  // ===========================================

  /**
   * Get completions at a position
   */
  async getCompletions(
    uri: string,
    position: Position
  ): Promise<CompletionItem[]> {
    await this.ensureInitialized();
    if (!this.connection) return [];

    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position,
    };

    try {
      const result = await this.connection.sendRequest<CompletionItem[] | { items: CompletionItem[] }>(
        'textDocument/completion',
        params
      );

      if (!result) return [];
      return Array.isArray(result) ? result : result.items;
    } catch (error) {
      this.emit('error', error);
      return [];
    }
  }

  /**
   * Get hover information
   */
  async getHover(uri: string, position: Position): Promise<Hover | null> {
    await this.ensureInitialized();
    if (!this.connection) return null;

    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position,
    };

    try {
      return await this.connection.sendRequest<Hover | null>('textDocument/hover', params);
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Go to definition
   */
  async getDefinition(
    uri: string,
    position: Position
  ): Promise<Location | Location[] | LocationLink[] | null> {
    await this.ensureInitialized();
    if (!this.connection) return null;

    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position,
    };

    try {
      return await this.connection.sendRequest<Location | Location[] | LocationLink[] | null>('textDocument/definition', params);
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Find references
   */
  async getReferences(
    uri: string,
    position: Position,
    includeDeclaration = true
  ): Promise<Location[] | null> {
    await this.ensureInitialized();
    if (!this.connection) return null;

    try {
      return await this.connection.sendRequest<Location[] | null>('textDocument/references', {
        textDocument: { uri },
        position,
        context: { includeDeclaration },
      });
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Get document symbols
   */
  async getDocumentSymbols(
    uri: string
  ): Promise<SymbolInformation[] | DocumentSymbol[] | null> {
    await this.ensureInitialized();
    if (!this.connection) return null;

    try {
      return await this.connection.sendRequest<SymbolInformation[] | DocumentSymbol[] | null>('textDocument/documentSymbol', {
        textDocument: { uri },
      });
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Get signature help
   */
  async getSignatureHelp(
    uri: string,
    position: Position
  ): Promise<SignatureHelp | null> {
    await this.ensureInitialized();
    if (!this.connection) return null;

    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position,
    };

    try {
      return await this.connection.sendRequest<SignatureHelp | null>('textDocument/signatureHelp', params);
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Rename symbol
   */
  async rename(
    uri: string,
    position: Position,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    await this.ensureInitialized();
    if (!this.connection) return null;

    try {
      return await this.connection.sendRequest<WorkspaceEdit | null>('textDocument/rename', {
        textDocument: { uri },
        position,
        newName,
      });
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Get code actions
   */
  async getCodeActions(
    uri: string,
    range: Range,
    diagnostics?: Diagnostic[]
  ): Promise<CodeAction[] | null> {
    await this.ensureInitialized();
    if (!this.connection) return null;

    try {
      const result = await this.connection.sendRequest<(CodeAction | { title: string })[] | null>('textDocument/codeAction', {
        textDocument: { uri },
        range,
        context: {
          diagnostics: diagnostics || this.diagnostics.get(uri) || [],
        },
      });

      if (!result) return null;
      return result.map((item: CodeAction | { title: string }) =>
        'title' in item ? item as CodeAction : ({ title: 'Unknown', kind: 'quickfix' } as CodeAction)
      );
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Format document
   */
  async formatDocument(uri: string): Promise<TextEdit[] | null> {
    await this.ensureInitialized();
    if (!this.connection) return null;

    try {
      return await this.connection.sendRequest<TextEdit[] | null>('textDocument/formatting', {
        textDocument: { uri },
        options: {
          tabSize: 2,
          insertSpaces: true,
        },
      });
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  // ===========================================
  // Diagnostics
  // ===========================================

  /**
   * Get diagnostics for a document
   */
  getDiagnostics(uri: string): Diagnostic[] {
    return this.diagnostics.get(uri) || [];
  }

  /**
   * Get all diagnostics
   */
  getAllDiagnostics(): Map<string, Diagnostic[]> {
    return new Map(this.diagnostics);
  }

  // ===========================================
  // Utilities
  // ===========================================

  /**
   * Ensure server is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.start();
    }
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.initialized && this.connection !== null;
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): InitializeResult['capabilities'] | null {
    return this.serverCapabilities;
  }

  /**
   * Convert file path to URI
   */
  static pathToUri(filePath: string): string {
    return `file://${path.resolve(filePath)}`;
  }

  /**
   * Convert URI to file path
   */
  static uriToPath(uri: string): string {
    return uri.replace('file://', '');
  }
}

// ===========================================
// Factory Function
// ===========================================

export function createLSPClient(options: LSPClientOptions): LSPClient {
  return new LSPClient(options);
}

/**
 * Create an LSP client for a specific language
 */
export function createLanguageClient(
  language: string,
  workspaceFolder: string,
  options?: Partial<LSPClientOptions>
): LSPClient | null {
  const serverConfig = LANGUAGE_SERVERS[language];
  if (!serverConfig) {
    return null;
  }

  return new LSPClient({
    workspaceFolder,
    serverConfig: {
      id: language,
      ...serverConfig,
    },
    ...options,
  });
}
