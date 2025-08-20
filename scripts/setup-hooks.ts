#!/usr/bin/env tsx

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const HOOK_SCRIPT = resolve(PROJECT_ROOT, 'claude-hook.ts');

function getClaudeConfigPath(): string {
  // Claude Code CLI uses ~/.claude/settings.json for hooks
  const claudeDir = resolve(homedir(), '.claude');
  const configPath = resolve(claudeDir, 'settings.json');
  
  // Ensure directory exists
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }
  
  return configPath;
}

function getCurrentConfig(configPath: string): any {
  if (!existsSync(configPath)) {
    return {};
  }
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('⚠️  Could not parse existing Claude config, creating new one');
    return {};
  }
}

function setupHooks(): void {
  const configPath = getClaudeConfigPath();
  const config = getCurrentConfig(configPath);
  
  // Initialize hooks object if it doesn't exist
  if (!config.hooks) {
    config.hooks = {};
  }
  
  // Using direct npx tsx commands in hook configuration
  let updated = false;
  
  // Setup UserPromptSubmit hook with better name
  if (!config.hooks.UserPromptSubmit) {
    config.hooks.UserPromptSubmit = [];
  }
  
  // Remove old hooks first
  config.hooks.UserPromptSubmit = config.hooks.UserPromptSubmit.filter((hook: any) => 
    !(hook.command?.includes('claude-hook.ts') || hook.hooks?.[0]?.command?.includes('claude-hook.ts'))
  );
  
  // Add new hook with correct nested structure
  config.hooks.UserPromptSubmit.push({
    matcher: '',
    hooks: [{
      type: 'command',
      command: `ccheckpoints track --event=submit`
    }]
  });
  updated = true;
  
  // Setup Stop hook with better name
  if (!config.hooks.Stop) {
    config.hooks.Stop = [];
  }
  
  // Remove old hooks first
  config.hooks.Stop = config.hooks.Stop.filter((hook: any) => 
    !(hook.command?.includes('claude-hook.ts') || hook.hooks?.[0]?.command?.includes('claude-hook.ts') || hook.hooks?.[0]?.command?.includes('ccheckpoints track'))
  );
  
  // Add new hook with correct nested structure
  config.hooks.Stop.push({
    matcher: '',
    hooks: [{
      type: 'command',
      command: `ccheckpoints track --event=stop`
    }]
  });
  updated = true;
  
  if (updated) {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('✅ Claude Code hooks added successfully!');
    console.log(`📁 Config: ${configPath}`);
    console.log(`🔗 Hook script: ${HOOK_SCRIPT}`);
    console.log('');
    console.log('🔄 Please restart Claude Code to load the new hooks');
  } else {
    console.log('✅ Claude Code hooks already configured');
  }
}

function main(): void {
  console.log('🔧 Setting up Claude Code hooks...');
  console.log('');
  
  try {
    setupHooks();
    console.log('');
    console.log('🎉 Setup complete! CCheckpoint will now automatically track your Claude sessions.');
  } catch (error) {
    console.error('❌ Failed to setup hooks:', error);
    process.exit(1);
  }
}

main();