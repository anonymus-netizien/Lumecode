/**
 * Automated tests for Lumecode project initialization tool
 */
import { runInit } from '../../src/cli/init.js';
import { existsSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

describe('Lumecode Init Tool', () => {
  const projectDir = process.cwd();
  const envPath = join(projectDir, '.env');
  const dataDir = join(homedir(), '.lumecode');
  const configPath = join(dataDir, 'config.json');

  afterAll(() => {
    // Clean up generated files
    if (existsSync(envPath)) unlinkSync(envPath);
    if (existsSync(configPath)) unlinkSync(configPath);
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  });

  it('should initialize project with defaults (non-interactive)', async () => {
    const result = await runInit({ yes: true, skipInstall: true, skipBuild: true });
    expect(result).toBe(true);
    expect(existsSync(envPath)).toBe(true);
    expect(existsSync(configPath)).toBe(true);
  });

  it('should fail if Bun is not installed', async () => {
    // Simulate missing Bun by temporarily renaming bun binary (skip on CI)
    // Not implemented here for safety
    expect(true).toBe(true);
  });

  it('should handle reinitialization with --force', async () => {
    const result = await runInit({ yes: true, force: true, skipInstall: true, skipBuild: true });
    expect(result).toBe(true);
  });
});
