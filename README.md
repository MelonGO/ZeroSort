<p align="center">
  <a href="./README.md">English</a> | <a href="./README-zh.md">简体中文</a>
</p>

# ZeroSort

**AI-powered desktop note-taking app** — local-first storage, rich editing, and optional end-to-end encrypted cloud sync.

ZeroSort runs natively on macOS, Windows, and Linux. Notes live in SQLite on your machine; sync to any S3-compatible store is optional and encrypted before anything leaves your device.

Website: [zerosort.app](https://zerosort.app)

## Table of Contents

- [Core Features](#core-features)
- [Rich Text Editor](#rich-text-editor)
- [AI Integration](#ai-integration)
- [Cloud Sync](#cloud-sync)
- [Security and Encryption](#security-and-encryption)
- [Folder and Note Management](#folder-and-note-management)
- [Tags and Filtering](#tags-and-filtering)
- [Customization](#customization)
- [Platform Support](#platform-support)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Documentation](#documentation)

---

## Core Features

### Intelligent Note Organization

Write a note and let AI handle the rest. ZeroSort automatically generates titles, summaries, and folder placements using your choice of AI provider. Notes are categorized into a hierarchical directory structure without manual effort.

### Rich Text Editing

A full-featured editor powered by Tiptap 3 with support for Markdown, tables, task lists, math equations, syntax-highlighted code blocks, embedded charts, mind maps, Mermaid diagrams, and freehand drawings.

### Linked Notes

Create wiki-style links with `[[Note Title]]` or alias them with `[[Note Title|Display Text]]`. ZeroSort resolves links against your existing notes, offers autocomplete while you type, lets you jump through inline links, and shows both outgoing links and backlinks in a dedicated Links panel. Broken links are surfaced separately so you can spot references to notes that do not exist yet.

### Flexible Tagging

Organize notes with reusable, color-coded tags that work alongside folders. Assign multiple tags to a note, create new tags inline while editing, manage your tag library from a dedicated Tag Manager, and use match-any or match-all filters to narrow large collections without changing the folder structure.

### Embedded Planning Tools

Add structured planning blocks directly inside notes. ZeroSort includes an embedded event calendar with day, week, month, year, and list views, plus a kanban board with draggable columns and cards. Both blocks are editable in place and include AI-assisted workflows for structured changes.

### Encrypted Cloud Sync

Synchronize notes, tags, and managed uploaded images across devices using any S3-compatible storage. All synced data is encrypted end-to-end with AES-256-GCM before leaving your machine. A three-way comparison algorithm ensures safe, conflict-aware merging.

### Multi-Provider AI

Connect to 10 AI provider types -- OpenAI, Anthropic, Google Gemini, DeepSeek, Mistral, MoonshotAI, Ollama (local), OpenRouter, Grok-compatible endpoints, and any OpenAI-compatible endpoint. Switch models freely or run entirely offline with Ollama.

---

## Rich Text Editor

ZeroSort's editor is built on Tiptap 3 with 25+ extensions providing a comprehensive writing experience.

### Formatting

| Feature                                    | Description                                                     |
| ------------------------------------------ | --------------------------------------------------------------- |
| **Bold, Italic, Underline, Strikethrough** | Standard text formatting                                        |
| **Headings**                               | H1, H2, H3 hierarchy                                            |
| **Text Color**                             | 12 preset colors + custom hex picker                            |
| **Text Highlight**                         | 12 preset highlight colors + custom hex picker                  |
| **Typography**                             | Smart quotes, em dashes, and automatic typographic enhancements |

### Structure

| Feature                      | Description                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Tables**                   | Resizable columns, header rows, floating toolbar for row/column operations and AI chart generation                         |
| **Task Lists**               | Interactive checkboxes with nested subtask support                                                                         |
| **Bullet and Ordered Lists** | Standard list formatting with multi-level nesting support (use Tab/Shift+Tab or toolbar buttons to indent/outdent)         |
| **Blockquotes**              | Indented quote blocks                                                                                                      |
| **Horizontal Rules**         | Visual section dividers                                                                                                    |
| **Links**                    | Hyperlinks with URL validation and auto-linking                                                                            |
| **Wiki Links**               | Internal note links with `[[Note Title]]` and `[[Note Title\|Alias]]` syntax, autocomplete, and click-to-navigate behavior |

### Code and Math

| Feature         | Description                                                                |
| --------------- | -------------------------------------------------------------------------- |
| **Code Blocks** | Syntax highlighting for 37+ languages via Lowlight, optional line wrapping |
| **Inline Code** | Monospace inline code spans                                                |
| **Block Math**  | Full LaTeX equation rendering with KaTeX (`$$...$$`)                       |
| **Inline Math** | Inline LaTeX expressions (`$...$`) with click-to-edit                      |

### Embedded Visualizations

| Feature              | Description                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Charts**           | Interactive Chart.js visualizations -- Line, Bar, Pie, Radar, and Bubble charts with resize handles                            |
| **Mind Maps**        | Markmap-powered hierarchical mind maps generated from Markdown, with zoom, pan, and fit controls                               |
| **Mermaid Diagrams** | Mermaid-powered diagrams (flowcharts, sequence, class, etc.) with edit/preview modes, zoom, pan, and live syntax error display |
| **Drawings**         | Excalidraw freehand drawing canvas with view and edit modes, theme-aware rendering                                             |
| **Images**           | Embedded images with drag-to-resize, aspect ratio preservation, and block/inline display modes                                 |
| **Event Calendars**  | Embedded event calendars with day, week, month, year, and list views, plus filters and event dialogs                           |
| **Kanban Boards**    | Embedded kanban boards with editable columns/cards, drag-and-drop, summaries, and AI-assisted changes                          |

### Markdown Support

Full Markdown import and export. Pasted Markdown is automatically detected and converted to rich text. Custom node types (charts, mind maps, Mermaid diagrams, drawings) serialize to Pandoc-style atomic blocks for portable Markdown representation.

### Configurable Toolbar

The toolbar is organized into 7 groups, each independently toggleable in settings:

| Group          | Tools                                                         |
| -------------- | ------------------------------------------------------------- |
| **History**    | Undo, Redo                                                    |
| **Headings**   | H1, H2, H3                                                    |
| **Formatting** | Bold, Italic, Underline, Strikethrough, Highlight, Text Color |
| **Lists**      | Bullet, Ordered, Task                                         |
| **Block**      | Blockquote, Inline Code, Code Block, Horizontal Rule          |
| **Insert**     | Link, Table, Image, Inline Math, Block Math                   |
| **Tools**      | Mermaid Diagram, Excalidraw Drawing, AI Assist                |

---

## AI Integration

### Supported Providers

| Provider                                          | Integration Type    | Local/Cloud  |
| ------------------------------------------------- | ------------------- | ------------ |
| **OpenAI** (GPT-5, GPT-5 Mini, o3, etc.)          | Native              | Cloud        |
| **Anthropic** (Claude Sonnet 4.5, Opus 4.5, etc.) | Native              | Cloud        |
| **Google Gemini** (Gemini 3 Pro, Flash, etc.)     | Native              | Cloud        |
| **DeepSeek** (DeepSeek V3, R1, etc.)              | Native              | Cloud        |
| **Mistral** (Mistral Large, Medium, Ministral)    | Native              | Cloud        |
| **MoonshotAI** (Kimi K2.5, K2, etc.)              | Native              | Cloud        |
| **Ollama** (Qwen3, GLM, etc.)                     | Native              | Local        |
| **OpenRouter**                                    | Native              | Cloud        |
| **Grok** (Grok 3, Grok 3 Mini)                    | Compatible endpoint | Cloud        |
| **OpenAI-Compatible** (custom endpoints)          | Compatible endpoint | Configurable |

### Automatic Note Organization

When you create a note, AI processes the content and generates:

- **Title**: A concise title (max 6 words in English, 10 characters in Chinese)
- **Summary**: A 2-3 sentence overview of the note's content
- **Folder Path**: A hierarchical folder placement (e.g., `Work > Meetings > Summary`)

The AI considers your existing folder structure for consistent categorization. All generation happens in real time with streaming previews.

### Two AI Modes

ZeroSort includes two different AI workflows inside the editor so you can either transform highlighted text or have a freeform conversation with the model.

### Selection Mode

Select any text in the editor to open the AI floating menu for context-aware actions on the highlighted passage. You can optionally use the rest of the current note as context while rewriting the selection.

| Action                       | Description                                                          |
| ---------------------------- | -------------------------------------------------------------------- |
| **Improve**                  | Enhance writing quality and clarity                                  |
| **Proofread**                | Fix grammar, spelling, and punctuation                               |
| **Explain**                  | Provide a clear explanation of the selected text                     |
| **Translate**                | Translate to English, Chinese, Spanish, French, German, or Japanese  |
| **Change Tone**              | Rewrite in Professional, Casual, Friendly, Confident, or Formal tone |
| **Make Longer**              | Expand content with more detail and examples                         |
| **Make Shorter**             | Condense text while preserving key information                       |
| **Simplify**                 | Rewrite using simpler language                                       |
| **Generate Mind Map**        | Convert text into a visual mind map                                  |
| **Generate Mermaid Diagram** | Create a Mermaid diagram (flowchart, sequence, class, etc.)          |
| **Generate Chart**           | Create a data visualization (Line, Bar, Pie, Radar, Bubble)          |
| **Custom Prompt**            | Apply any custom instruction to the selected text                    |

### Ask Mode

Use the floating Ask AI button in the editor when you want a freeform conversation instead of transforming a selected passage.

- Ask open-ended questions about the note you are writing
- Type `@` to reference other open notes as additional context
- Generate a response first, then insert it anywhere in the note

Ask Mode is useful for brainstorming, drafting new sections, summarizing multiple open notes, or generating content that is not tied to a specific selection.

### AI Assistants for Embedded Blocks

ZeroSort also includes dedicated AI assistants for embedded kanban boards and event calendars. These assistants can propose structured changes, preview them, and apply updates to board items or calendar events directly inside a note.

### Regeneration

Individually regenerate any AI-generated field after creation:

- Regenerate title only
- Regenerate summary only
- Regenerate folder placement only
- Regenerate tags only
- Compare before/after changes before applying
- Batch regenerate titles, summaries, folders, or tags across multiple selected notes

---

## Cloud Sync

### Three-Way Comparison Algorithm

ZeroSort's sync engine uses a three-way comparison model for safe, deterministic synchronization:

```
Local State (SQLite) ──┐
                       ├── Ensemble ── Planner ── Executor
Remote State (S3) ─────┤
                       │
Previous Sync State ───┘
```

**Phases:**

1. **Collecting** -- Gather current state from local database, S3 bucket, and previous sync records
2. **Ensemble** -- Merge all three states into unified comparison entities
3. **Planning** -- Determine the correct action for each entity using 41+ decision branches
4. **Guard Check** -- Validate the plan against safety rules before execution
5. **Execution** -- Perform uploads, downloads, and deletions with configurable concurrency

### Conflict Resolution

| Strategy                 | Behavior                                                               |
| ------------------------ | ---------------------------------------------------------------------- |
| **Keep Newer** (default) | Automatically keeps the version with the most recent modification time |
| **Keep Local**           | Always preserves local changes over remote                             |
| **Keep Remote**          | Always accepts remote changes over local                               |

### Sync Direction

| Mode                        | Behavior                                                |
| --------------------------- | ------------------------------------------------------- |
| **Bidirectional** (default) | Full two-way sync between local and remote              |
| **Push Only**               | Upload local changes without downloading remote changes |
| **Pull Only**               | Download remote changes without uploading local changes |

### Safety Guards

- **Deletion Threshold**: Blocks sync if more than 30% of items would be deleted
- **Mass Deletion Warning**: Alerts when 10+ items are targeted for deletion
- **Empty State Protection**: Prevents accidental wipe of all data
- **Sync Preview**: Review all planned changes before executing

### S3-Compatible Storage

Works with any S3-compatible storage provider:

- Amazon S3
- MinIO
- Backblaze B2
- DigitalOcean Spaces
- Any S3-compatible endpoint

---

## Security and Encryption

### End-to-End Sync Encryption

All data is encrypted before leaving your device:

| Parameter          | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| **Algorithm**      | AES-256-GCM (authenticated encryption)                |
| **Key Derivation** | PBKDF2 with 100,000 iterations and SHA-256            |
| **Salt**           | 16 bytes, randomly generated per encryption operation |
| **Nonce**          | 12 bytes, randomly generated per encryption operation |

**Encrypted fields**: Note titles, summaries, content, and directory names.
**Plaintext fields**: IDs, timestamps, and structural references (required for sync logic).

### Credential Storage

API keys and S3 credentials are stored locally with:

| Parameter          | Value                                    |
| ------------------ | ---------------------------------------- |
| **Algorithm**      | AES-256-GCM                              |
| **Key Derivation** | SHA-256 of machine ID + application salt |
| **Storage Format** | Binary file (bincode serialization)      |

Credentials are bound to the machine -- they cannot be decrypted on a different device.

### Privacy Architecture

- **Local-first**: All data stored in SQLite on your device
- **No telemetry**: No usage data leaves the application
- **Optional sync**: Cloud sync is entirely opt-in
- **Client-side AI**: AI API calls go directly from your device to the provider -- no intermediary server

---

## Folder and Note Management

### Hierarchical Folders

- Unlimited nesting depth for folder organization
- Create, rename, move, and delete folders
- Folder tree with expand/collapse and virtualized rendering
- Optional note count display per folder
- AI-suggested folder placements that respect your existing structure
- Move validation with circular dependency and collision detection
- Folder deletion options: move notes to Uncategorized or permanently delete

### Note Operations

- Create notes manually or via AI generation
- Edit title, summary, content, folder assignment, and tags independently
- Edit creation date after the fact
- Create wiki-style links between notes with autocomplete and alias support
- Move notes between folders
- Add or remove tags directly from the note header
- Multi-tab interface for working with several notes simultaneously
- Multi-select mode for bulk note selection and batch actions
- Persistent tab state across sessions
- Unsaved changes detection with confirmation dialogs
- Per-note scroll position persistence
- Review outgoing links, grouped backlinks, and broken links from the note viewer
- Batch regeneration support for AI-managed note fields

### Search and Navigation

- **Sidebar Search**: Real-time search across folder names, note titles, and summaries
- **Tag Filters**: Filter notes by one or more tags without leaving the current view
- **Match Modes**: Switch between "match any" (OR) and "match all" (AND) tag filtering
- **Sort Options**: Sort by creation date or last modified date
- **Date Picker**: Filter notes by specific calendar date
- **Linked Note Navigation**: Jump directly to referenced notes from inline wiki links, outgoing links, or backlinks
- **Timeline Scrubber**: Visual month-by-month timeline for quick navigation through large collections

---

## Tags and Filtering

ZeroSort includes a dedicated tagging system designed to complement folders rather than replace them.

### Tag Management

- Create, rename, recolor, search, and delete tags from a dedicated Tag Manager
- Apply optional colors to make tag groups easier to scan visually
- View per-tag note counts to understand how tags are being used
- Bulk-select and bulk-delete tags when reorganizing a large tag catalog
- Safe deletion automatically removes deleted tags from all affected notes

### Note Tagging Workflow

- Assign multiple tags to a single note
- Create a new tag inline while editing a note
- Remove tags directly from a note without opening a separate settings page
- Regenerate suggested tags for an existing note with AI
- Display tags on note cards and in open-note workspace views for quick scanning

### Filtering and Discovery

- Activate tag filters from the sidebar or Tag Manager
- Keep several tags active at once for cross-cutting views like `Research` + `Draft`
- Toggle between OR and AND matching depending on whether you want broader or narrower results
- Clear active filters in one click

### AI and Portability

- Regenerate suggested tags for an existing note with AI
- AI-generated tag names can be resolved to existing tags or created automatically when needed
- Import and export tags through Markdown frontmatter for portable backups and migrations

---

## Customization

### Appearance

| Setting             | Options                                                       |
| ------------------- | ------------------------------------------------------------- |
| **Theme**           | Light, Dark, System (auto-detect)                             |
| **Theme Presets**   | Built-in color presets + custom theme with HSL adjustments    |
| **Interface Scale** | 75% to 150% (continuous slider)                               |
| **Content Scale**   | sm, base, lg, xl, 2xl                                         |
| **Code Wrapping**   | Toggle between horizontal scroll and line wrap in code blocks |

### Theme Customization

Advanced theme controls for fine-tuning the visual appearance:

- **Color presets**: Multiple built-in themes to choose from
- **HSL adjustments**: Hue shift, saturation, and lightness controls
- **Shadow customization**: Color, opacity, blur, spread, and offset
- **Border radius**: Configurable from 0 to 5rem
- **Spacing**: Adjustable from 0.15 to 0.35rem
- **View transitions**: Smooth animated transitions between themes with circular reveal effect

### Editor Configuration

- Toggle individual toolbar groups on/off (7 groups)
- Enable/disable AI floating menu
- Configurable submit shortcut (Enter, Shift+Enter, Ctrl+Enter)
- Show/hide note summaries in the list view
- Show/hide folder note counts
- Show/hide character and word count in the editor

### AI Configuration

- Multiple provider configurations simultaneously
- Per-provider model selection
- Custom base URLs for self-hosted endpoints
- Toggle AI features on/off globally
- Connection testing to verify provider connectivity

### Data Management

- **Import**: Import individual Markdown files or a full Markdown folder hierarchy
- **Export**: Export notes to a Markdown folder structure with metadata and managed images
- **Cleanup tools**: Preview and remove unused tags or empty folders from the library

---

## Platform Support

| Platform    | Status    |
| ----------- | --------- |
| **macOS**   | Supported |
| **Windows** | Supported |
| **Linux**   | Supported |

---

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

- [AGENTS.md](AGENTS.md) — conventions for contributors and AI agents
