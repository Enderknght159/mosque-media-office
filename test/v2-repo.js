'use strict';

// Visual + behavioural checks for the repository tab, storage indicators and folder menu.
// Run: node test/v2-repo.js

const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const port = 4192;
const base = `http://127.0.0.1:${port}`;
const shots = path.join(__dirname, 'screenshots');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const now = Date.now();
const iso = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();

const seed = {
  version: 3,
  settings: {
    mosqueName: 'مسجد النور',
    tagline: 'المكتب الإعلامي',
    theme: 'light',
    onboarded: true,
    demo: false,
    repo: {
      path: 'C:\\MosqueMediaRepo',
      repoId: 'rpo_primary',
      autoRename: true,
      linkedAt: iso(9000),
      lastSyncAt: iso(40),
      label: 'المستودع الأساسي',
      lastScanAt: iso(2),
      volume: { label: 'DATA', serial: 'ABCD', fs: 'NTFS', total: 1_000_000_000_000, free: 660_000_000_000, at: iso(2) }
    },
    archives: [
      {
        id: 'arc_demo1',
        repoId: 'rpo_archive',
        path: 'E:\\MosqueArchive',
        label: 'هارد الأرشيف',
        linkedAt: iso(4000),
        lastSeenAt: iso(3),
        lastScanAt: iso(3),
        status: 'online',
        volume: { label: 'ARCHIVE', serial: 'EFGH', fs: 'NTFS', total: 2_000_000_000_000, free: 1_400_000_000_000, at: iso(3) }
      },
      {
        id: 'arc_demo2',
        repoId: 'rpo_archive2',
        path: 'F:\\MosqueArchiveOld',
        label: 'هارد قديم',
        linkedAt: iso(9000),
        lastSeenAt: iso(9000),
        status: 'offline',
        volume: { label: 'OLD', serial: 'IJKL', fs: 'NTFS', total: 500_000_000_000, free: 0, at: iso(9000) }
      }
    ],
    storage: {
      scannedAt: iso(2),
      totals: { used: 34_100_000_000, free: 660_000_000_000, capacity: 1_000_000_000_000 },
      sections: { sources: 6_200_000_000, output: 21_400_000_000, opencode: 3_100_000_000, other: 3_400_000_000, trash: 1_400_000_000, total: 35_500_000_000 },
      repos: {
        primary: { used: 28_000_000_000, free: 660_000_000_000, capacity: 1_000_000_000_000, online: true, scannedAt: iso(2), sections: { sources: 5_000_000_000, output: 18_000_000_000, opencode: 2_500_000_000, other: 2_500_000_000, trash: 1_400_000_000, total: 29_400_000_000 } },
        arc_demo1: { used: 6_100_000_000, free: 1_400_000_000_000, capacity: 2_000_000_000_000, online: true, scannedAt: iso(3), sections: { sources: 1_200_000_000, output: 3_400_000_000, opencode: 600_000_000, other: 900_000_000, trash: 0, total: 6_100_000_000 } }
      }
    },
    storageLog: [
      { at: iso(30), type: 'archive', taskId: 'task_1', section: 'output', bytes: 2_400_000_000, ok: true, message: 'إلى هارد الأرشيف' },
      { at: iso(120), type: 'trash-section', taskId: 'task_2', section: 'sources', bytes: 400_000_000, ok: true, message: 'المستودع الأساسي' }
    ],
    ai: { lastModel: '', filter: { mode: 'all', allowed: [], blocked: [] }, modelsCache: { at: null, list: [] } },
    links: [],
    security: null
  },
  users: [{ id: 'usr_1', name: 'أحمد', color: '#0a84ff', badges: [] }],
  templates: [{ id: 'tpl_1', name: 'ريلز', stages: [{ id: 'tst_1', name: 'اختيار' }] }],
  groups: [{ id: 'grp_1', name: 'الريلز', templateId: 'tpl_1', color: '#6c63ff', folder: 'الريلز', description: '', createdAt: iso(9000) }],
  tasks: [
    {
      id: 'task_1',
      title: 'ريل آداب المسجد',
      groupId: 'grp_1',
      templateId: 'tpl_1',
      folder: 'الريلز\\20260810 - ريل آداب المسجد',
      date: '2026-08-10',
      stages: [{ id: 'stg_1', name: 'اختيار', done: true }],
      createdAt: iso(7000),
      updatedAt: iso(300),
      storage: { sources: 381_000_000, output: 7_540_000_000, opencode: 572_000_000, total: 8_493_000_000, files: 40, at: iso(2) },
      archived: { output: { repoId: 'rpo_archive', archiveId: 'arc_demo1', rel: 'الريلز\\20260810 - ريل آداب المسجد', at: iso(30), bytes: 7_540_000_000, files: 30 } }
    },
    {
      id: 'task_2',
      title: 'خطبة الجمعة',
      groupId: 'grp_1',
      templateId: 'tpl_1',
      folder: 'الريلز\\20260811 - خطبة الجمعة',
      date: '2026-08-11',
      stages: [{ id: 'stg_2', name: 'اختيار', done: false }],
      createdAt: iso(7000),
      updatedAt: iso(200),
      storage: { sources: 191_000_000, output: 1_300_000_000, opencode: 94_000_000, total: 1_585_000_000, files: 10, at: iso(2) }
    }
  ],
  prompts: [],
  automations: [],
  activeUserId: 'usr_1'
};

const bridge = `
window.MMO = {
  isDesktop: true,
  platform: 'win32',
  info: async () => ({ ok: true, data: { appVersion: '2.2.0', platform: 'win32' } }),
  openExternal: async () => ({ ok: true }),
  repo: {
    pick: async () => ({ ok: true, data: { path: 'C:\\\\Media' } }),
    detect: async (path) => { window.__detectArg = path; return ({ ok: true, data: { manifest: null, isRepo: false, writable: true } }); },
    link: async () => ({ ok: true, data: { path: 'C:\\\\Media', manifest: { repoId: 'rpo_x' }, created: true } }),
    register: async () => ({ ok: true, data: { manifest: { repoId: 'rpo_arc' } } }),
    sync: async () => ({ ok: true, data: { groups: {}, tasks: {}, absolute: { groups: {}, tasks: {} }, actions: [], warnings: [] } }),
    open: async () => ({ ok: true }),
    reveal: async () => ({ ok: true }),
    readManifest: async () => ({ ok: true, data: { manifest: null } }),
    pathFor: async ({ relPath }) => ({ ok: true, data: { absolute: 'C:\\\\repo\\\\' + relPath, exists: true } }),
    forget: async () => ({ ok: true })
  },
  storage: {
    scan: async () => ({ ok: true, data: window.__seedStorage }),
    locate: async ({ items }) => ({ ok: true, data: { locations: items.map((item) => ({ ...item, exists: true, absolute: item.path + '\\\\' + item.rel })) } }),
    volume: async () => ({ ok: true, data: { label: 'DATA', serial: 'X', fs: 'NTFS', total: 1000, free: 500 } }),
    onProgress: () => () => {}
  },
  archive: {
    start: async () => ({ ok: true, data: { jobId: 'job_1', started: true } }),
    cancel: async () => ({ ok: true }),
    restore: async () => ({ ok: true }),
    reconcile: async () => ({ ok: true, data: { pending: [] } }),
    purgeExpired: async () => ({ ok: true, data: { removed: 0 } }),
    onProgress: () => () => {},
    onDone: () => () => {}
  },
  trash: {
    move: async () => ({ ok: true, data: { entry: { id: 'trs_x' } } }),
    list: async () => ({ ok: true, data: { entries: [
      { id: 'trs_1', kind: 'section', section: 'sources', originalRel: 'الريلز\\\\20260811 - خطبة الجمعة', bytes: 381000000, files: 4, createdAt: '2026-11-13T10:00:00.000Z', expiresAt: '2026-11-20T10:00:00.000Z', daysLeft: 4, repoPath: 'C:\\\\MosqueMediaRepo', meta: { taskId: 'task_2', taskTitle: 'خطبة الجمعة' } },
      { id: 'trs_2', kind: 'task', originalRel: 'الريلز\\\\20260812 - قديم', bytes: 944000000, files: 8, createdAt: '2026-11-15T10:00:00.000Z', expiresAt: '2026-11-22T10:00:00.000Z', daysLeft: 6, repoPath: 'E:\\\\MosqueArchive', meta: { taskTitle: 'مهمة قديمة' } }
    ] } }),
    restore: async () => ({ ok: true }),
    delete: async () => ({ ok: true }),
    purge: async () => ({ ok: true }),
    onChange: () => () => {}
  },
  opencode: {
    health: async () => ({ ok: true, data: { available: true, version: '2.2.5' } }),
    models: async () => ({ ok: true, data: { models: [] } }),
    jobs: async () => ({ ok: true, data: { jobs: [] } }),
    onEvent: () => () => {}, onUpdate: () => () => {}, onDone: () => () => {}, onPing: () => () => {}
  },
  store: { readMirror: async () => ({ ok: true, data: { snapshot: null } }), writeMirror: async () => ({ ok: true }), backup: async () => ({ ok: true }) }
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.addInitScript(({ data, script }) => {
      localStorage.setItem('mosque_media_office_v1', JSON.stringify(data));
      eval(script);
      window.__seedStorage = data.settings.storage;
    }, { data: seed, script: bridge });

    await page.goto(`${base}/#/repository`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(shots, '32-repository.png'), fullPage: true });

    const text = await page.locator('.content').innerText();
    for (const needle of ['المستودع', 'هارد الأرشيف', 'غير متصل', 'أكبر المهام', 'سلة المحذوفات', 'GB', 'بقي']) {
      if (!text.includes(needle)) errors.push(`repository is missing: ${needle}`);
    }
    const missingLabels = await page.evaluate(() => [...document.querySelectorAll('.content button.icon-btn, .content a.icon-btn')]
      .filter((node) => !node.getAttribute('title') || !node.getAttribute('aria-label')).length);
    if (missingLabels) errors.push(`${missingLabels} repository icon buttons without title/aria`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 2) errors.push(`repository overflows horizontally by ${overflow}px`);

    await page.locator('.repo-check[data-task-id]').first().check();
    await page.waitForTimeout(250);
    if (!(await page.locator('.repo-bulk-bar').count())) errors.push('bulk selection toolbar did not appear');
    await page.locator('[data-action="repo-section-menu"]').first().click();
    await page.waitForTimeout(250);
    if (!(await page.locator('.repo-section-menu').count())) errors.push('section actions dropdown did not open');
    await page.keyboard.press('Escape');
    await page.locator('[data-action="repo-clear-selection"]').click().catch(() => {});

    await page.goto(`${base}/#/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(shots, '33-dashboard-storage.png'), fullPage: true });
    const dashboard = await page.locator('.content').innerText();
    if (!dashboard.includes('مساحة الوسائط')) errors.push('dashboard storage indicator is missing');
    const storageChips = await page.locator('.storage-chip').count();
    if (!storageChips) errors.push('task cards do not show a storage chip');

    await page.locator('[data-action="open-task-folder"]').first().click();
    await page.waitForTimeout(500);
    const menuItems = await page.locator('.location-menu [data-location]').count();
    if (menuItems < 2) errors.push(`folder menu shows ${menuItems} locations instead of 2`);
    await page.keyboard.press('Escape');

    await page.goto(`${base}/#/groups`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const groupCard = await page.locator('.group-card').first().innerText();
    for (const removed of ['لا يوجد وصف', 'كل المراحل عامة', 'ريلز من فكرة']) {
      if (groupCard.includes(removed)) errors.push(`group card still shows: ${removed}`);
    }
    if (!(await page.locator('.group-card [data-action="archive-group"]').count())) errors.push('group card lacks the archive action');

    await page.goto(`${base}/#/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const columns = await page.locator('.settings-column').count();
    if (columns !== 3) errors.push(`settings renders ${columns} columns at 1440px`);
    await page.screenshot({ path: path.join(shots, '34-settings-columns.png'), fullPage: true });

    await page.goto(`${base}/#/repository`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('[data-action="repo-link-archive"]').first().click();
    await page.waitForTimeout(500);
    await page.locator('[data-confirm-yes]').click();
    await page.waitForTimeout(1200);
    const linkCheck = await page.evaluate(() => ({
      type: typeof window.__detectArg,
      archives: Data.get().settings.archives.length
    }));
    if (linkCheck.type !== 'string') errors.push(`repo.detect received ${linkCheck.type} instead of a path string`);
    if (linkCheck.archives !== 3) errors.push(`linking an archive did not persist (${linkCheck.archives})`);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/#/repository`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(shots, '35-repository-mobile.png'), fullPage: true });
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (mobileOverflow > 2) errors.push(`repository overflows on mobile by ${mobileOverflow}px`);

    if (errors.length) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('repository UI OK');
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
