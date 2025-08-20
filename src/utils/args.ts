export interface ParsedArgs {
  command: string;
  options: Record<string, string | boolean>;
  flags: string[];
}

export function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    return {
      command: 'show', // Default command
      options: {},
      flags: []
    };
  }

  // Check if first arg is an option (starts with --)
  let command = 'show'; // Default
  let startIndex = 0;
  
  if (args[0] && !args[0].startsWith('-')) {
    command = args[0];
    startIndex = 1;
  }
  
  const options: Record<string, string | boolean> = {};
  const flags: string[] = [];

  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value !== undefined) {
        options[key] = value;
      } else {
        // Check if next arg is a value
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith('-')) {
          options[key] = nextArg;
          i++; // Skip next arg as we consumed it
        } else {
          options[key] = true; // Flag without value
        }
      }
    } else if (arg.startsWith('-')) {
      flags.push(...arg.slice(1).split(''));
    }
  }

  return { command, options, flags };
}

export function showHelp(): void {
  console.log(`
🚀 CCheckpoints - Claude Code Checkpoint System

USAGE:
  ccheckpoints [command] [options]

COMMANDS:
  setup             Set up hooks and start background server
  show              Open dashboard in browser (default)
  track             Track events (used by hooks)
  help, --help, -h  Show this help message

OPTIONS:
  --verbose, -v     Verbose output and logging to file
  --version         Show version

EXAMPLES:
  ccheckpoints              # Setup if needed and open dashboard
  ccheckpoints setup        # Setup hooks and server
  ccheckpoints show         # Setup if needed and open dashboard
  ccheckpoints --verbose    # Run with detailed logging
`);
}