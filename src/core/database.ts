import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { resolve } from 'path';
import { homedir } from 'os';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import type { ClaudeSession, Checkpoint, FileSnapshot, ProjectStats } from '../types/index.js';

export class Database {
  private db: sqlite3.Database;
  private readonly dbPath: string;

  constructor() {
    const dataDir = resolve(homedir(), '.ccheckpoint');
    this.dbPath = resolve(dataDir, 'checkpoints.db');
    
    if (!existsSync(dataDir)) {
      mkdir(dataDir, { recursive: true }).catch(console.error);
    }

    this.db = new sqlite3.Database(this.dbPath);
    this.init();
  }

  private async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            project_path TEXT NOT NULL,
            project_name TEXT NOT NULL,
            start_time DATETIME NOT NULL,
            last_prompt TEXT,
            last_prompt_time DATETIME,
            is_active BOOLEAN NOT NULL DEFAULT 1
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS checkpoints (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            project_path TEXT NOT NULL,
            project_name TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            file_count INTEGER NOT NULL,
            total_size INTEGER NOT NULL,
            user_prompt TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions (id)
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS file_snapshots (
            id TEXT PRIMARY KEY,
            checkpoint_id TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            content TEXT NOT NULL,
            hash TEXT NOT NULL,
            size INTEGER NOT NULL,
            last_modified DATETIME NOT NULL,
            FOREIGN KEY (checkpoint_id) REFERENCES checkpoints (id)
          )
        `);

        this.db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON checkpoints(project_path)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_snapshots_checkpoint ON file_snapshots(checkpoint_id)`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async createSession(session: Omit<ClaudeSession, 'id'>): Promise<string> {
    const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO sessions (id, project_path, project_name, start_time, last_prompt, last_prompt_time, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, session.projectPath, session.projectName, session.startTime.toISOString(), 
          session.lastPrompt || null, session.lastPromptTime?.toISOString() || null, session.isActive ? 1 : 0],
      (err) => {
        if (err) reject(err);
        else resolve(id);
      });
    });
  }

  async updateSession(id: string, updates: Partial<ClaudeSession>): Promise<void> {
    if (updates.lastPrompt !== undefined || updates.lastPromptTime !== undefined) {
      return new Promise((resolve, reject) => {
        this.db.run(`
          UPDATE sessions 
          SET last_prompt = ?, last_prompt_time = ?, is_active = ?
          WHERE id = ?
        `, [updates.lastPrompt || null, updates.lastPromptTime?.toISOString() || null, updates.isActive ? 1 : 0, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  async createCheckpoint(checkpoint: Omit<Checkpoint, 'id'>): Promise<string> {
    const id = `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO checkpoints (id, session_id, project_path, project_name, message, timestamp, file_count, total_size, user_prompt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, checkpoint.sessionId, checkpoint.projectPath, checkpoint.projectName, checkpoint.message,
          checkpoint.timestamp.toISOString(), checkpoint.fileCount, checkpoint.totalSize, checkpoint.userPrompt || null],
      (err) => {
        if (err) reject(err);
        else resolve(id);
      });
    });
  }

  async saveFileSnapshot(snapshot: Omit<FileSnapshot, 'id'>): Promise<string> {
    const id = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO file_snapshots (id, checkpoint_id, relative_path, content, hash, size, last_modified)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, snapshot.checkpointId, snapshot.relativePath, snapshot.content, 
          snapshot.hash, snapshot.size, snapshot.lastModified.toISOString()],
      (err) => {
        if (err) reject(err);
        else resolve(id);
      });
    });
  }

  async getActiveSession(projectPath: string): Promise<ClaudeSession | null> {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT * FROM sessions 
        WHERE project_path = ? AND is_active = 1 
        ORDER BY start_time DESC 
        LIMIT 1
      `, [projectPath], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!row) {
          resolve(null);
          return;
        }
        
        resolve({
          id: row.id,
          projectPath: row.project_path,
          projectName: row.project_name,
          startTime: new Date(row.start_time),
          lastPrompt: row.last_prompt || undefined,
          lastPromptTime: row.last_prompt_time ? new Date(row.last_prompt_time) : undefined,
          isActive: Boolean(row.is_active)
        });
      });
    });
  }

  async getCheckpoints(projectPath?: string): Promise<Checkpoint[]> {
    const query = projectPath 
      ? `SELECT * FROM checkpoints WHERE project_path = ? ORDER BY timestamp DESC`
      : `SELECT * FROM checkpoints ORDER BY timestamp DESC`;
    
    const params = projectPath ? [projectPath] : [];
    
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        const checkpoints = rows.map(row => ({
          id: row.id,
          sessionId: row.session_id,
          projectPath: row.project_path,
          projectName: row.project_name,
          message: row.message,
          timestamp: new Date(row.timestamp),
          fileCount: row.file_count,
          totalSize: row.total_size,
          userPrompt: row.user_prompt
        }));
        
        resolve(checkpoints);
      });
    });
  }

  async getProjectStats(): Promise<ProjectStats[]> {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          project_name,
          project_path,
          COUNT(*) as checkpoint_count,
          MAX(timestamp) as last_checkpoint,
          SUM(total_size) as total_size
        FROM checkpoints 
        GROUP BY project_path 
        ORDER BY last_checkpoint DESC
      `, (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        const stats = rows.map(row => ({
          projectName: row.project_name,
          projectPath: row.project_path,
          checkpointCount: row.checkpoint_count,
          lastCheckpoint: row.last_checkpoint ? new Date(row.last_checkpoint) : undefined,
          totalSize: row.total_size
        }));
        
        resolve(stats);
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}