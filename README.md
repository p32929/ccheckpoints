# CCheckpoints

Cursor-style checkpoints for Claude Code CLI. Every message you send to Claude Code is saved as a checkpoint, and a local web dashboard shows your whole session as a timeline, so you can look back at any point and see what changed.

On npm: **[ccheckpoints](https://www.npmjs.com/package/ccheckpoints)**

<img width="1920" height="922" alt="CCheckpoints session dashboard" src="https://github.com/user-attachments/assets/506ce9f8-54aa-4ac3-8605-5404c2f0e017" />

## Why use it

In a long Claude Code session it is easy to lose track of what you asked and when things changed. Cursor has checkpoints for this; Claude Code CLI does not. CCheckpoints adds them by itself, with no change to how you work, and everything stays on your computer.

## Features

1. **Automatic checkpoints:** every message you send to Claude Code is saved, with the time.
2. **All your sessions:** see when each one started, how long it ran and what happened in it.
3. **Checkpoint timeline:** move through your whole conversation with its full context.
4. **Compare changes:** see what changed between two checkpoints, to find what broke or how your code grew.
5. **One-command setup:** it adds the Claude Code hooks for you and opens the dashboard.
6. **Stays on your computer:** everything is saved in a local SQLite database.

## Quick start

```bash
npm install -g ccheckpoints
ccheckpoints
```

You can also type the short name `ccp`. The first run does three things:

1. Adds the Claude Code hooks, if they are not there yet.
2. Starts a small background server at `http://127.0.0.1:9271`.
3. Opens the dashboard in your browser.

## Commands

1. `ccheckpoints` (or `ccp`): set up if needed and open the dashboard.
2. `ccheckpoints setup`: only add the hooks, without opening the dashboard.
3. `ccheckpoints show`: open the dashboard.
4. `ccheckpoints --verbose`: show detailed logs of what is happening.
5. `ccheckpoints --help`: show all options.

## Screenshots

### Sessions

See all your Claude Code sessions: when you started and how long you worked.

<img width="1920" height="922" alt="Session Dashboard" src="https://github.com/user-attachments/assets/506ce9f8-54aa-4ac3-8605-5404c2f0e017" />

### Checkpoint timeline

Every message is a checkpoint. Move through the whole conversation with times and full context.

<img width="1920" height="922" alt="Checkpoint Timeline" src="https://github.com/user-attachments/assets/6e26588b-a983-4ff7-96c7-e820734e62c3" />

### Compare changes

See exactly what changed between checkpoints.

<img width="1920" height="922" alt="Diff View" src="https://github.com/user-attachments/assets/3d0a72cf-da43-4b81-b797-eef0c5aa2086" />

## How it works

1. `ccheckpoints setup` adds two hooks to your Claude Code settings: `userPromptSubmit` (when you send a message) and `stop` (when a session ends).
2. Each hook runs `ccheckpoints track --event=<type>`, which sends the event to the background server on port 9271.
3. The server saves it in the local database, and the dashboard reads from there.

## Where your data is

Your data is in a `CCheckpoints` folder, in the file `checkpoints.db`:

1. Windows: `%APPDATA%\CCheckpoints\`
2. macOS: `~/Library/Application Support/CCheckpoints/`
3. Linux: `~/.local/share/CCheckpoints/`

## Troubleshooting

1. **Port 9271 is already in use:** the server needs this port, so close the other app using it.
2. **The dashboard does not open:** run `ccheckpoints --verbose` to see what is going on.
3. **Checkpoints are not being saved:** run `ccheckpoints setup` again to add the hooks.

## Build it yourself

```bash
git clone https://github.com/p32929/ccheckpoints.git
cd ccheckpoints
npm install
npm run build
npm install -g .
ccheckpoints
```

While working on it, `npm run dev` runs it without building, and `npm run dev:watch` reloads on every change.

## License

MIT License, Copyright (c) 2025 Fayaz Bin Salam. See [LICENSE](LICENSE) for the full text.

## Contributing

Contributions are very welcome, thank you! Before you start on a pull request, please open an issue and tell me what you would like to add or change. That way we can agree on it first, and your time is not spent on something that might not fit. Found a bug or have an idea? An issue is the best place for that too.

## Share

<a href="https://p32929.github.io/share/?repo=ccheckpoints"><picture><source media="(prefers-color-scheme: dark)" srcset="https://p32929.github.io/readme/share-dark.svg"><img src="https://p32929.github.io/readme/share-light.svg" alt="Share this with your friends in just a click" width="420"></picture></a>

## Support

<a href="https://p32929.github.io/support/"><picture><source media="(prefers-color-scheme: dark)" srcset="https://p32929.github.io/readme/support-dark.svg"><img src="https://p32929.github.io/readme/support-light.svg" alt="If you like my works and want to support me, feel free to support" width="420"></picture></a>
