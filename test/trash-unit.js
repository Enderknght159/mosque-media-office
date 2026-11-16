'use strict';

// Trash (`.trash`) checks with a stubbed event sender (no Electron window).
// Run: node test/trash-unit.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmo-trash-test-'));
const userData = path.join(tempRoot, 'user-data');
const repoDir = path.join(tempRoot, 'repo');
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(repoDir, { recursive: true });

const fakeElectron = {
  app: { getPath: () => userData, getVersion: () => '2.2.0' },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  shell: { openPath: async () => '', showItemInFolder: () => {} }
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, ...rest) {
  if (request === 'electron') return fakeElectron;
  return originalLoad.call(this, request, ...rest);
};

const engine = require('../electron/archive.js');

// --------------------------------------------------------------- harness

const handlers = new Map();
const guard = (fn) => async (event, payload) => {
  try {
    const result = await fn(payload || {});
    return result === undefined ? { ok: true } : result;
  } catch (error) {
    return { ok: false, message: error?.message || 'خطأ', code: error?.code || 'unknown' };
  }
};
const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
const call = (channel, payload) => handlers.get(channel)(null, payload || {});

const events = [];
engine.register(ipcMain, guard, { send: (channel, payload) => events.push({ channel, payload }) });

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

const exists = (target) => fs.existsSync(target);
const readJson = (target) => JSON.parse(fs.readFileSync(target, 'utf8'));
const listDir = (target) => {
  try {
    return fs.readdirSync(target).sort();
  } catch (error) {
    return [];
  }
};
const trashFolders = () => listDir(path.join(repoDir, '.trash'));
const fileEntries = (dir) => {
  const out = [];
  const walk = (abs, rel) => {
    let items = [];
    try {
      items = fs.readdirSync(abs, { withFileTypes: true });
    } catch (error) {
      return;
    }
    for (const item of items) {
      const nextAbs = path.join(abs, item.name);
      const nextRel = rel ? `${rel}/${item.name}` : item.name;
      if (item.isDirectory()) walk(nextAbs, nextRel);
      else out.push(nextRel);
    }
  };
  walk(dir, '');
  return out.sort();
};

function seedTask(rel) {
  const abs = path.join(repoDir, rel);
  fs.mkdirSync(path.join(abs, 'output'), { recursive: true });
  fs.mkdirSync(path.join(abs, 'opencode', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(abs, 'مقدمة.mp4'), Buffer.from('مصدر أول\n'));
  fs.mkdirSync(path.join(abs, 'مشاهد'), { recursive: true });
  fs.writeFileSync(path.join(abs, 'مشاهد', 'لقطة.mp4'), Buffer.from('لقطة داخل مجلد\n'));
  fs.writeFileSync(path.join(abs, 'output', 'فيديو.mp4'), Buffer.from('مخرجات المهمة\n'));
  fs.writeFileSync(path.join(abs, 'opencode', 'status.json'), '{"state":"done"}');
  fs.writeFileSync(path.join(abs, 'opencode', 'logs', 'run.jsonl'), '{"a":1}\n');
  return abs;
}

(async () => {
  const rel1 = path.join('مجموعة الاختبار', '20260810 - مهمة أولى');
  const rel2 = path.join('مجموعة الاختبار', '20260811 - مهمة ثانية');
  const rel3 = path.join('مجموعة الاختبار', '20260812 - مهمة ثالثة');
  seedTask(rel1);
  seedTask(rel2);
  seedTask(rel3);

  section('move the «sources» section only');
  const before = events.length;
  const sourcesMove = await call('trash:move', {
    repoPath: repoDir,
    repoId: 'rpo_primary',
    rel: rel1,
    section: 'sources',
    whole: false,
    meta: {
      kind: 'section',
      taskId: 'task_1',
      section: 'sources',
      taskTitle: 'مهمة أولى',
      archived: { repoId: 'rpo_arc', rel: rel1, bytes: 42 }
    }
  });
  check('move ok', sourcesMove.ok === true, JSON.stringify(sourcesMove));
  const entryOne = sourcesMove.data?.entry;
  check('entry id', /^trs_/.test(entryOne?.id || ''), entryOne?.id);
  check('entry kind/section', entryOne?.kind === 'section' && entryOne?.section === 'sources');
  check('entry originalRel', entryOne?.originalRel === rel1, entryOne?.originalRel);
  check('entry taskId', entryOne?.taskId === 'task_1');
  check('entry keeps meta', entryOne?.meta?.archived?.repoId === 'rpo_arc');
  check('entry files/bytes', entryOne?.files === 2 && entryOne?.bytes === Buffer.byteLength('مصدر أول\n') + Buffer.byteLength('لقطة داخل مجلد\n'), `${entryOne?.files}/${entryOne?.bytes}`);
  const created = new Date(entryOne?.createdAt).getTime();
  const expires = new Date(entryOne?.expiresAt).getTime();
  check('expiry is 7 days', Math.round((expires - created) / 86400000) === 7, `${expires - created}`);
  check('daysLeft is 7', entryOne?.daysLeft === 7, String(entryOne?.daysLeft));
  check('trash:changed emitted', events.slice(before).some((event) => event.channel === 'mmo:trash:changed' && event.payload?.repoPath === repoDir));

  const taskAbs = path.join(repoDir, rel1);
  check('sources files left the task folder', !exists(path.join(taskAbs, 'مقدمة.mp4')) && !exists(path.join(taskAbs, 'مشاهد')));
  check('output untouched', exists(path.join(taskAbs, 'output', 'فيديو.mp4')));
  check('opencode untouched', exists(path.join(taskAbs, 'opencode', 'status.json')));
  check('one trash folder', trashFolders().length === 1, JSON.stringify(trashFolders()));
  const payloadDir = path.join(repoDir, '.trash', entryOne.folder, 'payload', rel1);
  check('payload mirrors the tree', JSON.stringify(fileEntries(payloadDir)) === JSON.stringify(['مشاهد/لقطة.mp4', 'مقدمة.mp4']), JSON.stringify(fileEntries(payloadDir)));
  const onDisk = readJson(path.join(repoDir, '.trash', entryOne.folder, 'entry.json'));
  check('entry.json schema', onDisk.schema === 1 && onDisk.id === entryOne.id);
  check('entry.json has no record noise', onDisk.record === null);

  section('list');
  const listed = await call('trash:list', { repoPath: repoDir });
  check('list returns the entry', listed.ok === true && listed.data.entries.length === 1);
  check('list entry keeps size', listed.data.entries[0].bytes === entryOne.bytes);
  check('list entry daysLeft', listed.data.entries[0].daysLeft === 7);

  section('restore merges back into the existing task folder');
  const restored = await call('trash:restore', { repoPath: repoDir, entryId: entryOne.id });
  check('restore ok', restored.ok === true, JSON.stringify(restored));
  check('restoredTo is the task folder', restored.data?.restoredTo === taskAbs, restored.data?.restoredTo);
  check('sources back', exists(path.join(taskAbs, 'مقدمة.mp4')) && exists(path.join(taskAbs, 'مشاهد', 'لقطة.mp4')));
  check('output still there', exists(path.join(taskAbs, 'output', 'فيديو.mp4')));
  check('trash is empty after restore', trashFolders().length === 0, JSON.stringify(trashFolders()));
  check('restore clears the list', (await call('trash:list', { repoPath: repoDir })).data.entries.length === 0);

  section('move one section («output»)');
  const outputMove = await call('trash:move', {
    repoPath: repoDir,
    rel: rel2,
    section: 'output',
    whole: false,
    meta: { kind: 'section', taskId: 'task_2', section: 'output' }
  });
  check('output move ok', outputMove.ok === true, JSON.stringify(outputMove));
  const outputEntry = outputMove.data.entry;
  check('output payload path', outputEntry.payloadRel === path.join(rel2, 'output'), outputEntry.payloadRel);
  check('output removed from repo', !exists(path.join(repoDir, rel2, 'output')));
  check('task folder kept', exists(path.join(repoDir, rel2, 'مقدمة.mp4')));
  check('payload holds the output file', fileEntries(path.join(repoDir, '.trash', outputEntry.folder, 'payload', rel2)).length === 1);
  const outputRestore = await call('trash:restore', { repoPath: repoDir, entryId: outputEntry.id });
  check('output restore ok', outputRestore.ok === true, JSON.stringify(outputRestore));
  check('output back', exists(path.join(repoDir, rel2, 'output', 'فيديو.mp4')));

  section('restore refuses an existing destination');
  const blocked = await call('trash:move', {
    repoPath: repoDir,
    rel: rel2,
    whole: true,
    meta: { kind: 'task', taskId: 'task_2', taskTitle: 'مهمة ثانية', record: { task: { id: 'task_2', title: 'مهمة ثانية' } } }
  });
  check('whole move ok', blocked.ok === true, JSON.stringify(blocked));
  const blockedEntry = blocked.data.entry;
  check('whole entry kind', blockedEntry.kind === 'task' && blockedEntry.whole === true);
  check('record snapshot kept', blockedEntry.record?.task?.id === 'task_2', JSON.stringify(blockedEntry.record));
  check('task folder gone', !exists(path.join(repoDir, rel2)));
  fs.mkdirSync(path.join(repoDir, rel2), { recursive: true });
  fs.writeFileSync(path.join(repoDir, rel2, 'مؤقت.txt'), 'x');
  const conflict = await call('trash:restore', { repoPath: repoDir, entryId: blockedEntry.id });
  check('restore refused', conflict.ok === false && conflict.code === 'conflict', JSON.stringify(conflict));
  check('refused restore keeps the entry', (await call('trash:list', { repoPath: repoDir })).data.entries.length === 1);
  check('nothing was overwritten', exists(path.join(repoDir, rel2, 'مؤقت.txt')));
  fs.rmSync(path.join(repoDir, rel2), { recursive: true, force: true });

  section('final delete removes only that entry');
  const deleted = await call('trash:delete', { repoPath: repoDir, entryId: blockedEntry.id });
  check('delete ok', deleted.ok === true, JSON.stringify(deleted));
  check('trash folder removed', trashFolders().length === 0, JSON.stringify(trashFolders()));
  check('list empty after delete', (await call('trash:list', { repoPath: repoDir })).data.entries.length === 0);

  section('purge empties the trash');
  seedTask(rel2);
  seedTask(rel3);
  const purgeA = await call('trash:move', { repoPath: repoDir, rel: rel2, whole: true, meta: { kind: 'task', taskId: 'task_2' } });
  const purgeB = await call('trash:move', { repoPath: repoDir, rel: rel3, whole: true, meta: { kind: 'task', taskId: 'task_3' } });
  check('two entries queued', purgeA.ok && purgeB.ok && trashFolders().length === 2);
  const expectedBytes = (purgeA.data.entry.bytes || 0) + (purgeB.data.entry.bytes || 0);
  const purged = await call('trash:purge', { repoPath: repoDir });
  check('purge reports 2 removals', purged.ok === true && purged.data.removed === 2, JSON.stringify(purged.data));
  check('purge reports the freed bytes', purged.data.bytes === expectedBytes, `${purged.data.bytes} / ${expectedBytes}`);
  check('trash emptied', trashFolders().length === 0, JSON.stringify(trashFolders()));

  section('expiry purge removes only expired entries');
  seedTask(rel2);
  seedTask(rel3);
  const freshMove = await call('trash:move', { repoPath: repoDir, rel: rel2, whole: true, meta: { kind: 'task', taskId: 'task_2' } });
  const oldMove = await call('trash:move', { repoPath: repoDir, rel: rel3, whole: true, meta: { kind: 'task', taskId: 'task_3' } });
  check('two entries for expiry test', freshMove.ok && oldMove.ok && trashFolders().length === 2);
  const oldEntryPath = path.join(repoDir, '.trash', oldMove.data.entry.folder, 'entry.json');
  const oldRaw = readJson(oldEntryPath);
  oldRaw.expiresAt = new Date(Date.now() - 60 * 1000).toISOString();
  fs.writeFileSync(oldEntryPath, JSON.stringify(oldRaw, null, 2), 'utf8');
  const expired = await engine.purgeExpired({ repoPath: repoDir });
  check('purgeExpired removed exactly one', expired.ok === true && expired.data.removed === 1, JSON.stringify(expired.data));
  check('purgeExpired reports its bytes', expired.data.bytes === oldMove.data.entry.bytes, `${expired.data.bytes} / ${oldMove.data.entry.bytes}`);
  const left = await call('trash:list', { repoPath: repoDir });
  check('fresh entry survived', left.data.entries.length === 1 && left.data.entries[0].id === freshMove.data.entry.id, JSON.stringify(left.data.entries.map((entry) => entry.id)));

  section('safety and errors');
  const reserved = await call('trash:move', { repoPath: repoDir, rel: '.trash', whole: true });
  check('reserved folder refused', reserved.ok === false && reserved.code === 'reserved-path', JSON.stringify(reserved));
  const escape = await call('trash:move', { repoPath: repoDir, rel: '..\\..\\خارج', whole: true });
  check('escaping path refused', escape.ok === false, JSON.stringify(escape));
  const missing = await call('trash:move', { repoPath: repoDir, rel: 'غير موجود', whole: true });
  check('missing folder refused', missing.ok === false && missing.code === 'path-missing', JSON.stringify(missing));
  const badSection = await call('trash:move', { repoPath: repoDir, rel: rel2, section: 'nope', whole: false });
  check('unknown section refused', badSection.ok === false && badSection.code === 'section-invalid', JSON.stringify(badSection));
  const missingSection = await call('trash:move', { repoPath: repoDir, rel: rel2, section: 'opencode', whole: false });
  check('empty section refused', missingSection.ok === false, JSON.stringify(missingSection));
  const unknownRestore = await call('trash:restore', { repoPath: repoDir, entryId: 'trs_missing' });
  check('unknown entry refused', unknownRestore.ok === false && unknownRestore.code === 'trash-missing', JSON.stringify(unknownRestore));
  const badRepo = await call('trash:list', { repoPath: path.join(tempRoot, 'ghost') });
  check('missing repo refused', badRepo.ok === false, JSON.stringify(badRepo));

  process.stdout.write(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch (cleanupError) {}
  process.exit(1);
});
