import type { ParsedArgs } from '../utils/args.js';
import { SetupCommand } from './setup.js';
import { ShowCommand } from './show.js';
import { TrackCommand } from './track.js';
import { Logger } from '../utils/logger.js';

export class Command {
  private setupCommand = new SetupCommand();
  private showCommand = new ShowCommand();
  private trackCommand = new TrackCommand();
  private logger = Logger.getInstance();

  async execute(args: ParsedArgs): Promise<void> {
    const { command, options } = args;

    // Set verbose logging if requested
    if (Boolean(options.verbose) || args.flags.includes('v')) {
      process.env.CCHECKPOINTS_VERBOSE = 'true';
      await this.logger.verbose('Environment variable CCHECKPOINTS_VERBOSE set to true');
    }

    await this.logger.debug(`Command dispatcher handling: ${command}`);

    // Dispatch to appropriate command
    switch (command) {
      case 'setup':
        await this.logger.info('Executing setup command');
        await this.setupCommand.execute(options);
        break;
        
      case 'track':
        await this.logger.debug('Executing track command');
        await this.trackCommand.execute(options);
        break;
        
      case 'show':
      default:
        await this.logger.info('Executing show command (with auto-setup if needed)');
        await this.showCommand.execute(options);
        break;
    }

    await this.logger.success('Command completed successfully');
  }
}

// Base command interface for consistency
export interface ICommand {
  execute(options: Record<string, string | boolean>): Promise<void>;
}