'use strict';

// Filesystem checks for electron/storage.js with a stubbed Electron layer.
// Run: node test/storage-unit.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmo-storage-test-'));

const fakeElectron = {
  app: { getPath: () => path.join(tempRoot, 'user-data'), getVersion: () => '2.2.0' },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  shell: { openPath: async () => '', showItemInFolder: () => {} }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, ...rest) {
  if (request === 'electron') return fakeElectron;
  return originalLoad.call(this, request, ...rest);
};

const storage = require('../electron/storage.js');

const primaryRoot = path.join(tempRoot, 'repo-primary');
const archiveRoot = path.join(tempRoot, 'repo-archive');

function writeFile(root, rel, size) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.alloc(size, 7));
}

function makeDir(root, rel) {
  fs.mkdirSync(path.join(root, rel), { recursive: true });
}

// ---------------------------------------------------------------- tree
// المجموعة الأولى: «الخطب» — ثلاث مهام في المستودع الأساسي + ملف فضفاض.
const GROUP_A = 'الخطب';
const GROUP_B = 'الريلز';
const T1 = `${GROUP_A}\\20260101 - خطبة الجمعة`;
const T2 = `${GROUP_A}\\20260108 - درس الفجر`;
const T3 = `${GROUP_B}\\20260201 - ريل قصير`;
const T4 = `${GROUP_A}\\20260210 - مؤرشفة جزئيًا`;
const T5 = `${GROUP_A}\\20260301 - مؤرشفة كاملة`;

// المهمة t1: مصادر 350، مخرجات 1500، opencode 30
writeFile(primaryRoot, `${T1}\\a.bin`, 100);
writeFile(primaryRoot, `${T1}\\b.bin`, 200);
writeFile(primaryRoot, `${T1}\\sub\\c.bin`, 50);
writeFile(primaryRoot, `${T1}\\output\\o1.bin`, 1000);
writeFile(primaryRoot, `${T1}\\output\\o2.bin`, 500);
writeFile(primaryRoot, `${T1}\\opencode\\agent.log`, 10);
writeFile(primaryRoot, `${T1}\\opencode\\logs\\run.log`, 20);

// المهمة t2: مصادر 500، مخرجات 100، opencode 5
writeFile(primaryRoot, `${T2}\\video.mov`, 500);
writeFile(primaryRoot, `${T2}\\output\\x.mp4`, 100);
writeFile(primaryRoot, `${T2}\\opencode\\log.txt`, 5);

// المهمة t3: مصادر 300، مخرجات 700
writeFile(primaryRoot, `${T3}\\s.bin`, 300);
writeFile(primaryRoot, `${T3}\\output\\y.mp4`, 700);

// ملفات فضفاضة داخل مجلدَي المجموعتين
writeFile(primaryRoot, `${GROUP_A}\\loose.bin`, 42);
writeFile(primaryRoot, `${GROUP_B}\\groupLoose.txt`, 7);

// سلة ومجلد أرشيف (مستثنيان من الأقسام)
writeFile(primaryRoot, '.trash\\20260101-aaaa\\entry.json', 20);
writeFile(primaryRoot, '.trash\\20260101-aaaa\\payload\\f.bin', 999);
writeFile(primaryRoot, '.mmo-archive\\index\\receipt.json', 111);

// تعريف المستودع (يُستثنى من «أخرى»)
writeFile(primaryRoot, 'mosque-media-office.repo.json', 33);

// t4: المصادر باقية في الأساسي، والمخرجات انتقلت إلى الأرشيف.
writeFile(primaryRoot, `${T4}\\src.bin`, 60);
writeFile(primaryRoot, `${T4}\\opencode\\agent.log`, 4);
writeFile(archiveRoot, `${T4}\\output\\z.mp4`, 800);
writeFile(archiveRoot, `${T4}\\output\\nested\\q.mp4`, 40);

// t5: مهمة مؤرشفة بالكامل — مجلدها في الأساسي فارغ.
makeDir(primaryRoot, T5);
writeFile(archiveRoot, `${T5}\\s.bin`, 70);
writeFile(archiveRoot, `${T5}\\output\\o.bin`, 130);
writeFile(archiveRoot, `${T5}\\opencode\\agent.log`, 3);

const repos = [
  { id: 'primary', repoId: 'rpo_primary', path: primaryRoot, role: 'primary', label: 'المستودع الأساسي' },
  { id: 'arc_1', repoId: 'rpo_arc', path: archiveRoot, role: 'archive', label: 'هارد الأرشيف' }
];

const tasks = [
  { id: 't1', folder: T1, groupId: 'g1', archived: {} },
  { id: 't2', folder: T2, groupId: 'g1', archived: {} },
  { id: 't3', folder: T3, groupId: 'g2', archived: {} },
  {
    id: 't4',
    folder: T4,
    groupId: 'g1',
    archived: {
      output: { repoId: 'rpo_arc', archiveId: 'arc_1', rel: T4, bytes: 999999, files: 99 }
    }
  },
  {
    id: 't5',
    folder: T5,
    groupId: 'g1',
    archived: {
      sources: { repoId: 'rpo_arc', archiveId: 'arc_1', rel: T5, bytes: 70, files: 1 },
      output: { repoId: 'rpo_arc', archiveId: 'arc_1', rel: T5, bytes: 130, files: 1 },
      opencode: { repoId: 'rpo_arc', archiveId: 'arc_1', rel: T5, bytes: 3, files: 1 }
    }
  }
];

const groups = [
  { id: 'g1', folder: GROUP_A },
  { id: 'g2', folder: GROUP_B }
];

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
const near = (actual, expected) => Number(actual) === Number(expected);
const show = (value) => JSON.stringify(value);

(async () => {
  section('scan sections and per-task sizes');
  const first = await storage.scan({ force: true, repos, tasks, groups });
  check('scan ok', first.ok === true, show(first).slice(0, 200));
  const data = first.data;

  check('primary sources = 1210', near(data.repos.primary.sections.sources, 1210), data.repos.primary.sections.sources);
  check('primary output = 2300', near(data.repos.primary.sections.output, 2300), data.repos.primary.sections.output);
  check('primary opencode = 39', near(data.repos.primary.sections.opencode, 39), data.repos.primary.sections.opencode);
  check('primary other = 49', near(data.repos.primary.sections.other, 49), data.repos.primary.sections.other);
  check('other is greater than zero', data.repos.primary.sections.other > 0);
  check('primary trash = 1019', near(data.repos.primary.sections.trash, 1019), data.repos.primary.sections.trash);
  check('primary used excludes trash', near(data.repos.primary.used, 3598), data.repos.primary.used);
  check('primary total includes trash', near(data.repos.primary.sections.total, 4617), data.repos.primary.sections.total);
  check('mmo-archive excluded from used', !show(data.repos.primary.sections).includes('111'));

  check('t1 sources = 350', near(data.tasks.t1.sources, 350), data.tasks.t1.sources);
  check('t1 output = 1500', near(data.tasks.t1.output, 1500), data.tasks.t1.output);
  check('t1 opencode = 30', near(data.tasks.t1.opencode, 30), data.tasks.t1.opencode);
  check('t1 total = 1880', near(data.tasks.t1.total, 1880), data.tasks.t1.total);
  check('t1 files = 7', near(data.tasks.t1.files, 7), data.tasks.t1.files);
  check('t1 exists', data.tasks.t1.exists === true);

  check('t2 total = 605 files = 3', near(data.tasks.t2.total, 605) && near(data.tasks.t2.files, 3), show(data.tasks.t2));
  check('t3 total = 1000 files = 2', near(data.tasks.t3.total, 1000) && near(data.tasks.t3.files, 2), show(data.tasks.t3));

  section('archived sections count from the archive repo');
  check('archive output = 970', near(data.repos.arc_1.sections.output, 970), data.repos.arc_1.sections.output);
  check('archive sources = 70', near(data.repos.arc_1.sections.sources, 70), data.repos.arc_1.sections.sources);
  check('archive used = 1043', near(data.repos.arc_1.used, 1043), data.repos.arc_1.used);
  check('t4 output from archive = 840', near(data.tasks.t4.output, 840), data.tasks.t4.output);
  check('t4 sources from primary = 60', near(data.tasks.t4.sources, 60), data.tasks.t4.sources);
  check('t4 opencode = 4', near(data.tasks.t4.opencode, 4), data.tasks.t4.opencode);
  check('t4 total = 904', near(data.tasks.t4.total, 904), data.tasks.t4.total);
  check('t4 files = 4', near(data.tasks.t4.files, 4), data.tasks.t4.files);
  check('primary output does not include archived bytes', !near(data.repos.primary.sections.output, 3140));

  check('fully archived t5 still reports bytes', near(data.tasks.t5.total, 203), show(data.tasks.t5));
  check('fully archived t5 files = 3', near(data.tasks.t5.files, 3), data.tasks.t5.files);
  check('fully archived t5 exists (empty folder kept)', data.tasks.t5.exists === true);

  section('totals');
  check('totals used = 4641', near(data.totals.used, 4641), data.totals.used);
  check('sections sources = 1280', near(data.sections.sources, 1280), data.sections.sources);
  check('sections output = 3270', near(data.sections.output, 3270), data.sections.output);
  check('sections opencode = 42', near(data.sections.opencode, 42), data.sections.opencode);
  check('sections trash = 1019', near(data.sections.trash, 1019), data.sections.trash);
  check('sections total = 5660', near(data.sections.total, 5660), data.sections.total);
  check('capacity and free are numbers', Number.isFinite(data.totals.capacity) && Number.isFinite(data.totals.free));
  check('capacity >= free >= 0', data.totals.capacity >= data.totals.free && data.totals.free >= 0);
  check('scannedAt is ISO', /^\d{4}-\d{2}-\d{2}T/.test(data.scannedAt || ''));
  check('repo scannedAt is ISO', /^\d{4}-\d{2}-\d{2}T/.test(data.repos.primary.scannedAt || ''));

  section('60s cache and force');
  writeFile(primaryRoot, `${GROUP_A}\\loose2.bin`, 5000);
  const cached = await storage.scan({ force: false, repos, tasks, groups });
  check('cached scan keeps old numbers', near(cached.data.repos.primary.sections.other, 49), cached.data.repos.primary.sections.other);
  check('cached scan still returns fresh scannedAt', cached.data.scannedAt !== data.scannedAt);
  const forced = await storage.scan({ force: true, repos, tasks, groups });
  check('force picks up the new file', near(forced.data.repos.primary.sections.other, 5049), forced.data.repos.primary.sections.other);
  fs.rmSync(path.join(primaryRoot, `${GROUP_A}\\loose2.bin`));

  section('offline repo');
  const offlineRepos = repos.concat([{
    id: 'arc_gone',
    repoId: 'rpo_gone',
    path: path.join(tempRoot, 'missing-drive'),
    role: 'archive',
    label: 'مفقود'
  }]);
  let offline;
  try {
    offline = await storage.scan({ force: true, repos: offlineRepos, tasks, groups });
  } catch (error) {
    offline = { ok: false, message: error.message };
  }
  check('offline scan does not throw', offline.ok === true, offline.message);
  check('offline repo online = false', offline.data.repos.arc_gone.online === false);
  check('offline repo used = 0', near(offline.data.repos.arc_gone.used, 0));
  check('offline repo capacity = 0', near(offline.data.repos.arc_gone.capacity, 0));
  check('online repos still scanned', near(offline.data.repos.primary.used, 3598), offline.data.repos.primary.used);

  section('locate');
  const located = await storage.locate({
    items: [
      { id: 'primary', role: 'primary', label: 'الأساسي', path: primaryRoot, rel: T1, sections: ['sources'] },
      { id: 'arc_1', role: 'archive', label: 'الأرشيف', path: archiveRoot, rel: `${T4}\\output`, sections: ['output'] },
      { id: 'primary', role: 'primary', label: 'الأساسي', path: primaryRoot, rel: `${GROUP_A}\\noop`, sections: [] },
      { id: 'primary', role: 'primary', label: 'الأساسي', path: primaryRoot, rel: '..\\..\\outside', sections: [] },
      { id: 'lost', role: 'archive', label: 'مفقود', path: path.join(tempRoot, 'gone'), rel: 'x', sections: [] }
    ]
  });
  check('locate ok', located.ok === true);
  const list = located.data.locations;
  check('locate skips outside + missing roots', list.length === 3, `length=${list.length}`);
  check('locate existing folder', list[0] && list[0].exists === true && list[0].absolute === path.join(primaryRoot, T1));
  check('locate archived output folder', list[1] && list[1].exists === true && list[1].role === 'archive');
  check('locate missing rel -> exists false', list[2] && list[2].exists === false);
  check('locate keeps sections list', show(list[0]?.sections) === show(['sources']));
  check('locate refuses ../outside', !list.some((item) => String(item.absolute || '').includes('outside')));

  section('volume');
  const volume = await storage.volume({ path: primaryRoot });
  check('volume ok', volume.ok === true);
  check('volume total is a number >= 0', Number.isFinite(volume.data.total) && volume.data.total >= 0);
  check('volume free is a number >= 0', Number.isFinite(volume.data.free) && volume.data.free >= 0);
  check('volume free <= total', volume.data.total === 0 || volume.data.free <= volume.data.total);
  check('volume has label/serial/fs fields',
    typeof volume.data.label === 'string' && typeof volume.data.serial === 'string' && typeof volume.data.fs === 'string');
  if (process.platform === 'win32') {
    check('volume reports a real size on windows', volume.data.total > 0, show(volume.data));
  }

  section('ipc registration');
  const handlers = new Map();
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
  const guard = (fn) => async (event, payload) => fn(payload || {});
  storage.register(ipcMain, guard, { getWindow: () => null });
  check('storage:scan registered', typeof handlers.get('storage:scan') === 'function');
  check('storage:locate registered', typeof handlers.get('storage:locate') === 'function');
  check('storage:volume registered', typeof handlers.get('storage:volume') === 'function');
  const viaIpc = await handlers.get('storage:locate')(null, { items: [] });
  check('guard wrapper returns ok shape', viaIpc.ok === true && Array.isArray(viaIpc.data.locations));

  process.stdout.write(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.exit(1);
});
