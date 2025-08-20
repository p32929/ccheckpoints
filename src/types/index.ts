export interface ClaudeSession {
  id: string;
  projectPath: string;
  projectName: string;
  startTime: Date;
  lastPrompt?: string;
  lastPromptTime?: Date;
  isActive: boolean;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  projectPath: string;
  projectName: string;
  message: string;
  timestamp: Date;
  fileCount: number;
  totalSize: number;
  userPrompt?: string;
}

export interface FileSnapshot {
  id: string;
  checkpointId: string;
  relativePath: string;
  content: string;
  hash: string;
  size: number;
  lastModified: Date;
}

export interface WebSocketMessage {
  type: 'session_start' | 'session_stop' | 'checkpoint_created' | 'error' | 'connected';
  data: any;
}

export interface ProjectStats {
  projectName: string;
  projectPath: string;
  checkpointCount: number;
  lastCheckpoint?: Date;
  totalSize: number;
}