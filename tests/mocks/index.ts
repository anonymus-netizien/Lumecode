/**
 * Test Mocks Index
 * Export all mock utilities for testing
 */

export {
  MockProvider,
  createMockProvider,
  createToolCallingMockProvider,
  createErrorMockProvider,
  createStreamingMockProvider,
  type MockProviderConfig,
  type MockToolCall,
  type MockCallRecord,
} from './provider.mock.js';

export {
  MockFileSystem,
  createMockFileSystem,
  createPopulatedMockFileSystem,
  type MockFile,
  type MockDirectory,
  type FileSystemSnapshot,
} from './filesystem.mock.js';

export {
  MockGitRepository,
  createMockGitRepository,
  createMockGitRepositoryWithHistory,
  type MockCommit,
  type MockBranch,
  type MockFileStatus,
  type MockStash,
} from './git.mock.js';
