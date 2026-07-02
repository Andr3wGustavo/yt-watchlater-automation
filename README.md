# 🧠 Watch Later Agent — Segundo Cérebro

> An autonomous AI agent that consumes your YouTube Watch Later and Liked Videos, synthesizes the knowledge using LLMs (Gemini), and delivers high-quality insights directly to your Discord and WhatsApp. 

![Banner Placeholder](https://via.placeholder.com/1000x300.png?text=Watch+Later+Agent+Banner)

## 🎯 The Problem it Solves
We all have a massive "Watch Later" playlist filled with tutorials, podcasts, and essays that we never have the time to actually watch. This project creates a **Second Brain** that watches them for you, extracts the best insights, creates actionable plans, and deletes the video from the queue once processed.

## ✨ Core Features
- 🔄 **Smart Synchronization:** Scrapes and syncs videos from both `Watch Later` and `Liked Videos` playlists natively using your browser cookies via `yt-dlp`.
- 🧠 **Context-Aware Processing:**
  - **Shorts:** Extracts the core idea and a few bullet points (fast processing).
  - **Long Videos:** Extracts main insights, best quotes, and creates a practical action plan.
  - **Tags:** Automatically categorizes your videos with `#tags`.
- 📱 **WhatsApp Integration:** Built-in WhatsApp connection via QR code (`Baileys`). Includes a rich suite of commands (`!status`, `!fila`, `!buscar`, `!canais`, etc.).
- 💬 **Discord Command Center:** Interactive panel with slash commands (`/painel`, `/buscar`, `/canais`) and a seamless UX utilizing **Discord Threads** to keep your channels clean.
- 🧹 **Auto-Cleanup:** Physically removes processed videos from your Watch Later queue using headless browser automation (Puppeteer).
- 🗄️ **Local SQLite Database:** Safe, crash-resilient queue management using Prisma. With built-in retry logic for API failures.
- 🤖 **Autopilot (Modo Watch):** Runs silently in the background, syncing new videos and processing them automatically on a schedule, complete with a **Weekly Digest** sent every Monday.

## 📸 Screenshots

*(Space reserved for UI Screenshots)*
| Discord Threads | WhatsApp Digest |
|:---:|:---:|
| ![Discord Panel](https://via.placeholder.com/400x300.png?text=Discord+Threads) | ![WhatsApp](https://via.placeholder.com/400x300.png?text=WhatsApp+Messages) |

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Chrome Browser (for cookie extraction)
- Discord Bot Token & Gemini API Key

### Installation

1. **Clone the repo and install dependencies:**
   ```bash
   git clone https://github.com/Andr3wGustavo/yt-watchlater-automation.git
   cd yt-watchlater-automation
   npm install
   ```

2. **Setup your Environment:**
   Copy the example `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```

3. **Database Setup:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Deploy Slash Commands:**
   ```bash
   npm run deploy-commands
   ```

5. **Run the Bot (Dev Mode):**
   ```bash
   npm run dev
   ```

*(For background silent running on Windows, use the `start-background.bat` file).*

## 🛠️ Commands
Both Discord and WhatsApp support parallel commands:
- `/painel` - Opens the Control Center (Discord only).
- `/whatsapp-setup` - Link WhatsApp via QR Code.
- `/status` (`!status`) - View queue stats and pending processing time.
- `/fila` (`!fila`) - Process videos manually or filter by keyword.
- `/buscar <termo>` (`!buscar <termo>`) - Semantic search in your processed videos and tags.
- `/canais` (`!canais`) - View top watched channels ranking.
- `/pular <url>` (`!pular`) - Skip a video without processing it.
- `/reprocessar <url>` (`!reprocessar`) - Force reprocess an already downloaded video.

## 🛣️ Roadmap
Check out the [FEATURES-ROADMAP.md](./FEATURES-ROADMAP.md) file for future plans, including Anki/Obsidian Export and Voice Summaries.

## 🤝 Contributing
Feel free to open issues or submit pull requests. Let's build the ultimate second brain together.

---
*Built with TypeScript, Discord.js, Prisma, Baileys, and Gemini.*
