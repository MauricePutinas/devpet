<h1 align="center">DevPet ⚡</h1>

<p align="center">
  🇬🇧 <b>English</b> &nbsp;·&nbsp; 🇩🇪 <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <strong>A hand-animated coding buddy that lives on your desktop, watches you code, and writes your dev diary.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-22c55e.svg?style=for-the-badge" alt="MIT License">
  <img src="https://img.shields.io/badge/Electron-2C2E3B?style=for-the-badge&logo=electron&logoColor=9FEAF9" alt="Electron">
  <img src="https://img.shields.io/badge/Platform-Windows%2011-0078D6?style=for-the-badge&logo=windows11&logoColor=white" alt="Platform: Windows">
  <img src="https://img.shields.io/badge/runtime%20deps-none-8b5cf6?style=for-the-badge" alt="Zero runtime dependencies">
  <img src="https://img.shields.io/badge/made%20with-%E2%9D%A4%EF%B8%8F%20%26%20Claude-ff5e5e?style=for-the-badge" alt="Made with love and Claude">
</p>

<p align="center">
  <img src="media/lineup.gif" width="720" alt="DevPet — all five skins side by side, idling on the desktop">
</p>

<p align="center">
  <img src="media/hero.png" width="480" alt="DevPet sitting on the desktop">
</p>

<p align="center">
  <b>5 hand-animated characters</b> · each with <b>up to 8 unique animations</b> · 100% local · privacy-first · no account · no telemetry
</p>

---

> **DevPet** is a tiny desktop pet for **Windows** built with **Electron + pure Node**. A small hand-animated "coder" character sits on your desktop inside a **transparent, always-on-top, click-through** window. It **watches your coding activity**, **reacts live**, and **writes you an automatic developer diary** in English or German. It's **gamified** with XP, levels, coins, and unlockable skins — and it's **100% local**: no account, no telemetry, no cloud.

### ✨ Features & Highlights

| | |
|---|---|
| 🪟 **Lives on your desktop** | A transparent, always-on-top window that's **click-through everywhere except over the pet itself** — it never steals focus or blocks your clicks. |
| 🎬 **Hand-animated** | **5 characters**, **1 free + 4 unlockable**, each with **up to 8 unique animations**, rendered as smooth transparent **VP9 WebM** with real alpha and crossfaded by a 2-layer video engine. |
| 🧠 **Watches you code** | Three local activity sources — **git commits**, **file edits/bursts**, and **AI coding sessions** (Claude Code + Codex) — each independently toggleable. |
| 💬 **Reacts live** | On every detected event it plays a reaction, shows a **DE/EN speech bubble**, and can **speak it aloud** via free **Edge TTS** (each skin has its own voice). |
| 📔 **Auto dev diary** | Daily entries generated from your real activity, **grouped by project**, with stats — works **fully offline**, optionally enhanced by an AI provider. |
| 🎮 **Gamified** | Earn **XP** and **coins** as you code, **level up** with confetti, and spend coins in the built-in **Coin Shop** to unlock new skins. |
| 🔒 **Privacy-first** | Everything runs **on your machine**. The only thing that can ever leave is an optional AI diary summary — with **your own** API key, only if you turn it on. |
| 🪶 **Featherweight** | **Zero runtime dependencies** except Electron. (`jimp` is dev-only tooling.) |

### 🎬 Meet the Squad

**5 hand-animated coder characters** — one free default, four unlockable in the in-app Coin Shop.

| Emoji | Name | Personality | Status |
|:---:|:---|:---|:---|
| ⚡ | **Volt** | Energetic BVB-yellow spark | **Free** default |
| 🔥 | **Blaze** | Fiery and effortlessly cool | Unlock for **600** 🪙 |
| 💫 | **Nova** | Cosmic dreamer with starlight in their eyes | Unlock for **1500** 🪙 |
| 😈 | **Hex** | Dark trickster who codes by candlelight | Unlock for **3000** 🪙 |
| 👑 | **Root** | The crowned superuser — root access to everything | Unlock for **5000** 🪙 |

<p align="center">
  <img src="media/lineup.gif" width="720" alt="All five DevPet skins side by side">
</p>

Every skin shares a core animation set, and each one has an **exclusive personal signature move** that plays once when your mouse approaches.

#### ⚡ Volt — the energetic spark
<p align="center"><img src="media/bvbcoder.gif" width="720" alt="Volt animations: Idle, Look, Signature, Cheer, Stand up, Grab"></p>

> Idle · Look · **Signature** (a football/soccer goal celebration ⚽) · Cheer · Stand up · Grab

#### 🔥 Blaze — fiery cool
<p align="center"><img src="media/coolcoder.gif" width="720" alt="Blaze animations: Idle, Look, Signature, Cheer, Stand up, Grab"></p>

> Idle · Look · **Signature** (a cool flame snap 🔥) · Cheer · Stand up · Grab

#### 💫 Nova — cosmic dreamer
<p align="center"><img src="media/bluestarcoder.gif" width="720" alt="Nova animations: Idle, Look, Signature, Cheer, Sleep, Grab"></p>

> Idle · Look · **Signature** (a starlight call 💫) · Cheer · Sleep · Grab

#### 😈 Hex — dark trickster
<p align="center"><img src="media/darkcoder.gif" width="720" alt="Hex animations: Idle, Look, Signature, Cheer, Sleep, Grab"></p>

> Idle · Look · **Signature** (a dark-power rune circle 😈) · Cheer · Sleep · Grab

#### 👑 Root — the crowned superuser
<p align="center"><img src="media/kingcoder.gif" width="720" alt="Root animations: Idle, Look, Signature, Cheer, Coding, Sleep, Grab"></p>

> Idle · Look · **Signature** (a royal command 👑) · Cheer · **Coding** (an exclusive typing animation during AI/coding sessions) · Sleep · Grab

#### The animation set

| Animation | When it plays |
|:---|:---|
| 🪑 **Idle** | Sits and works at the keyboard. |
| 👀 **Look** | Reacts and notices when your mouse cursor comes near. |
| ⭐ **Signature** | An **exclusive personal move**, unique per skin, plays once when your mouse approaches. |
| 🎉 **Cheer** | Celebrates on a git commit, on level-up, or when you click/poke it. |
| 😴 **Sleep** | Dozes off after **75 seconds** of inactivity 💤. |
| 🌅 **Stand up** | Wakes back up when you return. |
| ✊ **Grab** | A "picked-up" reaction while you drag it around. |
| ⌨️ **Coding** | **Root 👑 only** — an extra exclusive typing animation during AI/coding sessions. |

### 🧠 What it watches

DevPet has **three local monitors**. They never touch the network — they read activity from your own machine, and **each one can be toggled on or off**.

| Monitor | What it does | Reward |
|:---|:---|:---:|
| 🌱 **Git commits** | Watches the git history of your watched folders. | 🏆 the biggest reward |
| 📝 **File edits / bursts** | Notices when you're actively editing files in your watched folders. | small |
| 🤖 **AI coding sessions** | Reads **Claude Code** (`~/.claude/projects/**/*.jsonl`) and **Codex** session logs to notice when you're pair-programming with an AI. | medium |

When something is detected, the pet plays a reaction animation, pops a **speech bubble** comment (DE/EN), and can **speak it aloud**. A **level-up** triggers a celebration with **confetti** and a spoken cheer. 🎊

### 📔 The Dev Diary

A separate window that writes your developer diary **for you**. Daily entries are generated from your real activity, **grouped by project**, with stats: commits, files touched, AI sessions, and the time span you worked.

<p align="center">
  <img src="media/screenshot-diary.png" width="600" alt="The DevPet Dev Diary window showing stats and an activity feed">
</p>

> 💡 The diary works **fully offline** with a built-in template writer (English **and** German). Optionally, it can be enhanced by an AI provider for nicer prose and per-project summaries — **DeepSeek** (cheapest, preferred), **MiniMax**, or **Claude/Anthropic**. API keys are **100% optional** and are **never required** for the core app.

Open the diary by **double-clicking the pet** or via the **tray**.

### 🎮 Leveling & Coin Shop

Your pet **levels up as you code**. Every event earns **XP** and **coins** 🪙 — commits are worth the most.

| Event | XP | Coins 🪙 |
|:---|:---:|:---:|
| 🌱 **Git commit** | **25** | **10** |
| 🤖 **AI session** | **8** | **3** |
| 📝 **File burst** | **3** | **1** |
| ⬆️ **Level-up bonus** | — | **+20** |

The level curve is a smooth square-root curve:

| Level | 2 | 3 | 4 | 5 | … |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Total XP** | 50 | 200 | 450 | 800 | … |

Spend your coins in the built-in **Coin Shop** (inside the diary window) to unlock new skins — Blaze, Nova, Hex, and Root. Your **level** and **coin balance** also show in the tray.

<p align="center">
  <img src="media/screenshot-shop.png" width="600" alt="The DevPet Coin Shop showing unlockable skins">
</p>

### 🕹️ Interactions

| Action | Result |
|:---|:---|
| 🖱️ **Drag** | Move the pet anywhere on screen. |
| 🖱️ **Mouse-wheel scroll** over it | Resize the pet. |
| 🖱️🖱️ **Double-click** | Open the Dev Diary. |
| 👉 **Click / poke** | Makes it cheer **and** speak. |
| 🖱️ **Right-click** | Opens the context/tray menu. |

**Tray menu:** switch skin · open diary · reset position to screen · toggle autostart · quit.

> The window is **click-through everywhere except over the pet itself**, so it never gets in the way of your work.

### 🔒 Privacy & API keys

- **100% local.** No account. No telemetry. No cloud sync.
- The **only** thing that can ever leave your machine is an **optional AI diary summary** — generated with **your own** API key, **only if you choose** to enable it.
- API keys are **optional** and stored locally in `.secrets/` or via environment variables. They are **never required** — without one, the diary uses the built-in offline template writer.

### 🚀 Getting Started

> **Requirements:** Node 18+ and Windows 11 (the pet window is tuned for Windows).

```bash
git clone https://github.com/MauricePutinas/devpet
cd devpet
npm install
npm start
```

That's it — your pet appears on the desktop. 🎉

**Optional — enable AI diary summaries:** drop an API key file in `.secrets/deepseek.key` (or `.secrets/minimax.key`). Otherwise the diary happily uses the offline template writer.

### 🧩 Tech & How it's built

- **Electron + pure Node** — **zero runtime dependencies** except Electron. (`jimp` is a dev-only asset tool.)
- **Transparent pet window** — always-on-top, click-through, focus-safe, tuned for Windows 11.
- **2-layer video engine** — crossfades between **transparent VP9 WebM** clips with real alpha for buttery-smooth transitions.
- **Asset pipeline** — raw hand-drawn animations are run through a pipeline (`scripts/normalize-poses.js`, `scripts/process-chroma.js`, …) that **chroma-keys**, **floor-anchors**, and exports each pose as a clean transparent WebM.
- **Local monitors** — git, file-watch, and AI-session readers, all on-device.
- **Free Edge TTS** — gives every skin its own voice with no API cost.

### 📁 Project Structure

```text
devpet/
├─ src/
│  ├─ main/                # Electron main process
│  │  ├─ monitors/         # git, file & AI-session watchers
│  │  ├─ diary/            # diary store + reporter
│  │  ├─ tray.js · tts.js  # tray menu + Edge TTS voices
│  │  └─ progress.js       # XP, levels & coins
│  ├─ preload/             # context-bridge API
│  ├─ renderer/
│  │  ├─ pet/              # transparent pet window + state machine
│  │  └─ diary/            # dev-diary + Coin Shop UI
│  └─ shared/              # creatures list, shared helpers
├─ scripts/                # asset pipeline (raw anim → transparent WebM)
└─ assets/
   └─ creatures/<id>/      # per-skin WebM animations + thumbnails
```

### 📜 License

Released under the **MIT License**. Built with ❤️ and Claude by **Maurice**.

---

## 📝 Changelog

> 🤖 This section updates **automatically on every push** via a GitHub Action, so anyone can see exactly what changed and when.

<!-- CHANGELOG:START -->

_The changelog fills in automatically after the first push._

<!-- CHANGELOG:END -->

---

<p align="center">
  <sub>⚡ <b>DevPet</b> — your code has a witness now.</sub>
</p>
