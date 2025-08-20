#!/usr/bin/env node

import { WebServer } from './server/app.js';
import { CheckpointManager } from './core/checkpoint-manager-sqlite.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🚀 CCheckpoint - Claude Code Checkpoint System

Usage:
  npm run dev          Start development server
  npm run build        Build TypeScript to JavaScript  
  npm start            Start production server
  npm run setup        Setup and build project

  node dist/index.js   Start server directly

Features:
  • Real-time Claude Code session tracking
  • Automatic checkpoint creation on task completion
  • Clean TypeScript architecture
  • Modern web dashboard with WebSocket updates
  • SQLite database for reliable storage

Server runs on: http://127.0.0.1:9271
`);
    return;
  }

  if (args.includes('--handle-event')) {
    const eventTypeIndex = args.indexOf('--handle-event') + 1;
    const eventType = args[eventTypeIndex];
    const dataStr = args[eventTypeIndex + 1];
    
    if (!eventType) {
      console.error('Event type is required');
      process.exit(1);
    }
    
    try {
      const data = dataStr ? JSON.parse(dataStr) : {};
      const manager = new CheckpointManager();
      await manager.handleClaudeEvent(eventType, data);
      await manager.close();
    } catch (error) {
      console.error('Error handling event:', error);
      process.exit(1);
    }
    return;
  }

  const server = new WebServer();
  
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await server.stop();
    await server.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    await server.stop();
    await server.cleanup();
    process.exit(0);
  });

  try {
    await server.start();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});