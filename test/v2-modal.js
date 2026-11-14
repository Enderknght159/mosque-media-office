'use strict';

// Renders the automation confirmation modal with a stubbed desktop bridge.
// Run: node test/v2-modal.js

const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const port = 4182;
const base = `http://127.0.0.1:${port}`;
const shots = path.join(__dirname, 'screenshots');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const now = Date.now();
const iso = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();

const seed = {
  version: 2,
  settings: {
    mosqueName: 'مسجد النور',
    tagline: 'المكتب الإعلامي',
    theme: 'light',
    onboarded: true,
    demo: false,
    repo: { path: 'C:\\media-repo', repoId: 'rpo_demo', autoRename: true, linkedAt: iso(600), lastSyncAt: iso(20) },
    ai: {
      lastModel: 'opencode-go/deepseek-v4.1-flash',
      opencodePath: '',
      filter: { mode: 'all', allowed: [], blocked: ['opencode-go/kimi-k3.1-pro'] },
      modelsCache: { at: iso(10), list: ['opencode-go/deepseek-v4.1-flash', 'opencode-go/kimi-k3.1-pro', 'opencode-go/glm-5.3', 'google/gemini-3-flash-preview'] }
    },
    links: [],
    security: null
  },
  users: [{ id: 'usr_1', name: 'أحمد', color: '#0a84ff', badges: [] }],
  templates: [{ id: 'tpl_1', name: 'ريلز من فكرة', description: '', stages: [{ id: 'tst_1', name: 'اختيار الفكرة' }, { id: 'tst_2', name: 'مونتاج الريل' }, { id: 'tst_3', name: 'النشر' }] }],
  groups: [{ id: 'grp_1', name: 'الريلز', templateId: 'tpl_1', color: '#6c63ff', description: '', stageAssignees: {}, folder: 'الريلز', createdAt: iso(6000) }],
  tasks: [{
    id: 'task_2', title: 'إعلان درس الجمعة', groupId: 'grp_1', templateId: 'tpl_1',
    folder: 'الريلز\\20260901 - إعلان درس الجمعة',
    stages: [
      { id: 'stg_1', name: 'اختيار الفكرة', done: true, completedBy: 'usr_1', completedByName: 'أحمد', completedAt: iso(900) },
      { id: 'stg_2', name: 'مونتاج الريل', done: false },
      { id: 'stg_3', name: 'النشر', done: false }
    ],
    assigneeId: 'usr_1', dueDate: new Date(now + 86400000).toISOString().slice(0, 10),
    priority: 'normal', description: 'إعلان قصير لدرس الجمعة.', createdAt: iso(7000), updatedAt: iso(700)
  }],
  prompts: [
    { id: 'prm_1', name: 'مونتاج ريل من درس', description: 'اختيار أقوى مقطع وقصه وتصديره 9:16', content: 'اقرأ ملفات المصادر في مجلد المهمة.\nاختر أقوى 45 ثانية.\nأضف كابشنز عربية.\nصدّر الناتج إلى output/reel.mp4.', createdAt: iso(3000), updatedAt: iso(300) },
    { id: 'prm_2', name: 'تفريغ وتلخيص درس', description: 'نسخة نصية مع ملخص', content: 'فرّغ الصوت نصًا، ثم لخّص في 10 نقاط.\nاكتب الناتج في output/transcript.md', createdAt: iso(2000), updatedAt: iso(200) }
  ],
  automations: [],
  activeUserId: 'usr_1'
};

const bridge = `
window.MMO = {
  isDesktop: true,
  platform: 'win32',
  info: async () => ({ ok: true, data: { appVersion: '2.0.0', platform: 'win32' } }),
  openExternal: async () => ({ ok: true }),
  repo: {
    pick: async () => ({ ok: true, data: { path: 'C:\\\\media-repo' } }),
    detect: async () => ({ ok: true, data: { manifest: null, isRepo: true, writable: true } }),
    link: async () => ({ ok: true, data: { manifest: { repoId: 'rpo_demo' }, created: false } }),
    sync: async () => ({ ok: true, data: { groups: {}, tasks: {}, absolute: { groups: {}, tasks: {} }, actions: [], warnings: [] } }),
    open: async () => ({ ok: true }),
    reveal: async () => ({ ok: true }),
    readManifest: async () => ({ ok: true, data: { manifest: null } }),
    pathFor: async ({ relPath }) => ({ ok: true, data: { absolute: 'C:\\\\media-repo\\\\' + relPath, exists: true } }),
    forget: async () => ({ ok: true })
  },
  store: {
    readMirror: async () => ({ ok: true, data: { snapshot: null } }),
    writeMirror: async () => ({ ok: true, data: { path: null } })
  },
  opencode: {
    health: async () => ({ ok: true, data: { available: true, version: '2.2.5', command: 'opencode', checkedAt: new Date().toISOString() } }),
    models: async () => ({ ok: true, data: { models: ['opencode-go/deepseek-v4.1-flash', 'opencode-go/kimi-k3.1-pro', 'opencode-go/glm-5.3', 'google/gemini-3-flash-preview'], at: new Date().toISOString(), source: 'live' } }),
    start: async () => ({ ok: true, data: { jobId: 'job_demo', pid: 1234 } }),
    cancel: async () => ({ ok: true, data: { cancelled: true } }),
    jobs: async () => ({ ok: true, data: { jobs: [] } }),
    status: async () => ({ ok: true, data: { agentStatus: null, run: null } }),
    log: async () => ({ ok: true, data: { text: '' } }),
    onEvent: () => () => {},
    onUpdate: () => () => {},
    onDone: () => () => {}
  }
};
`;

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(base, { cache: 'no-store' });
      if (response.ok) return;
    } catch (error) {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('server did not start');
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
  });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ executablePath: chrome, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.addInitScript(({ data, script }) => {
      localStorage.setItem('mosque_media_office_v1', JSON.stringify(data));
      // eslint-disable-next-line no-eval
      eval(script);
    }, { data: seed, script: bridge });

    await page.goto(`${base}/#/tasks`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.locator('[data-action="start-automation"]').first().click();
    await page.waitForTimeout(1200);

    const sheet = page.locator('.modal-sheet');
    if (!(await sheet.count())) errors.push('automation modal did not open');
    const modelOptions = await sheet.locator('select').last().locator('option').count();
    if (modelOptions < 2) errors.push(`model select has ${modelOptions} options`);
    await page.screenshot({ path: path.join(shots, '22-automation-start.png') });

    const textarea = sheet.locator('textarea').first();
    const prefilled = await textarea.inputValue();
    if (!prefilled.includes('output/')) errors.push('prompt textarea was not prefilled from the template');

    await sheet.locator('select').first().selectOption({ index: 1 });
    await page.waitForTimeout(300);
    const afterSelect = await textarea.inputValue();
    if (afterSelect === prefilled) errors.push('changing the prompt did not refresh the textarea');

    await page.screenshot({ path: path.join(shots, '24-automation-start-filled.png') });

    if (errors.length) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('automation modal OK');
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
