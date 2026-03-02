# DroidClaw

A lightweight AI agent for Android, built to run in Termux.

---

## What it does

DroidClaw connects an LLM to your Android device. You chat with it, it figures out what you need and does it — calls, SMS, files, torch, location, running scripts, whatever.

It's not magic. It's just a tight loop: you talk, it thinks, it acts, it tells you what happened.

---

## Features

- **Phone control** — calls, SMS, torch, vibrate, location, clipboard, notifications
- **File access** — read/write to your storage
- **Memory** — remembers things across sessions
- **Living docs** — maintains notes about you, your device, and ongoing tasks
- **Run anything** — executes any shell command via the `exec` tool
- **Bring your own API** — works with NVIDIA NIM (free), or any OpenAI-compatible endpoint

---

## Requirements

- Android phone with [Termux](https://termux.dev)
- [Termux:API](https://wiki.termux.com/wiki/Termux:API) app installed
- Node.js 18+

---

## Install

```bash
git clone https://github.com/yourusername/droidclaw
cd droidclaw
npm install
node src/index.js
```

First run will walk you through setup — name, API key, model. Takes under a minute.

---

## Usage

Just talk to it naturally:

```
> check my battery
84% — unplugged, running fine

> torch on
done

> send sms to 9123456789 say running late
sent

> whats in my downloads
[lists your files]

> write a python script that prints fibonacci and save it to downloads
done. fib.py saved.

> remember my bike is Royal Enfield
noted

> what bike do i have
royal enfield
```

Commands:
```
/help       — all commands
/status     — system info
/memory     — stored facts
/workspace  — view living docs
/config     — change model or API key
/clear      — clear conversation
/exit       — save session and quit
```

---

## Supported providers

| Provider | Base URL | Notes |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | gpt-4o, gpt-4o-mini |
| Anthropic | `https://api.anthropic.com/v1` | claude-sonnet-4-6 etc |
| Groq | `https://api.groq.com/openai/v1` | fast, free tier |
| Together AI | `https://api.together.xyz/v1` | many open models |
| Mistral | `https://api.mistral.ai/v1` | mistral-small etc |
| Ollama (local) | `http://localhost:11434/v1` | fully offline |
| Any OpenAI-compatible | your endpoint | just set the URL |

---

## Project structure

```
src/
  index.js          # entry point
  setup.js          # first run wizard
  core/
    loop.js         # agent loop
    engine.js       # LLM client
    soul.js         # system prompt + identity
    heartbeat.js    # uptime tracking
  workspace/
    index.js        # living documents manager
  tools/
    registry.js     # tool registry
    exec.js         # run shell commands
    memory.js       # remember/recall
  config/
    index.js        # config manager
  tui/
    index.js        # terminal UI
```

New tools go in `src/tools/`. New integrations go in `src/integrations/`. The core never changes.

---

## Roadmap

- [ ] Telegram bot
- [ ] Web search
- [ ] Task scheduler / cron
- [ ] Skills system
- [ ] Discord bot

---

## Notes

Built as a personal project on a Samsung A13 in Termux. Works on any Android with Termux and Node.js. Uses free API so there's no cost to run it.

Contributions welcome.

---

## License

MIT
