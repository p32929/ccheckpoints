import { resolve, basename } from 'path';
import type { ClaudeSession } from '../types/index.js';
import { Database } from './database.js';

export class SessionManager {
  private sessions = new Map<string, ClaudeSession>();
  private database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async handleUserPromptSubmit(data: any): Promise<ClaudeSession> {
    const projectPath = resolve(process.cwd());
    const projectName = basename(projectPath);
    
    let session = await this.database.getActiveSession(projectPath);
    
    if (!session) {
      const sessionId = await this.database.createSession({
        projectPath,
        projectName,
        startTime: new Date(),
        lastPrompt: data.message || 'User prompt submitted',
        lastPromptTime: new Date(),
        isActive: true
      });
      
      session = {
        id: sessionId,
        projectPath,
        projectName,
        startTime: new Date(),
        lastPrompt: data.message || 'User prompt submitted',
        lastPromptTime: new Date(),
        isActive: true
      };
    } else {
      await this.database.updateSession(session.id, {
        lastPrompt: data.message || 'User prompt submitted',
        lastPromptTime: new Date(),
        isActive: true
      });
      
      session.lastPrompt = data.message || 'User prompt submitted';
      session.lastPromptTime = new Date();
      session.isActive = true;
    }
    
    this.sessions.set(projectPath, session);
    return session;
  }

  async handleStop(data: any): Promise<ClaudeSession | null> {
    const projectPath = resolve(process.cwd());
    const session = this.sessions.get(projectPath) || await this.database.getActiveSession(projectPath);
    
    if (session) {
      await this.database.updateSession(session.id, {
        isActive: false
      });
      
      session.isActive = false;
      this.sessions.set(projectPath, session);
      return session;
    }
    
    return null;
  }

  getCurrentSession(): ClaudeSession | null {
    const projectPath = resolve(process.cwd());
    return this.sessions.get(projectPath) || null;
  }

  async getActiveSession(projectPath?: string): Promise<ClaudeSession | null> {
    const path = projectPath || resolve(process.cwd());
    const cached = this.sessions.get(path);
    
    if (cached && cached.isActive) {
      return cached;
    }
    
    return await this.database.getActiveSession(path);
  }
}