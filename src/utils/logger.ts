import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class Logger {
  private static instance: Logger;
  private logFile: string;
  private isVerbose: boolean = false;

  private constructor() {
    // Use proper app data directory - but don't create directories yet
    const logDir = this.getLogDirectory();
    this.logFile = path.join(logDir, 'ccheckpoints.log');
    // Only create directories when actually needed (lazy initialization)
  }

  private getLogDirectory(): string {
    switch (process.platform) {
      case 'win32':
        return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming', 'CCheckpoints');
      case 'darwin':
        return path.join(os.homedir(), 'Library', 'Logs', 'CCheckpoints');
      default: // Linux and others
        return process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state', 'CCheckpoints');
    }
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      const logDir = path.dirname(this.logFile);
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setVerbose(verbose: boolean): void {
    this.isVerbose = verbose;
    if (verbose) {
      this.info('🔍 Verbose logging enabled');
      this.info(`📝 Log file: ${this.logFile}`);
      this.info(`🖥️  Platform: ${process.platform}`);
      this.info(`📂 Working directory: ${process.cwd()}`);
      this.info(`🏠 Home directory: ${os.homedir()}`);
      this.info(`⚡ Node version: ${process.version}`);
    }
  }

  private async writeToFile(level: string, message: string, data?: any): Promise<void> {
    try {
      // Ensure log directory exists (lazy initialization)
      await this.ensureLogDirectory();
      
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level}] ${message}`;
      const fullEntry = data ? `${logEntry}\n${JSON.stringify(data, null, 2)}\n` : `${logEntry}\n`;
      
      await fs.appendFile(this.logFile, fullEntry);
    } catch (error) {
      // Don't fail the operation if logging fails
      this.safeConsoleError(`Failed to write to log file: ${error}`);
    }
  }

  private formatMessage(level: string, icon: string, message: string): string {
    const timestamp = this.isVerbose ? `[${new Date().toLocaleTimeString()}] ` : '';
    return `${timestamp}${icon} ${message}`;
  }

  safeConsoleLog(message: string): void {
    try {
      // For background processes, skip console output entirely to avoid EPIPE
      if (process.env.CCHECKPOINTS_BACKGROUND === 'true') {
        return;
      }
      
      // Double-check stdout availability
      if (process.stdout && 
          process.stdout.writable && 
          !process.stdout.destroyed &&
          !process.stdout.closed) {
        console.log(message);
      }
    } catch (error) {
      // If console logging fails (EPIPE), silently ignore
      // The file logging will still work
    }
  }

  safeConsoleError(message: string): void {
    try {
      // For background processes, skip console output entirely to avoid EPIPE
      if (process.env.CCHECKPOINTS_BACKGROUND === 'true') {
        return;
      }
      
      // Double-check stderr availability
      if (process.stderr && 
          process.stderr.writable && 
          !process.stderr.destroyed &&
          !process.stderr.closed) {
        console.error(message);
      }
    } catch (error) {
      // If console logging fails (EPIPE), silently ignore
      // The file logging will still work
    }
  }

  async info(message: string, data?: any): Promise<void> {
    const formattedMessage = this.formatMessage('INFO', '💡', message);
    this.safeConsoleLog(formattedMessage);
    await this.writeToFile('INFO', message, data);
  }

  async success(message: string, data?: any): Promise<void> {
    const formattedMessage = this.formatMessage('SUCCESS', '✅', message);
    this.safeConsoleLog(formattedMessage);
    await this.writeToFile('SUCCESS', message, data);
  }

  async warn(message: string, data?: any): Promise<void> {
    const formattedMessage = this.formatMessage('WARN', '⚠️', message);
    this.safeConsoleLog(formattedMessage);
    await this.writeToFile('WARN', message, data);
  }

  async error(message: string, error?: any): Promise<void> {
    const formattedMessage = this.formatMessage('ERROR', '❌', message);
    this.safeConsoleError(formattedMessage);
    
    let errorData = error;
    if (error instanceof Error) {
      errorData = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }
    
    await this.writeToFile('ERROR', message, errorData);
  }

  async debug(message: string, data?: any): Promise<void> {
    if (this.isVerbose) {
      const formattedMessage = this.formatMessage('DEBUG', '🔧', message);
      this.safeConsoleLog(formattedMessage);
    }
    await this.writeToFile('DEBUG', message, data);
  }

  async verbose(message: string, data?: any): Promise<void> {
    if (this.isVerbose) {
      const formattedMessage = this.formatMessage('VERBOSE', '🔍', message);
      this.safeConsoleLog(formattedMessage);
    }
    await this.writeToFile('VERBOSE', message, data);
  }

  async command(command: string, args?: string[]): Promise<void> {
    const fullCommand = args ? `${command} ${args.join(' ')}` : command;
    await this.verbose(`Executing command: ${fullCommand}`);
  }

  async network(message: string, data?: any): Promise<void> {
    await this.verbose(`Network: ${message}`, data);
  }

  async fs(message: string, data?: any): Promise<void> {
    await this.verbose(`FileSystem: ${message}`, data);
  }

  async process(message: string, data?: any): Promise<void> {
    await this.verbose(`Process: ${message}`, data);
  }

  async clearLogFile(): Promise<void> {
    try {
      await fs.writeFile(this.logFile, '');
      await this.info('Log file cleared');
    } catch (error) {
      await this.error('Failed to clear log file', error);
    }
  }

  getLogFilePath(): string {
    return this.logFile;
  }

  async appendSystemInfo(): Promise<void> {
    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cwd: process.cwd(),
      homedir: os.homedir(),
      env: {
        NODE_ENV: process.env.NODE_ENV,
        CCHECKPOINTS_VERBOSE: process.env.CCHECKPOINTS_VERBOSE,
        PATH: process.env.PATH?.substring(0, 200) + '...' // Truncate PATH for readability
      },
      argv: process.argv,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    await this.verbose('System Information', systemInfo);
  }

  async logCall(functionName: string, args?: any[]): Promise<void> {
    const argsStr = args ? JSON.stringify(args).substring(0, 200) : 'none';
    await this.debug(`🔧 Function call: ${functionName}(${argsStr})`);
  }

  async logReturn(functionName: string, result?: any): Promise<void> {
    const resultStr = result ? JSON.stringify(result).substring(0, 200) : 'void';
    await this.debug(`↩️  Function return: ${functionName} → ${resultStr}`);
  }

  async logException(functionName: string, error: any): Promise<void> {
    await this.error(`💥 Exception in ${functionName}`, error);
  }

  async logDatabaseOperation(operation: string, query?: string, params?: any[]): Promise<void> {
    await this.debug(`🗃️  Database ${operation}: ${query || 'N/A'}`, params ? { params } : undefined);
  }

  async logServerRequest(method: string, url: string, body?: any): Promise<void> {
    await this.debug(`📡 ${method} ${url}`, body ? { body } : undefined);
  }

  async logServerResponse(status: number, url: string, responseTime?: number): Promise<void> {
    const time = responseTime ? ` (${responseTime}ms)` : '';
    await this.debug(`📤 ${status} ${url}${time}`);
  }
}