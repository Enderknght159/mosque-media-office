'use strict';

// Filesystem checks for electron/repo.js with a stubbed Electron layer.
// Run: node test/repo-unit.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmo-repo-test-'));
const userData = path.join(tempRoot, 'user-data');
const repoDir = path.join(tempRoot, 'repo');
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(repoDir, { recursive: true });

const fakeElectron = {
  app: { getPath: () => userData, getVersion: () => '2.0.0' },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  },
  shell: {
    openPath: async () => '',
    showItemInFolder: () => {}
  }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, ...rest) {
  if (request === 'electron') return fakeElectron;
  return originalLoad.call(this, request, ...rest);
};

const repo = require('../electron/repo.js');

const handlers = new Map();
const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
const guard = (fn) => async (event, payload) => fn(payload || {});
repo.register(ipcMain, guard);

const call = (channel, payload) => handlers.get(channel)(null, payload || {});

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
const exists = (relative) => fs.existsSync(path.join(repoDir, relative));
const listDir = (relative) => {
  try {
    return fs.readdirSync(path.join(repoDir, relative)).sort();
  } catch (error) {
    return [];
  }
};

(async () => {
  section('manifest creation');
  const linked = await call('repo:link', { path: repoDir });
  check('link ok', linked.ok === true);
  check('manifest file exists', exists('mosque-media-office.repo.json'));
  const manifestRaw = JSON.parse(fs.readFileSync(path.join(repoDir, 'mosque-media-office.repo.json'), 'utf8'));
  check('manifest kind', manifestRaw.kind === 'mosque-media-office-repo');
  check('manifest repoId', /^rpo_/.test(manifestRaw.repoId || ''));
  check('manifest schema', manifestRaw.schema === 1);
  check('detect finds repo', (await call('repo:detect', { path: repoDir })).data.isRepo === true);

  section('sync creates folders');
  const groups = [
    { id: 'grp_1', name: 'خطبة/الجمعة', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'grp_2', name: 'إعلانات رمضان', createdAt: '2026-02-01T00:00:00.000Z' }
  ];
  const tasks = [
    { id: 'task_1', title: 'إعلان الافتتاح', groupId: 'grp_1', createdAt: '2026-08-10T09:00:00.000Z' },
    { id: 'task_2', title: 'إعلان الافتتاح', groupId: 'grp_1', createdAt: '2026-08-11T09:00:00.000Z' },
    { id: 'task_3', title: 'كليب رمضان', groupId: 'grp_2', createdAt: '2026-03-05T09:00:00.000Z' },
    { id: 'task_4', title: 'مادة بلا مجموعة', groupId: null, createdAt: '2026-04-05T09:00:00.000Z' }
  ];
  const first = await call('repo:sync', { repoPath: repoDir, autoRename: true, groups, tasks });
  check('sync ok', first.ok === true, JSON.stringify(first).slice(0, 200));
  const map = first.data.tasks;
  check('group illegal char replaced by space', first.data.groups.grp_1 === 'خطبة الجمعة', first.data.groups.grp_1);
  check('task folder has date prefix', map.task_1 === 'خطبة الجمعة\\20260810 - إعلان الافتتاح', map.task_1);
  check('duplicate title deduped', map.task_2 === 'خطبة الجمعة\\20260811 - إعلان الافتتاح', map.task_2);
  check('second group folder', first.data.groups.grp_2 === 'إعلانات رمضان', first.data.groups.grp_2);
  check('task without group uses fallback folder', map.task_4.startsWith('بدون مجموعة\\'), map.task_4);
  check('output folder created', exists(path.join(map.task_1, 'output')));
  check('opencode folder created', exists(path.join(map.task_1, 'opencode')));
  check('opencode logs created', exists(path.join(map.task_1, 'opencode', 'logs')));
  check('absolute path returned', first.data.absolute.tasks.task_1.startsWith(repoDir));
  check('actions include created', Array.isArray(first.data.actions) && first.data.actions.length >= 4);

  section('idempotent sync');
  const second = await call('repo:sync', { repoPath: repoDir, autoRename: true, groups, tasks });
  check('same mapping', JSON.stringify(second.data.tasks) === JSON.stringify(map));
  check('no new creates', second.data.actions.filter((a) => a.type === 'created').length === 0);

  section('rename on title change');
  const renamedTasks = tasks.map((task) => (task.id === 'task_3' ? { ...task, title: 'كليب رمضان الجديد' } : task));
  const third = await call('repo:sync', { repoPath: repoDir, autoRename: true, groups, tasks: renamedTasks });
  check('folder renamed', third.data.tasks.task_3 === 'إعلانات رمضان\\20260305 - كليب رمضان الجديد', third.data.tasks.task_3);
  check('old folder gone', !exists('إعلانات رمضان\\20260305 - كليب رمضان'));
  check('file inside survived rename', exists(path.join(third.data.tasks.task_3, 'opencode')));

  section('rename disabled by setting');
  const renamedAgain = renamedTasks.map((task) => (task.id === 'task_3' ? { ...task, title: 'اسم آخر' } : task));
  const fourth = await call('repo:sync', { repoPath: repoDir, autoRename: false, groups, tasks: renamedAgain });
  check('folder kept when autoRename false', fourth.data.tasks.task_3 === 'إعلانات رمضان\\20260305 - كليب رمضان الجديد', fourth.data.tasks.task_3);

  section('move between groups');
  const movedTasks = renamedAgain.map((task) => (task.id === 'task_3' ? { ...task, groupId: 'grp_1' } : task));
  const fifth = await call('repo:sync', { repoPath: repoDir, autoRename: false, groups, tasks: movedTasks });
  check('task folder moved', fifth.data.tasks.task_3 === 'خطبة الجمعة\\20260305 - كليب رمضان الجديد', fifth.data.tasks.task_3);
  check('old location empty', !exists('إعلانات رمضان\\20260305 - كليب رمضان الجديد'));

  section('existing disk folder collision');
  fs.mkdirSync(path.join(repoDir, 'إعلانات رمضان', '20260701 - مهمة جديدة'), { recursive: true });
  const withNew = [...movedTasks, {
    id: 'task_5',
    title: 'مهمة جديدة',
    groupId: 'grp_2',
    createdAt: '2026-07-01T09:00:00.000Z'
  }];
  const sixth = await call('repo:sync', { repoPath: repoDir, autoRename: true, groups, tasks: withNew });
  check('disk collision gets suffix', sixth.data.tasks.task_5 === 'إعلانات رمضان\\20260701 - مهمة جديدة (2)', sixth.data.tasks.task_5);

  section('reserved windows name');
  const reserved = await call('repo:sync', {
    repoPath: repoDir,
    autoRename: true,
    groups: [...groups, { id: 'grp_3', name: 'CON', createdAt: '2026-01-01T00:00:00.000Z' }],
    tasks: [...withNew, { id: 'task_6', title: 'مهمة', groupId: 'grp_3', createdAt: '2026-05-01T09:00:00.000Z' }]
  });
  check('reserved name suffixed', reserved.data.groups.grp_3 === 'CON-', reserved.data.groups.grp_3);

  section('deleted task leaves folder');
  const withoutTask = withNew.filter((task) => task.id !== 'task_4');
  const seventh = await call('repo:sync', { repoPath: repoDir, autoRename: true, groups, tasks: withoutTask });
  check('manifest drops deleted id', !seventh.data.tasks.task_4);
  check('disk folder kept', exists('بدون مجموعة\\20260405 - مادة بلا مجموعة'));

  section('path safety');
  const escape = await call('repo:sync', {
    repoPath: repoDir,
    autoRename: true,
    groups: [{ id: 'grp_x', name: '..\\..\\خارج', createdAt: '2026-01-01T00:00:00.000Z' }],
    tasks: []
  });
  check('dot segments neutralized', !escape.data.groups.grp_x.includes('..'), escape.data.groups.grp_x);
  let badRepo;
  try {
    badRepo = await call('repo:sync', { repoPath: path.join(tempRoot, 'missing'), groups: [], tasks: [] });
  } catch (error) {
    badRepo = { ok: false, message: error.message };
  }
  check('missing repo rejected', badRepo.ok === false);

  section('mirror');
  const written = await call('store:writeMirror', { snapshot: '{"a":1}' });
  check('mirror written into active repo', written.ok && exists('mosque-media-office.data.json'));
  const read = await call('store:readMirror');
  check('mirror readable', read.data.snapshot === '{"a":1}');

  section('forget repo');
  await call('repo:forget');
  const afterForget = await call('store:writeMirror', { snapshot: '{"b":2}' });
  check('mirror skipped after forget', afterForget.data.skipped === true);

  process.stdout.write(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.exit(1);
});
