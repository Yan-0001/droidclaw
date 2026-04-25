# Contributing to Kira

Thanks for wanting to contribute. A few things to know first.

## What Kira is

Kira is a personal AI agent that runs on Android via Termux. The core principle: don't simulate intelligence — create real conditions that produce intelligent behavior naturally.

Every module has a specific job. Before changing anything, understand what it does and why it exists.

## Stack

- Node.js (runs in Termux on Android)
- Pure JavaScript — no TypeScript, no build step
- Zero native dependencies — must compile on ARM without NDK
- SQLite via pure-JS storage (not better-sqlite3 — doesn't compile on Android)

## Before submitting

- Test on an actual Android device or Termux, not just your laptop
- No native npm packages — if it requires node-gyp it won't work
- Keep it zero-dependency where possible
- Don't break the TUI on small phone screens (360px width minimum)

## Architecture rules

- All modules read/write through `KIRA_MIND` (mind.js) — not their own JSON files
- New tools go in `src/tools/` and register via `registry.register()`
- New skills go in `src/tools/skills/` as `module.exports = { name, description, execute }`
- Don't add requires to core modules that create circular dependencies

## Good contributions

- New skills (things Kira can do)
- Better tool implementations
- Bug fixes with reproduction steps
- Performance improvements (startup time, memory usage)
- Better error messages for public users

## Not looking for

- UI rewrites (the TUI is intentional)
- Cloud sync or server components
- Anything that requires root
- Dependency additions without strong justification

## Reporting bugs

Open an issue with:
1. What you expected
2. What happened
3. Output of `kira logs`
4. Your device model and Android version

## Questions

Open a discussion. Don't DM.

---

Built by [@levilyf](https://github.com/levilyf) — with love
