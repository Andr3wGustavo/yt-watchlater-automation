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
- 📱 **WhatsApp Integration:** Built-in WhatsApp connection via QR code (`Baileys`). Can notify you instantly or send a nightly digest of what it learned.
- 💬 **Discord Command Center:** Interactive panel with slash commands (`/painel`, `/whatsapp-setup`, `/sync-curtidos`) to manage your queue and toggle the **Autopilot**.
- 🧹 **Auto-Cleanup:** Physically removes processed videos from your Watch Later queue using headless browser automation (Puppeteer).
- 🗄️ **Local SQLite Database:** Safe, crash-resilient queue management using Prisma.

## 📸 Screenshots

*(Space reserved for UI Screenshots)*
| Discord Panel | WhatsApp Digest |
|:---:|:---:|
| ![Discord Panel](https://via.placeholder.com/400x300.png?text=Discord+Panel) | ![WhatsApp](https://via.placeholder.com/400x300.png?text=WhatsApp+Messages) |

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Chrome Browser (for cookie extraction)
- Discord Bot Token & Gemini API Key

### Installation

1. **Clone the repo and install dependencies:**
   ```bash
   git clone https://github.com/your-username/watch-later-agent.git
   cd watch-later-agent
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

4. **Run the Bot (Dev Mode):**
   ```bash
   npm run dev
   ```

*(For background silent running on Windows, use the `start-background.bat` file).*

## 🛠️ Usage
1. Go to your Discord server and type `/painel` to open the Control Center.
2. Type `/whatsapp-setup` to link your WhatsApp account via QR code.
3. Turn on the **Autopilot** in the panel and let the agent digest your backlog for you!

## 🛣️ Roadmap
Check out the [ROADMAP.md](./ROADMAP.md) file for future plans, including Vector DB (RAG) implementation and Audio fallback using Whisper.

## 🤝 Contributing
Feel free to open issues or submit pull requests. Let's build the ultimate second brain together.

---
*Built with TypeScript, Discord.js, Prisma, and Gemini.*
