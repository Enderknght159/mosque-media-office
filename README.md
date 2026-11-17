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
- **Calm dashboard** — five equal stat cards with a large centered number, and explanatory subtitles moved to hover tooltips instead of crowding the screen; task dates can be sorted newest-first
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

## Storage and archiving — التخزين والأرشفة

- **Space indicators**: the dashboard carries a fifth stat card «مساحة الوسائط» (used, capacity, percentage) next to the four existing stats. Task cards show a small `hard-drive` chip with the task's size, and the task page breaks every task into three sections — المصادر, المخرجات, `opencode` — with a size and a share of the total for each.
- **Repository tab** (`المستودع`, under the **التخزين** heading): the primary repository and every external archive sit side by side as cards, each with its own donut for where the space went and a large used / small free pair. The primary card is marked «الأساسي». The largest-tasks table supports multi-select (checkbox + bulk archive/delete) and per-section action dropdowns on the size cell, without expanding the row.
- **External archive**: link a second drive as an archive repo (`.mmo-archive` receipts on that drive). Linking writes only `mosque-media-office.repo.json` — no task folders are created until you actually archive something. Moving a section is **verified**: each file is copied, re-read, its SHA-256 compared with the source, written to a receipt, and only then is the source deleted. A failure or a cancellation leaves the source untouched and cleans up only the partial copies.
- **`.trash` — 7 days**: deleting a task, group or section moves it into `.trash` inside the repository instead of erasing it. Entries stay for seven days with the remaining days shown, and can be restored (the record comes back too) or deleted permanently. Permanent deletion is a separate explicit action. The trash and the operations log are normal cards at the bottom of the tab.
- **Drive letter changed**: if the archive drive comes back as `F:` instead of `E:`, the app finds the repository by its `repoId` in `mosque-media-office.repo.json` and offers to re-link it — the files are never touched. An offline repository is shown dimmed with «إعادة ربط», not as missing data.
- **Unlinking**: both the primary repository and an archive ask for confirmation first; unlinking the primary also requires the settings password when one is set.
- **Per-section actions**: on the task page each section has «أرشفة» (move to the external archive) and «حذف» (move to `.trash`); an archived section shows its archive name and a «استعادة» button instead. The same actions are available from the repository tab.

## Upgrading — الترقية

Run the new installer over the installed copy — do not uninstall first. The `appId` and `productName` are fixed (see the header of `electron-builder.yml`), so NSIS recognises the previous version, replaces it in the same folder, keeps a single entry in «التطبيقات», and does not duplicate the desktop shortcut.

Your data stays in `%APPDATA%\mosque-media-office` (independent of the app version, and not deleted on uninstall). Before the first write after a version upgrade, `store:backup` writes a full pre-migration snapshot to `%APPDATA%\mosque-media-office\backups\pre-v3-<timestamp>.json` — keep it until you have checked the tasks and the repository links.

To verify an upgrade on a build machine that has both installers in `release/`:

```sh
node test/installer-upgrade.js
```

It installs 2.1.0 silently into a temporary folder, plants a probe file in the real user-data folder, installs 2.2.0 over it, and checks that the folder, the probe file, and the single uninstall entry survived. Without both installers it prints a skip message and exits 0.

## Automation with opencode

1. Install [opencode](https://opencode.ai) and make sure `opencode --version` works.
2. In **الإعدادات ← الأتمتة**: check the connection, load the models, and block the expensive ones so they never appear in the start dialog.
3. Create prompts in the **الأتمتة** tab (like templates: name, description, editable text).
4. Start a run from the task itself — the robot button on the card, the row, or the task page. The dialog lets you pick a prompt, edit its text, add notes, and choose a model (the last choice is remembered).

The app runs `opencode run --format json --auto --model … "<prompt>"` inside the task folder and asks the agent to follow a written contract: final files in `output/`, technical work in `opencode/`, and progress in `opencode/status.json` (`state`, `phase`, `percent`, `etaSeconds`). The UI shows live progress from those events and from `status.json`, and records tokens and USD cost for every run.

The run-details dialog is a live control panel: the current phase, percent, ETA, elapsed time, tokens, cost, outputs and the agent's question (when it is blocked) all come from `status.json` and the live process — no need to read the JSON. From it you can refresh the snapshot, ask the agent where it is, stop the run, restart it, open the output/opencode folders, and copy the session ID without displaying it.

Task date is a first-class field: it names the folder (`20260810 - title`) and is shown on the card. Due date, assignee, priority, description and stages live under **إعدادات متقدمة** in the task dialog.

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
| `js/repo-view.js` | the repository tab: capacity, largest tasks, sections, trash |
| `js/opencode.js` | renderer side of the automation engine |
| `js/io.js` | Excel and JSON import/export |
| `js/charts.js` | the report charts |
| `electron/main.js` | Electron window, `app://` protocol, IPC registration |
| `electron/preload.js` | the narrow `window.MMO` bridge |
| `electron/repo.js` | repository folders, manifest and mirror (main process) |
| `electron/storage.js` | space scan, capacity and volume detection (main process) |
| `electron/archive.js` | verified archive/restore moves, receipts and `.trash` (main process) |
| `electron/opencode.js` | process spawning, event parsing, cost accounting (main process) |
| `docs/v2-plan.md`, `docs/v2.2-plan.md`, `docs/ipc-contract.md` | design notes and the module contracts |
| `test/` | offline data/repo/storage tests, browser walkthrough, Electron end-to-end and installer-upgrade tests |

## Tests

```sh
npm run test:offline   # data model v2 + repository folders (no browser)
npm run test:ui        # browser screenshots and flows (Chrome)
npm run test:e2e       # real Electron + a real opencode run (costs a few tokens)
```

Data still lives in `localStorage` (the repository mirror is a copy, not the source). Export a JSON backup before clearing the browser's site data.
