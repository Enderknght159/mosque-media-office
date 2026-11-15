'use strict';

// Visual + behavioural check of the automation history and the job-detail dialog.
// Run: node test/v2-job-detail.js

const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const port = 4184;
const base = `http://127.0.0.1:${port}`;
const shots = path.join(__dirname, 'screenshots');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const now = Date.now();
const iso = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();
const SESSION = 'ses_full_demo_session_123456789';

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
      modelsCache: { at: iso(10), list: ['opencode-go/deepseek-v4.1-flash', 'opencode-go/kimi-k3.1-pro'] }
    },
    links: [],
    security: null
  },
  users: [{ id: 'usr_1', name: 'أحمد', color: '#0a84ff', badges: [] }],
  templates: [{ id: 'tpl_1', name: 'ريلز من فكرة', description: '', stages: [{ id: 'tst_1', name: 'اختيار الفكرة' }, { id: 'tst_2', name: 'مونتاج الريل' }] }],
  groups: [{ id: 'grp_1', name: 'الريلز', templateId: 'tpl_1', color: '#6c63ff', description: '', stageAssignees: {}, folder: 'الريلز', createdAt: iso(6000) }],
  tasks: [{
    id: 'task_1', title: 'ريل آداب المسجد', groupId: 'grp_1', templateId: 'tpl_1',
    folder: 'الريلز\\20260810 - ريل آداب المسجد',
    date: '2026-08-10',
    stages: [
      { id: 'stg_1', name: 'اختيار الفكرة', done: true, completedBy: 'usr_1', completedByName: 'أحمد', completedAt: iso(900) },
      { id: 'stg_2', name: 'مونتاج الريل', done: false }
    ],
    assigneeId: 'usr_1', dueDate: '', priority: 'normal', description: '', createdAt: iso(7000), updatedAt: iso(700)
  }],
  prompts: [{ id: 'prm_1', name: 'مونتاج ريل من درس', description: '', content: 'اقرأ المصادر ثم صدّر output/reel.mp4', createdAt: iso(3000), updatedAt: iso(300) }],
  automations: [
    {
      id: 'job_live', taskId: 'task_1', taskTitle: 'ريل آداب المسجد', groupId: 'grp_1', groupName: 'الريلز',
      promptId: 'prm_1', promptName: 'مونتاج ريل من درس', model: 'opencode-go/deepseek-v4.1-flash',
      notes: '', promptText: '', status: 'running', progress: 45, phase: 'قص المقاطع', etaSeconds: 300,
      steps: 7, sessionID: SESSION, taskFolder: 'الريلز\\20260810 - ريل آداب المسجد',
      startedAt: iso(6), endedAt: null, exitCode: null, error: '',
      usage: { input: 18400, output: 2100, reasoning: 0, cacheRead: 9000, cacheWrite: 0, costUSD: 0.0412 }
    },
    {
      id: 'job_done', taskId: 'task_1', taskTitle: 'ريل آداب المسجد', groupId: 'grp_1', groupName: 'الريلز',
      promptId: 'prm_1', promptName: 'مونتاج ريل من درس', model: 'opencode-go/deepseek-v4.1-flash',
      notes: '', promptText: '', status: 'done', progress: 100, phase: 'اكتمل', etaSeconds: 0,
      steps: 12, sessionID: 'ses_done_abcdef123456', taskFolder: 'الريلز\\20260810 - ريل آداب المسجد',
      startedAt: iso(60 * 26), endedAt: iso(60 * 25), exitCode: 0, error: '',
      usage: { input: 62000, output: 5600, reasoning: 0, cacheRead: 20000, cacheWrite: 0, costUSD: 0.1281 }
    }
  ],
  activeUserId: 'usr_1'
};

const bridge = `
window.__pingCalls = [];
window.__refreshCalls = 0;
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
    models: async () => ({ ok: true, data: { models: ['opencode-go/deepseek-v4.1-flash'], at: new Date().toISOString(), source: 'live' } }),
    start: async () => ({ ok: true, data: { jobId: 'job_new', pid: 1 } }),
    cancel: async () => ({ ok: true, data: { cancelled: true } }),
    jobs: async () => ({ ok: true, data: { jobs: [{ jobId: 'job_live', taskId: 'task_1', status: 'running', progress: 45, phase: 'قص المقاطع', etaSeconds: 300, steps: 7, sessionID: '${SESSION}', usage: { input: 18400, output: 2100, costUSD: 0.0412 } }] } }),
    status: async () => ({ ok: true, data: { agentStatus: null, run: null } }),
    log: async () => ({ ok: true, data: { text: 'line 1\\nline 2\\nline 3' } }),
    refresh: async ({ jobId }) => {
      window.__refreshCalls += 1;
      const live = jobId === 'job_live';
      return { ok: true, data: {
        agentStatus: {
          state: live ? 'working' : 'done',
          phase: live ? 'كتابة الكابشنز' : 'اكتمل التصدير',
          percent: live ? 68 : 100,
          etaSeconds: live ? 120 : 0,
          message: live ? '' : 'تم تصدير الريل بنجاح.',
          outputs: live ? [] : ['output/reel.mp4', 'output/cover.jpg'],
          updatedAt: live ? new Date().toISOString() : new Date(Date.now() - (60 * 25 - 1) * 60000).toISOString()
        },
        phase: live ? 'كتابة الكابشنز' : 'اكتمل التصدير',
        percent: live ? 68 : 100,
        etaSeconds: live ? 120 : 0,
        progress: live ? 68 : 100,
        steps: live ? 9 : 12,
        sessionID: live ? '${SESSION}' : 'ses_done_abcdef123456',
        usage: { input: 45000, output: 5200, reasoning: 0, cacheRead: 21000, cacheWrite: 0, costUSD: 0.0619 },
        logTail: 'step 1\\nstep 2\\n'
      } };
    },
    ping: async ({ jobId, message }) => {
      window.__pingCalls.push({ jobId, message });
      return { ok: true, data: { started: true, pid: 5 } };
    },
    onEvent: () => () => {},
    onUpdate: () => () => {},
    onDone: () => () => {},
    onPing: () => () => {}
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
  const errors = [];
  try {
    await waitForServer();
    browser = await chromium.launch({ executablePath: chrome, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.addInitScript(({ data, script }) => {
      localStorage.setItem('mosque_media_office_v1', JSON.stringify(data));
      eval(script);
    }, { data: seed, script: bridge });

    await page.goto(`${base}/#/automation`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const modelWidth = await page.locator('.automation-history-table .automation-cell-model').first().evaluate((el) => el.getBoundingClientRect().width);
    if (modelWidth > 160) errors.push(`model column is ${Math.round(modelWidth)}px wide`);

    await page.locator('[data-action="open-job"][data-job-id="job_live"]').first().click();
    await page.waitForTimeout(2600);
    await page.screenshot({ path: path.join(shots, '26-job-detail-live.png') });

    const statCount = await page.locator('.modal-sheet .automation-live-stat').count();
    if (statCount < 6) errors.push(`live stat tiles: ${statCount}`);
    const phase = await page.locator('.modal-sheet [data-live-phase]').innerText().catch(() => '');
    if (!phase.includes('كابشنز')) errors.push(`phase not updated from status.json: "${phase}"`);
    const percent = await page.locator('.modal-sheet [data-live-percent]').innerText().catch(() => '');
    if (!percent.includes('68')) errors.push(`percent not updated: "${percent}"`);
    const eta = await page.locator('.modal-sheet [data-live-eta]').innerText().catch(() => '');
    if (!eta.trim()) errors.push('ETA is empty');
    const bodyText = await page.locator('.modal-sheet').innerText();
    if (bodyText.includes(SESSION)) errors.push('full session id is rendered');
    if (!/ses_…/.test(bodyText)) errors.push('masked session id is missing');
    if ((await page.locator('.modal-sheet [data-action="job-copy-session"]').count()) < 1) errors.push('copy-session button missing');

    await page.locator('.modal-sheet [data-action="job-ping"]').click();
    await page.waitForTimeout(250);
    await page.fill('.modal-sheet #automation-ping-text', 'أين وصلت الآن؟');
    await page.locator('.modal-sheet [data-action="job-ping-send"]').click();
    await page.waitForTimeout(900);
    const pingCalls = await page.evaluate(() => window.__pingCalls);
    if (!pingCalls.length) errors.push('ping was not sent');

    await page.locator('.modal-sheet [data-action="job-refresh"]').click();
    await page.waitForTimeout(600);
    const refreshCalls = await page.evaluate(() => window.__refreshCalls);
    if (refreshCalls < 2) errors.push(`refresh not called (${refreshCalls})`);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    await page.locator('[data-action="open-job"][data-job-id="job_done"]').first().click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(shots, '27-job-detail-done.png') });
    const doneText = await page.locator('.modal-sheet').innerText();
    if (!doneText.includes('reel.mp4')) errors.push('outputs from status.json are missing');
    if ((await page.locator('.modal-sheet [data-action="job-restart"]').count()) < 1) errors.push('restart button missing for a finished run');
    if ((await page.locator('.modal-sheet [data-action="job-ping"]').count()) > 0) errors.push('ping should not be offered for a finished run');

    const titleCount = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.modal-sheet button.icon-btn')];
      return nodes.filter((node) => !node.getAttribute('title') || !node.getAttribute('aria-label')).length;
    });
    if (titleCount > 0) errors.push(`${titleCount} icon buttons without title/aria-label`);

    if (errors.length) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('job detail OK');
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
