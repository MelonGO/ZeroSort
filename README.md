# ZeroSort

**AI-powered desktop note-taking app** — local-first storage, rich editing, and optional end-to-end encrypted cloud sync.

ZeroSort runs natively on macOS, Windows, and Linux. Notes live in SQLite on your machine; sync to any S3-compatible store is optional and encrypted before anything leaves your device.

Website: [zerosort.app](https://zerosort.app)

## Features

- **AI organization** — auto title, summary, folder, and tags from your choice of provider
- **Rich text editor** — Markdown, tables, tasks, math, code, charts, mind maps, Mermaid, drawings (Tiptap 3)
- **Linked notes** — wiki-style `[[Note Title]]` links with backlinks
- **Tags & folders** — hierarchical folders plus color-coded tags with flexible filters
- **Embedded planning** — calendar and kanban blocks inside notes
- **Encrypted cloud sync** — AES-256-GCM end-to-end sync over S3-compatible storage
- **Multi-provider AI** — OpenAI, Anthropic, Gemini, DeepSeek, Mistral, MoonshotAI, Ollama, OpenRouter, and OpenAI-compatible endpoints
- **Internationalization** — 11 languages

See [FEATURES.md](FEATURES.md) for the full feature catalog.

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop host | Tauri v2 (Rust), SQLite via rusqlite, S3 sync |
| Renderer | React 19, TypeScript, Vite 7 |
| Editor | Tiptap 3 |
| State | Zustand |
| Styling | Tailwind CSS 4 |
| AI | Vercel AI SDK |
| Routing | TanStack Router |

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **pnpm** 10.17.1 (pinned in `package.json`)
- **Rust** stable toolchain (1.77+)

For Linux desktop builds, install WebKit and related packages:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf xdg-utils
```

## Getting started

```bash
pnpm install
pnpm tauri:dev    # full desktop app (Vite + Rust host)
# or
pnpm dev          # Vite renderer only (http://localhost:3000)
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start Vite dev server (port 3000) |
| `pnpm tauri:dev` | Run the Tauri desktop app in dev mode |
| `pnpm build` | Production renderer build + type check |
| `pnpm tauri:build` / `pnpm build:tauri` | Build and package the production Tauri app |
| `pnpm test` | Run Vitest in watch mode |
| `pnpm vitest run` | Run all tests once |
| `pnpm format` | Format with Prettier |

## Project structure

```
src/                 # React renderer
  components/        # UI by domain
  lib/               # Business logic (AI, sync, theme, …)
  lib/desktop-adapter.ts  # Renderer ↔ Tauri host bridge
  locales/           # i18n translation JSON
  routes/            # TanStack Router pages
  store/             # Zustand slices
  types/             # Shared TypeScript types
src-tauri/           # Tauri v2 Rust host (SQLite, sync, credentials, images)
```

## Documentation

- [FEATURES.md](FEATURES.md) — product features in detail
- [AGENTS.md](AGENTS.md) — conventions for contributors and AI agents