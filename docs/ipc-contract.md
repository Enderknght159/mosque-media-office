# عقود النسخة 2 (IPC + الوحدات + الواجهة)

هذا الملف هو المرجع الملزم لكل وحدة. لا تغيّر أي توقيع هنا دون تحديث الملف نفسه أولًا.

## 0. قواعد عامة

- كل نتيجة IPC: `{ ok: true, data: ... }` أو `{ ok: false, message: 'رسالة عربية واضحة', code: '...' }`.
- لا نستخدم `alert` / `confirm` / `prompt` الأصلية. استخدم `App.toast`، `App.confirm`، `App.openModal`.
- كل الرسائل للمستخدم بالعربية، والأسماء في الكود بالإنجليزية.
- كل مسار ملف من الواجهة يُمرَّر **نسبيًا للمستودع** (مثل `إعلانات رمضان\\20260810 - اسم المهمة`)، والوحدة الرئيسية فقط تُحوّله إلى مسار مطلق.
- منع الخروج من المستودع: أي مسار لا يبدأ بالمستودع يُرفض.
- الواجهة لا تعرف Node ولا `fs` إطلاقًا؛ كل شيء عبر `window.MMO`.

## 1. سطح `window.MMO` (preload، منفّذ مسبقًا)

```ts
window.MMO = {
  isDesktop: true,
  platform: 'win32',
  versions: { electron, chrome, node },
  info(): Promise<{ ok, data: { appVersion, electron, node, platform, userData, isPackaged } }>,
  openExternal(url): Promise<{ ok }>,

  repo: {
    pick(): { ok, data: { path } },
    detect(path): { ok, data: { path, manifest: Manifest|null, isRepo: boolean, writable: boolean } },
    link(path): { ok, data: { path, manifest: Manifest, created: boolean } },
    sync({ repoPath, autoRename, groups, tasks }): SyncResult,
    open({ repoPath, relPath, kind }): { ok },
    reveal({ repoPath, relPath }): { ok },
    readManifest(repoPath): { ok, data: { manifest } },
    pathFor({ repoPath, relPath }): { ok, data: { absolute, exists } }
  },

  store: {
    readMirror(): { ok, data: { snapshot: string|null, path } },
    writeMirror(snapshot: string): { ok, data: { path } }
  },

  opencode: {
    health({ opencodePath }): { ok, data: { available, command, version, checkedAt } },
    models({ opencodePath, refresh }): { ok, data: { models: string[], at, source } },
    start(JobStart): { ok, data: { jobId, pid, taskFolder, logPath, command } },
    cancel({ jobId }): { ok, data: { cancelled } },
    jobs(): { ok, data: { jobs: JobSnapshot[] } },
    status({ taskFolder }): { ok, data: { status: AgentStatus|null, run: RunRecord|null } },
    log({ jobId, tail }): { ok, data: { text } },
    refresh({ jobId, taskFolder?, repoPath? }): { ok, data: { agentStatus, run, logTail, phase, percent, etaSeconds, message, outputs, updatedAt } },
    ping({ jobId, message? }): { ok, data: { started, logPath, pid } },
    onEvent(cb): () => void,
    onUpdate(cb): () => void,
    onDone(cb): () => void,
    onPing(cb): () => void
  }
}
```

### بيانات مشتركة

```jsonc
// المصدر المنطقي للواجهة (Data)
{
  "groups": [{ "id": "grp_x", "name": "إعلانات رمضان", "folder": "إعلانات رمضان" }],
  "tasks": [{ "id": "tsk_x", "title": "إعلان الافتتاح", "groupId": "grp_x", "createdAt": "2026-08-10T…", "folder": "إعلانات رمضان\\20260810 - إعلان الافتتاح" }]
}
```

```jsonc
// SyncResult
{
  "ok": true,
  "data": {
    "repoPath": "C:\\repo",
    "manifest": { /* Manifest */ },
    "groups": { "grp_x": "إعلانات رمضان" },
    "tasks": { "tsk_x": "إعلانات رمضان\\20260810 - إعلان الافتتاح" },
    "absolute": { "groups": { "grp_x": "C:\\repo\\إعلانات رمضان" }, "tasks": { "tsk_x": "C:\\repo\\…" } },
    "actions": [{ "type": "created|moved|renamed", "target": "task|group", "id": "tsk_x", "from": "", "to": "…" }],
    "warnings": ["…"]
  }
}
```

```ts
type JobStart = {
  jobId: string;            // يولّده Data.startAutomation
  taskId: string;
  taskTitle: string;
  groupName?: string;
  repoPath: string;
  taskFolder: string;       // نسبي للمستودع
  model: string;            // provider/model أو provider/model#variant
  prompt: string;           // نص البرومت بعد التعديل
  notes: string;            // ملاحظات المستخدم
}
```

```ts
type JobSnapshot = {
  jobId, taskId, status: 'running'|'done'|'failed'|'cancelled',
  progress: number, phase: string, etaSeconds: number, steps: number,
  sessionID: string, startedAt: string, endedAt: string|null,
  exitCode: number|null, error: string,
  usage: { input, output, reasoning, cacheRead, cacheWrite, costUSD }
}
```

```ts
type AgentStatus = {
  state: 'working'|'done'|'failed'|'blocked',
  phase?: string, percent?: number, etaSeconds?: number,
  message?: string, outputs?: string[], updatedAt?: string
}
```

## 2. `electron/repo.js`

```js
module.exports = {
  register(ipcMain, guard) { /* ipcMain.handle('repo:*', guard(handler)) */ },
  MANIFEST_NAME: 'mosque-media-office.repo.json',
  MIRROR_NAME: 'mosque-media-office.data.json',
  STATUS_DIR: 'opencode',
  OUTPUT_DIR: 'output'
};
```

مسؤوليات إلزامية:

- `repo:pick`: `dialog.showOpenDialog({ properties: ['openDirectory','createDirectory'] })`.
- `repo:detect`: يتحقق من وجود المجلد، يقرأ `mosque-media-office.repo.json` ويُعيده أو `null`، و`writable` عبر محاولة كتابة ملف مؤقت.
- `repo:link`: إن لم يوجد الملف ينشئه (`schema:1`, `repoId: 'rpo_'+random`, `kind:'mosque-media-office-repo'`)، ويكتبه كتابة ذرّية (tmp + rename).
- `repo:sync`: هذه أهم دالة:
  - يقرأ الملف أو ينشئه.
  - لكل مجموعة: مجلد = `sanitizeFolder(name)` في الجذر (وإن كان الاسم فارغًا → `مجموعة <id>`).
  - لكل مهمة: مجلد داخل مجلد مجموعتها = `${YYYYMMDD} - ${sanitizeFolder(title)}` حيث التاريخ من `createdAt` بالتوقيت المحلي.
  - التفريد: إذا كان الاسم محجوزًا لمجلد آخر أو موجودًا على القرص لمهمة أخرى → `(2)`, `(3)`…
  - إن كان للمهمة/المجموعة مجلد مسجّل سابقًا: يُعاد استخدامه. وإذا تغيّر الاسم (title/name) و`autoRename` → `fs.renameSync` مع تحديث السجل؛ وإذا تغيّرت مجموعة المهمة → نقل المجلد.
  - إذا اختفى المجلد من القرص → يُعاد إنشاؤه ويُسجّل `warning`.
  - ينشئ داخل كل مهمة `output/` و`opencode/` (و`opencode/logs/`).
  - يحدّث `manifest.tasks[id] = { title, groupId, folder, createdDate, updatedAt }` و`manifest.groups[id] = { name, folder }`، ويحذف من الملف ما حُذف من البيانات (دون حذف مجلدات القرص).
  - يكتب الملف مرة واحدة في النهاية.
- `repo:open`: `shell.openPath(absolute)`؛ `kind: 'task-output'|'task-opencode'` يفتح المجلد الفرعي.
- `repo:reveal`: `shell.showItemInFolder` أو `shell.openPath` للمجلد.
- `repo:pathFor`: إرجاع المسار المطلق و`exists`.

قواعد التسمية (إلزامية، مشتركة مع الواجهة):

```
sanitizeFolder(name):
  1) إزالة المحارف \ / : * ? " < > | و \u0000-\u001f
  2) تحويل المسافات المتكررة إلى مسافة واحدة، وتشذيب النقاط والمسافات من الطرفين
  3) الأسماء المحجوزة في ويندوز (CON, PRN, AUX, NUL, COM1-9, LPT1-9) → لاحقة "-"
  4) القص إلى 60 حرفًا (بحساب الوحدات المنطقية)
  5) إن كان فارغًا → "بدون اسم"
```

## 3. `electron/opencode.js`

```js
module.exports = {
  register(ipcMain, guard, { getWindow }) {},
  shutdown() {}
};
```

مسؤوليات:

- `resolveCommand(opencodePath?)`: ابحث بالترتيب: المسار المحدد، `opencode` في PATH، `%APPDATA%\\npm\\opencode.cmd`. أعِد `{ command, shell }`؛ على ويندوز استخدم `shell: true` للـ `.cmd` أو `cmd.exe /c`.
- `opencode:health`: `opencode --version` بمهلة 8 ثوان، وأعِد الإصدار.
- `opencode:models`: `opencode models` بمهلة 30 ثانية، سطر لكل موديل `provider/model`، مع كاش في الذاكرة 10 دقائق ما لم يُطلب `refresh`.
- `opencode:start`:
  1. تحقق أن `taskFolder` داخل `repoPath`، وأن المجلد موجود.
  2. أنشئ `output/` و`opencode/logs/`.
  3. اكتب `opencode/AGENTS.md` (عقد العمل الكامل أدناه).
  4. اكتب `opencode/status.json` ابتدائيًا: `{ "state": "working", "phase": "بدء التشغيل", "percent": 0, "etaSeconds": 0 }`.
  5. شغّل:
     ```
     opencode run --format json --auto --model <model> --title "<taskTitle>" "<fullPrompt>"
     ```
     مع `cwd = <taskFolder>` و`windowsHide: true`، والالتقاط الكامل.
  6. `fullPrompt` = `prompt` + قسم الملاحظات (إن وُجدت) + قسم «عقد العمل» النصي.
  7. اكتب كل سطر JSON في `opencode/logs/run-<jobId>.jsonl` وأرسل `mmo:automation:event`.
  8. حلّل `step_finish.part` لتجميع `tokens` و`cost` (USD)، و`step_start`/`tool_use` لعدّ الخطوات، والتقط `sessionID` من أول حدث.
  9. راقب `opencode/status.json` كل ثانية (`fs.watchFile`) وحدّث التقدّم.
  10. عند الإغلاق: اكتب `opencode/run-<jobId>.json` وأرسل `mmo:automation:done`.
  11. `setInterval`/تحديثات `mmo:automation:update` بحد أقصى 4 مرات/ثانية.
  12. لا حد لعدد العمليات المتزامنة.
- `opencode:cancel`: `taskkill /pid <pid> /T /F` على ويندوز، وإنهاء العملية ومعالجة الخطأ إن كانت منتهية.
- `opencode:refresh`: يعيد آخر حالة من `opencode/status.json` + أحدث `run-*.json` + آخر 120 سطرًا من السجل. يعمل للتشغيلات الحية والمنتهية (المجلد يجب أن يبقى داخل المستودع)، ولا يرمي خطأ لملف مفقود.
- `opencode:ping`: يرسل رسالة متابعة إلى الوكيل داخل نفس الجلسة عبر `opencode run --session <id>`، ويكتب سجلًا في `opencode/logs/ping-<jobId>-<ts>.jsonl` ويضيف توكنز/تكلفة الرد إلى نفس التشغيل. يعمل فقط ما دامت العملية حية ومعها `sessionID`، ويُرفض مع رسالة عربية واضحة بعدها. الأحداث تُبث على `mmo:automation:ping` بالشكل `{ jobId, taskId, type: 'text'|'log'|'error'|'done', text, exitCode?, error? }`.
- `opencode:jobs`: العمليات الحية فقط.
- `opencode:status`: يقرأ `opencode/status.json` و`run-*.json` الأخير.
- `opencode:log`: آخر N سطر من ملف السجل (افتراضي 200).
- `shutdown()`: قتل كل العمليات الحية قبل الخروج.

عقد العمل النصي (يُرسل مع كل مهمة ويُكتب في `opencode/AGENTS.md`):

```md
# عقد العمل — المكتب الإعلامي

أنت تعمل داخل مجلد مهمة واحدة. المصادر في هذا المجلد نفسه.

1. المخرجات النهائية فقط داخل `output/` (فيديو، صور، ملفات تصدير).
2. كل المسودات والملاحظات والأوامر التقنية داخل `opencode/`.
3. لا تنشئ أو تعدّل أي ملف خارج هذين المجلدين، ولا تلمس مجلدات أخرى.
4. لا تحذف ملفات المصدر.
5. حدّث `opencode/status.json` بعد كل خطوة رئيسية بالشكل:
   { "state": "working|done|failed|blocked", "phase": "…", "percent": 0-100, "etaSeconds": 0, "message": "…", "outputs": ["output/…"], "updatedAt": "ISO" }
6. عند الانتهاء: الناتج في `output/` و`state` في `status.json` تساوي `done` والـ`percent` 100.
7. أسماء الملفات الناتجة واضحة وبالعربية، وأخبر في `message` بما أنجزته.
8. إن احتجت قرارًا من المستخدم: `state: "blocked"` واكتب السؤال في `message` ثم توقف.
```

## 4. الوحدات في الواجهة

### `js/repo.js`

```js
const Repo = {
  available(),                              // !!window.MMO?.repo
  status(),                                 // { linked, path, exists, lastSyncAt }
  async link(),                             // اختيار مجلد + ربط + مزامنة كاملة (يعيد { ok })
  async relink(),                           // إعادة اختيار مستودع جديد
  unlink(),                                 // Data.unlinkRepo()
  async sync({ silent = false } = {}),      // يرسل البيانات إلى الرئيسية ثم Data.applyFolderIndex
  async ensureTask(taskId),                 // يضمن مجلد المهمة ويعيد المسار النسبي أو ''
  async ensureGroup(groupId),
  async openTask(taskId), openTaskOutput(taskId), openTaskOpencode(taskId), openGroup(groupId), openRepo(),
  async refreshMissing()                    // فحص المجلدات الناقصة وإعادة إنشائها
};
```

قواعد:
- أي عملية مجلد في وضع المتصفح → `App.toast('مجلدات المهام تحتاج تطبيق سطح المكتب.', { type: 'info' })` وإرجاع `false`.
- `sync` لا يُظهر أخطاء مزعجة إذا لم يكن هناك مستودع مربوط.
- بعد كل `sync` ناجح: `Data.applyFolderIndex(...)` ثم `App.refresh()`.
- المزامنة التلقائية: `Repo.autoSync()` مؤجّلة 1500ms تُستدعى بعد إنشاء/تعديل/حذف مهمة أو مجموعة (تستدعيها `app.js`).

### `js/opencode.js`

```js
const Opencode = {
  available(),
  async health({ silent = false } = {}),        // يحدّث settings.ai عبر Data.setAiSettings
  async models({ refresh = false } = {}),       // يعيد { all: string[], allowed: string[] }
  allowedModels(all),                           // يطبّق settings.ai.filter
  isModelAllowed(model),
  async start({ taskId, promptId, promptName, model, notes, promptText }), // يعيد { ok, job|message }
  async cancel(jobId),
  attach(),                                     // اشتراك واحد بأحداث main + استئناف الحالة
  markStaleJobs(),                              // job status=running بلا عملية حية → interrupted
  formatCost(usd),                              // "$0.0123"
  async openLog(jobId)
};
```

- `start`: يجب أن يكون المستودع مربوطًا، وأن يكون مجلد المهمة جاهزًا (`Repo.ensureTask`)، وأن يكون الموديل مسموحًا.
- ينشئ السجل عبر `Data.startAutomation` ثم يحدّث بالمعرّف عند كل حدث من `onUpdate`/`onDone`.
- يمنع بدء مهمتين لنفس المهمة في الوقت نفسه: `Data.activeAutomation(taskId)` موجودة → رسالة واضحة.

### `js/automation-ui.js`

```js
const AutomationUI = {
  page(data, state),        // HTML صفحة تبويب «الأتمتة»
  handleAction(action, el), // true إذا تعامل مع الحدث
  openStart(taskId),        // نافذة تأكيد الأتمتة (اختيار برومت + تحرير + ملاحظات + موديل)
  openPromptForm(promptId = null),
  openJobDetail(jobId)
};
```

- تبويب الأتمتة: المهام الجارية الآن أولًا (تقدّم + مرحلة + وقت متبقٍ + إلغاء + فتح السجل + فتح المجلد)، ثم سجل المنتهية، ثم إدارة البرومتات (قائمة + إضافة/تعديل/تكرار/حذف).
- صفحة الأتمتة لا تبدأ أي مهمة؛ البدء فقط من المهمة.
- نافذة التأكيد: اختيار البرومت (يحمّل محتواه في حقل قابل للتحرير)، الملاحظات، الموديل (من `Opencode.models` مع `settings.ai.lastModel` كافتراضي، وتذكير آخر اختيار)، وملخص «سيُحفظ في …».
- استخدم `App.openModal` و`App.toast` و`App.refresh`.

### `js/settings-sections.js`

```js
const SettingsSections = {
  repoMarkup(data),         // HTML قسم «المستودع»
  aiMarkup(data),           // HTML قسم «الأتمتة والذكاء الاصطناعي»
  handleAction(action, el), // repo-link, repo-relink, repo-sync, repo-unlink, repo-reveal,
                            // ai-check, ai-models-refresh, ai-model-toggle, ai-filter-mode, ai-default-model
  bind(root)                // ربط الحقول النصية (مسار opencode) عند الحاجة
};
```

- قسم الأتمتة: حالة الاتصال (`Opencode.health`)، مسار opencode، زر فحص، زر جلب الموديلات، قائمة الموديلات كاملة (بحث + مفتاح مسموح/ممنوع لكل موديل)، الوضع (`all` أو `allow`)، الموديل الافتراضي، وتنبيه أن الموديلات الممنوعة لن تظهر في قائمة الاختيار.
- يجب أن يعمل القسم في وضع المتصفح مع تنبيه لطيف.

## 5. تعديلات `js/app.js` (يملكها المنسّق فقط)

- استيراد الوحدات في `index.html` بالترتيب: `utils, icons, data, charts, io, repo, opencode, settings-sections, views, automation-ui, modals, app`.
- توجيه جديد: `automation` → `Views.render` يستدعي `AutomationUI.page`.
- قبل `switch` في `handleAction`:
  ```js
  for (const handler of [window.Repo, window.SettingsSections, window.AutomationUI]) {
    if (handler?.handleAction && await handler.handleAction(action, element)) { finishMenu(); return; }
  }
  ```
- بعد كل `Data.createTask/updateTask/deleteTask/createGroup/updateGroup/deleteGroup/duplicateTask` → `Repo.autoSync()`.
- عند بدء التطبيق: `Data.restoreFromMirror()` إن لم توجد بيانات، ثم `Repo.sync({silent:true})` و`Opencode.attach()` و`Opencode.markStaleJobs()`.

## 6. خريطة ملكية الملفات (إلزامية للتوازي)

| المالك | الملفات |
|---|---|
| المنسّق (أنا) | `electron/main.js`, `electron/preload.js`, `js/data.js`, `js/app.js`, `js/icons.js`, `index.html`, `js/io.js`, `docs/*`, `README.md` |
| A | `electron/repo.js`, `js/repo.js` |
| B | `electron/opencode.js`, `js/opencode.js` |
| C | `js/automation-ui.js`, `css/automation.css` |
| D | `js/views.js`, `js/modals.js`, `css/views.css`, `css/components.css` |
| E | `js/settings-sections.js`, `scripts/build-electron.js`, `electron-builder.yml`, `assets/icon.png` |

ممنوع على أي وكيل تعديل ملف لا يملكه. أي حاجة لعنصر مشترك → اطلبها في تقريرك النهائي.

## 7. عقود v2.2 — التخزين والأرشفة والسلة

> المرجع التصميمي: `docs/v2.2-plan.md` §4.3. الأسماء والأشكال أدناه هي **المنفّذة فعليًا** في
> `electron/storage.js`, `electron/archive.js`, `electron/repo.js`, `electron/main.js`
> و`electron/preload.js`. كل اختلاف عن مسوّدة الخطة مذكور صراحة في §7.5.

### 7.0 قواعد إلزامية في هذه المجموعة

- كل قناة تُسجّل عبر `guard` نفسه: `{ ok: true, data }` أو `{ ok: false, message, code }`.
- كل مسار قادم من الواجهة **نسبي للمستودع** ويُحل داخل جذره عبر `resolveInside` نفسه في
  `electron/repo.js`. أي مسار خارج الجذر يُرفض (`path-escape`)، والنقل فوق جذر المستودع
  أو بين مستودعين متداخلين يُرفض (`repo-overlap`).
- النقل (أرشفة/استعادة/سلة) لا يحذف المصدر قبل: نسخ إلى `.incoming/<uuid>.part` → إعادة قراءة
  الوجهة → حساب **SHA-256** للأصل والنسخة → مطابقة تامة → إعادة تسمية ذرّية → كتابة الإيصال
  في `.mmo-archive/index/` → **وبعدها فقط** حذف المصدر. أي فشل/إلغاء ينظّف `.incoming` ويترك
  المصدر سليمًا.
- `.trash` و`.mmo-archive` و`.incoming` مستثناة من كل حسابات المساحة، ولا تُعدّ أقسام مهمة.
- إن كانت الإعدادات مقفلة بكلمة مرور: الأرشفة مسموحة (لا تُفقد بيانات)، والحذف/الإفراغ يتطلبان فتح القفل.

### 7.1 التخزين — `electron/storage.js`

```ts
storage:scan({ repos, tasks, force? })
  -> {
       scannedAt,
       totals: { used, free, capacity },
       sections: { sources, output, opencode, other, trash, total },
       repos: {
         [repoId]: { used, free, capacity, sections, online, scannedAt }
       },
       tasks: {
         [taskId]: { sources, output, opencode, total, files, exists }
       }
     }
// repos: [{ id | repoId, path, role: 'primary'|'archive', ... }]
// force يتجاوز كاش 60 ثانية. المستودع غير المتصل يعود online:false بأرقامه المعروفة من سجل الأرشفة.

storage:locate({ items: [{ id, path, rel, role?, label?, sections? }] })
  -> { locations: [{ id, role: 'primary'|'archive', label, path, rel, sections, absolute, exists }] }
// العنصر الذي جذره مفقود أو مساره خارج الجذر يُسقط وحده (لا يفشل الاستدعاء كله).

storage:volume({ path })
  -> { label, serial, fs, total, free }
// على ويندوز عبر Get-CimInstance Win32_LogicalDisk بلا صلاحيات مدير، وfallback إلى fs.statfs.
```

حدث التقدم: `mmo:storage:progress` → `{ repoId, phase: 'scan', files, bytes }` (كل 250ms تقريبًا)،
يُبثّ للنافذة الحية فقط.

### 7.2 المستودعات — `electron/repo.js`

```ts
repo:register({ path, role?: 'archive', label? })
  -> { path, manifest, created }      // يربط مجلدًا كمستودع أرشيفي دون تغيير المستودع النشط
repo:forget()
  -> { forgotten: true }              // ينسى المستودع النشط على هذا الجهاز فقط
repo:readManifest({ repoPath })       -> { manifest }
store:readMirror()                    -> { snapshot: string|null, path }
store:writeMirror({ snapshot })       -> { path } | { path: null, skipped: true }
```

الهوية: `mosque-media-office.repo.json` يحمل `repoId` (`rpo_…`) و`schema` و`kind` والدور.
`repo:detect` يقرؤه للتحقق من مستودع موجود، و`repo:register` ينشئه عند الحاجة — وبهذا
تُعاد ربط المستودع عند تغيّر حرف القرص (`repoId` نفسه، مسار جديد).

### 7.3 الأرشيف — `electron/archive.js`

```ts
archive:start({ taskId, section: 'sources'|'output'|'opencode', from: { path }, to: { path }, rel, sectionRel? })
  -> { jobId }
archive:restore({ ...نفس الشكل })
  -> { jobId }                        // نفس محرك النقل بالاتجاه المعاكس
archive:cancel({ jobId })
  -> { cancelled: boolean }
archive:reconcile({ repoPath })       // أو path
  -> { pending: [{ taskId, section, reason, sourcePath? }] }
// reason: 'source-present' | 'both-present' | 'receipt-incomplete' | 'source-path-invalid'
```

- `from` و`to` جذران مطلقان (المستودع الأساسي ومستودع الأرشيف)؛ يجب أن يكونا منفصلين تمامًا.
- `rel` مسار المهمة النسبي داخل المستودع المصدر. `sources` يستخدم مجلد المهمة نفسه،
  و`output`/`opencode` يقبلان المسار مع القسم أو بدونه.
- إلغاء عبر `AbortController` لكل مهمة، وطابور واحد لكل مجلد وجهة (لا نقلان متوازيان لنفس القرص).

الأحداث:

```ts
mmo:archive:progress -> { jobId, phase, file, filesDone, filesTotal, bytesDone, bytesTotal }
mmo:archive:done     -> { jobId, ok: true, data: { bytes, files, receipt } }
                      | { jobId, ok: false, error, code? }
// code: 'cancelled' | 'source-delete-failed' | رمز الخطأ الداخلي
```

### 7.4 السلة — `electron/archive.js`

```ts
trash:move({ repoPath, rel, section?, whole?, meta? })
  -> { entry }
trash:list({ repoPath })
  -> { entries: [entry] }
trash:restore({ repoPath, entryId })
  -> { restoredTo, entry }
trash:delete({ repoPath, entryId })
  -> { removed: 1, id }
trash:purge({ repoPath })
  -> { removed, bytes }
```

- `trash:move` يقبل `whole: true` لحذف مجلد المهمة كاملًا، أو `section` لقسم واحد.
- `entry` = محتوى `entry.json` + `daysLeft` + `expired`:
  `{ schema, id, repoId, kind:'task'|'group'|'section', taskId, groupId, section, originalRel, createdAt, expiresAt, bytes, files, record?, recordOmitted?, daysLeft, expired }`
- النقل للسلة داخل نفس القرص = `rename` ذرّي؛ عبر أقراص = نسخ متحقق ثم حذف.
- العمر 7 أيام ثابتة (`expiresAt`)، والفحص عند الإقلاع وكل 24 ساعة وعند فتح التبويب.
  الحذف النهائي إجراء صريح منفصل (`trash:delete` / `trash:purge`).
- الاستعادة تُرجع الشجرة إلى `originalRel`، وإن وُجد `record` تُستعاد المهمة/المجموعة نفسها.

الحدث: `mmo:trash:changed -> { repoPath }` بعد أي نقل/استعادة/حذف/إفراغ.

### 7.5 النسخ الاحتياطي قبل الترحيل — `electron/main.js`

```ts
store:backup({ snapshot, label? })
  -> { path }
// snapshot: نص JSON كامل (حتى 60MB). يُكتب في:
//   %APPDATA%\mosque-media-office\backups\<label>-<timestamp>.json
// قبل أول كتابة بعد الترقية إلى v3 يكون label = 'pre-v3'.
```

### 7.6 فروق عن مسوّدة الخطة (ملزمة)

| المسوّدة (§4.3) | المنفّذ | السبب |
|---|---|---|
| `storage:locate({ taskId, folder, archived, archives })` | `storage:locate({ items: [...] })` | نفس الدالة تخدم المهمة والمجموعة وقائمة «فتح المجلد» بلا منطق مكرر. |
| `archive:start({ sections: string[] })` | `archive:start({ section })` | النقل قسم واحد لكل عملية: إيصال أدق، إلغاء أوضح، وطابور وجهة واحد. |
| `repo:capacities`, `repo:relink` | `repo:register`, `storage:volume` | السعة تُقاس داخل `storage:scan`/`storage:volume`، وإعادة الربط = `repo:register` بمسار جديد ثم تحديث سجل الأرشيف. |
| `archive:progress/archive:done` | `mmo:archive:progress` / `mmo:archive:done` | كل الأحداث في المساحة المسبقة `mmo:` كما في بقية التطبيق. |
| `trash:*` بمعرّف `repoId` | `trash:*` بـ`repoPath` | المصدر الوحيد للحقيقة هو الجذر المطلق بعد فحصه؛ `repoId` يبقى في `entry.json` للمراجعة. |

> ملاحظة تنفيذ: لا توجد قناة `storage:recover` ولا فحص خلفي لأحرف الأقراص. إعادة الربط تتم يدويًا من
> بطاقة المستودع الخارجي عبر `repo:pick` + `repo:detect` + `repo:register` ثم تحديث سجل الأرشيف،
> مع مقارنة `repoId` وطلب تأكيد عند اختلافه.

