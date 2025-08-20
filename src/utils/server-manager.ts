import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ServerManager {
  private static readonly PID_FILE = path.join(os.homedir(), '.ccheckpoints.pid');
  private static readonly LOG_FILE = path.join(os.homedir(), '.ccheckpoints.server.log');
  private logger = Logger.getInstance();


  async start(port: number = 9271): Promise<void> {
    await this.logger.verbose(`Starting server on port ${port}`);
    
    // Check if already running
    if (await this.isRunning()) {
      await this.logger.verbose('Server is already running');
      return;
    }

    // Get the server script path
    const serverScript = await this.getServerScriptPath();
    await this.logger.verbose(`Server script path: ${serverScript}`);
    
    // Simple environment - no database complexity with SQLite
    const env = {
      ...process.env,
      PORT: port.toString(),
      NODE_ENV: 'production',
      CCHECKPOINTS_BACKGROUND: 'true'  // Disable console output to prevent EPIPE
    };
    
    await this.logger.verbose('Server environment', { 
      PORT: env.PORT, 
      NODE_ENV: env.NODE_ENV
    });

    // Determine the command based on the file extension
    const isTypeScript = serverScript.endsWith('.ts');
    const command = isTypeScript ? 'tsx' : 'node';
    const args = [serverScript];
    
    // Spawn the server process from CLI package directory (simple and reliable)
    await this.logger.command(command, args);
    const serverProcess = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env,
      cwd: path.dirname(serverScript), // Run from server script directory
      shell: false
    });

    await this.logger.verbose(`Server process spawned with PID: ${serverProcess.pid}`);

    // Handle server process events
    serverProcess.unref();

    // Save PID for later management
    await fs.writeFile(ServerManager.PID_FILE, serverProcess.pid!.toString());
    await this.logger.fs(`PID saved to ${ServerManager.PID_FILE}: ${serverProcess.pid}`);

    // Setup logging
    if (serverProcess.stdout) {
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        this.logger.verbose(`[SERVER STDOUT] ${output.trim()}`);
        this.logToServerFile(`[STDOUT] ${output}`);
      });
    }

    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        this.logger.verbose(`[SERVER STDERR] ${output.trim()}`);
        this.logToServerFile(`[STDERR] ${output}`);
      });
    }

    serverProcess.on('error', async (error) => {
      await this.logger.error('Server process error', error);
      this.logToServerFile(`[ERROR] ${error.message}`);
      throw new Error(`Failed to start server: ${error.message}`);
    });

    serverProcess.on('exit', async (code, signal) => {
      await this.logger.verbose(`Server exited with code ${code}, signal ${signal}`);
      this.logToServerFile(`[EXIT] Server exited with code ${code}, signal ${signal}`);
      this.cleanup();
    });

    // Wait a moment for the server to start
    await this.logger.verbose('Waiting for server to start...');
    await this.waitForServerStart(port, 5000);
    await this.logger.success(`Server successfully started on port ${port}`);
  }

  async stop(): Promise<void> {
    try {
      const pid = await this.getPid();
      if (pid !== null) {
        process.kill(pid, 'SIGTERM');
        await this.waitForServerStop(2000);
      }
    } catch (error) {
      // If we can't stop gracefully, clean up anyway
      if (process.env.CCHECKPOINTS_VERBOSE) {
        console.log('Graceful stop failed, cleaning up:', error);
      }
    } finally {
      await this.cleanup();
    }
  }

  async isRunning(): Promise<boolean> {
    try {
      const pid = await this.getPid();
      if (!pid) return false;
      
      // Check if process exists
      process.kill(pid, 0); // This throws if process doesn't exist
      return true;
    } catch {
      // Process doesn't exist, clean up stale PID file
      await this.cleanup();
      return false;
    }
  }

  async getStatus(): Promise<{ running: boolean; pid?: number; port?: number }> {
    const running = await this.isRunning();
    const pidValue = running ? await this.getPid() : null;
    const pid = pidValue !== null ? pidValue : undefined;
    
    return {
      running,
      pid,
      port: 9271 // Could be enhanced to read from config
    };
  }

  private async getPid(): Promise<number | null> {
    try {
      const pidString = await fs.readFile(ServerManager.PID_FILE, 'utf-8');
      return parseInt(pidString.trim(), 10);
    } catch {
      return null;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await fs.unlink(ServerManager.PID_FILE);
    } catch {
      // File might not exist, ignore
    }
  }

  private async getServerScriptPath(): Promise<string> {
    await this.logger.verbose(`getServerScriptPath: __dirname = ${__dirname}`);
    await this.logger.verbose(`getServerScriptPath: NODE_ENV = ${process.env.NODE_ENV}`);
    
    // When running from development (tsx), __dirname will be src/utils
    // When running from production (node), __dirname will be dist/utils
    // We need to handle both cases correctly
    
    const isDevelopment = process.env.NODE_ENV === 'development' || 
                          __dirname.includes('src') || 
                          __dirname.includes('src\\utils');
    
    if (isDevelopment) {
      // Development: run TypeScript directly with tsx
      const projectRoot = path.resolve(__dirname, '../..');
      const serverPath = path.join(projectRoot, 'src', 'server.ts');
      await this.logger.verbose(`Development server path: ${serverPath}`);
      
      // Check if TypeScript file exists, fall back to dist if not
      try {
        await fs.access(serverPath);
        return serverPath;
      } catch {
        // Fall back to dist version
        const distPath = path.join(projectRoot, 'dist', 'server.js');
        await this.logger.verbose(`Falling back to dist server path: ${distPath}`);
        return distPath;
      }
    } else {
      // Production: use the distributed JavaScript file
      // When installed globally, __dirname points to the installed package directory
      // The server.js should be at the same level as utils directory
      const distRoot = path.resolve(__dirname, '..');
      const serverPath = path.join(distRoot, 'server.js');
      await this.logger.verbose(`Production server path: ${serverPath}`);
      
      // Verify the file exists
      try {
        await fs.access(serverPath);
        await this.logger.verbose(`Server script exists at: ${serverPath}`);
        return serverPath;
      } catch (error) {
        // Try alternative path - when running from source dist folder
        const altPath = path.resolve(__dirname, '..', '..', 'dist', 'server.js');
        await this.logger.verbose(`Trying alternative path: ${altPath}`);
        try {
          await fs.access(altPath);
          await this.logger.verbose(`Server script found at alternative path: ${altPath}`);
          return altPath;
        } catch {
          await this.logger.error(`Server script NOT found at: ${serverPath} or ${altPath}`);
          await this.logger.error(`Error: ${error}`);
          throw new Error(`Server script not found at ${serverPath} or ${altPath}`);
        }
      }
    }
  }


  private async waitForServerStart(port: number, timeout: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(1000)
        });
        
        if (response.ok) {
          return; // Server is ready
        }
      } catch {
        // Server not ready yet, continue waiting
      }
      
      // Wait 500ms before next check
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error(`Server failed to start within ${timeout}ms`);
  }

  private async waitForServerStop(timeout: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (!(await this.isRunning())) {
        return; // Server stopped
      }
      
      // Wait 100ms before next check
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Force kill if still running
    const pid = await this.getPid();
    if (pid !== null) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process might already be dead
      }
    }
  }

  private async logToServerFile(message: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}\n`;
      await fs.appendFile(ServerManager.LOG_FILE, logEntry);
    } catch (error) {
      await this.logger.warn('Failed to write to server log file', error);
    }
  }
}