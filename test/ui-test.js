const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const port = 4173;
const base = `http://127.0.0.1:${port}`;
const screens = path.join(__dirname, 'screenshots');
const downloads = path.join(__dirname, 'downloads');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function prepareShot(page, delay = 550) {
  await page.waitForTimeout(delay);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((node) => node.remove()));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(base, { cache: 'no-store' });
      if (response.ok) return;
    } catch (error) {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Server did not start');
}

(async () => {
  fs.mkdirSync(screens, { recursive: true });
  fs.mkdirSync(downloads, { recursive: true });
  const server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
  });
  const errors = [];
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({
      headless: true,
      executablePath: chrome,
      args: ['--force-color-profile=srgb']
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      locale: 'ar-EG',
      colorScheme: 'light',
      acceptDownloads: true
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
    });

    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('#onboarding-form');
    const fontLoaded = await page.evaluate(() => document.fonts.check('12px Alexandria'));
    assert(fontLoaded, 'Alexandria font did not load');
    await page.fill('#onboarding-mosque', 'مسجد النور');
    for (const name of ['أحمد', 'عبدالله', 'سارة']) {
      await page.fill('#onboarding-member-input', name);
      await page.click('[data-onboard-add]');
    }
    assert(await page.isChecked('#onboarding-demo'), 'Demo data should be enabled');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '01-onboarding-desktop.png'), fullPage: true });
    await page.click('.onboarding-submit');
    await page.waitForSelector('.app .sidebar');
    await page.waitForTimeout(500);
    assert((await page.locator('.stat-card').count()) === 4, 'Dashboard stats missing');
    assert((await page.locator('.task-card').count()) === 0, 'Task page should not be visible initially');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '02-dashboard-light.png'), fullPage: true });

    await page.click('[data-nav="tasks"]');
    await page.waitForSelector('.tasks-grid .task-card');
    const initialTasks = await page.locator('.task-card').count();
    assert(initialTasks >= 10, 'Demo tasks did not render');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '03-tasks.png'), fullPage: true });

    const card = page.locator('.task-card').filter({ has: page.locator('[data-action="quick-complete"]') }).first();
    await card.locator('.task-title').click();
    await page.waitForSelector('.task-detail-modal');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '04-task-detail.png') });
    await page.click('.task-detail-modal [data-action="complete-stage"][data-source="detail"]');
    await page.waitForSelector('#complete-form');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '05-complete-stage.png') });
    await page.click('button[form="complete-form"]');
    await page.waitForSelector('.task-detail-modal');
    await page.waitForTimeout(350);
    assert((await page.locator('.toast-success').count()) > 0, 'Completion toast missing');
    await page.keyboard.press('Escape');

    await page.locator('[data-action="add-task"]:visible').first().click();
    await page.waitForSelector('#task-form');
    await page.fill('#task-form [name="title"]', 'مهمة اختبار تلقائية');
    await page.locator('#task-form .group-choice').nth(1).click();
    await page.locator('#task-form .advanced-settings-summary').click();
    await page.fill('#task-form [name="date"]', new Date().toISOString().slice(0, 10));
    await page.fill('#task-form [name="dueDate"]', new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await page.click('button[form="task-form"]');
    await page.waitForTimeout(350);
    const created = await page.evaluate(() => Data.get().tasks.some((task) => task.title === 'مهمة اختبار تلقائية'));
    assert(created, 'Task creation failed');

    await page.fill('#task-search', 'مهمة اختبار');
    await page.waitForTimeout(550);
    assert((await page.locator('.task-card').count()) === 1, 'Search filter did not work');
    await page.locator('.task-card .task-title').click();
    await page.waitForSelector('.task-detail-modal');
    await page.click('.task-detail-modal [data-action="edit-task"]');
    await page.waitForSelector('#task-form');
    await page.fill('#task-form [name="title"]', 'مهمة اختبار معدلة');
    await page.click('button[form="task-form"]');
    await page.waitForTimeout(350);
    const edited = await page.evaluate(() => Data.get().tasks.some((task) => task.title === 'مهمة اختبار معدلة'));
    assert(edited, 'Task edit failed');
    await page.keyboard.press('Escape');
    await page.click('[data-action="clear-task-filters"]');

    await page.click('[data-nav="groups"]');
    await page.waitForSelector('.groups-grid');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '06-groups.png'), fullPage: true });
    await page.locator('[data-action="add-group"]').first().click();
    await page.waitForSelector('#group-form');
    await page.fill('#group-form [name="name"]', 'مجموعة اختبار');
    await page.click('button[form="group-form"]');
    await page.waitForTimeout(300);

    await page.click('[data-nav="templates"]');
    await page.waitForSelector('.templates-grid');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '07-templates.png'), fullPage: true });
    await page.locator('[data-action="add-template"]').first().click();
    await page.waitForSelector('#template-form');
    await page.fill('#template-form [name="name"]', 'قالب اختبار');
    await page.fill('.stage-edit-input >> nth=0', 'المرحلة الأولى');
    await page.click('[data-stage-add]');
    await page.fill('.stage-edit-input >> nth=1', 'المرحلة الثانية');
    await page.click('button[form="template-form"]');
    await page.waitForTimeout(300);

    await page.click('[data-nav="team"]');
    await page.waitForSelector('.team-grid');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '08-team.png'), fullPage: true });
    await page.locator('[data-action="add-user"]:visible').first().click();
    await page.waitForSelector('#user-form');
    await page.fill('#user-form [name="name"]', 'محمد');
    await page.click('button[form="user-form"]');
    await page.waitForTimeout(300);

    await page.click('[data-nav="reports"]');
    await page.waitForSelector('.report-sheet');
    await page.waitForTimeout(300);
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '09-reports.png'), fullPage: true });

    await page.selectOption('#report-group', { label: 'الخطب' });
    await page.waitForTimeout(250);
    const filteredGroupRows = await page.locator('.report-tables-grid .report-block').first().locator('tbody tr').count();
    assert(filteredGroupRows === 1, 'Report group filter did not apply');
    await page.selectOption('#report-group', 'all');
    await page.selectOption('#report-user', { label: 'أحمد' });
    await page.waitForTimeout(250);
    assert((await page.locator('.report-meta-row').innerText()).includes('أحمد'), 'Report member filter did not apply');
    await page.selectOption('#report-user', 'all');
    await page.waitForTimeout(250);

    await page.emulateMedia({ media: 'print' });
    assert(!(await page.locator('.report-filters').isVisible()), 'Print mode should hide report filters');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '09b-report-print.png'), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await page.waitForTimeout(150);

    const reportDownload = page.waitForEvent('download');
    await page.click('[data-action="export-report-excel"]');
    const reportFile = await reportDownload;
    const reportPath = path.join(downloads, 'report.xlsx');
    await reportFile.saveAs(reportPath);
    assert(fs.statSync(reportPath).size > 5000, 'Report Excel is too small');

    await page.click('[data-nav="settings"]');
    await page.waitForSelector('.settings-grid');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '10-settings.png'), fullPage: true });

    await page.locator('[data-action="add-link"]').first().click();
    await page.waitForSelector('#link-form');
    await page.fill('#link-form [name="name"]', 'صفحة المسجد');
    await page.fill('#link-form [name="url"]', 'example.com');
    await page.click('button[form="link-form"]');
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => Data.get().settings.links.length === 1), 'Link creation failed');
    assert(await page.evaluate(() => Data.get().settings.links[0].url === 'https://example.com'), 'Link URL normalization failed');

    await page.locator('[data-action="toggle-user-menu"]').click();
    await page.locator('.user-option').filter({ hasText: 'سارة' }).click();
    await page.waitForTimeout(250);
    assert((await page.locator('.user-chip-text').innerText()).trim() === 'سارة', 'Active user switch failed');
    await page.locator('[data-action="toggle-user-menu"]').click();
    await page.locator('.user-option').filter({ hasText: 'أحمد' }).click();
    await page.waitForTimeout(250);

    const jsonDownload = page.waitForEvent('download');
    await page.click('[data-action="export-json"]');
    const jsonFile = await jsonDownload;
    const jsonPath = path.join(downloads, 'backup.json');
    await jsonFile.saveAs(jsonPath);
    assert(fs.statSync(jsonPath).size > 1000, 'JSON backup too small');

    const excelDownload = page.waitForEvent('download');
    await page.click('[data-action="export-excel"]');
    const excelFile = await excelDownload;
    const excelPath = path.join(downloads, 'backup.xlsx');
    await excelFile.saveAs(excelPath);
    assert(fs.statSync(excelPath).size > 5000, 'Excel backup too small');

    const tasksBeforeImport = await page.evaluate(() => Data.get().tasks.length);
    const [jsonChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('[data-action="import-json"]')
    ]);
    await jsonChooser.setFiles(jsonPath);
    await page.waitForSelector('[data-import-confirm]');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '11-import-confirm.png') });
    await page.click('[data-import-confirm]');
    await page.waitForTimeout(500);
    const tasksAfterJson = await page.evaluate(() => Data.get().tasks.length);
    assert(tasksAfterJson === tasksBeforeImport, 'JSON import changed the task count');
    assert(page.url().endsWith('#/dashboard'), 'Import did not navigate to dashboard');

    await page.click('[data-nav="settings"]');
    const [excelChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('[data-action="import-excel"]')
    ]);
    await excelChooser.setFiles(excelPath);
    await page.waitForSelector('[data-import-confirm]');
    await page.click('[data-import-confirm]');
    await page.waitForTimeout(500);
    const tasksAfterExcel = await page.evaluate(() => Data.get().tasks.length);
    assert(tasksAfterExcel === tasksBeforeImport, 'Excel import changed the task count');
    assert(await page.evaluate(() => Data.get().settings.links.length === 1), 'Link was lost after import');

    await page.locator('[data-action="toggle-theme"]').first().click();
    await page.waitForTimeout(250);
    await page.click('[data-nav="dashboard"]');
    await page.waitForTimeout(400);
    assert((await page.locator('.shortcut').filter({ hasText: 'صفحة المسجد' }).count()) === 1, 'Shortcut did not render on dashboard');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '12-dashboard-dark.png'), fullPage: true });

    await page.locator('[data-action="toggle-theme"]').first().click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    assert((await page.locator('.topbar .crumb-mosque').innerText()).trim() === 'مسجد النور', 'Mobile topbar mosque name missing');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '13-dashboard-mobile.png'), fullPage: true });
    await page.locator('[data-action="open-drawer"]').first().click();
    await page.waitForTimeout(350);
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '14-drawer-mobile.png') });
    await page.keyboard.press('Escape');
    await page.locator('.bottom-nav [data-nav="tasks"]').click();
    await page.waitForSelector('.tasks-grid .task-card');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '15-tasks-mobile.png'), fullPage: true });
    await page.locator('.task-card .task-title').first().click();
    await page.waitForSelector('.task-detail-modal');
    await prepareShot(page);
    await page.screenshot({ path: path.join(screens, '16-task-detail-mobile.png') });
    await page.keyboard.press('Escape');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.app .bottom-nav');
    assert((await page.locator('.bottom-nav').count()) === 1, 'App did not persist after reload');

    assert(errors.length === 0, `Browser errors:\n${errors.join('\n')}`);
    console.log('UI test passed');
    console.log(`Screenshots: ${screens}`);
    console.log(`Downloads: ${downloads}`);
  } catch (error) {
    console.error(error.stack || error.message);
    console.error(`Browser errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})();
