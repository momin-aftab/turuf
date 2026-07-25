# Turuf Online 🃏

> Browser-based online multiplayer version of the traditional Kashmiri card game **Turuf** — a 4-player trick-taking game with a trump (Master Suit) mechanic.

[![CI](https://github.com/momin-aftab/turuf/actions/workflows/ci.yml/badge.svg)](https://github.com/momin-aftab/turuf/actions/workflows/ci.yml)

---

## Quick Start

### Prerequisites
- Node.js 20+
- npm 10+

### Development

```bash
# Clone the repo
git clone https://github.com/momin-aftab/turuf.git
cd turuf

# Set up environment variables
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local with your Ably, Upstash, and JWT values

# Install all dependencies
npm install --workspace=packages/game-engine
npm install --workspace=apps/web

# Run the dev server
npm run dev
```

App runs at **http://localhost:3000**

---

## Project Structure

```
turuf/
├── apps/
│   └── web/              # Next.js 16 frontend + API routes
├── packages/
│   └── game-engine/      # Pure TypeScript game logic (zero dependencies)
├── e2e/                  # Playwright end-to-end tests
├── .github/workflows/    # GitHub Actions CI
├── .env.example          # Environment variable template
└── vercel.json           # Vercel deployment config
```

---

## Services Required

| Service | Purpose | Free Tier |
|---|---|---|
| [Upstash Redis](https://upstash.com) | Game state persistence | ✅ Generous |
| [Ably](https://ably.com) | Real-time WebSocket pub/sub | ✅ 6M messages/month |
| [Vercel](https://vercel.com) | Hosting (frontend + API) | ✅ Hobby tier |
| [Sentry](https://sentry.io) | Error reporting | ✅ Free tier |

---

## Development Commands

```bash
# Run game-engine unit tests
npm run test --workspace=packages/game-engine

# Run game-engine tests with coverage
npm run test:coverage --workspace=packages/game-engine

# Type check game-engine
npm run typecheck --workspace=packages/game-engine

# Type check web app
npm run typecheck --workspace=apps/web

# Lint web app
npm run lint --workspace=apps/web

# Format all files
npm run format

# Check formatting
npm run format:check
```

---

## Game Rules Summary

- **4 players**, seated 0–3. Teams: Player 0+2 (Team A) vs Player 1+3 (Team B).
- **52-card deck**, 13 rounds.
- Player 0 receives **5 cards first**, selects the **Trump (Master) Suit**, then receives 8 more. All others receive 13 cards.
- **Follow suit** if you can. If not, play any card.
- **Trump cards** beat all non-trump cards. Value = 14 + rank.
- Team with the most rounds won wins the match.

---

## Architecture

See the full [Architecture Document](docs/architecture.md) for the complete technical design.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT
