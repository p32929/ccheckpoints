#!/usr/bin/env node

import { WebServer } from './server/app.js';
import { Logger } from './utils/logger.js';

async function main() {
  const logger = Logger.getInstance();
  
  // Check if we should enable verbose mode
  const isVerbose = process.env.CCHECKPOINTS_VERBOSE === 'true' || process.argv.includes('--verbose') || process.argv.includes('-v');
  logger.setVerbose(isVerbose);
  
  if (isVerbose) {
    await logger.appendSystemInfo();
  }
  
  await logger.info('Starting CCheckpoints server...');
  
  let server: WebServer | undefined;
  
  try {
    await logger.verbose('Creating WebServer instance');
    server = new WebServer();
    await logger.verbose('WebServer instance created');
    
    await logger.info('Starting server...');
    await server.start();
    await logger.success('Server started successfully');
    
    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      await logger.info('🛑 Received SIGTERM, shutting down gracefully...');
      if (server) {
        await server.stop();
        await server.cleanup();
      }
      await logger.info('Graceful shutdown completed');
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      await logger.info('🛑 Received SIGINT, shutting down gracefully...');
      if (server) {
        await server.stop();
        await server.cleanup();
      }
      await logger.info('Graceful shutdown completed');
      process.exit(0);
    });

    // Keep the process alive
    process.on('uncaughtException', async (error) => {
      await logger.error('❌ Uncaught Exception', error);
      if (server) {
        await server.cleanup();
      }
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      await logger.error('❌ Unhandled Rejection', reason);
      if (server) {
        await server.cleanup();
      }
      process.exit(1);
    });

  } catch (error) {
    await logger.error('❌ Failed to start server', error);
    if (server) {
      await server.cleanup();
    }
    process.exit(1);
  }
}

// Only run if this is the main module
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('/server.js') || 
  process.argv[1].endsWith('\\server.js') ||
  process.argv[1].endsWith('/server.ts') || 
  process.argv[1].endsWith('\\server.ts')
);

if (isMainModule) {
  main().catch(async (error) => {
    const logger = Logger.getInstance();
    await logger.error('❌ Server startup error', error);
    process.exit(1);
  });
}