'use strict';

// Offline checks for the v3 storage/archive data model. No browser, no Electron.
// Run: node test/data-v3.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const store = new Map();

const sandbox = {
  console,
  Intl,
  Date,
  Math,
  JSON,
  TextEncoder,
  Blob: class Blob {
    constructor(parts) { this.size = Buffer.byteLength(parts.join('')); }
  },
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  },
  document: {
    documentElement: { dataset: { themeMode: 'auto', theme: 'light' } },
    createElement: () => ({ style: {}, setAttribute() {}, click() {} }),
    body: { appendChild() {} }
  },
  navigator: { language: 'ar' }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.crypto = {
  randomUUID: () => {
    sandbox.__uuidSeq = (sandbox.__uuidSeq || 0) + 1;
    return `00000000-0000-4000-8000-${String(sandbox.__uuidSeq).padStart(12, '0')}`;
  }
};
vm.createContext(sandbox);

const source = ['js/utils.js', 'js/data.js']
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
  .join('\n;\n');
const { Data, Utils } = vm.runInContext(`${source}\n;({ Data, Utils });`, sandbox, { filename: 'bundle.js' });

let failures = 0;

function check(label, condition, details = '') {
  if (condition) {
    process.stdout.write(`  ok   ${label}\n`);
  } else {
    failures += 1;
    process.stdout.write(`  FAIL ${label}${details ? ` — ${details}` : ''}\n`);
  }
}

function section(title) {
  process.stdout.write(`\n${title}\n`);
}

const v2 = {
  version: 2,
  settings: {
    mosqueName: 'مسجد الأرشيف',
    onboarded: true,
    repo: { path: 'C:\\media', repoId: 'rpo_primary', autoRename: true, linkedAt: '2026-01-01T00:00:00.000Z', lastSyncAt: null }
  },
  users: [{ id: 'usr_a', name: 'أحمد' }],
  templates: [{ id: 'tpl_a', name: 'قالب', stages: [{ id: 'tst_a', name: 'مرحلة' }] }],
  groups: [{ id: 'grp_a', name: 'مجموعة', templateId: 'tpl_a', folder: 'مجموعة' }],
  tasks: [
    { id: 'task_a', title: 'مهمة أولى', groupId: 'grp_a', templateId: 'tpl_a', folder: 'مجموعة\\20260810 - مهمة أولى', date: '2026-08-10', createdAt: '2026-08-10T09:00:00.000Z', stages: [] },
    { id: 'task_b', title: 'مهمة ثانية', groupId: 'grp_a', templateId: 'tpl_a', folder: 'مجموعة\\20260811 - مهمة ثانية', date: '2026-08-11', createdAt: '2026-08-11T09:00:00.000Z', stages: [] }
  ],
  activeUserId: 'usr_a'
};

section('v2 -> v3 migration');
const migrated = Data.normalize(v2);
check('version is 3', migrated.version === 3, String(migrated.version));
check('keeps the existing repo', migrated.settings.repo.path === 'C:\\media');
check('adds archives array', Array.isArray(migrated.settings.archives) && migrated.settings.archives.length === 0);
check('adds storage log', Array.isArray(migrated.settings.storageLog));
check('adds empty archived map', Object.keys(migrated.tasks[0].archived).length === 0);
check('sets storage snapshot to null', migrated.settings.storage === null);
check('keeps folders and dates', migrated.tasks[0].folder.includes('20260810') && migrated.tasks[0].date === '2026-08-10');
check('repo label defaults', migrated.settings.repo.label === 'المستودع الأساسي');

section('archive registry');
Data.replace(migrated);
const archive = Data.addArchive({ repoId: 'rpo_arc', path: 'E:\\archive', label: 'هارد الأرشيف' });
check('archive recorded', Boolean(archive) && archive.repoId === 'rpo_arc');
check('archive id format', /^arc_[A-Za-z0-9_-]+$/.test(archive.id), archive.id);
check('archive found by repoId', Data.archiveRepo('rpo_arc')?.label === 'هارد الأرشيف');
check('archive deduplicated by path', Data.addArchive({ repoId: '', path: 'E:\\archive' })?.id === archive.id);
Data.updateArchive(archive.id, { status: 'offline' });
check('archive can go offline', Data.archiveRepo('rpo_arc').status === 'offline');
Data.updateArchive(archive.id, { status: 'online' });
check('archive can come back online', Data.archiveRepo('rpo_arc').status === 'online');

section('storage snapshot');
Data.setStorageSnapshot({
  scannedAt: '2026-11-16T10:00:00.000Z',
  totals: { used: 3_000, free: 7_000, capacity: 10_000 },
  sections: { sources: 1_000, output: 1_500, opencode: 500, other: 0, trash: 0, total: 3_000 },
  repos: {
    primary: { used: 2_000, free: 7_000, capacity: 10_000, online: true, sections: { sources: 1_000, output: 500, opencode: 500, other: 0, trash: 0, total: 2_000 } },
    [archive.id]: { used: 1_000, free: 0, capacity: 0, online: true, sections: { sources: 0, output: 1_000, opencode: 0, other: 0, trash: 0, total: 1_000 } }
  },
  tasks: {
    task_a: { sources: 1_000, output: 1_500, opencode: 500, total: 3_000, files: 12, exists: true },
    task_b: { sources: 300, output: 200, opencode: 100, total: 600, files: 5, exists: true }
  }
});
check('snapshot stored', Data.settings().storage.scannedAt === '2026-11-16T10:00:00.000Z');
check('task snapshot applied', Data.storageForTask('task_a').total === 3_000);
check('group storage sums tasks', Data.storageForGroup('grp_a') === 3_600);
check('group summary exposes bytes', Data.groupSummary('grp_a').bytes === 3_600);
check('repo capacity kept', Data.settings().repo.volume.total === 10_000);

section('archive markers');
Data.markArchived('task_a', 'output', {
  repoId: 'rpo_arc',
  archiveId: archive.id,
  rel: 'مجموعة\\20260810 - مهمة أولى',
  bytes: 1_500,
  files: 4,
  receipt: '.mmo-archive/index/task_a.json'
});
check('section marked archived', Data.archivedForTask('task_a').output.bytes === 1_500);
check('archived label resolves', Data.archiveRepo(Data.archivedForTask('task_a').output.archiveId)?.label === 'هارد الأرشيف');
Data.unmarkArchived('task_a', 'output');
check('section can be restored', !Data.archivedForTask('task_a').output);

section('sorting by storage');
const sorted = Data.sortTasks(Data.tasks(), 'storage-desc');
check('largest task first', sorted[0].id === 'task_a', sorted.map((task) => task.id).join(','));
const ascending = Data.sortTasks(Data.tasks(), 'storage-asc');
check('smallest task first', ascending[0].id === 'task_b', ascending.map((task) => task.id).join(','));
const byDate = Data.sortTasks(Data.tasks(), 'date-desc');
check('newest task date first', byDate[0].id === 'task_b', byDate.map((task) => task.date).join(','));

section('restore deleted records');
const taskRecord = JSON.parse(JSON.stringify(Data.findTask('task_b')));
Data.deleteTask('task_b');
check('task deleted', !Data.findTask('task_b'));
const restoredTask = Data.restoreTaskRecord(taskRecord);
check('task restored from trash record', Boolean(restoredTask) && restoredTask.title === 'مهمة ثانية');
const groupRecord = { group: JSON.parse(JSON.stringify(Data.findGroup('grp_a'))), tasks: [JSON.parse(JSON.stringify(Data.findTask('task_a')))] };
Data.restoreGroupRecord(groupRecord);
check('restore group is idempotent', Data.groups().length === 1);

section('storage log');
Data.logStorage({ type: 'archive', taskId: 'task_a', section: 'output', bytes: 1_500, ok: true, message: 'اختبار' });
check('log appended', Data.settings().storageLog.length === 1);
check('log normalized', Data.settings().storageLog[0].bytes === 1_500 && Data.settings().storageLog[0].ok === true);

if (failures) {
  process.stdout.write(`\n${failures} CHECK(S) FAILED\n`);
  process.exit(1);
}
process.stdout.write('\nALL CHECKS PASSED\n');
