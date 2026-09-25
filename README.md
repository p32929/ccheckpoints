# CCheckpoints

A checkpoint system for Claude Code CLI that automatically tracks your coding sessions. Inspired by Cursor IDE's checkpoint feature - see everything you've done with Claude Code CLI and navigate through your conversation history.

On npm: **[ccheckpoints](https://www.npmjs.com/package/ccheckpoints)**

<img width="1920" height="922" alt="CCheckpoints session dashboard" src="https://github.com/user-attachments/assets/506ce9f8-54aa-4ac3-8605-5404c2f0e017" />

## What is CCheckpoints?

CCheckpoints hooks into Claude Code CLI to automatically save checkpoints every time you interact with Claude Code CLI. It creates a timeline of your entire coding session that you can view in a beautiful web dashboard.

## Quick Start

```bash
# Install globally
npm install -g ccheckpoints

# Run (auto-setup + open dashboard)
ccheckpoints
# or use the short alias
ccp
```

That's it! Running `ccheckpoints` (or `ccp`) will:
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
# or
ccp
```
This does everything - sets up hooks if needed and opens the dashboard.

### Manual setup (optional)
```bash
ccheckpoints setup
# or
ccp setup
```
Only needed if you want to setup without opening the dashboard.

### Show dashboard
```bash
ccheckpoints show
# or
ccp show
```
Same as running just `ccheckpoints` - opens the dashboard (with auto-setup if needed).

### Help
```bash
ccheckpoints --help
# or
ccp --help
```

### Verbose mode
```bash
ccheckpoints --verbose
# or
ccp --verbose
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

MIT License — Copyright (c) 2025 Fayaz Bin Salam. See [LICENSE](LICENSE) for the full text.

## Contributing

Contributions are warmly welcomed and greatly appreciated! Whether it's a bug fix, new feature, or improvement, your input helps make this project better for everyone.

Before submitting a pull request, please:

1. Create an issue describing the feature or bug fix you'd like to work on
2. Wait for discussion and approval to ensure alignment with project goals
3. Fork the repository and create your feature branch
4. Submit your pull request with a clear description of changes

This approach helps avoid duplicate efforts and ensures smooth collaboration. Thank you for considering contributing!

## Share

Sharing this repository with your friends is just one click away from here

[![facebook](https://user-images.githubusercontent.com/6418354/179013321-ac1d1452-0689-493f-9066-940cf2302b6e.png)](https://www.facebook.com/sharer/sharer.php?u=https://github.com/p32929/ccheckpoints/)
[![twitter](https://user-images.githubusercontent.com/6418354/179013351-7d8d6d1c-4ce2-46ab-bef8-4c4765a1b888.png)](https://twitter.com/intent/tweet?url=https://github.com/p32929/ccheckpoints/)
[![tumblr](https://user-images.githubusercontent.com/6418354/179013343-3111f55a-3b90-40c7-8487-9777348672b0.png)](https://www.tumblr.com/share?v=3&u=https://github.com/p32929/ccheckpoints/)
[![pocket](https://user-images.githubusercontent.com/6418354/179013334-b095c45f-becf-49f4-9ee1-5a731a9b1f85.png)](https://getpocket.com/save?url=https://github.com/p32929/ccheckpoints/)
[![pinterest](https://user-images.githubusercontent.com/6418354/179013331-44cd9206-11b1-4b65-becb-5863b61c828f.png)](https://pinterest.com/pin/create/button/?url=https://github.com/p32929/ccheckpoints/)
[![reddit](https://user-images.githubusercontent.com/6418354/179013338-7416ae3f-73ba-4522-86e1-1374d7082d22.png)](https://www.reddit.com/submit?url=https://github.com/p32929/ccheckpoints/)
[![linkedin](https://user-images.githubusercontent.com/6418354/179013327-ca7b7102-1da8-4b1c-858f-1a6e5f21bd70.png)](https://www.linkedin.com/shareArticle?mini=true&url=https://github.com/p32929/ccheckpoints/)
[![whatsapp](https://user-images.githubusercontent.com/6418354/179013353-f477fa0b-3e6f-4138-a357-c9991b23ff88.png)](https://api.whatsapp.com/send?text=https://github.com/p32929/ccheckpoints/)

---

## Support

If this saved you time, you can buy me a coffee — it keeps these projects maintained and free.

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-%E2%98%95-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/p32929)

**Sponsor a mention** — $499 one-time: your name + link in this section for 3 months. **$1,200 one-time:** featured placement at the top of this section, plus a pinned mention on [my X profile](https://x.com/p32929), for 3 months. Email **[fayazdevinbox@uberip.com](mailto:fayazdevinbox@uberip.com)** for an invoice.

<!-- kit-block -->

---

## Using Claude Code CLI for real work?

I put together the **[Claude Code Starter Kit](https://p32929.github.io/claude-code-starter-kit/)** — tested `.claude/` subagents, slash commands and guard hooks (blocks `rm -rf` and `.env` reads) that install in 60 seconds. Free Lite version on GitHub, or the full kit plus a done-for-you Team ($999) / Enterprise ($1,499) rollout across your repos.

<!-- hire-block -->

---

## 💼 Using this at a company?

I do fixed-price delivery work on my own projects. One invoice, one date, no hourly billing:

| | |
|---|---|
| **White-label build** — this project rebranded, extended and deployed as yours | **$6,500** · 3 weeks |
| **Custom app from scratch** on my own stack, signed and auto-updating | **$12,500** · 6 weeks |
| **Production-hardening sprint** — 72 hours on this project, for your load and your security review | **$999** |
| **Ongoing capacity** — one project-week of my time reserved every month | **$9,000 / month** |

Full details → **[p32929.github.io/hire](https://p32929.github.io/hire/)** · Email **[fayazdevinbox@uberip.com](mailto:fayazdevinbox@uberip.com)** — scoping and quotes are free and I answer within one business day.
