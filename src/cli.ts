#!/usr/bin/env node

import { Command } from './commands/index.js';
import { parseArgs, showHelp } from './utils/args.js';
import { Logger } from './utils/logger.js';

async function main() {
  const logger = Logger.getInstance();
  
  try {
    const args = parseArgs();
    
    // Set verbose mode early
    const isVerbose = Boolean(args.options.verbose) || args.flags.includes('v');
    logger.setVerbose(isVerbose);
    
    if (isVerbose) {
      await logger.appendSystemInfo();
      await logger.verbose('Parsed command line arguments', args);
    }
    
    // Handle help and version
    if (args.command === 'help' || args.options.help || args.flags.includes('h')) {
      await logger.debug('Showing help');
      showHelp();
      return;
    }
    
    if (args.options.version) {
      await logger.debug('Showing version information');
      // Use fs to read package.json since import assertion might not work consistently
      const fs = await import('fs/promises');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const packagePath = path.resolve(__dirname, '../package.json');
      await logger.fs(`Reading package.json from ${packagePath}`);
      const packageContent = await fs.readFile(packagePath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      logger.safeConsoleLog(`ccheckpoints v${packageJson.version}`);
      await logger.info(`Version displayed: ${packageJson.version}`);
      return;
    }

    // Execute command
    const command = new Command();
    await logger.verbose(`Executing command: ${args.command}`);
    await command.execute(args);
    
  } catch (error) {
    await logger.error('❌ CLI execution failed', error);
    
    if (process.env.NODE_ENV === 'development' && error instanceof Error) {
      await logger.error('Stack trace', { stack: error.stack });
    }
    
    await logger.error(`Log file available at: ${logger.getLogFilePath()}`);
    process.exit(1);
  }
}

// Only run if this is the main module
// Check if this file is being run directly
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('/cli.js') || 
  process.argv[1].endsWith('\\cli.js') ||
  process.argv[1].endsWith('/cli.ts') || 
  process.argv[1].endsWith('\\cli.ts') ||
  process.argv[1].endsWith('/ccheckpoints') || // Global install symlink
  process.argv[1].endsWith('\\ccheckpoints')   // Windows global install
);

if (isMainModule) {
  main().catch(async (error) => {
    const logger = Logger.getInstance();
    await logger.error('❌ Unhandled CLI error', error);
    process.exit(1);
  });
}