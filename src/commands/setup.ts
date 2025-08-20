import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import type { ICommand } from './index.js';
import { ServerManager } from '../utils/server-manager.js';
import { Logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SetupCommand implements ICommand {
  private serverManager = new ServerManager();
  private logger = Logger.getInstance();
  private readonly PORT = 9271;

  async execute(options: Record<string, string | boolean>): Promise<void> {
    await this.logger.info('🔧 Setting up CCheckpoints...');

    try {
      await this.logger.verbose('Starting setup process with options', options);
      
      // Step 1: Setup Claude Code hooks
      await this.logger.info('Step 1: Setting up Claude Code hooks');
      await this.setupClaudeCodeHooks();
      
      // Step 2: Database is now self-contained (SQLite)
      await this.logger.info('Step 2: Database initialization');
      await this.logger.info('Database will be automatically created in %APPDATA%/CCheckpoints/');
      console.log('✅ Database will be automatically created when needed');
      
      // Step 3: Start background server
      await this.logger.info('Step 3: Starting background server');
      await this.startBackgroundServer();
      
      // Step 4: Verify setup
      await this.logger.info('Step 4: Verifying setup');
      await this.verifySetup();
      
      await this.logger.success('Setup complete! CCheckpoints is ready to use.');
      console.log('\n✅ Setup complete! CCheckpoints is ready to use.');
      console.log('💡 Run `ccheckpoints` to open the dashboard');
      
      // Ensure clean exit after setup completion (only if called directly)
      await this.logger.success('Command completed successfully');
      if (!options.calledFromOtherCommand) {
        process.exit(0);
      }
      
    } catch (error) {
      await this.logger.error('Setup failed', error);
      console.error('\n❌ Setup failed:', error instanceof Error ? error.message : String(error));
      if (!options.calledFromOtherCommand) {
        process.exit(1);
      }
      throw error;
    }
  }

  private async setupClaudeCodeHooks(): Promise<void> {
    await this.logger.info('📋 Setting up Claude Code hooks...');
    
    try {
      // Check if Claude Code is available
      await this.logger.verbose('Checking if Claude Code is available');
      await this.checkClaudeCodeAvailable();
      await this.logger.success('Claude Code CLI is available');
      
      // Get the CLI executable path for hooks
      const cliPath = await this.getCliPath();
      await this.logger.verbose(`CLI path for hooks: ${cliPath}`);
      
      // Set up the hooks using settings.json file
      await this.setupHooksViaSettingsFile(cliPath);
      
      await this.logger.success('Claude Code hooks configured');
      console.log('✅ Claude Code hooks configured');
      
    } catch (error) {
      await this.logger.error('Failed to setup hooks', error);
      throw new Error(`Failed to setup hooks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async setupHooksViaSettingsFile(cliPath: string): Promise<void> {
    const os = await import('os');
    const path = await import('path');
    
    // Determine Claude settings directory
    let claudeDir: string;
    switch (process.platform) {
      case 'win32':
        claudeDir = path.join(os.homedir(), '.claude');
        break;
      case 'darwin':
        claudeDir = path.join(os.homedir(), '.claude');
        break;
      default: // linux
        claudeDir = path.join(os.homedir(), '.claude');
        break;
    }
    
    const settingsPath = path.join(claudeDir, 'settings.json');
    await this.logger.verbose(`Claude settings path: ${settingsPath}`);
    
    // Ensure the directory exists
    try {
      await fs.mkdir(claudeDir, { recursive: true });
      await this.logger.verbose(`Created Claude directory: ${claudeDir}`);
    } catch (error) {
      await this.logger.verbose(`Claude directory already exists or creation failed`, error);
    }
    
    // Create hooks configuration
    const hooksConfig = {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: "command",
                command: `${cliPath} track --event=submit`
              }
            ]
          }
        ],
        Stop: [
          {
            hooks: [
              {
                type: "command", 
                command: `${cliPath} track --event=stop`
              }
            ]
          }
        ]
      }
    };
    
    // Read existing settings if they exist
    let existingSettings = {};
    try {
      const existingContent = await fs.readFile(settingsPath, 'utf-8');
      existingSettings = JSON.parse(existingContent);
      await this.logger.verbose('Read existing Claude settings', existingSettings);
    } catch (error) {
      await this.logger.verbose('No existing Claude settings found, creating new file');
    }
    
    // Merge with existing settings
    const mergedSettings = {
      ...existingSettings,
      ...hooksConfig
    };
    
    // Write settings file
    await this.logger.verbose('Writing Claude settings with hooks', mergedSettings);
    await fs.writeFile(settingsPath, JSON.stringify(mergedSettings, null, 2), 'utf-8');
    await this.logger.success(`Claude hooks configured in: ${settingsPath}`);
    
    console.log('✅ Claude hooks written to settings.json');
    console.log('💡 Please restart Claude Code for the hooks to take effect');
  }

  private async checkClaudeCodeAvailable(): Promise<void> {
    // Try multiple methods to detect Claude Code
    const methods = [
      { command: 'claude', args: ['--version'], name: 'version check' },
      { command: 'claude', args: ['doctor'], name: 'doctor check' }
    ];

    for (const method of methods) {
      try {
        await this.tryClaudeCommand(method.command, method.args, method.name);
        return; // Success, exit early
      } catch (error) {
        await this.logger.verbose(`${method.name} failed, trying next method`, error);
      }
    }

    // If we get here, all methods failed
    throw new Error('Claude CLI not found or not working properly.\nPlease ensure Claude Code is properly installed.\nTry running `claude doctor` to verify your installation.');
  }

  private async tryClaudeCommand(command: string, args: string[], methodName: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      await this.logger.command(command, args);
      
      const child = spawn(command, args, { 
        stdio: 'pipe',
        shell: true 
      });
      
      let stdout = '';
      let stderr = '';
      
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }
      
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }
      
      child.on('error', async (error) => {
        await this.logger.error(`Claude CLI ${methodName} - process error`, error);
        reject(error);
      });
      
      child.on('exit', async (code) => {
        await this.logger.verbose(`Claude CLI ${methodName} exit code: ${code}`);
        await this.logger.verbose(`Claude CLI stdout: ${stdout.trim()}`);
        await this.logger.verbose(`Claude CLI stderr: ${stderr.trim()}`);
        
        // Check for success indicators
        const output = stdout.trim() + stderr.trim();
        const isSuccess = code === 0 || 
                         output.includes('claude') || 
                         output.includes('version') ||
                         output.includes('API Key: Valid') ||
                         output.includes('✅');
        
        if (isSuccess) {
          await this.logger.success(`Claude CLI detected via ${methodName}: ${output || 'Command succeeded'}`);
          resolve();
        } else {
          await this.logger.verbose(`Claude CLI ${methodName} failed - exit code: ${code}, output: "${output}"`);
          reject(new Error(`${methodName} failed with exit code ${code}: ${output}`));
        }
      });
    });
  }

  private async getCliPath(): Promise<string> {
    // In production, this will be the installed binary path
    // In development, we need to handle it differently
    
    if (process.env.NODE_ENV === 'development') {
      // Development: use tsx to run the TypeScript file
      const projectRoot = path.resolve(__dirname, '../..');
      return `tsx "${path.join(projectRoot, 'src/cli.ts')}"`;
    } else {
      // Production: use the installed binary
      return 'ccheckpoints';
    }
  }



  private async startBackgroundServer(): Promise<void> {
    await this.logger.info('🚀 Starting background server...');
    
    try {
      await this.logger.verbose(`Starting server on port ${this.PORT}`);
      await this.serverManager.start(this.PORT);
      await this.logger.success(`Server started on port ${this.PORT}`);
      console.log(`✅ Server started on port ${this.PORT}`);
    } catch (error) {
      await this.logger.error('Failed to start server', error);
      throw new Error(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async verifySetup(): Promise<void> {
    await this.logger.info('🔍 Verifying setup...');
    
    // Check if server is responding
    try {
      const healthUrl = `http://127.0.0.1:${this.PORT}/api/health`;
      await this.logger.network(`Checking health endpoint: ${healthUrl}`);
      
      const response = await fetch(healthUrl, {
        method: 'GET'
      });
      
      await this.logger.verbose(`Health check response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        throw new Error(`Server not responding properly: ${response.status} ${response.statusText}`);
      }
      
      const responseData = await response.json();
      await this.logger.verbose('Health check response data', responseData);
      
      await this.logger.success('Server is responding correctly');
      console.log('✅ Server is responding');
    } catch (error) {
      await this.logger.error('Server verification failed', error);
      throw new Error(`Server verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}