'use strict';

// Offline checks for the v2 data model. No browser, no Electron.
// Run: node test/data-v2.js

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

section('schema upgrade');
const v1 = {
  version: 1,
  settings: { mosqueName: 'مسجد الاختبار', onboarded: true },
  users: [{ id: 'usr_a', name: 'أحمد' }],
  templates: [{ id: 'tpl_a', name: 'قالب', stages: [{ id: 'tst_a', name: 'مرحلة' }] }],
  groups: [{ id: 'grp_a', name: 'مجموعة', templateId: 'tpl_a' }],
  tasks: [{ id: 'task_a', title: 'مهمة', groupId: 'grp_a', templateId: 'tpl_a', createdAt: '2026-08-10T09:00:00.000Z', stages: [] }],
  activeUserId: 'usr_a'
};
const upgraded = Data.normalize(v1);
check('version becomes 2', upgraded.version === 2, String(upgraded.version));
check('prompts array exists', Array.isArray(upgraded.prompts));
check('automations array exists', Array.isArray(upgraded.automations));
check('repo defaults to null', upgraded.settings.repo === null);
check('ai defaults', upgraded.settings.ai.filter.mode === 'all' && upgraded.settings.ai.lastModel === '');
check('task folder defaults empty', upgraded.tasks[0].folder === '');

section('prompts');
Data.replace(upgraded);
const prompt = Data.createPrompt({ name: 'مونتاج ريل', content: 'اقرأ المصادر واصنع ريلًا' });
check('created prompt has id', /^prm_/.test(prompt.id));
check('prompt listed', Data.prompts().length === 1);
const updatedPrompt = Data.updatePrompt(prompt.id, { content: 'نص جديد' });
check('update content', updatedPrompt.content === 'نص جديد');
const copy = Data.duplicatePrompt(prompt.id);
check('duplicate creates second', Data.prompts().length === 2 && copy.id !== prompt.id);
check('delete works', Data.deletePrompt(copy.id) && Data.prompts().length === 1);

section('repository settings');
Data.linkRepo({ path: 'C:\\media-repo', repoId: 'rpo_test' });
check('repo linked', Data.settings().repo.path === 'C:\\media-repo');
Data.applyFolderIndex({
  groups: { grp_a: 'مجموعة' },
  tasks: { task_a: 'مجموعة\\20260810 - مهمة' },
  syncedAt: '2026-11-14T10:00:00.000Z'
});
check('group folder stored', Data.findGroup('grp_a').folder === 'مجموعة');
check('task folder stored', Data.folderFor({ taskId: 'task_a' }) === 'مجموعة\\20260810 - مهمة');
check('last sync stored', Data.settings().repo.lastSyncAt === '2026-11-14T10:00:00.000Z');

section('automations');
const job = Data.startAutomation({
  taskId: 'task_a',
  promptId: Data.prompts()[0].id,
  promptName: 'مونتاج ريل',
  model: 'opencode-go/deepseek-v4.1-flash',
  promptText: 'نص',
  taskFolder: 'مجموعة\\20260810 - مهمة'
});
check('job created', /^job_/.test(job.id) && job.status === 'queued');
check('active automation found', Data.activeAutomation('task_a')?.id === job.id);
Data.updateAutomation(job.id, {
  status: 'running',
  progress: 40,
  phase: 'قص المقاطع',
  usage: { input: 1200, output: 300, cacheRead: 100, costUSD: 0.0123 }
});
check('progress updated', Data.automation(job.id).progress === 40);
check('usage merged', Data.automation(job.id).usage.input === 1200 && Data.automation(job.id).usage.costUSD === 0.0123);
Data.finishAutomation(job.id, { status: 'done', exitCode: 0, endedAt: new Date().toISOString() });
check('finished as done', Data.automation(job.id).status === 'done');
check('progress forced to 100', Data.automation(job.id).progress === 100);
check('no active automation now', Data.activeAutomation('task_a') === null);

Data.startAutomation({ taskId: 'task_a', model: 'm', promptText: 'x' });
const second = Data.automation(Data.automationsForTask('task_a')[0].id);
Data.finishAutomation(second.id, {
  status: 'failed',
  exitCode: 1,
  error: 'User location is not supported',
  usage: { costUSD: 0.001 }
});

const stats = Data.automationStats({ days: 30 });
check('stats count', stats.total === 2, String(stats.total));
check('stats success rate', stats.successPct === 50, String(stats.successPct));
check('stats cost sum', Math.abs(stats.costUSD - 0.0133) < 1e-9, String(stats.costUSD));
check('stats by model', stats.byModel.length === 2);
check('daily series length', Data.automationDailySeries(30).length === 30);
const seriesTotal = Data.automationDailySeries(30, 'cost').reduce((sum, point) => sum + point.value, 0);
check('daily series cost matches', Math.abs(seriesTotal - 0.0133) < 1e-9, String(seriesTotal));

section('ai settings');
Data.setAiSettings({ lastModel: 'opencode-go/deepseek-v4.1-flash', filter: { mode: 'allow', allowed: ['a', 'b'] } });
check('filter merged', Data.settings().ai.filter.mode === 'allow' && Data.settings().ai.filter.allowed.length === 2);
check('last model kept', Data.settings().ai.lastModel === 'opencode-go/deepseek-v4.1-flash');

section('normalize clamps hostile input');
const hostile = Data.normalize({
  settings: {
    ai: {
      lastModel: 'm'.repeat(500),
      filter: { mode: 'weird', allowed: ['x'.repeat(500), '', 5] },
      modelsCache: { list: null }
    },
    repo: { path: '  C:\\repo  ' }
  },
  prompts: [{ name: 'p', content: 'c'.repeat(90000) }],
  automations: [{ taskId: 'task_a', status: 'nonsense', progress: 500, usage: { costUSD: -3 } }]
});
check('long model trimmed', hostile.settings.ai.lastModel.length <= 120);
check('filter mode fallback', hostile.settings.ai.filter.mode === 'all');
check('bad list filtered', hostile.settings.ai.filter.allowed.length === 1);
check('prompt content capped', hostile.prompts[0].content.length === 40000);
check('status fallback', hostile.automations[0].status === 'queued');
check('progress clamped', hostile.automations[0].progress === 100);
check('negative cost clamped', hostile.automations[0].usage.costUSD === 0);
check('repo path trimmed', hostile.settings.repo.path === 'C:\\repo');

section('utils sanity');
check('uid format', /^[a-z]+_/.test(Utils.uid('x')));

process.stdout.write(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
