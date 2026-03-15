# 🧠 RunAnywhere CommandBrain

**An offline-first command memory + execution copilot.** Never repeat the same command twice.

<div style="margin: 20px 0; text-align: center;">
  <a href="https://github.com/RunanywhereAI/runanywhere-sdks">
    <img alt="RunAnywhere SDK" src="https://img.shields.io/badge/RunAnywhere-SDK-1f4788?style=flat-square" />
  </a>
  <img alt="Offline AI" src="https://img.shields.io/badge/Offline%20Local%20AI-1f4788?style=flat-square" />
  <img alt="Solution" src="https://img.shields.io/badge/Solution-2d5016?style=flat-square" />
  <img alt="Creator" src="https://img.shields.io/badge/by%20%40algsoch-434343?style=flat-square" />
</div>

**CommandBrain** is a React + TypeScript browser app that transforms natural language into executable system commands. Built locally-first with `@runanywhere/web` + WebAssembly—your data stays on your machine.

### Why This Exists

I noticed I was repeating the same ChatGPT prompts again and again. Instead of re-explaining context every time, I built CommandBrain to **remember commands locally** and execute/refine them instantly without repeating the full conversation.

---

## 💾 What Gets Stored (Local Database)

<div style="background: #f5f5f5; padding: 25px; border-radius: 10px; margin: 25px 0; border-left: 5px solid #1f4788;">

### IndexedDB (`CommandBrainDB`)

Everything is stored locally in your browser:

```json
{
  "commands": [
    {
      "id": "cmd_1",
      "prompt": "download youtube video",
      "generated": "yt-dlp \"<VIDEO_URL>\"",
      "safety": "caution",
      "category": "Media",
      "timestamp": 1710614400000
    }
  ],
  
  "favorites": [
    {
      "commandId": "cmd_1",
      "nickname": "YouTube Download",
      "folder": "Media Tools",
      "tags": ["video", "download", "yt-dlp"],
      "notes": "Best for video extraction and audio conversion"
    }
  ],
  
  "macros": [
    {
      "id": "macro_1",
      "name": "Batch Download",
      "description": "Download multiple videos",
      "commandIds": ["cmd_1", "cmd_2"],
      "runCount": 5
    }
  ],
  
  "patterns": [
    { "category": "Media", "count": 12 },
    { "category": "DevOps", "count": 8 },
    { "category": "Files", "count": 5 }
  ],
  
  "reminders": [
    {
      "commandId": "cmd_1",
      "frequency": "high",
      "lastRun": 1710614300000,
      "snoozed": null
    }
  ]
}
```

### localStorage (Session Data)

```json
{
  "commandbrain_bridge_config": {
    "bridgeUrl": "http://localhost:8888",
    "enabled": true
  },
  "commandbrain_reminder_snooze_map": {
    "cmd_1": "2026-03-24T00:00:00Z"
  }
}
```

🔒 **Zero cloud sync.** Everything stays in your browser's local database.

</div>

---

## ✨ What You Get

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin: 30px 0;">

<div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #1f4788;">
<h4 style="color: #1f4788; margin-top: 0;">🗣️ Natural Language Input</h4>
<p>Describe what you want in plain English. CommandBrain generates the right command automatically.</p>
</div>

<div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #2d5016;">
<h4 style="color: #2d5016; margin-top: 0;">🛡️ Safety First</h4>
<p>Classify commands as <code>safe</code>, <code>caution</code>, or <code>dangerous</code>. Preview before execution.</p>
</div>

<div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #434343;">
<h4 style="color: #434343; margin-top: 0;">💾 Saved Commands</h4>
<p>Organize with folders, tags, notes. Search and filter. Never lose a command again.</p>
</div>

<div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #1f4788;">
<h4 style="color: #1f4788; margin-top: 0;">📊 Analytics</h4>
<p>Track patterns, trends, and execution stats over time with visual charts and tables.</p>
</div>

<div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #2d5016;">
<h4 style="color: #2d5016; margin-top: 0;">🔔 Smart Reminders</h4>
<p>Auto-suggest frequently used commands. Snooze for 1 or 7 days with one click.</p>
</div>

<div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #434343;">
<h4 style="color: #434343; margin-top: 0;">🎬 YouTube Specialist</h4>
<p>Intelligent <code>yt-dlp</code> recipe generation. Download, convert, audio-only, with refinement.</p>
</div>

</div>

---

## 🚀 Quick Start

<div style="background: #f5f5f5; padding: 25px; border-radius: 10px; margin: 30px 0; border-left: 5px solid #1f4788;">

**Install & Run:**

```bash
npm install
npm run dev
```

Open `http://localhost:5173`

**Production Build:**

```bash
npm run build
npm run preview
```

</div>

---

## ⚡ Main Workflow

1. **Describe** — Enter what you need in natural language
2. **Preview** — See generated command + safety classification
3. **Refine** — Edit parameters (URLs, outputs, placeholders) inline
4. **Execute** — Run in Simulate or Real mode (with bridge)
5. **Save** — Store in Saved Commands for instant reuse

---

## 🎬 YouTube Command Recipes

For YouTube requests, CommandBrain generates multiple `yt-dlp` variants:

```bash
# Video download (best quality)
yt-dlp "<VIDEO_URL>"

# High-quality MP4 merge
yt-dlp -f "bestvideo+bestaudio" --merge-output-format mp4 "<VIDEO_URL>"

# Audio-only extraction
yt-dlp -x --audio-format mp3 "<VIDEO_URL>"

# List available formats
yt-dlp -F "<VIDEO_URL>"

# Download specific format
yt-dlp -f <FORMAT_CODE> "<VIDEO_URL>"

# Custom output filename
yt-dlp -o "%(title)s.%(ext)s" "<VIDEO_URL>"
```

**Refinement in Action:** Type "audio only" or "use this URL" to update the preview in real-time instead of starting from scratch.

---

## 📚 Saved Commands

Organize saved commands with:

- **Nicknames** — Friendly names for quick recall
- **Folders** — Group by project or category
- **Tags** — Filter across your command library
- **Notes** — Context and usage instructions
- **Inline Editing** — Update metadata directly from cards
- **Search & Filter** — Find commands in milliseconds

---

## 🔔 Reminders

Auto-suggest frequently used commands:

- Shows reminder card for commands you run often
- Quick execute or explore options
- Snooze for 1 day or 7 days
- Open Saved Commands for full context

---

## ⚙️ Execution Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Simulate** | No real execution, returns mock output | Testing, previews |
| **Real** | Executes through local bridge | Actual command execution |

Configure bridge in Settings.

---

## 🏗️ Project Structure

```
src/
  ├── App.tsx                    # Main app entry
  ├── runanywhere.ts             # RunAnywhere SDK
  ├── components/
  │   └── CommandBrainTab.tsx    # 🧠 Core UI
  ├── commandbrain/
  │   ├── CommandBrain.ts        # Main API
  │   ├── interpreter/           # NL → Command
  │   ├── safety/                # Safety classification
  │   ├── storage/               # IndexedDB management
  │   └── templates/             # Command templates
  └── styles/
      └── index.css              # Global styles
```

**Note:** CommandBrain is the active experience. Chat/Vision/Voice tabs are gated behind `SHOW_EXTRA_TABS`.

---

## 🚀 Deployment

This app requires **Cross-Origin Isolation** headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

`vercel.json` is included for Vercel deployment.

---

## 📚 Documentation

- [Quick Start](./QUICKSTART.md) — Get running in 5 minutes
- [CommandBrain Guide](./COMMANDBRAIN.md) — Detailed workflow
- [New Features](./NEW_FEATURES_V2.md) — Latest additions
- [Implementation](./IMPLEMENTATION_SUMMARY.md) — Architecture & internals

---

## 👤 Creator

**Vicky Kumar** | [@algsoch](https://github.com/algsoch)

- **GitHub:** https://github.com/algsoch
- **LinkedIn:** https://www.linkedin.com/in/algsoch
- **Email:** npdimagine@gmail.com

Building intelligent command execution tools for developers.

---

## 📌 Ecosystem

<div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin: 25px 0;">
<img alt="RunAnywhere" src="https://img.shields.io/badge/RunAnywhere-1f4788?style=flat-square&logo=github&logoColor=white" />
<img alt="Singularity" src="https://img.shields.io/badge/Singularity-2d5016?style=flat-square" />
<img alt="Offline AI" src="https://img.shields.io/badge/Offline%20AI-434343?style=flat-square" />
<img alt="CommandBrain" src="https://img.shields.io/badge/CommandBrain-1f4788?style=flat-square" />
</div>

**SDK Repository:** https://github.com/RunanywhereAI/runanywhere-sdks

---

## 📄 License

MIT

---

<div align="center" style="margin-top: 60px; padding: 30px 0; border-top: 1px solid #e0e0e0;">

**Made with ❤️ by Vicky Kumar**

[GitHub](https://github.com/algsoch) • [LinkedIn](https://linkedin.com/in/algsoch) • [Email](mailto:npdimagine@gmail.com)

© 2026 RunAnywhere CommandBrain

</div>
