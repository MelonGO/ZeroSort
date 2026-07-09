# AGENTS.md - ZeroSort

## Project Overview

ZeroSort is a desktop note-taking app built with **Tauri v2** (Rust host) and **React 19** (TypeScript renderer). It features a Tiptap 3 rich-text editor, AI-powered note categorization (Vercel AI SDK), S3 cloud sync, and SQLite local storage (rusqlite).

## Build & Run Commands

| Command            | Description                                                           |
| ------------------ | --------------------------------------------------------------------- |
| `pnpm dev`         | Start Vite dev server (port 3000)                                     |
| `pnpm build`       | Production renderer build + type check (`vite build && tsc --noEmit`) |
| `pnpm tauri:dev`   | Run the Tauri desktop app in dev mode (Vite + Rust host)              |
| `pnpm tauri:build` | Build & package the production Tauri app                              |
| `pnpm build:tauri` | Production renderer build + Tauri package                             |
| `pnpm format`      | Format all files with Prettier                                        |

When running build commands in the terminal, prefer `set -o pipefail && <build-command> 2>&1 | tail -n 200` so the agent keeps output compact without hiding failures.

### Testing (Vitest)

| Command                                                      | Description                 |
| ------------------------------------------------------------ | --------------------------- |
| `pnpm test`                                                  | Run all tests in watch mode |
| `pnpm vitest run`                                            | Run all tests once (CI)     |
| `pnpm vitest run src/lib/sync/__tests__/guards.test.ts`      | Run a single test file      |
| `pnpm vitest run -t "Should block when deletion percentage"` | Run a single test by name   |

Tests live in `__tests__/` directories co-located with source (e.g., `src/lib/sync/__tests__/`). No explicit `test` block in `vite.config.ts`; test environment is jsdom. Shared test helpers go in `__tests__/test-utils.ts` next to the tests.

### Tauri (Rust host, run from repo root)

| Command            | Description                               |
| ------------------ | ----------------------------------------- |
| `pnpm tauri:dev`   | Vite + `tauri dev` against `src-tauri/`   |
| `pnpm tauri:build` | Package the Tauri app                     |
| `pnpm build:tauri` | `vite build` then Tauri production bundle |

The Tauri host lives in `src-tauri/` and shares the same React renderer. The renderer talks to the host through [`src/lib/desktop-adapter.ts`](src/lib/desktop-adapter.ts).

## Tech Stack

- **Package manager**: pnpm | **Bundler**: Vite 7 | **Target**: ES2022
- **Frontend**: React 19, TypeScript (strict), Tailwind CSS 4
- **Routing**: TanStack Router (file-based, auto code-splitting)
- **State**: Zustand (slice pattern in `src/store/slices/`, composed in `src/store/useStore.ts`)
- **Editor**: Tiptap 3 (math, tables, images, code blocks, tasks, markdown)
- **AI**: Vercel AI SDK (Anthropic, OpenAI, Gemini, DeepSeek, Ollama, OpenRouter)
- **Validation**: Zod 4 | **i18n**: i18next + react-i18next
- **Desktop host**: Tauri v2 (Rust) — SQLite via rusqlite, S3 sync, credentials, license, images
- **Command bridge**: renderer calls go through [`src/lib/desktop-adapter.ts`](src/lib/desktop-adapter.ts)

## Code Style

### Formatting & Linting

Prettier handles all formatting -- **no ESLint**. Plugins: `prettier-plugin-organize-imports` (auto-sorts imports) and `prettier-plugin-tailwindcss` (sorts Tailwind classes). The `.prettierrc` registers `cn()` as a Tailwind function. Do not manually organize imports. Run `pnpm format` to format.

### TypeScript

- `strict: true` with all strict checks enabled, `noEmit: true`
- Path alias: `@/*` → `./src/*` -- always use `@/` for internal imports
- Module resolution: Bundler | Target: ES2022

### Imports

Use `@/` for all internal imports. Never use relative paths that go up more than one level. Use `import type` or inline `type` for type-only imports. Order (enforced by Prettier): external packages → `@/` internal → `./` relative siblings.

### Types & Interfaces

- `interface` for object shapes, props, data models; `type` for unions, intersections, Zod inferences
- All types/interfaces: **PascalCase**; props: `ComponentNameProps`
- Zod schemas: camelCase + `Schema` suffix (`noteSchema`); inferred types: PascalCase (`NoteSchema`)
- Types live in `src/types/` by domain (`index.ts`, `model.ts`, `sync.ts`, `theme.ts`, `timeline.ts`)
- Document interface fields with JSDoc `/** */`

### Naming Conventions

- **Components**: PascalCase file + named export (`HomeHeader.tsx` → `export function HomeHeader()`)
- **Hooks**: camelCase with `use` prefix (`useNoteActions.ts`)
- **Utilities**: camelCase file (`utils.ts`)
- **Store slices**: camelCase file (`notes.ts` → `createNotesSlice`)
- **Types/interfaces**: PascalCase (`Note`, `SyncStatus`)
- **Constants**: camelCase or UPPER_SNAKE_CASE (context-dependent)
- **Test files**: `*.test.ts` in `__tests__/` (`guards.test.ts`)

### Functions & Exports

- **Named exports only** -- no default exports
- `function` declarations for components, hooks, and utilities
- Arrow functions for callbacks, Zustand slices, and inline logic
- All async code uses `async/await`

### Component Patterns

- Destructure props in function signature; group hooks at top of component body
- Use `cn()` (clsx + tailwind-merge) for conditional classes
- Style exclusively with Tailwind CSS utility classes
- Use `sonner` `toast` for user-facing notifications
- All user-facing strings go through `useTranslation()` -- translation files in `src/locales/`

### Error Handling

- Wrap async operations in `try/catch`
- Show user-facing errors via `toast.error()` from `sonner`
- Include fallback logic where possible; never silently swallow errors

### Testing Patterns

- Vitest with `describe`/`it`/`expect`; test environment: jsdom
- Test descriptions: capitalize first word, use "Should ..." pattern
- `vi.mock()` for module mocking (placed before imports of mocked modules)
- `vi.fn()` for function mocks, `vi.clearAllMocks()` in `beforeEach`
- Cast mocks with `as any` when calling `.mockResolvedValue()`
- JSDoc comment at top of test files describing what is tested

### Documentation

- JSDoc `/** */` on exported functions, components, hooks, and interfaces (one sentence)
- Inline `//` comments sparingly for non-obvious logic

### State Management (Zustand)

Single store in `src/store/useStore.ts` composed from 7 slices in `src/store/slices/`: settings, notes, tags, ui, sync, license, batchJob. Slices use arrow function factory pattern: `createNotesSlice(set, get) => ({...})`. Access state via `useStore` hook with selectors. State interface: `ZeroSortState` in `src/types/index.ts`.

## Key Directories

```
src/
  components/    # React components (PascalCase files)
  hooks/         # Custom React hooks (useX.ts)
  lib/           # Business logic, actions, sync engine, AI
  lib/sync/      # S3 incremental sync (collector, planner, executor, guards)
  locales/       # i18n translation JSON (en.json, zh.json)
  routes/        # TanStack Router file-based routes
  store/slices/  # Zustand slices (settings, notes, tags, ui, sync, license, batchJob)
  styles/        # Tailwind CSS theme (app.css, OKLCH colors, light/dark via .dark)
  types/         # TypeScript type definitions by domain
src-tauri/       # Tauri v2 Rust host (commands + plugins)
  src/           # Rust services (credentials, db, images, license, store, sync)
  tauri.conf.json
  capabilities/  # Permission grants for the main window
```

Renderer ↔ host bridge: [`src/lib/desktop-adapter.ts`](src/lib/desktop-adapter.ts).
