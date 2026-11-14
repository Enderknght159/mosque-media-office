# mosque-media-office

نظام متابعة المكتب الإعلامي في المسجد — النسخة 2.

An offline-first media-office tracker for a mosque: what has been asked for, which stage each job reached, who finished which part, what was delivered — plus a file repository and AI automation of editing tasks through `opencode`.

The interface is Arabic and right-to-left.

## What it does

- A dashboard with the work currently open, the numbers behind it, and the AI spend of the last 30 days
- Tasks broken into stages, with the member who completed each stage recorded
- Groups, to keep tasks related to one event or one recurring programme together
- Reports with charts built from the same data, including an automation section (runs, success rate, cost, tokens, cost per model and per group)
- Export to Excel or JSON, and import either format back
- Light and dark themes
- **File repository** — one folder per group and one folder per task on the office's disk, indexed in `mosque-media-office.repo.json`
- **AI automation** — a task can be handed to `opencode` with an editable prompt; results land in `output/`, technical files in `opencode/`

## Running it

### Desktop app (recommended)

```sh
npm install
npm run dev
```

### Browser mode

```sh
node server.js
```

and open `http://localhost:3000`. Everything works except the file repository and automation (they need the desktop shell).

### Building the Windows app

```sh
npm run build            # NSIS installer + portable exe  → release/
npm run build:portable   # portable only
npm run build:installer  # installer only
```

Both need Node 20+ and `opencode` installed for the automation features.

## The file repository

Pick a folder once from **الإعدادات ← المستودع**. The app writes:

```text
<repo>/
├─ mosque-media-office.repo.json   ← index: which folder belongs to which task/group
├─ mosque-media-office.data.json   ← automatic mirror of the app data (restore + moving machines)
├─ <group name>/
│  └─ 20260810 - <task title>/
│     ├─ output/                   ← everything the AI produces
│     └─ opencode/                 ← drafts, logs, status.json, run-*.json
└─ بدون مجموعة/                    ← tasks that have no group
```

- Folder names stay readable: illegal Windows characters become spaces, names are capped at 60 characters, duplicates get ` (2)`, ` (3)`…
- Renaming a task or group renames its folder; moving a task between groups moves the folder.
- Deleting a task never deletes its folder — the link is dropped and the media stays on disk.
- Opening a folder is one click from the task row, the task card, the task page and the group card.

## Automation with opencode

1. Install [opencode](https://opencode.ai) and make sure `opencode --version` works.
2. In **الإعدادات ← الأتمتة**: check the connection, load the models, and block the expensive ones so they never appear in the start dialog.
3. Create prompts in the **الأتمتة** tab (like templates: name, description, editable text).
4. Start a run from the task itself — the robot button on the card, the row, or the task page. The dialog lets you pick a prompt, edit its text, add notes, and choose a model (the last choice is remembered).

The app runs `opencode run --format json --auto --model … "<prompt>"` inside the task folder and asks the agent to follow a written contract: final files in `output/`, technical work in `opencode/`, and progress in `opencode/status.json` (`state`, `phase`, `percent`, `etaSeconds`). The UI shows live progress from those events and from `status.json`, and records tokens and USD cost for every run.

There is no limit on how many automations run at once.

## Files

| Path | Contents |
|---|---|
| `index.html`, `css/` | the interface |
| `js/app.js` | routing, state and actions |
| `js/data.js` | the data model (v2), persistence and automation statistics |
| `js/views.js` | screens |
| `js/modals.js` | dialogs |
| `js/automation-ui.js` | the automation tab, prompts and the start dialog |
| `js/settings-sections.js` | repository and AI settings sections |
| `js/repo.js` | renderer side of the file repository |
| `js/opencode.js` | renderer side of the automation engine |
| `js/io.js` | Excel and JSON import/export |
| `js/charts.js` | the report charts |
| `electron/main.js` | Electron window, `app://` protocol, IPC registration |
| `electron/preload.js` | the narrow `window.MMO` bridge |
| `electron/repo.js` | repository folders, manifest and mirror (main process) |
| `electron/opencode.js` | process spawning, event parsing, cost accounting (main process) |
| `docs/v2-plan.md`, `docs/ipc-contract.md` | design notes and the module contracts |
| `test/` | offline data/repo tests, browser walkthrough, Electron end-to-end test |

## Tests

```sh
npm run test:offline   # data model v2 + repository folders (no browser)
npm run test:ui        # browser screenshots and flows (Chrome)
npm run test:e2e       # real Electron + a real opencode run (costs a few tokens)
```

Data still lives in `localStorage` (the repository mirror is a copy, not the source). Export a JSON backup before clearing the browser's site data.
