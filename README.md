# AgentFlow AI

Welcome to **AgentFlow AI**—a premium, localized, and keyless multi-agent AI workspace.

## 🚀 Key Features

* **Multi-Agent Orchestration**: Specialized agents (Planner, Research, Coding, Reviewer, and Memory) coordinate autonomously on complex software and research tasks.
* **100% Free & Keyless**: Seamlessly streams unlimited browser-level LLM calls via the **Puter.js SDK** (Gemini 3.5 Flash, 3.1 Pro, etc.). No personal API keys are required to chat.
* **Local Database (SQLite)**: Swapped out cloud dependencies for a robust local database schema (`local.db`) running entirely on your machine using native `node:sqlite`.
* **Self-Healing Auth**: Wipes invalid browser sessions automatically and ensures seamless click-and-chat Guest Login.
* **Real-Time Web Search**: Automatically scrapes DuckDuckGo in real-time on the server to supplement prompts with accurate, cited internet results.
* **Semantic Memory (RAG)**: Indexes local PDFs and documents into `1536`-dimensional vector chunks locally without external API requirements.

## 🛠️ Technology Stack

* **Frontend**: React 19, TailwindCSS, Lucide Icons, Glassmorphic UI.
* **Routing**: TanStack Router, TanStack Start.
* **Database**: Local SQLite via native `node:sqlite` DatabaseSync.
* **AI Engine**: Puter.js SDK (Client) & TanStack Start Server functions.
