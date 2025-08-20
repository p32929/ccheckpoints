import type { ICommand } from './index.js';
import { Logger } from '../utils/logger.js';
import { basename } from 'path';

export class TrackCommand implements ICommand {
  private logger = Logger.getInstance();
  private readonly PORT = 9271;

  private async readStdin(): Promise<string> {
    return new Promise((resolve) => {
      let data = '';
      
      if (process.stdin.isTTY) {
        // No stdin data available (running from terminal)
        resolve('');
        return;
      }

      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      
      process.stdin.on('end', () => {
        resolve(data.trim());
      });
      
      // Timeout after 1 second if no data comes
      setTimeout(() => {
        resolve(data.trim());
      }, 1000);
    });
  }

  async execute(options: Record<string, string | boolean>): Promise<void> {
    const event = options.event as string;
    
    await this.logger.debug(`Track command executed with event: ${event}`, options);
    
    if (!event) {
      await this.logger.error('Event type is required for track command');
      console.error('❌ Event type is required. Use --event=submit or --event=stop');
      process.exit(1);
    }

    // Read stdin for Claude Code hook data (contains user prompt)
    const stdinContent = await this.readStdin();
    let actualPrompt = '';
    let hookData: any = {};

    if (stdinContent) {
      try {
        hookData = JSON.parse(stdinContent);
        actualPrompt = hookData.prompt || '';
        await this.logger.debug('Parsed hook data from stdin', hookData);
      } catch (parseError) {
        await this.logger.warn('Failed to parse stdin as JSON, treating as plain text', parseError);
        actualPrompt = stdinContent;
      }
    }

    // Map CLI events to CheckpointManager events
    let eventType: string;
    switch (event) {
      case 'submit':
        eventType = 'UserPromptSubmit';
        break;
      case 'stop':
        eventType = 'Stop';
        break;
      default:
        throw new Error(`Unknown event type: ${event}`);
    }

    const data = {
      timestamp: new Date().toISOString(),
      cwd: process.cwd(),
      args: process.argv.slice(2),
      eventType,
      promptSources: {
        actual_prompt: actualPrompt,
        stdin_content: stdinContent,
        hook_data: hookData
      },
      possiblePrompt: actualPrompt || 'User prompt submitted',
      projectPath: process.cwd(),
      projectName: basename(process.cwd())
    };

    try {
      // Send tracking event to the background server
      const trackUrl = `http://127.0.0.1:${this.PORT}/api/claude-event`;
      const payload = { eventType, data };
      
      await this.logger.verbose(`Tracking event to ${trackUrl}`, payload);
      
      const response = await fetch(trackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000)
      });

      await this.logger.verbose(`Track response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        await this.logger.error(`Server error response: ${errorText}`);
        throw new Error(`Server responded with ${response.status}: ${errorText}`);
      }

      const responseData = await response.json();
      await this.logger.verbose('Track response data', responseData);

      // Silent success for hook operations
      await this.logger.success(`Event tracked: ${event}`);
      if (process.env.CCHECKPOINTS_VERBOSE) {
        console.log(`✅ Tracked event: ${event}`);
      }
      
      // Ensure clean exit after successful tracking
      await this.logger.success('Command completed successfully');
      process.exit(0);

    } catch (error) {
      // Server failed, try direct database access as fallback
      await this.logger.warn(`Server unavailable, trying direct database access...`);
      
      try {
        // Import and use the checkpoint manager directly
        const { CheckpointManager } = await import('../core/checkpoint-manager-sqlite.js');
        const checkpointManager = new CheckpointManager();
        
        const result = await checkpointManager.handleClaudeEvent(eventType, data);
        
        await this.logger.success(`Event tracked: ${event} (direct database)`);
        if (process.env.CCHECKPOINTS_VERBOSE) {
          console.log(`✅ Tracked event: ${event} (direct database)`);
        }
        
        await this.logger.success('Command completed successfully');
        process.exit(0);
        
      } catch (directError) {
        // Both server and direct access failed
        await this.logger.warn(`Failed to track event ${event} (both server and direct access failed)`, directError);
        if (process.env.CCHECKPOINTS_VERBOSE) {
          console.error(`⚠️  Failed to track event ${event}:`, 
            directError instanceof Error ? directError.message : String(directError));
        }
        
        // Exit successfully to not break Claude Code hooks
        await this.logger.debug('Exiting successfully to not break Claude Code hooks');
        process.exit(0);
      }
    }
  }
}