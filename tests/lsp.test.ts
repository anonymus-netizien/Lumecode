/**
 * LSP Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

// ===========================================
// Language Detection Tests
// ===========================================

describe('Language Detection', () => {
  it('should detect TypeScript files', async () => {
    const { detectLanguage, getLanguageId } = await import('../src/lsp/manager.js');
    
    expect(detectLanguage('file.ts')).toBe('typescript');
    expect(detectLanguage('file.tsx')).toBe('typescript');
    expect(getLanguageId('file.ts')).toBe('typescript');
    expect(getLanguageId('file.tsx')).toBe('typescriptreact');
  });

  it('should detect JavaScript files', async () => {
    const { detectLanguage, getLanguageId } = await import('../src/lsp/manager.js');
    
    expect(detectLanguage('file.js')).toBe('typescript'); // Uses tsserver
    expect(detectLanguage('file.jsx')).toBe('typescript');
    expect(getLanguageId('file.js')).toBe('javascript');
    expect(getLanguageId('file.jsx')).toBe('javascriptreact');
  });

  it('should detect Python files', async () => {
    const { detectLanguage, getLanguageId } = await import('../src/lsp/manager.js');
    
    expect(detectLanguage('file.py')).toBe('python');
    expect(getLanguageId('file.py')).toBe('python');
  });

  it('should detect Rust files', async () => {
    const { detectLanguage, getLanguageId } = await import('../src/lsp/manager.js');
    
    expect(detectLanguage('file.rs')).toBe('rust');
    expect(getLanguageId('file.rs')).toBe('rust');
  });

  it('should detect Go files', async () => {
    const { detectLanguage, getLanguageId } = await import('../src/lsp/manager.js');
    
    expect(detectLanguage('file.go')).toBe('go');
    expect(getLanguageId('file.go')).toBe('go');
  });

  it('should detect JSON files', async () => {
    const { detectLanguage, getLanguageId } = await import('../src/lsp/manager.js');
    
    expect(detectLanguage('file.json')).toBe('json');
    expect(getLanguageId('file.json')).toBe('json');
    expect(getLanguageId('file.jsonc')).toBe('jsonc');
  });

  it('should detect web files', async () => {
    const { detectLanguage, getLanguageId } = await import('../src/lsp/manager.js');
    
    expect(detectLanguage('file.html')).toBe('html');
    expect(detectLanguage('file.css')).toBe('css');
    expect(detectLanguage('file.scss')).toBe('css');
    expect(getLanguageId('file.html')).toBe('html');
    expect(getLanguageId('file.css')).toBe('css');
    expect(getLanguageId('file.scss')).toBe('scss');
  });

  it('should return null for unknown extensions', async () => {
    const { detectLanguage, getLanguageId } = await import('../src/lsp/manager.js');
    
    expect(detectLanguage('file.xyz')).toBeNull();
    expect(getLanguageId('file.xyz')).toBe('plaintext');
  });
});

// ===========================================
// LSP Client Tests
// ===========================================

describe('LSPClient', () => {
  it('should export path conversion utilities', async () => {
    const { LSPClient } = await import('../src/lsp/client.js');
    
    const testPath = '/home/user/project/file.ts';
    const uri = LSPClient.pathToUri(testPath);
    
    expect(uri).toBe(`file://${testPath}`);
    expect(LSPClient.uriToPath(uri)).toBe(testPath);
  });

  it('should handle Windows-style paths', async () => {
    const { LSPClient } = await import('../src/lsp/client.js');
    
    // Test relative path resolution
    const relativePath = 'src/file.ts';
    const uri = LSPClient.pathToUri(relativePath);
    
    expect(uri.startsWith('file://')).toBe(true);
  });
});

// ===========================================
// LSP Manager Tests
// ===========================================

describe('LSPManager', () => {
  it('should create manager with options', async () => {
    const { createLSPManager } = await import('../src/lsp/manager.js');
    
    const manager = createLSPManager({
      workspaceFolder: '/tmp/test-workspace',
    });
    
    expect(manager).toBeDefined();
    expect(manager.getSupportedLanguages()).toContain('typescript');
    expect(manager.getSupportedLanguages()).toContain('python');
    expect(manager.isLanguageSupported('typescript')).toBe(true);
    expect(manager.isLanguageSupported('unknown')).toBe(false);
  });

  it('should list supported languages', async () => {
    const { createLSPManager } = await import('../src/lsp/manager.js');
    
    const manager = createLSPManager({
      workspaceFolder: '/tmp/test-workspace',
    });
    
    const languages = manager.getSupportedLanguages();
    
    expect(languages).toContain('typescript');
    expect(languages).toContain('python');
    expect(languages).toContain('rust');
    expect(languages).toContain('go');
    expect(languages).toContain('json');
    expect(languages).toContain('html');
    expect(languages).toContain('css');
  });

  it('should report no running servers initially', async () => {
    const { createLSPManager } = await import('../src/lsp/manager.js');
    
    const manager = createLSPManager({
      workspaceFolder: '/tmp/test-workspace',
      autoStart: false,
    });
    
    expect(manager.getRunningServers()).toEqual([]);
  });
});

// ===========================================
// LSP Tools Tests
// ===========================================

describe('LSPTools', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `lumecode-lsp-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should create all LSP tools', async () => {
    const { createLSPTools } = await import('../src/lsp/tools.js');
    
    const tools = createLSPTools(tempDir);
    const toolList = tools.getTools();
    
    const toolNames = toolList.map(t => t.name);
    
    expect(toolNames).toContain('lsp_get_diagnostics');
    expect(toolNames).toContain('lsp_hover');
    expect(toolNames).toContain('lsp_definition');
    expect(toolNames).toContain('lsp_references');
    expect(toolNames).toContain('lsp_symbols');
    expect(toolNames).toContain('lsp_completions');
    expect(toolNames).toContain('lsp_format');
    expect(toolNames).toContain('lsp_code_actions');
    expect(toolNames).toContain('lsp_signature_help');
    expect(toolNames).toContain('lsp_rename');
  });

  it('should have proper tool structure', async () => {
    const { createLSPTools } = await import('../src/lsp/tools.js');
    
    const tools = createLSPTools(tempDir);
    const toolList = tools.getTools();
    
    for (const tool of toolList) {
      expect(tool.name).toBeDefined();
      expect(tool.name.startsWith('lsp_')).toBe(true);
      expect(tool.description).toBeDefined();
      expect(tool.category).toBe('code');
      expect(tool.parameters).toBeDefined();
      expect(tool.execute).toBeInstanceOf(Function);
    }
  });
});

// ===========================================
// Language Server Config Tests
// ===========================================

describe('Language Server Configurations', () => {
  it('should have valid configurations for each language', async () => {
    const { LANGUAGE_SERVERS } = await import('../src/lsp/client.js');
    
    for (const [id, config] of Object.entries(LANGUAGE_SERVERS)) {
      expect(config.name).toBeDefined();
      expect(config.languages).toBeDefined();
      expect(config.languages.length).toBeGreaterThan(0);
      expect(config.command).toBeDefined();
    }
  });

  it('should configure TypeScript server correctly', async () => {
    const { LANGUAGE_SERVERS } = await import('../src/lsp/client.js');
    
    const tsConfig = LANGUAGE_SERVERS.typescript;
    
    expect(tsConfig.name).toBe('TypeScript Language Server');
    expect(tsConfig.languages).toContain('typescript');
    expect(tsConfig.languages).toContain('javascript');
    expect(tsConfig.command).toBe('typescript-language-server');
    expect(tsConfig.args).toContain('--stdio');
  });

  it('should configure Python server correctly', async () => {
    const { LANGUAGE_SERVERS } = await import('../src/lsp/client.js');
    
    const pyConfig = LANGUAGE_SERVERS.python;
    
    expect(pyConfig.name).toBe('Pylsp');
    expect(pyConfig.languages).toContain('python');
    expect(pyConfig.command).toBe('pylsp');
  });
});

// ===========================================
// Module Export Tests
// ===========================================

describe('LSP Module Exports', () => {
  it('should export all expected items', async () => {
    const lspModule = await import('../src/lsp/index.js');
    
    // Client
    expect(lspModule.LSPClient).toBeDefined();
    expect(lspModule.createLSPClient).toBeInstanceOf(Function);
    expect(lspModule.createLanguageClient).toBeInstanceOf(Function);
    expect(lspModule.LANGUAGE_SERVERS).toBeDefined();
    
    // Manager
    expect(lspModule.LSPManager).toBeDefined();
    expect(lspModule.createLSPManager).toBeInstanceOf(Function);
    expect(lspModule.detectLanguage).toBeInstanceOf(Function);
    expect(lspModule.getLanguageId).toBeInstanceOf(Function);
    
    // Tools
    expect(lspModule.LSPTools).toBeDefined();
    expect(lspModule.createLSPTools).toBeInstanceOf(Function);
    expect(lspModule.registerLSPTools).toBeInstanceOf(Function);
  });
});

// ===========================================
// Text Edit Application Tests
// ===========================================

describe('Text Edit Application', () => {
  it('should apply single line edits correctly', async () => {
    const { createLSPTools } = await import('../src/lsp/tools.js');
    
    const tools = createLSPTools('/tmp');
    
    // Access private method for testing
    const applyEdits = (tools as any).applyTextEdits.bind(tools);
    
    const content = 'hello world';
    const edits = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        newText: 'goodbye',
      },
    ];
    
    const result = applyEdits(content, edits);
    expect(result).toBe('goodbye world');
  });

  it('should apply multi-line edits correctly', async () => {
    const { createLSPTools } = await import('../src/lsp/tools.js');
    
    const tools = createLSPTools('/tmp');
    const applyEdits = (tools as any).applyTextEdits.bind(tools);
    
    const content = 'line1\nline2\nline3';
    const edits = [
      {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 5 },
        },
        newText: 'modified',
      },
    ];
    
    const result = applyEdits(content, edits);
    expect(result).toBe('line1\nmodified\nline3');
  });
});
