# CCheckpoints

A checkpoint system for Claude Code CLI that automatically tracks your coding sessions. Inspired by Cursor IDE's checkpoint feature - see everything you've done with Claude Code CLI and navigate through your conversation history.

## What is CCheckpoints?

CCheckpoints hooks into Claude Code CLI to automatically save checkpoints every time you interact with Claude Code CLI. It creates a timeline of your entire coding session that you can view in a beautiful web dashboard.

## Quick Start

```bash
# Install globally
npm install -g ccheckpoints

# Run (auto-setup + open dashboard)
ccheckpoints
```

That's it! Running `ccheckpoints` will:
1. ✅ Auto-setup Claude Code hooks (if not already done)
2. ✅ Start the background server
3. ✅ Open the dashboard in your browser

## How It Works

1. **Automatic Tracking**: Every time you send a message to Claude Code CLI, CCheckpoints saves it as a checkpoint
2. **Background Server**: Runs quietly at `http://127.0.0.1:9271` to handle tracking
3. **Web Dashboard**: Beautiful interface to see all your checkpoints and sessions
4. **SQLite Database**: All data stored locally in `%APPDATA%/CCheckpoints/`

## Commands

### Just run it!
```bash
ccheckpoints
```
This does everything - sets up hooks if needed and opens the dashboard.

### Manual setup (optional)
```bash
ccheckpoints setup
```
Only needed if you want to setup without opening the dashboard.

### Show dashboard
```bash
ccheckpoints show
```
Same as running just `ccheckpoints` - opens the dashboard (with auto-setup if needed).

### Help
```bash
ccheckpoints --help
```

### Verbose mode
```bash
ccheckpoints --verbose
```
See detailed logs of what's happening behind the scenes.

## What Gets Tracked?

- **Every message you send to Claude Code CLI** (submit event)
- **Session stops** (when you exit Claude Code)
- **Timestamps** for everything
- **Full conversation context**

## Screenshots

### 📊 Session Overview
Get a bird's-eye view of all your Claude Code CLI sessions. See when you started, how long you worked, and track your productivity patterns.

<img width="1920" height="922" alt="Session Dashboard" src="https://github.com/user-attachments/assets/506ce9f8-54aa-4ac3-8605-5404c2f0e017" />

### 🎯 Checkpoint Timeline
Every message you send to Claude Code CLI is saved as a checkpoint. Navigate through your entire conversation history with timestamps and full context.

<img width="1920" height="922" alt="Checkpoint Timeline" src="https://github.com/user-attachments/assets/6e26588b-a983-4ff7-96c7-e820734e62c3" />

### 🔍 Compare Changes
See exactly what changed between checkpoints. Perfect for debugging when something breaks or understanding how your code evolved.

<img width="1920" height="922" alt="Diff View" src="https://github.com/user-attachments/assets/3d0a72cf-da43-4b81-b797-eef0c5aa2086" />

## File Locations

- **Windows**: `%APPDATA%/CCheckpoints/`
- **Mac/Linux**: `~/.ccheckpoints/`

Contains:
- `checkpoints.db` - SQLite database with all your data
- `logs/` - Debug logs (when using --verbose)

## For Developers

### Build from source

```bash
# Clone repo
git clone https://github.com/p32929/ccheckpoints.git
cd ccheckpoints

# Install deps
npm install

# Build
npm run build

# install globally
npm install -g .

# Now use it
ccheckpoints
```

### Development mode

```bash
npm run dev         # Run without building
npm run dev:watch   # Auto-reload on changes
```

## How the Hook System Works

When you run `ccheckpoints setup`, it adds these hooks to your Claude Code config:

- `userPromptSubmit` → Tracks when you send a message
- `stop` → Tracks when session ends

The hooks call `ccheckpoints track --event=<type>` which sends the data to the background server running on port 9271.

## Troubleshooting

### Port 9271 already in use?
The background server needs port 9271. If it's busy, close other apps using it.

### Dashboard won't open?
Make sure the server is running. Try `ccheckpoints --verbose` to see what's happening.

### Hooks not working?
Run setup again:
```bash
ccheckpoints setup
```

### See detailed logs
```bash
ccheckpoints --verbose
```
Check logs in `%APPDATA%/CCheckpoints/logs/`

## Found Something?

If you find a bug or have an idea, feel free to open an issue! I'd be happy to discuss and see what we can do about it together.

Your feedback means a lot - thank you for using CCheckpoints!

## License

```
MIT License

Copyright (c) 2025 Fayaz Bin Salam

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```