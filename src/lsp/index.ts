/**
 * LSP Module
 * Language Server Protocol integration for code intelligence
 */

// Client
export {
  LSPClient,
  createLSPClient,
  createLanguageClient,
  LANGUAGE_SERVERS,
  type LanguageServerConfig,
  type LSPClientOptions,
  type DocumentState,
} from './client.js';

// Manager
export {
  LSPManager,
  createLSPManager,
  detectLanguage,
  getLanguageId,
  type LSPManagerOptions,
  type DiagnosticReport,
  type FormattedDiagnostic,
} from './manager.js';

// Tools
export {
  LSPTools,
  createLSPTools,
  registerLSPTools,
} from './tools.js';

// Re-export useful types from vscode-languageserver-protocol
export type {
  Position,
  Range,
  Location,
  LocationLink,
  Diagnostic,
  DiagnosticSeverity,
  CompletionItem,
  CompletionItemKind,
  Hover,
  SignatureHelp,
  DocumentSymbol,
  SymbolInformation,
  SymbolKind,
  CodeAction,
  CodeActionKind,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver-protocol';
