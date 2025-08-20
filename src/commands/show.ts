import { spawn } from 'child_process';
import type { ICommand } from './index.js';
import { ServerManager } from '../utils/server-manager.js';
import { SetupCommand } from './setup.js';
import { Logger } from '../utils/logger.js';

export class ShowCommand implements ICommand {
  private serverManager = new ServerManager();
  private setupCommand = new SetupCommand();
  private logger = Logger.getInstance();
  private readonly PORT = 9271;

  async execute(options: Record<string, string | boolean>): Promise<void> {
    const url = `http://127.0.0.1:${this.PORT}`;

    try {
      await this.logger.info('Starting show command execution');
      await this.logger.verbose(`Target URL: ${url}`);

      // Check if setup has been done (by checking if hooks are configured)
      const needsSetup = await this.checkIfSetupNeeded();
      
      if (needsSetup) {
        await this.logger.info('Setup needed - attempting auto-setup');
        try {
          await this.setupCommand.execute({ ...options, calledFromOtherCommand: true });
          await this.logger.success('Auto-setup completed');
        } catch (error) {
          await this.logger.warn('Auto-setup failed, but continuing with server startup', error);
          console.log('⚠️  Auto-setup failed, but you can still use the dashboard.');
          console.log('💡 Run `ccheckpoints setup` manually later to configure Claude Code hooks.');
        }
      } else {
        await this.logger.verbose('Setup not needed, proceeding with server check');
      }

      // Check if server is running
      const isRunning = await this.checkServerRunning();
      await this.logger.verbose(`Server running status: ${isRunning}`);
      
      if (!isRunning) {
        await this.logger.info('Starting server...');
        await this.serverManager.start(this.PORT);
        await this.logger.success(`Server started on port ${this.PORT}`);
      } else {
        await this.logger.verbose(`Server already running on port ${this.PORT}`);
      }

      // Open browser
      await this.logger.info(`Opening dashboard: ${url}`);
      await this.openBrowser(url);
      await this.logger.success('Dashboard opened successfully');
      
      // Ensure clean exit after successful execution
      await this.logger.success('Command completed successfully');
      process.exit(0);
      
    } catch (error) {
      await this.logger.error('Failed to open dashboard', error);
      console.error('❌ Failed to open dashboard:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async checkIfSetupNeeded(): Promise<boolean> {
    try {
      await this.logger.verbose('Checking if setup is needed');
      
      // Check if Claude Code is available
      const claudeCodeAvailable = await this.checkClaudeCodeAvailable();
      await this.logger.verbose(`Claude Code available: ${claudeCodeAvailable}`);
      
      if (!claudeCodeAvailable) {
        await this.logger.warn('Claude Code CLI not found - setup may be needed');
        return true;
      }
      
      // Check if hooks are configured (this is a simple heuristic)
      const { spawn } = await import('child_process');
      return new Promise((resolve) => {
        const child = spawn('claude', ['config', 'get', 'hooks.userPromptSubmit'], {
          stdio: 'pipe',
          shell: true
        });
        
        let output = '';
        child.stdout?.on('data', (data) => {
          output += data.toString();
        });
        
        child.on('exit', (code) => {
          const hasHook = output.includes('ccheckpoints') || output.includes('track');
          this.logger.verbose(`Hook check result: ${hasHook} (output: ${output.trim()})`);
          resolve(!hasHook); // Need setup if no hook is found
        });
        
        child.on('error', () => {
          this.logger.verbose('Error checking hooks - assuming setup needed');
          resolve(true);
        });
      });
    } catch (error) {
      await this.logger.verbose('Error checking setup status, assuming setup needed', error);
      return true;
    }
  }

  private async checkClaudeCodeAvailable(): Promise<boolean> {
    const { spawn } = await import('child_process');
    return new Promise((resolve) => {
      const child = spawn('claude', ['--version'], { 
        stdio: 'pipe',
        shell: true 
      });
      
      child.on('error', () => resolve(false));
      child.on('exit', (code: number) => resolve(code === 0));
    });
  }

  private async checkServerRunning(): Promise<boolean> {
    try {
      await this.logger.network(`Checking server health at http://127.0.0.1:${this.PORT}/api/health`);
      
      const response = await fetch(`http://127.0.0.1:${this.PORT}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000) // 3 second timeout
      });
      
      const isOk = response.ok;
      await this.logger.network(`Health check response: ${response.status} ${response.statusText}`);
      return isOk;
    } catch (error) {
      await this.logger.network('Health check failed', error);
      return false;
    }
  }

  private async openBrowser(url: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      let command: string;
      let args: string[];

      // Cross-platform browser opening
      switch (process.platform) {
        case 'darwin': // macOS
          command = 'open';
          args = [url];
          break;
        case 'win32': // Windows
          command = 'start';
          args = ['', url]; // Empty string is required for start command
          break;
        default: // Linux and others
          command = 'xdg-open';
          args = [url];
          break;
      }

      await this.logger.verbose(`Platform: ${process.platform}, Browser command: ${command} ${args.join(' ')}`);
      await this.logger.command(command, args);

      const child = spawn(command, args, {
        stdio: 'ignore',
        detached: true,
        shell: process.platform === 'win32' // Windows needs shell for 'start' command
      });

      child.on('error', async (error) => {
        // Fallback: show URL if browser opening fails
        await this.logger.error('Failed to open browser automatically', error);
        console.log(`❌ Failed to open browser automatically: ${error.message}`);
        console.log(`📋 Please open this URL manually: ${url}`);
        await this.logger.info(`User should manually open: ${url}`);
        resolve(); // Don't fail the command, just show the URL
      });

      child.on('spawn', async () => {
        await this.logger.verbose('Browser process spawned successfully');
        child.unref(); // Don't keep the process alive
        resolve();
      });
    });
  }
}