'use strict';

// Smoke test for the packaged Windows build (release/win-unpacked).
// Run after `npm run build`.

const { _electron } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const unpacked = path.join(root, 'release', 'win-unpacked');

function findExe() {
  if (!fs.existsSync(unpacked)) return '';
  const candidates = fs.readdirSync(unpacked).filter((name) => name.toLowerCase().endsWith('.exe'));
  if (!candidates.length) return '';
  // prefer the app exe over helper binaries
  const main = candidates.find((name) => !/uninstall|crashpad|squirrel/i.test(name));
  return path.join(unpacked, main || candidates[0]);
}

(async () => {
  const exe = findExe();
  if (!exe) {
    console.error('No packaged executable found in release/win-unpacked. Run: npm run build');
    process.exit(1);
  }
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mmo-packaged-'));
  const app = await _electron.launch({
    executablePath: exe,
    env: { ...process.env, MMO_USER_DATA: userData }
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);
  try {
    const url = page.url();
    if (!url.startsWith('app://mosque-media-office/')) throw new Error(`unexpected origin: ${url}`);
    const bridge = await page.evaluate(() => Boolean(window.MMO?.repo && window.MMO?.opencode));
    if (!bridge) throw new Error('bridge missing in packaged app');
    const info = await page.evaluate(() => window.MMO.info());
    if (!info?.ok) throw new Error('mmo:info failed');
    const opencode = await page.evaluate(async () => window.MMO.opencode.health({}));
    if (!opencode?.ok) throw new Error('opencode health failed');
    const hasOnboarding = await page.evaluate(() => Boolean(document.querySelector('.onboarding, #onboarding, [data-onboarding]')) || document.body.textContent.length > 100);
    if (!hasOnboarding) throw new Error('empty screen');
    await page.screenshot({ path: path.join(__dirname, 'screenshots', '33-packaged-app.png') });
    console.log(`packaged app OK — ${path.basename(exe)} — opencode ${opencode.data?.version || 'unknown'}`);
  } finally {
    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      fs.rmSync(userData, { recursive: true, force: true });
    } catch (error) {}
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
