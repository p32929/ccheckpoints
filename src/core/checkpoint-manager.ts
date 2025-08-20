import { resolve, basename } from 'path';
import type { Checkpoint, ClaudeSession } from '../types/index.js';
import { Database } from './database.js';
import { SessionManager } from './session-manager.js';
import { FileUtils } from '../utils/file-utils.js';

export class CheckpointManager {
  private database: Database;
  private sessionManager: SessionManager;

  constructor() {
    this.database = new Database();
    this.sessionManager = new SessionManager(this.database);
  }

  async handleClaudeEvent(eventType: string, data: any): Promise<any> {
    switch (eventType) {
      case 'UserPromptSubmit':
        return await this.handleUserPromptSubmit(data);
      
      case 'Stop':
        return await this.handleStop(data);
      
      case 'Notification':
        return await this.handleNotification(data);
      
      default:
        console.warn(`Unknown event type: ${eventType}`);
        return null;
    }
  }

  private async handleUserPromptSubmit(data: any): Promise<ClaudeSession> {
    console.log('📝 User prompt submitted, tracking session...');
    return await this.sessionManager.handleUserPromptSubmit(data);
  }

  private async handleStop(data: any): Promise<Checkpoint | null> {
    console.log('🛑 Claude stopped, creating checkpoint...');
    
    const session = await this.sessionManager.handleStop(data);
    if (!session) {
      console.log('No active session found');
      return null;
    }

    return await this.createCheckpoint(session);
  }

  private async handleNotification(data: any): Promise<void> {
    console.log('🔔 Notification received:', data);
  }

  private async createCheckpoint(session: ClaudeSession): Promise<Checkpoint | null> {
    try {
      const projectPath = session.projectPath;
      const files = await FileUtils.getProjectFiles(projectPath);
      
      if (files.length === 0) {
        console.log('No files found to checkpoint');
        return null;
      }

      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const message = this.generateCheckpointMessage(session, files.length, totalSize);

      const checkpoint: Omit<Checkpoint, 'id'> = {
        sessionId: session.id,
        projectPath: session.projectPath,
        projectName: session.projectName,
        message,
        timestamp: new Date(),
        fileCount: files.length,
        totalSize,
        userPrompt: session.lastPrompt || undefined
      };

      const checkpointId = await this.database.createCheckpoint(checkpoint);
      
      for (const file of files) {
        await this.database.saveFileSnapshot({
          checkpointId,
          relativePath: file.relativePath,
          content: file.content,
          hash: file.hash,
          size: file.size,
          lastModified: file.lastModified
        });
      }

      const createdCheckpoint: Checkpoint = {
        ...checkpoint,
        id: checkpointId
      };

      console.log(`✅ Checkpoint created: ${message}`);
      console.log(`   Files: ${files.length}, Size: ${FileUtils.formatFileSize(totalSize)}`);
      
      return createdCheckpoint;
      
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      return null;
    }
  }

  private generateCheckpointMessage(session: ClaudeSession, fileCount: number, totalSize: number): string {
    const prompt = session.lastPrompt?.slice(0, 50) || 'Claude task';
    const size = FileUtils.formatFileSize(totalSize);
    return `${prompt}... (${fileCount} files, ${size})`;
  }

  async getCheckpoints(projectPath?: string): Promise<Checkpoint[]> {
    return await this.database.getCheckpoints(projectPath);
  }

  async getProjectStats() {
    return await this.database.getProjectStats();
  }

  getCurrentSession(): ClaudeSession | null {
    return this.sessionManager.getCurrentSession();
  }

  async close(): Promise<void> {
    await this.database.close();
  }
}