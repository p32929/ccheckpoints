import { resolve, basename } from 'path';
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import { mkdirSync } from 'fs';
import { FileUtils } from '../utils/file-utils.js';
import type { FileInfo } from '../utils/file-utils.js';
import { Logger } from '../utils/logger.js';

// Database interfaces
interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  totalFileChanges: number;
  sessionStartTime: string;
  sessionEndTime: string | null;
  lastPrompt?: string;
  lastPromptTime?: string;
  createdAt: string;
  updatedAt: string;
}

interface Checkpoint {
  id: string;
  sessionId: string;
  prompt: string;
  timestamp: string;
  metadata: string;
  createdAt: string;
}

interface ProjectStats {
  id: string;
  projectPath: string;
  projectName: string;
  totalSessions: number;
  totalCheckpoints: number;
  totalFileChanges: number;
  lastSessionTime: Date;
  firstSessionTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface StatsResponse {
  projects: ProjectStats[];
  totalSessions: number;
  totalCheckpoints: number;
  hasActiveSession: boolean;
}

export class CheckpointManager {
  private db: Database.Database;
  private currentSession: Session | null = null;
  private logger = Logger.getInstance();

  constructor() {
    try {
      this.logger.verbose('CheckpointManager initializing...');
      const dbPath = this.getDatabasePath();
      this.logger.debug(`Database path: ${dbPath}`);
      this.db = new Database(dbPath);
      this.initializeDatabase();
      this.logger.success('CheckpointManager initialized successfully');
    } catch (error) {
      this.logger.error('CheckpointManager initialization failed', error);
      throw error;
    }
  }

  private getDatabasePath(): string {
    const appDataDir = this.getAppDataDirectory();
    const ccheckpointsDir = path.join(appDataDir, 'CCheckpoints');
    
    // Ensure directory exists
    mkdirSync(ccheckpointsDir, { recursive: true });
    
    return path.join(ccheckpointsDir, 'checkpoints.db');
  }

  private getAppDataDirectory(): string {
    switch (process.platform) {
      case 'win32':
        return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      case 'darwin':
        return path.join(os.homedir(), 'Library', 'Application Support');
      default: // Linux and others
        return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    }
  }

  private initializeDatabase(): void {
    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        projectPath TEXT NOT NULL,
        projectName TEXT NOT NULL,
        totalCheckpoints INTEGER DEFAULT 0,
        totalFileChanges INTEGER DEFAULT 0,
        sessionStartTime TEXT NOT NULL,
        sessionEndTime TEXT,
        lastPrompt TEXT,
        lastPromptTime TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);

    // Create checkpoints table with file tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        projectPath TEXT NOT NULL,
        projectName TEXT NOT NULL,
        prompt TEXT NOT NULL,
        message TEXT NOT NULL,
        fileCount INTEGER DEFAULT 0,
        totalSize INTEGER DEFAULT 0,
        userPrompt TEXT,
        timestamp TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        createdAt TEXT NOT NULL,
        FOREIGN KEY (sessionId) REFERENCES sessions(id)
      )
    `);

    // Create file snapshots table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checkpointId TEXT NOT NULL,
        filePath TEXT NOT NULL,
        relativePath TEXT NOT NULL,
        content TEXT,
        size INTEGER,
        modifiedTime TEXT,
        extension TEXT,
        isDirectory INTEGER DEFAULT 0,
        FOREIGN KEY (checkpointId) REFERENCES checkpoints(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(projectPath);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(sessionId);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_timestamp ON checkpoints(timestamp);
      CREATE INDEX IF NOT EXISTS idx_file_snapshots_checkpoint ON file_snapshots(checkpointId);
    `);
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
        await this.logger.warn(`Unknown event type: ${eventType}`);
        return null;
    }
  }

  private async handleUserPromptSubmit(data: any): Promise<Session> {
    await this.logger.info('📝 User prompt submitted, tracking session...');
    await this.logger.debug('📋 Prompt data received:', data);
    
    const projectPath = data.cwd || process.cwd();
    const projectName = basename(projectPath);
    const now = new Date().toISOString();

    // Extract prompt text with improved detection
    let promptText = 'User prompt submitted';
    
    // Priority 1: ACTUAL USER PROMPT from stdin JSON (the real deal!)
    if (data.promptSources?.actual_prompt && data.promptSources.actual_prompt.length > 0) {
      promptText = data.promptSources.actual_prompt;
      await this.logger.info('🎉 SUCCESS! Using actual user prompt from stdin JSON:', promptText);
    }
    // Priority 2: possiblePrompt (fallback)
    else if (data.possiblePrompt && data.possiblePrompt.length > 10 && 
             data.possiblePrompt !== 'User prompt submitted' && 
             data.possiblePrompt !== 'UserPromptSubmit') {
      promptText = data.possiblePrompt.substring(0, 300);
      await this.logger.debug('📝 Using possiblePrompt:', promptText);
    }
    // Priority 3: Environment variables (fallback)
    else if (data.promptSources?.env_claude_prompt && data.promptSources.env_claude_prompt.length > 10) {
      promptText = data.promptSources.env_claude_prompt.substring(0, 300);
      await this.logger.debug('📝 Using env_claude_prompt:', promptText);
    } else if (data.promptSources?.env_user_input && data.promptSources.env_user_input.length > 10) {
      promptText = data.promptSources.env_user_input.substring(0, 300);
      await this.logger.debug('📝 Using env_user_input:', promptText);
    } else {
      await this.logger.warn('❌ No actual prompt captured, using fallback');
    }

    await this.logger.debug('📝 Extracted prompt text:', promptText);

    // Find or create session
    let session = this.getActiveSession(projectPath);
    
    if (!session) {
      // Create new session
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const insertSession = this.db.prepare(`
        INSERT INTO sessions (id, projectPath, projectName, totalFileChanges, 
                             sessionStartTime, lastPrompt, lastPromptTime, createdAt, updatedAt)
        VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)
      `);
      
      insertSession.run(sessionId, projectPath, projectName, now, promptText, now, now, now);
      
      session = {
        id: sessionId,
        projectPath,
        projectName,
        totalFileChanges: 0,
        sessionStartTime: now,
        sessionEndTime: null,
        lastPrompt: promptText,
        lastPromptTime: now,
        createdAt: now,
        updatedAt: now
      };
      
      this.currentSession = session;
      await this.logger.info(`🆕 Created new session: ${sessionId}`);
    } else {
      // Update existing session with new prompt
      const updateSession = this.db.prepare(`
        UPDATE sessions SET lastPrompt = ?, lastPromptTime = ?, updatedAt = ? WHERE id = ?
      `);
      updateSession.run(promptText, now, now, session.id);
      
      session.lastPrompt = promptText;
      session.lastPromptTime = now;
      this.currentSession = session;
    }
    
    return session;
  }

  private async handleStop(data: any): Promise<any> {
    await this.logger.info('🛑 Stop event received, creating checkpoint...');
    
    // Try to find active session if not already loaded
    if (!this.currentSession) {
      const projectPath = data.cwd || process.cwd();
      const session = this.getActiveSession(projectPath);
      if (session) {
        this.currentSession = session;
      }
    }
    
    if (!this.currentSession) {
      await this.logger.warn('No active session found');
      return null;
    }

    // Create checkpoint with file snapshots
    const checkpoint = await this.createCheckpoint(this.currentSession);
    
    // Mark session as inactive
    const now = new Date().toISOString();
    const updateSession = this.db.prepare(`
      UPDATE sessions SET sessionEndTime = ?, updatedAt = ? WHERE id = ?
    `);
    updateSession.run(now, now, this.currentSession.id);
    
    await this.logger.info(`🏁 Ended session: ${this.currentSession.id}`);
    this.currentSession = null;
    
    return checkpoint;
  }

  private async handleNotification(data: any): Promise<void> {
    await this.logger.debug('🔔 Notification received:', data);
    // Handle notifications as needed
  }

  private async createCheckpoint(session: any): Promise<any> {
    try {
      const projectPath = session.projectPath;
      // Force full scan to ensure all files are included in checkpoint
      const files = await FileUtils.getProjectFiles(projectPath, true);
      
      if (files.length === 0) {
        await this.logger.warn('No files found to checkpoint');
        return null;
      }

      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const message = this.generateCheckpointMessage(session, files.length, totalSize);

      // Create checkpoint
      const checkpointId = `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();
      
      const insertCheckpoint = this.db.prepare(`
        INSERT INTO checkpoints (id, sessionId, projectPath, projectName, prompt, message, 
                                fileCount, totalSize, userPrompt, timestamp, metadata, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      insertCheckpoint.run(
        checkpointId, 
        session.id, 
        session.projectPath,
        session.projectName,
        session.lastPrompt || 'User prompt submitted',
        message,
        files.length,
        totalSize,
        session.lastPrompt || 'User prompt submitted',
        now,
        JSON.stringify({}),
        now
      );

      // Insert file snapshots
      const insertFile = this.db.prepare(`
        INSERT INTO file_snapshots (checkpointId, filePath, relativePath, content, size, modifiedTime, extension, isDirectory)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const file of files) {
        insertFile.run(
          checkpointId,
          file.absolutePath,
          file.relativePath,
          file.content,
          file.size,
          file.lastModified.toISOString(),
          file.extension,
          0
        );
      }

      // Update session stats  
      const updateSession = this.db.prepare(`
        UPDATE sessions SET totalFileChanges = totalFileChanges + ?, 
                           updatedAt = ? 
        WHERE id = ?
      `);
      updateSession.run(files.length, now, session.id);

      await this.logger.success(`✅ Checkpoint created: ${message}`);
      await this.logger.info(`   Files: ${files.length}, Size: ${FileUtils.formatFileSize(totalSize)}`);
      
      return {
        id: checkpointId,
        sessionId: session.id,
        projectPath: session.projectPath,
        projectName: session.projectName,
        message,
        fileCount: files.length,
        totalSize,
        userPrompt: session.lastPrompt,
        timestamp: now
      };
      
    } catch (error) {
      await this.logger.error('Failed to create checkpoint', error);
      return null;
    }
  }

  private generateCheckpointMessage(session: any, fileCount: number, totalSize: number): string {
    const size = FileUtils.formatFileSize(totalSize);
    
    // If we have the actual user prompt (not the generic message), use it directly
    if (session.lastPrompt && 
        session.lastPrompt !== 'User prompt submitted') {
      
      // Use the full prompt as the checkpoint title (this is what the user wants!)
      return `${session.lastPrompt} (${fileCount} files, ${size})`;
    }
    
    // Fallback to generic message if no real prompt captured
    return `User prompt submitted (${fileCount} files, ${size})`;
  }

  private getActiveSession(projectPath: string): Session | null {
    const getActiveSession = this.db.prepare(`
      SELECT * FROM sessions 
      WHERE projectPath = ? AND sessionEndTime IS NULL 
      ORDER BY sessionStartTime DESC 
      LIMIT 1
    `);
    
    const session = getActiveSession.get(projectPath) as Session | undefined;
    
    if (session) {
      this.currentSession = session;
    }
    
    return session || null;
  }

  async getProjectStats(): Promise<StatsResponse> {
    try {
      await this.logger.debug('Getting project stats from database');
      
      const getProjectStats = this.db.prepare(`
        SELECT 
          s.projectPath as id,
          s.projectPath,
          s.projectName,
          COUNT(DISTINCT s.id) as totalSessions,
          COUNT(c.id) as totalCheckpoints,
          SUM(s.totalFileChanges) as totalFileChanges,
          MAX(s.sessionStartTime) as lastSessionTime,
          MIN(s.sessionStartTime) as firstSessionTime,
          MIN(s.createdAt) as createdAt,
          MAX(s.updatedAt) as updatedAt
        FROM sessions s
        LEFT JOIN checkpoints c ON s.id = c.sessionId
        GROUP BY s.projectPath, s.projectName
      `);

      const rawProjects = getProjectStats.all();
      const projects = rawProjects.map((row: any) => ({
        ...row,
        lastSessionTime: new Date(row.lastSessionTime),
        firstSessionTime: new Date(row.firstSessionTime),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      })) as ProjectStats[];

      const getTotals = this.db.prepare(`
        SELECT 
          COUNT(DISTINCT s.id) as totalSessions,
          COUNT(c.id) as totalCheckpoints
        FROM sessions s
        LEFT JOIN checkpoints c ON s.id = c.sessionId
      `);

      const totals = getTotals.get() as { totalSessions: number; totalCheckpoints: number };
      const hasActiveSession = this.db.prepare(`
        SELECT COUNT(*) as count FROM sessions WHERE sessionEndTime IS NULL
      `).get() as { count: number };

      const result = {
        projects,
        totalSessions: totals.totalSessions || 0,
        totalCheckpoints: totals.totalCheckpoints || 0,
        hasActiveSession: (hasActiveSession.count || 0) > 0
      };

      await this.logger.debug(`Project stats: ${projects.length} projects, ${result.totalSessions} sessions`);
      return result;
    } catch (error) {
      await this.logger.error('Failed to get project stats', error);
      throw error;
    }
  }

  // Get current session (for API compatibility)
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  // Get checkpoints for a project
  async getCheckpoints(projectPath: string): Promise<any[]> {
    await this.logger.debug(`📋 Loading checkpoints for project: ${projectPath}`);
    
    const getCheckpoints = this.db.prepare(`
      SELECT 
        c.id,
        c.sessionId,
        c.message,
        c.timestamp,
        c.metadata,
        c.createdAt,
        c.projectPath,
        c.projectName,
        c.fileCount,
        c.totalSize,
        c.userPrompt,
        c.prompt
      FROM checkpoints c
      WHERE c.projectPath = ?
      ORDER BY c.timestamp DESC
    `);
    
    try {
      const rows = getCheckpoints.all(projectPath) as any[];
      await this.logger.debug(`📋 Found ${rows.length} checkpoints for project ${projectPath}`);
      
      return rows.map((row: any) => ({
        ...row,
        timestamp: row.timestamp  // Keep as string for JSON serialization
      }));
    } catch (error) {
      await this.logger.error(`❌ Error getting checkpoints for ${projectPath}`, error);
      throw error;
    }
  }

  // Get checkpoint by ID
  async getCheckpointById(checkpointId: string): Promise<any> {
    const getCheckpoint = this.db.prepare(`
      SELECT * FROM checkpoints WHERE id = ?
    `);
    
    const checkpoint = getCheckpoint.get(checkpointId) as any;
    
    if (!checkpoint) {
      return null;
    }
    
    // Get file snapshots for this checkpoint
    const getFiles = this.db.prepare(`
      SELECT * FROM file_snapshots WHERE checkpointId = ? ORDER BY relativePath ASC
    `);
    
    const files = getFiles.all(checkpointId);
    
    return {
      ...checkpoint,
      files
    };
  }

  // Simple cache/index stats (simplified for SQLite)
  async getProjectIndexStats(projectPath: string): Promise<any> {
    const getStats = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT s.id) as sessionCount,
        COUNT(c.id) as checkpointCount,
        s.projectName
      FROM sessions s
      LEFT JOIN checkpoints c ON s.id = c.sessionId
      WHERE s.projectPath = ?
      GROUP BY s.projectPath, s.projectName
    `);
    
    const stats = getStats.get(projectPath) as any;
    return {
      projectPath,
      projectName: stats?.projectName || basename(projectPath),
      sessionCount: stats?.sessionCount || 0,
      checkpointCount: stats?.checkpointCount || 0,
      lastIndexed: new Date().toISOString()
    };
  }

  // Reset project index (no-op for SQLite, but maintain API compatibility)
  async resetProjectIndex(projectPath?: string): Promise<void> {
    await this.logger.debug(`Index reset requested for ${projectPath || 'all projects'} - no action needed for SQLite`);
  }

  // Force full scan (no-op for SQLite, but maintain API compatibility)
  async forceFullScan(projectPath: string): Promise<void> {
    await this.logger.debug(`Full scan requested for ${projectPath} - no action needed for SQLite`);
  }

  // Restore checkpoint
  async restoreCheckpoint(checkpointId: string): Promise<any> {
    const checkpoint = await this.getCheckpointById(checkpointId);
    if (!checkpoint) {
      throw new Error('Checkpoint not found');
    }

    // Get all files for this checkpoint
    const getFiles = this.db.prepare(`
      SELECT filePath, content, isDirectory 
      FROM file_snapshots 
      WHERE checkpointId = ? AND isDirectory = 0
    `);
    const files = getFiles.all(checkpointId) as Array<{
      filePath: string;
      content: string | null;
      isDirectory: number;
    }>;

    let filesRestored = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        // Create directory if it doesn't exist
        const { dirname } = await import('path');
        const { mkdir, writeFile } = await import('fs/promises');
        
        const dir = dirname(file.filePath);
        await mkdir(dir, { recursive: true });
        
        // Write file content
        if (file.content !== null) {
          await writeFile(file.filePath, file.content, 'utf-8');
          filesRestored++;
          await this.logger.verbose(`Restored file: ${file.filePath}`);
        }
      } catch (error) {
        await this.logger.error(`Failed to restore file ${file.filePath}`, error);
        errors.push(`${file.filePath}: ${error}`);
      }
    }

    const result = {
      filesRestored,
      totalFiles: files.length,
      errors,
      checkpoint: {
        id: checkpoint.id,
        message: checkpoint.message || checkpoint.prompt,
        timestamp: checkpoint.timestamp
      }
    };

    await this.logger.success(`Restored ${filesRestored}/${files.length} files from checkpoint ${checkpointId}`);
    return result;
  }

  // Diff checkpoints
  async diffCheckpoints(currentId: string, previousId: string): Promise<any> {
    const current = await this.getCheckpointById(currentId);
    const previous = await this.getCheckpointById(previousId);
    
    if (!current || !previous) {
      throw new Error('One or both checkpoints not found');
    }

    // Get files for both checkpoints
    const getFiles = this.db.prepare(`
      SELECT filePath, relativePath, content, size
      FROM file_snapshots 
      WHERE checkpointId = ? AND isDirectory = 0
    `);
    
    const currentFiles = getFiles.all(currentId) as Array<{
      filePath: string;
      relativePath: string;
      content: string | null;
      size: number;
    }>;
    
    const previousFiles = getFiles.all(previousId) as Array<{
      filePath: string;
      relativePath: string;
      content: string | null;
      size: number;
    }>;

    // Create maps for easier comparison
    const currentFileMap = new Map(currentFiles.map(f => [f.filePath, f]));
    const previousFileMap = new Map(previousFiles.map(f => [f.filePath, f]));

    const changes: Array<{
      type: 'added' | 'modified' | 'deleted';
      file: string;
      diff?: string;
      sizeBefore?: number;
      sizeAfter?: number;
    }> = [];

    // Get all unique file paths
    const allPaths = new Set([...currentFileMap.keys(), ...previousFileMap.keys()]);

    for (const path of allPaths) {
      const currentFile = currentFileMap.get(path);
      const previousFile = previousFileMap.get(path);

      if (currentFile && !previousFile) {
        // File added
        changes.push({
          type: 'added',
          file: currentFile.relativePath || path,
          sizeAfter: currentFile.size
        });
      } else if (!currentFile && previousFile) {
        // File deleted
        changes.push({
          type: 'deleted',
          file: previousFile.relativePath || path,
          sizeBefore: previousFile.size
        });
      } else if (previousFile && currentFile) {
        // File exists in both - check if content changed
        if (currentFile.content !== previousFile.content) {
          // File modified
          const diff = this.generateSimpleDiff(previousFile.content || '', currentFile.content || '');
          changes.push({
            type: 'modified',
            file: currentFile.relativePath || path,
            diff,
            sizeBefore: previousFile.size,
            sizeAfter: currentFile.size
          });
        }
      }
    }

    return {
      current: {
        id: current.id,
        message: current.message || current.prompt,
        timestamp: current.timestamp
      },
      previous: {
        id: previous.id,
        message: previous.message || previous.prompt,
        timestamp: previous.timestamp
      },
      changes,
      summary: {
        added: changes.filter(c => c.type === 'added').length,
        modified: changes.filter(c => c.type === 'modified').length,
        deleted: changes.filter(c => c.type === 'deleted').length
      }
    };
  }

  private generateSimpleDiff(oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    // Generate full unified diff format
    let result = '';
    const maxLength = Math.max(oldLines.length, newLines.length);
    
    // Add unified diff header
    result += `@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
    
    // Generate line-by-line diff
    for (let i = 0; i < maxLength; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      
      if (oldLine === undefined) {
        // Line added
        result += `+${newLine}\n`;
      } else if (newLine === undefined) {
        // Line deleted
        result += `-${oldLine}\n`;
      } else if (oldLine !== newLine) {
        // Line modified
        result += `-${oldLine}\n`;
        result += `+${newLine}\n`;
      } else {
        // Line unchanged (context)
        result += ` ${oldLine}\n`;
      }
    }
    
    return result.trim() || 'No content changes detected';
  }

  // Delete checkpoint
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    const deleteCheckpoint = this.db.prepare(`DELETE FROM checkpoints WHERE id = ?`);
    deleteCheckpoint.run(checkpointId);
  }

  // Delete all checkpoints for a project
  async deleteProjectCheckpoints(projectPath: string): Promise<any> {
    const deleteCheckpoints = this.db.prepare(`
      DELETE FROM checkpoints 
      WHERE sessionId IN (SELECT id FROM sessions WHERE projectPath = ?)
    `);
    const deleteSessions = this.db.prepare(`DELETE FROM sessions WHERE projectPath = ?`);
    
    const checkpointResult = deleteCheckpoints.run(projectPath);
    const sessionResult = deleteSessions.run(projectPath);
    
    return {
      deletedCheckpoints: checkpointResult.changes,
      deletedSessions: sessionResult.changes
    };
  }

  // Clear all checkpoints
  async clearAllCheckpoints(): Promise<any> {
    // Get project count BEFORE clearing
    const getProjectCount = this.db.prepare(`SELECT COUNT(DISTINCT projectPath) as count FROM sessions`);
    const projectCount = (getProjectCount.get() as any)?.count || 0;
    
    // Clear everything - checkpoints, file_snapshots, and sessions
    const deleteFileSnapshots = this.db.prepare(`DELETE FROM file_snapshots`);
    const deleteAllCheckpoints = this.db.prepare(`DELETE FROM checkpoints`);
    const deleteAllSessions = this.db.prepare(`DELETE FROM sessions`);
    
    const fileSnapshotsResult = deleteFileSnapshots.run();
    const checkpointResult = deleteAllCheckpoints.run();
    const sessionResult = deleteAllSessions.run();
    
    await this.logger.success(`Cleared all data: ${sessionResult.changes} sessions, ${checkpointResult.changes} checkpoints, ${fileSnapshotsResult.changes} file snapshots`);
    
    return {
      deletedCheckpoints: checkpointResult.changes,
      deletedSessions: sessionResult.changes,
      deletedFileSnapshots: fileSnapshotsResult.changes,
      projectCount
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }
}