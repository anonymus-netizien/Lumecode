#!/usr/bin/env bun
/**
 * Tool Testing CLI
 * Quick test script for the tool system
 */

import { toolRegistry, initializeTools } from '../tools/index.js';

async function main() {
  console.log('🔧 Lumecode Tool System Test\n');

  // Initialize tools
  initializeTools();
  console.log(`Registered ${toolRegistry.count} tools:\n`);

  // List all tools
  for (const tool of toolRegistry.getAll()) {
    console.log(`  📦 ${tool.name} (${tool.category})`);
    console.log(`     ${tool.description.split('\n')[0]}`);
    console.log('');
  }

  // Test file_read
  console.log('─'.repeat(60));
  console.log('Testing file_read on package.json...\n');
  
  const readResult = await toolRegistry.execute('file_read', {
    path: 'package.json',
    endLine: 10,
  }, { workingDirectory: process.cwd() });

  console.log(readResult.success ? '✅ Success' : '❌ Failed');
  if (readResult.output) {
    console.log(readResult.output.split('\n').slice(0, 15).join('\n'));
  }
  if (readResult.error) {
    console.log('Error:', readResult.error);
  }

  // Test directory_list
  console.log('\n' + '─'.repeat(60));
  console.log('Testing directory_list on src/...\n');

  const listResult = await toolRegistry.execute('directory_list', {
    path: 'src',
    maxDepth: 2,
  }, { workingDirectory: process.cwd() });

  console.log(listResult.success ? '✅ Success' : '❌ Failed');
  if (listResult.output) {
    console.log(listResult.output.split('\n').slice(0, 30).join('\n'));
  }
  if (listResult.error) {
    console.log('Error:', listResult.error);
  }

  // Test search_files
  console.log('\n' + '─'.repeat(60));
  console.log('Testing search_files for "export class"...\n');

  const searchResult = await toolRegistry.execute('search_files', {
    pattern: 'export class',
    filePattern: '*.ts',
    maxResults: 5,
  }, { workingDirectory: process.cwd() });

  console.log(searchResult.success ? '✅ Success' : '❌ Failed');
  if (searchResult.output) {
    console.log(searchResult.output.split('\n').slice(0, 25).join('\n'));
  }
  if (searchResult.error) {
    console.log('Error:', searchResult.error);
  }

  // Test terminal_execute
  console.log('\n' + '─'.repeat(60));
  console.log('Testing terminal_execute with "ls -la"...\n');

  const termResult = await toolRegistry.execute('terminal_execute', {
    command: 'ls -la | head -10',
    timeout: 5000,
  }, { workingDirectory: process.cwd() });

  console.log(termResult.success ? '✅ Success' : '❌ Failed');
  if (termResult.output) {
    console.log(termResult.output.split('\n').slice(0, 15).join('\n'));
  }
  if (termResult.error) {
    console.log('Error:', termResult.error);
  }

  console.log('\n' + '─'.repeat(60));
  console.log('✨ Tool system test complete!\n');
}

main().catch(console.error);
