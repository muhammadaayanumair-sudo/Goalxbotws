# GoalX

A football Discord bot (v1.9.0) with live scores, standings, player cards, betting, fantasy teams, AI chat, news, and 94 slash commands.

## Run & Operate

- **Run the bot:** `pnpm --filter @workspace/goalx-bot run dev`
- **Deploy slash commands to Discord:** `pnpm --filter @workspace/goalx-bot run deploy`
- The "GoalX Bot" workflow starts the bot automatically.

## Required Secrets

| Secret | Purpose |
|---|---|
| `DISCORD_TOKEN` | Bot token — required to start |
| `DISCORD_CLIENT_ID` | Application ID — required to start |
| `MONGODB_URI` | MongoDB connection string |

## Optional Secrets (enable more features)

| Secret | Feature |
|---|---|
| `API_FOOTBALL_KEY` | Live scores, fixtures, standings, players (api-sports.io) |
| `FOOTBALL_DATA_KEY` | Fallback football data API |
| `GROQ_API_KEY` | AI commands: /ask, /analyze, /predictions |
| `NEWS_API_KEY` | /news, /transfernews commands |
| `SESSION_SECRET` | Dashboard login sessions |

## Stack

- pnpm workspaces, Node.js 24, JavaScript (bot) + TypeScript (API server)
- Discord: discord.js v14
- DB: MongoDB + Mongoose
- AI: Groq SDK (llama-3.3-70b-versatile)
- Scheduling: cron jobs via `cron` package

## Where things live

- `artifacts/goalx-bot/src/commands/` — all slash commands (organized by category)
- `artifacts/goalx-bot/src/services/` — football API, AI, cards, economy, betting
- `artifacts/goalx-bot/src/models/` — Mongoose models (User, Card, Bet, Guild, etc.)
- `artifacts/goalx-bot/src/scheduler/` — background schedulers (live scores, news, transfers)
- `artifacts/goalx-bot/src/config/config.js` — all config from env vars

## Architecture decisions

- MongoDB over SQL — document model fits per-guild/per-user card collections and flexible bet schemas naturally
- In-memory cache (node-cache) instead of Redis — simpler ops, sufficient for Discord bot latency requirements
- api-sports.io direct (x-apisports-key header) instead of RapidAPI — see `.agents/memory/api-football-migration.md`
- Scheduler instances live in SchedulerManager, not re-created per tick — preserves in-memory dedup state

## Links

- **Documentation:** https://docs.google.com/document/d/1PkQ0wu7bAa-dEyAGYTRh3_jQRyZjT5bfNecTvmpnFPI/edit?usp=sharing
- **Support Server:** https://discord.gg/RVFtDPENpW
- **Add to Server:** https://discord.com/oauth2/authorize?client_id=1517258426898448394&permissions=8&scope=bot+applications.commands

## Gotchas

- After changing slash command definitions, run `pnpm --filter @workspace/goalx-bot run deploy` to push them to Discord
- MONGODB_URI (not MONGODB_URL) is used in this project
- BOT_OWNER_ID is set as a shared env var (not a secret) — value is the Discord user ID of the bot owner