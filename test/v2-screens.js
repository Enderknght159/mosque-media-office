'use strict';

// Visual check of the v2 screens (automation tab, settings sections).
// Run: node test/v2-screens.js

const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const port = 4181;
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
    repo: {
      path: 'C:\\Users\\HADI\\Documents\\media-repo',
      repoId: 'rpo_demo',
      autoRename: true,
      linkedAt: iso(60 * 24 * 20),
      lastSyncAt: iso(12)
    },
    ai: {
      lastModel: 'opencode-go/deepseek-v4.1-flash',
      opencodePath: '',
      filter: { mode: 'all', allowed: [], blocked: ['opencode-go/kimi-k3.1-pro', 'opencode-go/gpt-6-luna'] },
      modelsCache: {
        at: iso(30),
        list: ['opencode-go/deepseek-v4.1-flash', 'opencode-go/kimi-k3.1-pro', 'opencode-go/gpt-6-luna', 'google/gemini-3-flash-preview']
      }
    },
    links: [],
    security: null
  },
  users: [{ id: 'usr_1', name: 'أحمد', color: '#0a84ff', badges: [] }, { id: 'usr_2', name: 'سارة', color: '#ff375f', badges: [] }],
  templates: [{ id: 'tpl_1', name: 'ريلز من فكرة', description: '', stages: [{ id: 'tst_1', name: 'اختيار الفكرة' }, { id: 'tst_2', name: 'مونتاج الريل' }, { id: 'tst_3', name: 'النشر' }] }],
  groups: [
    { id: 'grp_1', name: 'الريلز', templateId: 'tpl_1', color: '#6c63ff', description: '', stageAssignees: {}, folder: 'الريلز', createdAt: iso(6000) },
    { id: 'grp_2', name: 'الخطب', templateId: 'tpl_1', color: '#ff9f0a', description: '', stageAssignees: {}, folder: 'الخطب', createdAt: iso(6000) }
  ],
  tasks: [
    {
      id: 'task_1', title: 'ريل أدآب المسجد', groupId: 'grp_1', templateId: 'tpl_1',
      folder: 'الريلز\\20260810 - ريل أدآب المسجد',
      stages: [
        { id: 'stg_1', name: 'اختيار الفكرة', done: true, completedBy: 'usr_1', completedByName: 'أحمد', completedAt: iso(400), completedNote: '' },
        { id: 'stg_2', name: 'مونتاج الريل', done: false, completedBy: null, completedByName: '', completedAt: null, note: '' },
        { id: 'stg_3', name: 'النشر', done: false, completedBy: null, completedByName: '', completedAt: null, note: '' }
      ],
      assigneeId: 'usr_1', dueDate: new Date(now + 86400000).toISOString().slice(0, 10),
      priority: 'high', description: 'ريل قصير عن آداب دخول المسجد.', createdAt: iso(5000), updatedAt: iso(200)
    },
    {
      id: 'task_2', title: 'إعلان درس الجمعة', groupId: 'grp_2', templateId: 'tpl_1',
      folder: 'الخطب\\20260901 - إعلان درس الجمعة',
      stages: [
        { id: 'stg_4', name: 'اختيار الفكرة', done: true, completedBy: 'usr_2', completedByName: 'سارة', completedAt: iso(900) },
        { id: 'stg_5', name: 'مونتاج الريل', done: true, completedBy: 'usr_2', completedByName: 'سارة', completedAt: iso(800) },
        { id: 'stg_6', name: 'النشر', done: true, completedBy: 'usr_1', completedByName: 'أحمد', completedAt: iso(700) }
      ],
      assigneeId: 'usr_2', dueDate: new Date(now - 86400000).toISOString().slice(0, 10),
      priority: 'normal', description: '', createdAt: iso(7000), updatedAt: iso(700)
    }
  ],
  prompts: [
    { id: 'prm_1', name: 'مونتاج ريل من درس', description: 'اختيار أقوى مقطع وقصه وتصديره 9:16', content: 'اقرأ ملفات المصادر في مجلد المهمة.\nاختر أقوى 45 ثانية.\nأضف كابشنز عربية.\nصدّر الناتج إلى output/reel.mp4.', createdAt: iso(3000), updatedAt: iso(300) },
    { id: 'prm_2', name: 'تفريغ وتلخيص درس', description: 'نسخة نصية مع ملخص', content: 'فرّغ الصوت نصًا، ثم لخّص في 10 نقاط.\nاكتب الناتج في output/transcript.md', createdAt: iso(2000), updatedAt: iso(200) }
  ],
  automations: [
    {
      id: 'job_1', taskId: 'task_1', taskTitle: 'ريل أدآب المسجد', groupId: 'grp_1', groupName: 'الريلز',
      promptId: 'prm_1', promptName: 'مونتاج ريل من درس', model: 'opencode-go/deepseek-v4.1-flash',
      notes: '', promptText: '', status: 'running', progress: 45, phase: 'قص المقاطع', etaSeconds: 300,
      steps: 7, sessionID: 'ses_demo', taskFolder: 'الريلز\\20260810 - ريل أدآب المسجد',
      startedAt: iso(6), endedAt: null, exitCode: null, error: '',
      usage: { input: 18400, output: 2100, reasoning: 0, cacheRead: 9000, cacheWrite: 0, costUSD: 0.0412 }
    },
    {
      id: 'job_2', taskId: 'task_2', taskTitle: 'إعلان درس الجمعة', groupId: 'grp_2', groupName: 'الخطب',
      promptId: 'prm_2', promptName: 'تفريغ وتلخيص درس', model: 'opencode-go/deepseek-v4.1-flash',
      notes: '', promptText: '', status: 'done', progress: 100, phase: 'اكتمل', etaSeconds: 0,
      steps: 12, sessionID: 'ses_demo2', taskFolder: 'الخطب\\20260901 - إعلان درس الجمعة',
      startedAt: iso(60 * 26), endedAt: iso(60 * 25), exitCode: 0, error: '',
      usage: { input: 62000, output: 5600, reasoning: 0, cacheRead: 20000, cacheWrite: 0, costUSD: 0.1281 }
    },
    {
      id: 'job_3', taskId: 'task_2', taskTitle: 'إعلان درس الجمعة', groupId: 'grp_2', groupName: 'الخطب',
      promptId: 'prm_2', promptName: 'تفريغ وتلخيص درس', model: 'opencode-go/kimi-k3.1-pro',
      notes: '', promptText: '', status: 'failed', progress: 12, phase: 'فشل', etaSeconds: 0,
      steps: 2, sessionID: 'ses_demo3', taskFolder: 'الخطب\\20260901 - إعلان درس الجمعة',
      startedAt: iso(60 * 50), endedAt: iso(60 * 49), exitCode: 1, error: 'Model unavailable: user location not supported',
      usage: { input: 2400, output: 120, reasoning: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0.0035 }
    },
    {
      id: 'job_4', taskId: 'task_1', taskTitle: 'ريل أدآب المسجد', groupId: 'grp_1', groupName: 'الريلز',
      promptId: 'prm_1', promptName: 'مونتاج ريل من درس', model: 'opencode-go/deepseek-v4.1-flash',
      notes: '', promptText: '', status: 'done', progress: 100, phase: 'اكتمل', etaSeconds: 0,
      steps: 9, sessionID: 'ses_demo4', taskFolder: 'الريلز\\20260810 - ريل أدآب المسجد',
      startedAt: iso(60 * 24 * 4), endedAt: iso(60 * 24 * 4 - 40), exitCode: 0, error: '',
      usage: { input: 31000, output: 3300, reasoning: 0, cacheRead: 12000, cacheWrite: 0, costUSD: 0.0711 }
    }
  ],
  activeUserId: 'usr_1'
};

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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.addInitScript((data) => {
      localStorage.setItem('mosque_media_office_v1', JSON.stringify(data));
    }, seed);

    await page.goto(`${base}/#/automation`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(shots, '20-automation.png'), fullPage: true });

    const startButtonsOnAutomationPage = await page.locator('[data-action="start-automation"]').count();
    if (startButtonsOnAutomationPage > 0) errors.push('automation page must not offer a start action');

    await page.goto(`${base}/#/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(shots, '21-settings.png'), fullPage: true });

    await page.goto(`${base}/#/tasks`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const robot = await page.locator('[data-action="start-automation"]').count();
    const folder = await page.locator('[data-action="open-task-folder"]').count();
    if (robot === 0) errors.push('task cards lack the robot button');
    if (folder === 0) errors.push('task cards lack the folder button');

    await page.locator('[data-action="start-automation"]').nth(1).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(shots, '22-automation-start.png'), fullPage: false });

    await page.keyboard.press('Escape');
    await page.goto(`${base}/#/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(shots, '23-dashboard-with-automation.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const navLinks = await page.locator('.bottom-nav-link').count();
    if (navLinks < 6) errors.push(`bottom nav has ${navLinks} items`);
    const navOverflow = await page.evaluate(() => {
      const nav = document.querySelector('.bottom-nav');
      return nav ? nav.scrollWidth - nav.clientWidth : 0;
    });
    if (navOverflow > 2) errors.push(`bottom nav overflows by ${navOverflow}px`);
    await page.screenshot({ path: path.join(shots, '25-mobile-dashboard.png') });

    if (errors.length) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('v2 screens OK');
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
