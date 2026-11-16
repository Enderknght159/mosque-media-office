'use strict';

// Verified-move engine checks with a stubbed event sender (no Electron window).
// Run: node test/archive-unit.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmo-archive-test-'));
const userData = path.join(tempRoot, 'user-data');
const primary = path.join(tempRoot, 'primary');
const archiveRoot = path.join(tempRoot, 'archive');
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(primary, { recursive: true });
fs.mkdirSync(archiveRoot, { recursive: true });

// repo.js destructures `electron` at load time; stub it so the test is Node-only.
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
const waiters = [];

function send(channel, payload) {
  const event = { channel, payload };
  events.push(event);
  for (const waiter of [...waiters]) waiter(event);
}

engine.register(ipcMain, guard, { send });

function waitFor(predicate, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const listener = (event) => {
      if (!predicate(event)) return;
      finish(resolve, event);
    };
    function finish(done, value) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const index = waiters.indexOf(listener);
      if (index >= 0) waiters.splice(index, 1);
      done(value);
    }
    timer = setTimeout(() => finish(reject, new Error('انتهت مهلة انتظار الحدث')), timeoutMs);
    waiters.push(listener);
    for (const event of events) {
      if (predicate(event)) {
        finish(resolve, event);
        return;
      }
    }
  });
}

const waitDone = (jobId) => waitFor((event) => (
  event.channel === 'mmo:archive:done' && event.payload?.jobId === jobId
)).then((event) => event.payload);

const waitPhase = (jobId, phase) => waitFor((event) => (
  event.channel === 'mmo:archive:progress'
  && event.payload?.jobId === jobId
  && event.payload?.phase === phase
)).then((event) => event.payload);

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

// --------------------------------------------------------------- helpers

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const exists = (target) => fs.existsSync(target);
const read = (target) => fs.readFileSync(target);
const readJson = (target) => JSON.parse(fs.readFileSync(target, 'utf8'));
const listDir = (target) => {
  try {
    return fs.readdirSync(target).sort();
  } catch (error) {
    return [];
  }
};
const incomingLeft = (root) => {
  const dir = path.join(root, '.incoming');
  if (!exists(dir)) return [];
  return listDir(dir);
};
const fileEntries = (dir) => {
  // every file under dir, relative + posix
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

function makeTask(rel, { sources = [], output = [], opencode = [] } = {}) {
  const taskAbs = path.join(primary, rel);
  fs.mkdirSync(path.join(taskAbs, 'output'), { recursive: true });
  fs.mkdirSync(path.join(taskAbs, 'opencode', 'logs'), { recursive: true });
  for (const [name, contents] of sources) {
    const target = path.join(taskAbs, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  for (const [name, contents] of output) fs.writeFileSync(path.join(taskAbs, 'output', name), contents);
  for (const [name, contents] of opencode) fs.writeFileSync(path.join(taskAbs, 'opencode', name), contents);
  return taskAbs;
}

// ----------------------------------------------------------------- tests

(async () => {
  const taskRel = path.join('مجموعة الاختبار', '20260810 - إعلان الافتتاح');
  const big = Buffer.alloc(1_500_000);
  for (let index = 0; index < big.length; index += 1) big[index] = index % 251;
  const small = Buffer.from('مخرجات المهمة الأولى — نص عربي للتحقق من الهاش\n', 'utf8');

  section('successful archive of «output» (2 files)');
  const taskAbs = makeTask(taskRel, {
    sources: [['مقدمة.mp4', Buffer.from('مصدر\n')]],
    output: [['الفيديو النهائي.mp4', big], ['بوستر.png', small]],
    opencode: [['status.json', '{"state":"done"}']]
  });
  const sourceBigMtime = fs.statSync(path.join(taskAbs, 'output', 'الفيديو النهائي.mp4')).mtimeMs;
  const started = await call('archive:start', {
    type: 'archive',
    taskId: 'task_1',
    section: 'output',
    from: { repoId: 'primary', path: primary },
    to: { repoId: 'rpo_arc', path: archiveRoot },
    rel: taskRel,
    sectionRel: `${taskRel}${path.sep}output`
  });
  check('start returns a jobId', started.ok === true && /^arc_/.test(started.data?.jobId || ''), JSON.stringify(started));
  const done = await waitDone(started.data.jobId);
  check('done ok', done.ok === true, done.error || '');
  check('done reports 2 files', done.data?.files === 2, String(done.data?.files));
  check('done reports the byte total', done.data?.bytes === big.length + small.length, String(done.data?.bytes));

  const archivedOutput = path.join(archiveRoot, taskRel, 'output');
  check('source output folder removed', !exists(path.join(taskAbs, 'output')));
  check('destination output folder exists', exists(archivedOutput));
  check('both destination files present', JSON.stringify(fileEntries(archivedOutput)) === JSON.stringify(['الفيديو النهائي.mp4', 'بوستر.png']), JSON.stringify(fileEntries(archivedOutput)));
  check('destination bytes match source', sha256(read(path.join(archivedOutput, 'الفيديو النهائي.mp4'))) === sha256(big));
  check('sources untouched', exists(path.join(taskAbs, 'مقدمة.mp4')));
  check('opencode untouched', exists(path.join(taskAbs, 'opencode', 'status.json')));
  check('.incoming cleaned', incomingLeft(archiveRoot).length === 0, JSON.stringify(incomingLeft(archiveRoot)));

  const receiptPath = path.join(archiveRoot, '.mmo-archive', 'index', 'task_1.json');
  check('receipt written', exists(receiptPath));
  const receipt = readJson(receiptPath);
  check('receipt schema/section', receipt.schema === 1 && receipt.section === 'output');
  check('receipt source recorded', receipt.source?.path === primary && receipt.source?.repoId === 'primary');
  check('receipt lists 2 files with sha256', Array.isArray(receipt.files) && receipt.files.length === 2
    && receipt.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)), JSON.stringify(receipt.files));
  const bigEntry = (receipt.files || []).find((file) => file.path.endsWith('الفيديو النهائي.mp4'));
  check('receipt hash matches the real content', bigEntry?.sha256 === sha256(big), bigEntry?.sha256);
  check('receipt size matches', bigEntry?.size === big.length);
  const summary = readJson(path.join(archiveRoot, '.mmo-archive', 'index.json'));
  check('index summary has the section', Array.isArray(summary.entries)
    && summary.entries.some((entry) => entry.taskId === 'task_1' && entry.section === 'output'));
  check('mtime preserved', Math.round(fs.statSync(path.join(archivedOutput, 'الفيديو النهائي.mp4')).mtimeMs / 1000)
    === Math.round(sourceBigMtime / 1000),
  `${fs.statSync(path.join(archivedOutput, 'الفيديو النهائي.mp4')).mtimeMs} / ${sourceBigMtime}`);

  const phases = events
    .filter((event) => event.channel === 'mmo:archive:progress' && event.payload?.jobId === started.data.jobId)
    .map((event) => event.payload.phase);
  check('progress events emitted', phases.length > 0);
  for (const phase of ['prepare', 'copy', 'verify', 'commit', 'cleanup']) {
    check(`progress phase «${phase}»`, phases.includes(phase), phases.join(','));
  }
  const anyProgress = events.find((event) => event.channel === 'mmo:archive:progress' && event.payload?.jobId === started.data.jobId);
  check('progress payload shape', anyProgress && typeof anyProgress.payload.filesTotal === 'number'
    && typeof anyProgress.payload.bytesTotal === 'number' && typeof anyProgress.payload.file === 'string',
    JSON.stringify(anyProgress?.payload));

  section('archive «sources» merges with an already archived section');
  // The destination task folder already exists (it holds the archived output).
  const startedSources = await call('archive:start', {
    type: 'archive',
    taskId: 'task_1',
    section: 'sources',
    from: { repoId: 'primary', path: primary },
    to: { repoId: 'rpo_arc', path: archiveRoot },
    rel: taskRel,
    sectionRel: taskRel
  });
  check('sources start ok despite existing task folder', startedSources.ok === true, JSON.stringify(startedSources));
  const sourcesDone = await waitDone(startedSources.data.jobId);
  check('sources done ok', sourcesDone.ok === true, sourcesDone.error || '');
  check('sources file removed from primary', !exists(path.join(taskAbs, 'مقدمة.mp4')));
  check('sources file landed next to output', exists(path.join(archiveRoot, taskRel, 'مقدمة.mp4')));
  check('archived output survived the merge', exists(path.join(archivedOutput, 'بوستر.png')));
  check('primary output/opencode still untouched', !exists(path.join(taskAbs, 'output')) && exists(path.join(taskAbs, 'opencode', 'status.json')));

  section('re-running an archive skips already verified files');
  // Put an identical copy of one source back and archive the section again: the
  // identical destination file must be kept (not overwritten) and hashed.
  fs.mkdirSync(path.join(taskAbs, 'output'), { recursive: true });
  fs.writeFileSync(path.join(taskAbs, 'output', 'بوستر.png'), small);
  const startedMerge = await call('archive:start', {
    type: 'archive',
    taskId: 'task_1',
    section: 'output',
    from: { repoId: 'primary', path: primary },
    to: { repoId: 'rpo_arc', path: archiveRoot },
    rel: taskRel,
    sectionRel: `${taskRel}${path.sep}output`
  });
  check('identical destination file does not block the job', startedMerge.ok === true, JSON.stringify(startedMerge));
  if (startedMerge.ok) {
    const mergeDone = await waitDone(startedMerge.data.jobId);
    check('merge done ok', mergeDone.ok === true, mergeDone.error || '');
    check('existing file kept', exists(path.join(archivedOutput, 'بوستر.png')));
    check('source file removed after verification', !exists(path.join(taskAbs, 'output', 'بوستر.png')));
  }

  section('restore «sources» back into a task folder that still holds opencode');
  const srcRel = path.join('مجموعة الاختبار', '20260814 - مهمة مصادر');
  const srcAbs = makeTask(srcRel, {
    sources: [['أصل.mp4', Buffer.from('ملف مصدر للاستعادة\n')]],
    opencode: [['status.json', '{"state":"done"}']]
  });
  const srcArchive = await call('archive:start', {
    type: 'archive',
    taskId: 'task_5',
    section: 'sources',
    from: { repoId: 'primary', path: primary },
    to: { repoId: 'rpo_arc', path: archiveRoot },
    rel: srcRel,
    sectionRel: srcRel
  });
  const srcArchiveDone = await waitDone(srcArchive.data.jobId);
  check('sources archive ok', srcArchiveDone.ok === true, srcArchiveDone.error || '');
  check('source file left the task folder', !exists(path.join(srcAbs, 'أصل.mp4')));
  check('opencode stayed', exists(path.join(srcAbs, 'opencode', 'status.json')));
  const srcRestore = await call('archive:restore', {
    type: 'restore',
    taskId: 'task_5',
    section: 'sources',
    from: { repoId: 'rpo_arc', path: archiveRoot },
    to: { repoId: 'primary', path: primary },
    rel: srcRel,
    sectionRel: srcRel
  });
  check('sources restore accepted into the existing folder', srcRestore.ok === true, JSON.stringify(srcRestore));
  const srcRestoreDone = await waitDone(srcRestore.data.jobId);
  check('sources restored', srcRestoreDone.ok === true, srcRestoreDone.error || '');
  check('source file is back', exists(path.join(srcAbs, 'أصل.mp4')));
  check('opencode untouched by restore', exists(path.join(srcAbs, 'opencode', 'status.json')));
  check('archive copy removed', !exists(path.join(archiveRoot, srcRel, 'أصل.mp4')));

  section('hash failure keeps the source intact');
  const failRel = path.join('مجموعة الاختبار', '20260811 - مهمة فاشلة');
  const failAbs = makeTask(failRel, {
    sources: [['أ.mp4', Buffer.from('ملف أول\n')], ['ب.mp4', Buffer.from('ملف ثانٍ\n')]]
  });
  engine.__setVerifyHook((info) => {
    if (info.file.endsWith('ب.mp4')) throw new Error('محاكاة فشل التحقق');
    return undefined;
  });
  const failStart = await call('archive:start', {
    type: 'archive',
    taskId: 'task_2',
    section: 'sources',
    from: { repoId: 'primary', path: primary },
    to: { repoId: 'rpo_arc', path: archiveRoot },
    rel: failRel,
    sectionRel: failRel
  });
  const failDone = await waitDone(failStart.data.jobId);
  engine.__setVerifyHook(null);
  check('failed job reports ok:false', failDone.ok === false);
  check('failure message is Arabic', /[\u0600-\u06FF]/.test(failDone.error || ''), failDone.error);
  check('source files intact after failure', exists(path.join(failAbs, 'أ.mp4')) && exists(path.join(failAbs, 'ب.mp4')));
  check('no final files written on failure', fileEntries(path.join(archiveRoot, failRel)).length === 0, JSON.stringify(fileEntries(path.join(archiveRoot, failRel))));
  check('no receipt after failure', !exists(path.join(archiveRoot, '.mmo-archive', 'index', 'task_2.json')));
  check('.incoming cleaned after failure', incomingLeft(archiveRoot).length === 0, JSON.stringify(incomingLeft(archiveRoot)));

  section('cancellation keeps the source intact');
  const cancelRel = path.join('مجموعة الاختبار', '20260812 - مهمة ملغاة');
  const cancelAbs = makeTask(cancelRel, {
    opencode: [['status.json', '{"state":"working"}'], ['notes.md', '# ملاحظات']]
  });
  engine.__setVerifyHook((info) => new Promise((resolve, reject) => {
    if (info.signal.aborted) {
      reject(new Error('أُلغي'));
      return;
    }
    info.signal.addEventListener('abort', () => reject(new Error('أُلغي')), { once: true });
  }));
  const cancelStart = await call('archive:start', {
    type: 'archive',
    taskId: 'task_3',
    section: 'opencode',
    from: { repoId: 'primary', path: primary },
    to: { repoId: 'rpo_arc', path: archiveRoot },
    rel: cancelRel,
    sectionRel: `${cancelRel}${path.sep}opencode`
  });
  await waitPhase(cancelStart.data.jobId, 'verify');
  const cancelResult = await call('archive:cancel', { jobId: cancelStart.data.jobId });
  check('cancel accepted', cancelResult.ok === true && cancelResult.data?.cancelled === true);
  const cancelDone = await waitDone(cancelStart.data.jobId);
  engine.__setVerifyHook(null);
  check('cancelled job reports ok:false', cancelDone.ok === false);
  check('cancelled job reports the cancel code', cancelDone.code === 'cancelled', cancelDone.code);
  check('source intact after cancel', exists(path.join(cancelAbs, 'opencode', 'status.json')) && exists(path.join(cancelAbs, 'opencode', 'notes.md')));
  check('no final files after cancel', fileEntries(path.join(archiveRoot, cancelRel)).length === 0, JSON.stringify(fileEntries(path.join(archiveRoot, cancelRel))));
  check('.incoming cleaned after cancel', incomingLeft(archiveRoot).length === 0, JSON.stringify(incomingLeft(archiveRoot)));
  check('cancelling an unknown job is harmless', (await call('archive:cancel', { jobId: 'arc_missing' })).data?.cancelled === false);

  section('destination conflict is refused');
  const conflictRel = path.join('مجموعة الاختبار', '20260813 - مهمة متعارضة');
  makeTask(conflictRel, { output: [['نفس.mp4', Buffer.from('نسخة المصدر\n')]] });
  const conflictDest = path.join(archiveRoot, conflictRel, 'output');
  fs.mkdirSync(conflictDest, { recursive: true });
  fs.writeFileSync(path.join(conflictDest, 'نفس.mp4'), Buffer.from('محتوى مختلف تمامًا في الوجهة\n'));
  const conflictStart = await call('archive:start', {
    type: 'archive',
    taskId: 'task_4',
    section: 'output',
    from: { repoId: 'primary', path: primary },
    to: { repoId: 'rpo_arc', path: archiveRoot },
    rel: conflictRel,
    sectionRel: `${conflictRel}${path.sep}output`
  });
  check('conflicting start refused', conflictStart.ok === false);
  check('conflict code', conflictStart.code === 'conflict', conflictStart.code);
  check('conflict message is Arabic', /[\u0600-\u06FF]/.test(conflictStart.message || ''));
  check('source kept after conflict', exists(path.join(primary, conflictRel, 'output', 'نفس.mp4')));
  check('destination file not overwritten', read(path.join(conflictDest, 'نفس.mp4')).toString('utf8').includes('محتوى مختلف'));

  section('restore moves the section back and verifies it');
  const restoreStart = await call('archive:restore', {
    type: 'restore',
    taskId: 'task_1',
    section: 'output',
    from: { repoId: 'rpo_arc', path: archiveRoot },
    to: { repoId: 'primary', path: primary },
    rel: taskRel,
    sectionRel: `${taskRel}${path.sep}output`
  });
  check('restore start ok', restoreStart.ok === true, JSON.stringify(restoreStart));
  const restoreDone = await waitDone(restoreStart.data.jobId);
  check('restore done ok', restoreDone.ok === true, restoreDone.error || '');
  const restoredOutput = path.join(taskAbs, 'output');
  check('files are back in the primary repo', exists(path.join(restoredOutput, 'بوستر.png')));
  check('restored bytes match', sha256(read(path.join(restoredOutput, 'بوستر.png'))) === sha256(small));
  check('archive copy removed', !exists(path.join(archiveRoot, taskRel, 'output')));
  const summaryAfterRestore = readJson(path.join(archiveRoot, '.mmo-archive', 'index.json'));
  check('archive index entry dropped', !summaryAfterRestore.entries.some((entry) => entry.taskId === 'task_1' && entry.section === 'output'));

  section('reconcile only reports interrupted moves');
  const reconcileClean = await call('archive:reconcile', { repoPath: archiveRoot });
  check('reconcile has nothing pending after clean jobs', Array.isArray(reconcileClean.data?.pending)
    && reconcileClean.data.pending.length === 0, JSON.stringify(reconcileClean.data));
  // Simulate a crash between commit and source deletion: put the archived file back.
  fs.writeFileSync(path.join(taskAbs, 'مقدمة.mp4'), Buffer.from('مصدر\n'));
  const reconcileBoth = await call('archive:reconcile', { repoPath: archiveRoot });
  const leftover = reconcileBoth.data.pending.find((item) => item.taskId === 'task_1' && item.section === 'sources');
  check('interrupted archive is reported', Boolean(leftover), JSON.stringify(reconcileBoth.data.pending));
  check('reason is both-present', leftover?.reason === 'both-present', leftover?.reason);
  check('reconcile never deletes anything', exists(path.join(taskAbs, 'مقدمة.mp4')));
  fs.rmSync(path.join(taskAbs, 'مقدمة.mp4'), { force: true });
  const reconcileAgain = await call('archive:reconcile', { repoPath: archiveRoot });
  check('pending clears once the source is gone', reconcileAgain.data.pending.length === 0, JSON.stringify(reconcileAgain.data.pending));

  section('path safety');
  const escape = await call('archive:start', {
    section: 'output',
    taskId: 'task_escape',
    from: { path: primary },
    to: { path: archiveRoot },
    rel: '..',
    sectionRel: `..${path.sep}..${path.sep}خارج`
  });
  check('escaping path rejected', escape.ok === false, JSON.stringify(escape));
  const missingRepo = await call('archive:start', {
    section: 'output',
    taskId: 'task_x',
    from: { path: path.join(tempRoot, 'ghost') },
    to: { path: archiveRoot },
    rel: 'a',
    sectionRel: 'a\\output'
  });
  check('missing repo rejected', missingRepo.ok === false);
  const sameRepo = await call('archive:start', {
    section: 'output',
    taskId: 'task_x',
    from: { path: primary },
    to: { path: primary },
    rel: taskRel,
    sectionRel: `${taskRel}${path.sep}output`
  });
  check('same repo rejected', sameRepo.ok === false && sameRepo.code === 'repo-overlap', JSON.stringify(sameRepo));

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
