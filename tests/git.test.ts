/**
 * Git Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { simpleGit } from 'simple-git';

// Test imports - these will be tested
import { ConflictParser } from '../src/git/conflicts.js';

// ===========================================
// Conflict Parser Tests
// ===========================================

describe('ConflictParser', () => {
  describe('parseConflicts', () => {
    it('should parse a simple conflict', () => {
      const content = `line 1
<<<<<<< HEAD
our changes
=======
their changes
>>>>>>> feature
line 2`;

      const conflicts = ConflictParser.parseConflicts(content);
      
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].ours).toBe('our changes');
      expect(conflicts[0].theirs).toBe('their changes');
    });

    it('should parse multiple conflicts', () => {
      const content = `start
<<<<<<< HEAD
our first
=======
their first
>>>>>>> branch
middle
<<<<<<< HEAD
our second
=======
their second
>>>>>>> branch
end`;

      const conflicts = ConflictParser.parseConflicts(content);
      
      expect(conflicts).toHaveLength(2);
      expect(conflicts[0].ours).toBe('our first');
      expect(conflicts[0].theirs).toBe('their first');
      expect(conflicts[1].ours).toBe('our second');
      expect(conflicts[1].theirs).toBe('their second');
    });

    it('should parse multi-line conflicts', () => {
      const content = `<<<<<<< HEAD
line 1
line 2
line 3
=======
different line 1
different line 2
>>>>>>> branch`;

      const conflicts = ConflictParser.parseConflicts(content);
      
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].ours).toBe('line 1\nline 2\nline 3');
      expect(conflicts[0].theirs).toBe('different line 1\ndifferent line 2');
    });

    it('should handle diff3 style conflicts with base', () => {
      const content = `<<<<<<< HEAD
our version
||||||| base
original version
=======
their version
>>>>>>> branch`;

      const conflicts = ConflictParser.parseConflicts(content);
      
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].ours).toBe('our version');
      expect(conflicts[0].base).toBe('original version');
      expect(conflicts[0].theirs).toBe('their version');
    });

    it('should return empty array for content without conflicts', () => {
      const content = `just some normal
content without any
conflict markers`;

      const conflicts = ConflictParser.parseConflicts(content);
      
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('hasConflicts', () => {
    it('should return true for content with conflicts', () => {
      const content = `line1
<<<<<<< HEAD
changes
=======
other
>>>>>>> branch
line2`;

      expect(ConflictParser.hasConflicts(content)).toBe(true);
    });

    it('should return false for content without conflicts', () => {
      const content = 'normal content';
      expect(ConflictParser.hasConflicts(content)).toBe(false);
    });

    it('should return false for partial conflict markers', () => {
      const content = `<<<<<<< HEAD
changes`;

      expect(ConflictParser.hasConflicts(content)).toBe(false);
    });
  });

  describe('resolveConflicts', () => {
    it('should resolve with ours', () => {
      const content = `before
<<<<<<< HEAD
our changes
=======
their changes
>>>>>>> branch
after`;

      const resolved = ConflictParser.resolveConflicts(content, [
        { index: 0, resolution: 'ours' },
      ]);

      expect(resolved).toBe('before\nour changes\nafter');
    });

    it('should resolve with theirs', () => {
      const content = `before
<<<<<<< HEAD
our changes
=======
their changes
>>>>>>> branch
after`;

      const resolved = ConflictParser.resolveConflicts(content, [
        { index: 0, resolution: 'theirs' },
      ]);

      expect(resolved).toBe('before\ntheir changes\nafter');
    });

    it('should resolve with both', () => {
      const content = `before
<<<<<<< HEAD
our changes
=======
their changes
>>>>>>> branch
after`;

      const resolved = ConflictParser.resolveConflicts(content, [
        { index: 0, resolution: 'both' },
      ]);

      expect(resolved).toBe('before\nour changes\ntheir changes\nafter');
    });

    it('should resolve with custom content', () => {
      const content = `before
<<<<<<< HEAD
our changes
=======
their changes
>>>>>>> branch
after`;

      const resolved = ConflictParser.resolveConflicts(content, [
        { index: 0, resolution: 'custom', customContent: 'merged content' },
      ]);

      expect(resolved).toBe('before\nmerged content\nafter');
    });

    it('should resolve multiple conflicts independently', () => {
      const content = `start
<<<<<<< HEAD
first ours
=======
first theirs
>>>>>>> branch
middle
<<<<<<< HEAD
second ours
=======
second theirs
>>>>>>> branch
end`;

      const resolved = ConflictParser.resolveConflicts(content, [
        { index: 0, resolution: 'ours' },
        { index: 1, resolution: 'theirs' },
      ]);

      expect(resolved).toBe('start\nfirst ours\nmiddle\nsecond theirs\nend');
    });
  });
});

// ===========================================
// Auto-Commit Tests
// ===========================================

describe('AutoCommitManager', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `lumecode-autocommit-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const git = simpleGit(tempDir);
    await git.init();
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('commit message generation', () => {
    it('should detect feat type for new source files', async () => {
      // Import dynamically to avoid initialization issues
      const { AutoCommitManager } = await import('../src/git/auto-commit.js');
      
      // Create manager with valid directory
      const manager = new (AutoCommitManager as any)(tempDir);
      
      // Test type detection through reflection
      const type = manager['detectCommitType'](['src/new-feature.ts']);
      expect(type).toBe('feat');
    });

    it('should detect test type for test files', async () => {
      const { AutoCommitManager } = await import('../src/git/auto-commit.js');
      const manager = new (AutoCommitManager as any)(tempDir);
      
      const type = manager['detectCommitType'](['tests/feature.test.ts']);
      expect(type).toBe('test');
    });

    it('should detect docs type for markdown files', async () => {
      const { AutoCommitManager } = await import('../src/git/auto-commit.js');
      const manager = new (AutoCommitManager as any)(tempDir);
      
      const type = manager['detectCommitType'](['README.md', 'docs/guide.md']);
      expect(type).toBe('docs');
    });

    it('should detect chore type for config files', async () => {
      const { AutoCommitManager } = await import('../src/git/auto-commit.js');
      const manager = new (AutoCommitManager as any)(tempDir);
      
      const type = manager['detectCommitType'](['package.json', 'tsconfig.json']);
      expect(type).toBe('chore');
    });

    it('should detect scope from common directory', async () => {
      const { AutoCommitManager } = await import('../src/git/auto-commit.js');
      const manager = new (AutoCommitManager as any)(tempDir);
      
      const scope = manager['detectScope']([
        'src/git/repository.ts',
        'src/git/tools.ts',
        'src/git/conflicts.ts',
      ]);
      expect(scope).toBe('src');
    });
  });
});

// ===========================================
// Git Tools Tests
// ===========================================

describe('GitTools', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `lumecode-gittools-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const git = simpleGit(tempDir);
    await git.init();
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should create all required tools', async () => {
    const { createGitTools } = await import('../src/git/tools.js');
    const tools = createGitTools(tempDir);
    const toolList = tools.getTools();

    const toolNames = toolList.map(t => t.name);
    
    expect(toolNames).toContain('git_status');
    expect(toolNames).toContain('git_diff');
    expect(toolNames).toContain('git_log');
    expect(toolNames).toContain('git_commit');
    expect(toolNames).toContain('git_add');
    expect(toolNames).toContain('git_branch');
    expect(toolNames).toContain('git_checkout');
    expect(toolNames).toContain('git_merge');
    expect(toolNames).toContain('git_pull');
    expect(toolNames).toContain('git_push');
    expect(toolNames).toContain('git_stash');
    expect(toolNames).toContain('git_reset');
    expect(toolNames).toContain('git_show');
    expect(toolNames).toContain('git_auto_commit');
    expect(toolNames).toContain('git_suggest_commit');
  });

  it('should have proper tool structure', async () => {
    const { createGitTools } = await import('../src/git/tools.js');
    const tools = createGitTools(tempDir);
    const toolList = tools.getTools();

    for (const tool of toolList) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.category).toBe('git');
      expect(tool.parameters).toBeDefined();
      expect(tool.execute).toBeInstanceOf(Function);
    }
  });
});

// ===========================================
// Conflict Tools Tests
// ===========================================

describe('ConflictTools', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `lumecode-conflicttools-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const git = simpleGit(tempDir);
    await git.init();
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should create all conflict resolution tools', async () => {
    const { createConflictTools } = await import('../src/git/conflicts.js');
    const tools = createConflictTools(tempDir);
    const toolList = tools.getTools();

    const toolNames = toolList.map(t => t.name);
    
    expect(toolNames).toContain('git_list_conflicts');
    expect(toolNames).toContain('git_show_conflict');
    expect(toolNames).toContain('git_resolve_conflict');
    expect(toolNames).toContain('git_merge_status');
    expect(toolNames).toContain('git_abort_merge');
  });
});

// ===========================================
// Integration Export Tests
// ===========================================

describe('Git Module Exports', () => {
  it('should export all expected items', async () => {
    const gitModule = await import('../src/git/index.js');
    
    // Repository
    expect(gitModule.GitRepository).toBeDefined();
    expect(gitModule.createGitRepository).toBeInstanceOf(Function);
    
    // Auto-commit
    expect(gitModule.AutoCommitManager).toBeDefined();
    expect(gitModule.createAutoCommitManager).toBeInstanceOf(Function);
    
    // Tools
    expect(gitModule.GitTools).toBeDefined();
    expect(gitModule.createGitTools).toBeInstanceOf(Function);
    expect(gitModule.registerGitTools).toBeInstanceOf(Function);
    
    // Conflicts
    expect(gitModule.ConflictParser).toBeDefined();
    expect(gitModule.ConflictManager).toBeDefined();
    expect(gitModule.createConflictTools).toBeInstanceOf(Function);
    expect(gitModule.registerConflictTools).toBeInstanceOf(Function);
    
    // Convenience
    expect(gitModule.registerAllGitTools).toBeInstanceOf(Function);
  });
});

// ===========================================
// Real Git Repository Tests (Integration)
// ===========================================

describe('GitRepository Integration', () => {
  let testDir: string;
  let git: ReturnType<typeof simpleGit>;

  beforeAll(async () => {
    // Create a temporary directory for testing
    testDir = path.join(os.tmpdir(), `lumecode-git-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Initialize git repo
    git = simpleGit(testDir);
    await git.init();
    await git.addConfig('user.email', 'test@test.com');
    await git.addConfig('user.name', 'Test User');
  });

  afterAll(async () => {
    // Clean up
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Reset to clean state before each test
    const files = await fs.readdir(testDir);
    for (const file of files) {
      if (file !== '.git') {
        await fs.rm(path.join(testDir, file), { recursive: true, force: true });
      }
    }
  });

  it('should get repository status', async () => {
    const { createGitRepository } = await import('../src/git/repository.js');
    const repo = createGitRepository(testDir);

    // Create a file
    await fs.writeFile(path.join(testDir, 'test.txt'), 'content');

    const status = await repo.getStatus();
    
    expect(status.untracked).toContain('test.txt');
  });

  it('should add and commit files', async () => {
    const { createGitRepository } = await import('../src/git/repository.js');
    const repo = createGitRepository(testDir);

    // Create and add a file
    await fs.writeFile(path.join(testDir, 'file.txt'), 'content');
    await repo.add(['file.txt']);
    
    // Commit
    const result = await repo.commit('Initial commit');
    
    expect(result.commit).toBeDefined();
    expect(result.commit.length).toBeGreaterThan(0);
  });

  it('should create and switch branches', async () => {
    const { createGitRepository } = await import('../src/git/repository.js');
    const repo = createGitRepository(testDir);

    // Need at least one commit to create branches
    await fs.writeFile(path.join(testDir, 'init.txt'), 'init');
    await repo.addAll();
    await repo.commit('Initial');

    // Create a branch
    await repo.createBranch('feature');
    
    // Switch to it
    await repo.switchBranch('feature');
    
    const current = await repo.getCurrentBranch();
    expect(current).toBe('feature');
  });

  it('should get commit log', async () => {
    const { createGitRepository } = await import('../src/git/repository.js');
    const repo = createGitRepository(testDir);

    // Create commits
    await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
    await repo.addAll();
    await repo.commit('First commit');

    await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2');
    await repo.addAll();
    await repo.commit('Second commit');

    const log = await repo.getLog({ maxCount: 2 });
    
    expect(log).toHaveLength(2);
    expect(log[0].message).toBe('Second commit');
    expect(log[1].message).toBe('First commit');
  });

  it('should detect file changes', async () => {
    const { createGitRepository } = await import('../src/git/repository.js');
    const repo = createGitRepository(testDir);

    // Initial commit
    await fs.writeFile(path.join(testDir, 'file.txt'), 'initial');
    await repo.addAll();
    await repo.commit('Initial');

    // Modify file
    await fs.writeFile(path.join(testDir, 'file.txt'), 'modified');

    const status = await repo.getStatus();
    
    expect(status.isDirty).toBe(true);
    expect(status.unstaged.map(f => f.path)).toContain('file.txt');
  });
});
