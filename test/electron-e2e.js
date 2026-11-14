'use strict';

// End-to-end check of the Electron app: repository folders + a real opencode run.
// Run: node test/electron-e2e.js
// Requires: electron installed, opencode on PATH, a working model on this machine.

const { _electron } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmo-e2e-'));
const userData = path.join(tempRoot, 'user-data');
const repoDir = path.join(tempRoot, 'media-repo');
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(repoDir, { recursive: true });

const MODEL = process.env.MMO_TEST_MODEL || 'opencode-go/deepseek-v4.1-flash';
const shots = path.join(__dirname, 'screenshots');

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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: ['.'],
    cwd: root,
    env: { ...process.env, MMO_USER_DATA: userData, NODE_ENV: 'test' }
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.waitForLoadState('domcontentloaded');
  await wait(600);

  try {
    section('window and bridge');
    const title = await page.title();
    check('app loaded from app:// origin', page.url().startsWith('app://mosque-media-office/'), page.url());
    check('bridge exposed', await page.evaluate(() => Boolean(window.MMO?.repo && window.MMO?.opencode)));
    const info = await page.evaluate(() => window.MMO.info());
    check('info ok', info.ok && info.data.platform === 'win32');
    check('localStorage origin stable', await page.evaluate(() => location.origin === 'app://mosque-media-office'), await page.evaluate(() => location.origin));
    await page.screenshot({ path: path.join(shots, '30-electron-onboarding.png'), fullPage: false });

    section('workspace');
    await page.evaluate(async () => {
      Data.createWorkspace({ mosqueName: 'مسجد الاختبار', members: ['أحمد', 'سارة'] });
      const template = Data.templates()[0];
      const group = Data.createGroup({ name: 'الاختبار', templateId: template.id, color: '#6c63ff', description: '', stageAssignees: {} });
      const task = Data.createTask({ title: 'مهمة أتمتة', groupId: group.id, templateId: template.id, priority: 'normal', description: '', dueDate: '' });
      window.__testIds = { groupId: group.id, taskId: task.id };
      return true;
    });
    await page.evaluate(() => { location.hash = '#/dashboard'; });
    await page.reload();
    await wait(800);
    check('dashboard rendered', (await page.locator('.stats-grid').count()) === 1);

    section('repository');
    const linkResult = await page.evaluate(async (dir) => window.MMO.repo.link(dir), repoDir);
    check('repo:link ok', linkResult?.ok === true, JSON.stringify(linkResult).slice(0, 200));
    check('manifest on disk', fs.existsSync(path.join(repoDir, 'mosque-media-office.repo.json')));

    const syncResult = await page.evaluate(async ({ dir }) => {
      const manifest = await window.MMO.repo.readManifest(dir);
      Data.linkRepo({ path: dir, repoId: manifest?.data?.manifest?.repoId || '', autoRename: true });
      return window.Repo.sync({ silent: true });
    }, { dir: repoDir });
    check('Repo.sync ok', syncResult?.ok === true, JSON.stringify(syncResult).slice(0, 300));

    const ids = await page.evaluate(() => {
      const data = Data.get();
      const task = data.tasks.find((item) => item.title === 'مهمة أتمتة') || data.tasks[0];
      const group = data.groups.find((item) => item.name === 'الاختبار') || data.groups[0];
      return { groupId: group?.id || '', taskId: task?.id || '' };
    });
    const taskFolder = await page.evaluate((taskId) => Data.findTask(taskId)?.folder || '', ids.taskId);
    check('task folder recorded in data', Boolean(taskFolder), taskFolder);
    check('task folder exists', fs.existsSync(path.join(repoDir, taskFolder)), path.join(repoDir, taskFolder));
    check('output directory', fs.existsSync(path.join(repoDir, taskFolder, 'output')));
    check('opencode directory', fs.existsSync(path.join(repoDir, taskFolder, 'opencode')));
    const manifest = JSON.parse(fs.readFileSync(path.join(repoDir, 'mosque-media-office.repo.json'), 'utf8'));
    check('manifest indexes the task', Boolean(manifest.tasks?.[ids.taskId]?.folder));
    check('manifest indexes the group', Boolean(manifest.groups?.[ids.groupId]?.folder));

    section('opencode health and models');
    const health = await page.evaluate(async () => window.Opencode.health({ silent: true }));
    check('opencode available', health?.available === true, JSON.stringify(health).slice(0, 200));
    const models = await page.evaluate(async () => window.Opencode.models({ refresh: true }));
    check('models listed', Array.isArray(models?.all) && models.all.length > 5, JSON.stringify(models?.all?.length));
    check('test model present', models.all.includes(MODEL), MODEL);

    section('automation run');
    const started = await page.evaluate(async ({ taskId, model }) => window.Opencode.start({
      taskId,
      model,
      notes: 'اختبار آلي قصير.',
      promptText: 'هذه مهمة اختبار. أنشئ ملف output/result.txt يحتوي على كلمة ok فقط، واكتب في opencode/status.json الحالة done والنسبة 100.'
    }), { taskId: ids.taskId, model: MODEL });
    check('job started', started?.ok === true, JSON.stringify(started).slice(0, 300));

    let status = 'queued';
    let job = null;
    for (let attempt = 0; attempt < 180; attempt += 1) {
      job = await page.evaluate(() => {
        const jobs = Data.get().automations;
        return jobs[jobs.length - 1] || null;
      });
      status = job?.status || 'queued';
      if (status !== 'queued' && status !== 'running') break;
      await wait(1000);
    }
    check('job finished (not running)', status !== 'running' && status !== 'queued', `${status} · ${job?.error || ''}`);
    check('job succeeded', status === 'done', `${status} · ${job?.error || ''} · exit ${job?.exitCode}`);
    check('usage recorded', (job?.usage?.input || 0) > 0, JSON.stringify(job?.usage));
    check('session captured', Boolean(job?.sessionID), job?.sessionID);
    check('log file written', fs.existsSync(path.join(repoDir, taskFolder, 'opencode', 'logs', `run-${job?.id}.jsonl`)));
    check('run file written', fs.existsSync(path.join(repoDir, taskFolder, 'opencode', `run-${job?.id}.json`)));
    const outputPath = path.join(repoDir, taskFolder, 'output', 'result.txt');
    check('agent wrote output/result.txt', fs.existsSync(outputPath));
    if (fs.existsSync(outputPath)) {
      const content = fs.readFileSync(outputPath, 'utf8');
      check('output contains ok', /ok/i.test(content), content.slice(0, 80));
    }
    const statusFile = path.join(repoDir, taskFolder, 'opencode', 'status.json');
    check('status.json exists', fs.existsSync(statusFile));

    section('ui reflects the run');
    await page.evaluate(() => { location.hash = '#/tasks'; });
    await wait(900);
    check('task page rendered', (await page.locator('.task-card, .task-row').count()) > 0);
    await page.screenshot({ path: path.join(shots, '31-electron-tasks.png'), fullPage: false });
    await page.evaluate(() => { location.hash = '#/automation'; });
    await wait(900);
    check('automation page rendered', (await page.locator('.automation-page, .automation-layout, main').count()) > 0);
    await page.screenshot({ path: path.join(shots, '32-electron-automation.png'), fullPage: true });

    const uiErrors = errors.filter((line) => !line.includes('Autofill'));
    check('no page errors', uiErrors.length === 0, uiErrors.slice(0, 3).join(' | '));
  } finally {
    await app.close();
    await wait(800);
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (error) {
      process.stdout.write(`\nCould not remove temp folder (files still locked): ${tempRoot}\n`);
    }
  }

  process.stdout.write(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
