'use strict';
const chalk     = require('chalk');
const heartbeat = require('../core/heartbeat');
const engine    = require('../core/engine');
const config    = require('../config');

const C = {
  kira:     '#7ecec4',
  kiraFull: '#a8e6df',
  kiraDim:  '#3d7a74',
  user:     '#d4a96a',
  userDim:  '#7a5c30',
  sys:      '#5a6a7a',
  error:    '#e06c75',
  muted:    '#3a4a5a',
  hint:     '#2a3540',
};

const BOOT = [
  ``,
  `  ╭─────────────────────────────────╮`,
  `  │  ◈  K I R A                    │`,
  `  │     persistent. observing.      │`,
  `  ╰─────────────────────────────────╯`,
  ``,
];

class TUI {
  constructor() {
    this.onInput        = null;
    this.thinking       = false;
    this._dots          = null;
    this._inputBuf      = '';
    this._rawMode       = false;
    this._menuMode      = false;
    this._streamStarted = false;
    this._streaming     = false;       // true while _streamKira is running
    this._history       = [];
    this._historyIdx    = -1;
    this._savedInput    = '';
    this._pendingTools  = 0;
    this._termWidth     = process.stdout.columns || 80;
    this._escBuf        = '';          // buffer for escape sequences
    this._escTimer      = null;
    this._messageQueue  = [];          // queue for messages arrived during streaming
    this._queuedInput   = null;        // user's message typed during streaming
  }

  async init(onInput) {
    this.onInput = onInput;
    process.stdout.on('resize', () => { this._termWidth = process.stdout.columns || 80; });
    console.clear();

    for (const line of BOOT) {
      if (line.includes('◈  K I R A'))    process.stdout.write(chalk.hex(C.kiraFull)(line) + '\n');
      else if (line.includes('persistent')) process.stdout.write(chalk.hex(C.sys)(line) + '\n');
      else if (line.trim())                process.stdout.write(chalk.hex(C.muted)(line) + '\n');
      else                                 process.stdout.write('\n');
      await this._sleep(40);
    }

    this._statusLine();
    await this._sleep(80);

    const hour    = new Date().getHours();
    const timeCtx = hour < 6 ? 'still up?' : hour < 12 ? 'morning.' : hour < 18 ? 'hey.' : hour < 22 ? 'evening.' : 'late.';
    process.stdout.write('\n' + chalk.hex(C.kiraDim)('  ') + chalk.hex(C.kira)('kira') + chalk.hex(C.kiraDim)(' › ') + chalk.hex(C.sys)(timeCtx + '\n\n'));

    this._startRawInput();
  }

  _startRawInput() {
    if (this._rawMode) return;
    this._rawMode  = true;
    this._inputBuf = '';
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    this._showPrompt();
    process.stdin.on('data', this._onData.bind(this));
  }

  _showPrompt() {
    if (this.thinking || this._menuMode || this._streaming) return;
    const name = (config.load().name || 'you').toLowerCase();
    process.stdout.write(chalk.hex(C.userDim)('  ') + chalk.hex(C.user)(name) + chalk.hex(C.userDim)(' › '));
  }

  _kiraPrompt() {
    process.stdout.write('  ' + chalk.hex(C.kira)('kira') + chalk.hex(C.kiraDim)(' › '));
  }

  // ── Input handling — proper escape sequence buffering ─────────────────────
  _onData(data) {
    if (this._menuMode) return;

    // buffer escape sequences properly
    for (const ch of data) {
      const code = ch.charCodeAt(0);
      if (code === 27) {
        // start of escape sequence
        this._escBuf = ch;
        // wait briefly for rest of sequence
        clearTimeout(this._escTimer);
        this._escTimer = setTimeout(() => {
          // timeout — bare escape key, discard
          this._escBuf = '';
        }, 50);
        continue;
      }

      if (this._escBuf) {
        this._escBuf += ch;
        // check for complete sequences
        if (this._escBuf === '\u001b[A') { this._historyUp();   this._escBuf = ''; clearTimeout(this._escTimer); continue; }
        if (this._escBuf === '\u001b[B') { this._historyDown(); this._escBuf = ''; clearTimeout(this._escTimer); continue; }
        if (this._escBuf === '\u001b[C') { this._escBuf = ''; clearTimeout(this._escTimer); continue; } // right arrow ignore
        if (this._escBuf === '\u001b[D') { this._escBuf = ''; clearTimeout(this._escTimer); continue; } // left arrow ignore
        if (this._escBuf.length > 4) { this._escBuf = ''; clearTimeout(this._escTimer); } // unknown sequence
        continue;
      }

      this._onKey(ch);
    }
  }

  _onKey(key) {
    const code = key.charCodeAt(0);

    // Ctrl+C
    if (key === '\u0003') process.exit(0);

    // Ctrl+L — clear screen
    if (key === '\u000c') {
      console.clear();
      this._statusLine();
      process.stdout.write('\n');
      this._showPrompt();
      return;
    }

    // Enter
    if (key === '\r' || key === '\n') {
      const input = this._inputBuf.trim();
      this._inputBuf   = '';
      this._historyIdx = -1;
      this._savedInput = '';
      process.stdout.write('\n');
      
      if (input) {
        if (this._history[0] !== input) this._history.unshift(input);
        if (this._history.length > 50) this._history.pop();
        
        // If TUI is actively streaming, queue this message and show indicator
        if (this._streaming || this._streamStarted) {
          this._queuedInput = input;
          // Print queue indicator inline where the prompt would be
          process.stdout.write(chalk.hex(C.hint)(`  queue: ${input.slice(0, 40)}${input.length > 40 ? '...' : ''}\n`));
          // Abort the current stream so we can process the queued message
          if (this.onInput) this.onInput('__QUEUE_ABORT__');
          return;
        }
        
        if (this.onInput) this.onInput(input);
      } else {
        this._showPrompt();
      }
      return;
    }

    // Backspace — use ANSI clear to handle multi-byte chars safely
    if (key === '\u007f' || key === '\u0008') {
      if (this._inputBuf.length > 0) {
        // safely remove last char (handle multi-byte)
        const arr = [...this._inputBuf];
        arr.pop();
        const newBuf = arr.join('');
        const removed = this._inputBuf.length - newBuf.length;
        this._inputBuf = newBuf;
        // clear and redraw input line
        process.stdout.write('\x1b[2K\r');
        this._showPromptInline();
        process.stdout.write(chalk.hex(C.user)(this._inputBuf));
      }
      return;
    }

    if (code === 27) return;

    if (code >= 32) {
      this._inputBuf += key;
      process.stdout.write(chalk.hex(C.user)(key));
    }
  }

  // show prompt inline without newline (for redraw after backspace)
  _showPromptInline() {
    const name = (config.load().name || 'you').toLowerCase();
    process.stdout.write(chalk.hex(C.userDim)('  ') + chalk.hex(C.user)(name) + chalk.hex(C.userDim)(' › '));
  }

  _historyUp() {
    if (!this._history.length) return;
    if (this._historyIdx === -1) this._savedInput = this._inputBuf;
    this._historyIdx = Math.min(this._historyIdx + 1, this._history.length - 1);
    this._setInput(this._history[this._historyIdx]);
  }

  _historyDown() {
    if (this._historyIdx === -1) return;
    this._historyIdx--;
    this._setInput(this._historyIdx === -1 ? this._savedInput : this._history[this._historyIdx]);
  }

  _setInput(text) {
    // use ANSI clear + redraw — handles any unicode safely
    process.stdout.write('\x1b[2K\r');
    this._showPromptInline();
    this._inputBuf = text;
    process.stdout.write(chalk.hex(C.user)(text));
  }

  enterMenuMode()  { this._menuMode = true;  process.stdout.write('\x1b[2K\r'); }
  exitMenuMode()   { this._menuMode = false; this._inputBuf = ''; if (!this.thinking && !this._streaming) this._showPrompt(); }

  _statusLine() {
    let turns = 0;
    try { turns = engine.stats().turns || 0; } catch {}
    const cfg = config.load();

    let daemon = '◯ offline';
    try {
      const fs  = require('fs'), os = require('os');
      const pid = parseInt(fs.readFileSync(`${os.homedir()}/.droidclaw/daemon.pid`, 'utf8').trim());
      if (pid && !isNaN(pid)) { process.kill(pid, 0); daemon = '◈ thinking'; }
    } catch {}

    let mood = '';
    try { mood = require('../core/mind').getMood(); } catch {}

    const model = cfg.model ? cfg.model.split('/').pop().slice(0, 14) : '?';
    const tg    = cfg.telegramToken ? '⟐ tg' : '';
    const parts = [daemon, mood, `${turns}t`, model, tg].filter(Boolean).join('  ·  ');
    process.stdout.write(chalk.hex(C.muted)(`  ${parts}\n`));
  }

  // word-wrap — strips markdown markers for width calculation
  _wrap(text) {
    if (!text) return '';
    const str = String(text);
    const max = Math.max(20, this._termWidth - 12);
    const lines = [];
    for (const para of str.split('\n')) {
      // visible length — ignore markdown bold/italic markers
      const visibleLen = para.replace(/\*\*?|__?/g, '').length;
      if (visibleLen <= max) { lines.push(para); continue; }
      const words = para.split(' ');
      let line = '', lineLen = 0;
      for (const word of words) {
        const wLen = word.replace(/\*\*?|__?/g, '').length;
        if (lineLen > 0 && lineLen + wLen + 1 > max) {
          lines.push(line);
          line = word;
          lineLen = wLen;
        } else {
          line = line ? line + ' ' + word : word;
          lineLen = lineLen ? lineLen + 1 + wLen : wLen;
        }
      }
      if (line) lines.push(line);
    }
    return lines.join('\n  ');
  }

  addMessage(type, text) {
    if (this._streaming) {
      this._messageQueue.push({ type, text });
      return;
    }

    // don't clear mid-stream — only clear if not streaming
    if (!this._streaming) process.stdout.write('\x1b[2K\r');
    const str = String(text);

    if (type === 'agent') {
      process.stdout.write('\n');
      this._kiraPrompt();
      this._streaming = true;
      this._streamKira(this._wrap(str), () => {
        process.stdout.write('\n\n');
        this.thinking       = false;
        this._streamStarted = false;
        this._streaming     = false;
        this._pendingTools  = 0;
        
        // Flush queued messages and check for queued user input
        while (this._messageQueue.length > 0) {
          const msg = this._messageQueue.shift();
          this.addMessage(msg.type, msg.text);
        }
        
        // If user typed during streaming, process their queued message now
        if (this._queuedInput !== null) {
          const queued = this._queuedInput;
          this._queuedInput = null;
          if (this.onInput) this.onInput(queued);
        } else {
          this._showPrompt();
        }
      });

    } else if (type === 'tool') {
      this._pendingTools++;
      const clean = str.split('\n')[0].slice(0, 72);
      if (this._pendingTools === 1) {
        process.stdout.write(chalk.hex(C.hint)(`  ⟳ ${clean}\n`));
      } else {
        process.stdout.write(`\x1b[1A\x1b[2K\r${chalk.hex(C.hint)(`  ⟳ ${this._pendingTools} tools running\n`)}`);
      }

    } else if (type === 'system') {
      // single line only — truncate if needed
      const oneline = str.replace(/\n/g, ' ').trim().slice(0, 80);
      process.stdout.write(chalk.hex(C.muted)(`  ${oneline}\n`));
      if (!this.thinking) this._showPrompt();

    } else if (type === 'error') {
      this._streaming = false;
      process.stdout.write('\n' + chalk.hex(C.error)(`  ✕ ${str.split('\n')[0]}\n\n`));
      this.thinking       = false;
      this._streamStarted = false;
      this._showPrompt();
    }
  }

  // stream using a queue — no deep call stack on long responses
  _streamKira(text, done) {
    const chars = [...text]; // spread handles multi-byte chars
    let i = 0;

    const flush = () => {
      // process up to 3 chars per tick for smoother feel
      let batch = 0;
      while (i < chars.length && batch < 3) {
        const ch = chars[i++];
        process.stdout.write(chalk.hex(C.kiraFull)(ch));

        // only pause on sentence-ending punctuation
        if (/[.!?]/.test(ch) && chars[i] === ' ') {
          setTimeout(flush, 55);
          return;
        }
        if (/[,;:]/.test(ch)) {
          setTimeout(flush, 20);
          return;
        }
        if (ch === '\n') {
          setTimeout(flush, 25);
          return;
        }
        batch++;
      }

      if (i >= chars.length) {
        done && done();
      } else {
        setTimeout(flush, 7);
      }
    };

    flush();
  }

  setThinking(on) {
    this.thinking = on;
    if (on) {
      this._pendingTools  = 0;
      this._streaming     = false;
      const frames = ['  ◌  ', '  ◍  ', '  ●  ', '  ◍  '];
      let i = 0;
      process.stdout.write('\x1b[2K\r');
      this._dots = setInterval(() => {
        process.stdout.write(`\x1b[2K\r${chalk.hex(C.kiraDim)(frames[i++ % 4])}`);
      }, 180);
    } else {
      if (this._dots) { clearInterval(this._dots); this._dots = null; }
      process.stdout.write('\x1b[2K\r');
    }
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new TUI();
