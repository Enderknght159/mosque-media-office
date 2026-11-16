'use strict';

/* arabic-note: لا تُعدّل هذا الملف بمحرّر يغيّر الترميز — UTF-8 بلا BOM. */

/**
 * اختبار ترقية المثبّت في المكان: 2.2.0 ← 2.2.1 دون فقد بيانات.
 * Installer in-place upgrade test: 2.2.0 → 2.2.1 without data loss.
 *
 * لماذا هذا الاختبار؟
 *   المثبّت NSIS يتعرّف على النسخة المثبّتة سابقًا عبر `appId` و`productName`
 *   (انظر رأس electron-builder.yml)، فيستبدلها في مجلدها نفسه ويحتفظ ببيانات
 *   المستخدم في `%APPDATA%\mosque-media-office`. أي تغيير في الهوية ينتج تثبيتًا
 *   ثانيًا بجانب الأول أو فقدًا لبيانات المستخدم — وهذا ما نثبته هنا.
 *
 * ما يفعله:
 *   1) يثبّت 2.2.0 صامتًا في مجلد مؤقت:  <exe> /S /D=<dir>
 *   2) يزرع ملف تحقيق في مسار بيانات المستخدم الحقيقي: %APPDATA%\mosque-media-office
 *   3) يسجّل بصمة الملف التنفيذي (mtime/الحجم) وعدد إدخالات إزالة التثبيت
 *   4) يثبّت 2.2.1 فوقه بنفس /D
 *   5) يتحقق: نفس المجلد، ملف تنفيذي مُستبدل، ملف التحقيق سليم بايت ببايت،
 *      إدخال إزالة تثبيت واحد فقط (لا تكرار)، والإصدار في السجل = 2.2.1
 *   6) يزيل التثبيت صامتًا، ويتحقق أن ملف التحقيق ما زال موجودًا
 *      (deleteAppDataOnUninstall: false)، ثم ينظّف ما أنشأه.
 *
 * التشغيل:
 *   node test/installer-upgrade.js
 *
 * الخروج:
 *   0 = نجاح أو تخطي (المثبّتات غير مبنية بعد، أو بيئة غير مناسبة)
 *   1 = فشل حقيقي: تثبيت مزدوج، فقد بيانات، أو تعذّر تشغيل المثبّت
 *
 * متغيرات اختيارية:
 *   MMO_UPGRADE_TEST_FORCE=1  — يسمح بالتشغيل حتى لو كان التطبيق مثبّتًا
 *                               فعليًا على الجهاز (يُصدّر مفتاح إزالة التثبيت
 *                               ويعيده بعد الاختبار). غير مستحسن.
 *
 * لا يحتاج أي مكتبة خارجية، ولا يشغّل Electron.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');

// هوية التطبيق — يجب أن تطابق electron-builder.yml وpackage.json بلا تغيير.
const APP_ID = 'com.mosque.mediaoffice';
const APP_NAME = 'mosque-media-office'; // package.json name → مجلد %APPDATA%
const PRODUCT_NAME = 'المكتب الإعلامي'; // electron-builder.yml productName

const UNINSTALL_ROOT = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
const OLD_PATTERN = /2\.2\.0.*x64\.exe$/i;
const NEW_PATTERN = /2\.2\.1.*x64\.exe$/i;
const INSTALL_TIMEOUT_MS = 180000;
const REG_TIMEOUT_MS = 30000;
const UNINSTALL_TIMEOUT_MS = 180000;

const warnings = [];
let failures = 0;

// ------------------------------------------------------------------ output

function step(message) {
  console.log(`\n▶ ${message}`);
}

function ok(message) {
  console.log(`   ✓ ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`   ⚠ ${message}`);
}

function check(condition, message) {
  if (condition) {
    ok(message);
    return true;
  }
  failures += 1;
  console.error(`   ✖ ${message}`);
  return false;
}

function sleep(ms) {
  // نوم متزامن بدون setTimeout (لا حاجة لقلب الاختبار إلى async).
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    sleep(500);
  }
  return predicate();
}

// --------------------------------------------------------------- locations

const appDataRoot = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const userDataDir = path.join(appDataRoot, APP_NAME);
const probePath = path.join(userDataDir, 'upgrade-probe.json');

// -------------------------------------------------------------- installer

function findInstaller(pattern) {
  let names = [];
  try {
    names = fs.readdirSync(RELEASE_DIR);
  } catch (error) {
    return null;
  }
  const matches = names
    .filter((name) => pattern.test(name))
    .map((name) => path.join(RELEASE_DIR, name));
  if (!matches.length) return null;
  // لو توجد نسخ متعددة: الأحدث كتابةً هو المقصود.
  matches.sort((a, b) => {
    try {
      return fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs;
    } catch (error) {
      return 0;
    }
  });
  return matches[matches.length - 1];
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return [];
  }
}

function findAppExe(dir) {
  const entries = listFiles(dir).filter((entry) => entry.isFile() && /\.exe$/i.test(entry.name));
  // استثنِ أداة إزالة التثبيت وأدوات crash/تحديث مساعدة.
  const app = entries.find((entry) => !/^uninstall/i.test(entry.name) && !/crashpad|squirrel|elevate/i.test(entry.name));
  return app ? path.join(dir, app.name) : '';
}

function findUninstaller(dir) {
  const entry = listFiles(dir).find((item) => item.isFile() && /^uninstall.*\.exe$/i.test(item.name));
  return entry ? path.join(dir, entry.name) : '';
}

function runInstaller(exe, installDir) {
  // NSIS: /D= يجب أن يكون آخر وسيط، وبلا علامات اقتباس حتى لو كان المسار فيه مسافات.
  const result = spawnSync(exe, ['/S', `/D=${installDir}`], {
    timeout: INSTALL_TIMEOUT_MS,
    windowsHide: true,
    stdio: 'ignore'
  });
  if (result.error) return { ok: false, message: `تعذّر تشغيل المثبّت: ${result.error.message}` };
  if (result.status !== 0) return { ok: false, message: `المثبّت أعاد رمز خروج ${result.status}` };
  return { ok: true, message: '' };
}

function runUninstaller(exe) {
  const result = spawnSync(exe, ['/S'], {
    timeout: UNINSTALL_TIMEOUT_MS,
    windowsHide: true,
    stdio: 'ignore'
  });
  if (result.error) return { ok: false, message: result.error.message };
  // أداة إزالة التثبيت في NSIS تنسخ نفسها إلى TEMP وتعود فورًا؛
  // لذا لا نعتمد على رمز الخروج وحده، بل ننتظر اختفاء المجلد.
  return { ok: true, message: '' };
}

// --------------------------------------------------------------- registry

/**
 * مفتاح إزالة التثبيت الذي يبنيه electron-builder ليس نص `appId`، بل UUID v5
 * مشتق منه: `UUID.v5(appInfo.id, 50e065bc-3134-11e6-9bab-38c9862bdaf3)`
 * (app-builder-lib/out/targets/nsis/NsisTarget.js). نحسبه هنا بنفس الخوارزمية
 * حتى نستعلم عن الإدخال الصحيح بدقة بدل البحث النصي عن appId.
 */
function uninstallKeyForAppId(appId) {
  const namespace = Buffer.from('50e065bc313411e69bab38c9862bdaf3', 'hex');
  const hash = crypto.createHash('sha1').update(namespace).update(appId).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = hash.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

function reg(args) {
  const result = spawnSync('reg', args, {
    encoding: 'utf8',
    timeout: REG_TIMEOUT_MS,
    windowsHide: true
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    error: result.error ? result.error.message : '',
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

/**
 * عدد إدخالات إزالة التثبيت المطابقة. كل إدخال يظهر كسطر مفتاح يبدأ بـHKEY.
 * يعيد null إذا مُنع الاستعلام (بيئة مقفلة) — وهذا تحذير لا فشل.
 */
function countUninstallEntries(guid) {
  const result = reg(['query', UNINSTALL_ROOT, '/s']);
  if (!result.ok) {
    warn(`تعذّر استعلام السجل (reg query): ${result.stderr.trim() || result.status} — تخطّي فحص الإدخال الواحد.`);
    return null;
  }
  const keys = new Set();
  const wanted = guid.toLowerCase();
  result.stdout.split(/\r?\n/).forEach((line) => {
    if (!/^HKEY_/i.test(line)) return; // سطور القيم تبدأ بمسافات
    const lower = line.trim().toLowerCase();
    const leaf = lower.split('\\').pop();
    if (leaf === wanted || lower.includes(APP_ID)) keys.add(lower);
  });
  return keys.size;
}

function readInstalledVersion(guid) {
  const result = reg(['query', `${UNINSTALL_ROOT}\\${guid}`, '/v', 'DisplayVersion']);
  if (!result.ok) return null;
  const match = result.stdout.match(/DisplayVersion\s+REG_SZ\s+(\S+)/i);
  return match ? match[1] : null;
}

function uninstallKeyExists(guid) {
  return reg(['query', `${UNINSTALL_ROOT}\\${guid}`]).ok;
}

// ---------------------------------------------------------------- cleanup

function restoreProbe(probeState) {
  try {
    if (!probeState.existed) {
      if (fs.existsSync(probePath)) fs.unlinkSync(probePath);
      return;
    }
    if (!probeState.bytes) {
      warn('ملف التحقيق كان موجودًا قبل الاختبار وتعذّرت قراءته — لن يُعاد كتابته.');
      return;
    }
    fs.writeFileSync(probePath, probeState.bytes);
  } catch (error) {
    warn(`تعذّر استرجاع ملف التحقيق: ${error.message}`);
  }
}

function main() {
  console.log('installer upgrade test — 2.2.0 → 2.2.1 (silent /S /D=, in-place, no data loss)');

  if (process.platform !== 'win32') {
    console.log(`\nتخطي: هذا الاختبار لويندوز فقط (المنصة الحالية: ${process.platform}).`);
    console.log(`SKIP: Windows only (current platform: ${process.platform}).`);
    return 0;
  }

  const oldInstaller = findInstaller(OLD_PATTERN);
  const newInstaller = findInstaller(NEW_PATTERN);
  if (!oldInstaller || !newInstaller) {
    console.log('\nتخطي: مثبّت 2.2.0 أو 2.2.1 غير موجود في release/');
    console.log('SKIP: installer 2.2.0 or 2.2.1 not found in release/ (build both versions first).');
    if (oldInstaller) console.log(`   الموجود: ${path.basename(oldInstaller)}`);
    if (newInstaller) console.log(`   الموجود: ${path.basename(newInstaller)}`);
    return 0;
  }

  console.log(`   2.2.0: ${path.basename(oldInstaller)}`);
  console.log(`   2.2.1: ${path.basename(newInstaller)}`);

  const guid = uninstallKeyForAppId(APP_ID);
  // مجلد عمل خاص بالاختبار: نسخة .reg للسجل + مجلد التثبيت المستهدف.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmo-upgrade-'));
  const installDir = path.join(workDir, 'app');
  let regBackup = '';
  let probeState = { existed: false, bytes: null, expected: null };

  try {
    // ---------------------------------------------- 0) بيئة نظيفة؟
    step(`هوية الترقية: appId=${APP_ID} → مفتاح إزالة التثبيت ${guid}`);
    const preexisting = uninstallKeyExists(guid);
    if (preexisting && process.env.MMO_UPGRADE_TEST_FORCE !== '1') {
      console.log('\nتخطي: يوجد تثبيت حقيقي للتطبيق على هذا الجهاز (مفتاح إزالة التثبيت موجود).');
      console.log('SKIP: a real installation exists (uninstall key present); refusing to replace it.');
      console.log('      شغّل الاختبار على جهاز/حساب نظيف، أو اضبط MMO_UPGRADE_TEST_FORCE=1');
      console.log('      (سيُصدَّر مفتاح إزالة التثبيت ويُعاد بعد الاختبار).');
      return 0;
    }
    if (preexisting) {
      warn('تثبيت حقيقي موجود — سيُستبدل مؤقتًا ثم يُعاد مفتاح إزالة التثبيت من نسخة .reg');
      regBackup = path.join(workDir, 'uninstall-key-backup.reg');
      const exported = reg(['export', `${UNINSTALL_ROOT}\\${guid}`, regBackup, '/y']);
      if (!exported.ok) {
        warn('تعذّر تصدير مفتاح إزالة التثبيت — قد تفقد إدخال «التطبيقات» لهذا التطبيق بعد الاختبار.');
        regBackup = '';
      }
    }

    // ---------------------------------------- 1) تثبيت 2.2.0 صامتًا
    step(`تثبيت 2.2.0 صامتًا في ${installDir}`);
    const first = runInstaller(oldInstaller, installDir);
    if (!first.ok) {
      check(false, `فشل تثبيت 2.2.0: ${first.message}`);
      return 1;
    }
    const appExeBefore = findAppExe(installDir);
    if (!check(Boolean(appExeBefore), `وجود الملف التنفيذي بعد التثبيت (${appExeBefore ? path.basename(appExeBefore) : 'غير موجود'})`)) {
      return 1;
    }
    const beforeStat = fs.statSync(appExeBefore);

    // ---------------------------------------- 2) ملف تحقيق في بيانات المستخدم
    step(`مسار بيانات المستخدم الحقيقي: ${userDataDir}`);
    probeState.existed = fs.existsSync(probePath);
    if (probeState.existed) {
      try {
        probeState.bytes = fs.readFileSync(probePath);
        warn('ملف upgrade-probe.json موجود مسبقًا — سيُحفظ محتواه ويُعاد كما كان بعد الاختبار.');
      } catch (error) {
        probeState.bytes = null;
      }
    }
    const probe = {
      schema: 1,
      app: APP_ID,
      purpose: 'installer-upgrade-test',
      nonce: crypto.randomBytes(12).toString('hex'),
      version: '2.2.0',
      at: new Date().toISOString()
    };
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(probePath, JSON.stringify(probe, null, 2), 'utf8');
    probeState.expected = fs.readFileSync(probePath);
    ok(`زُرع ملف التحقيق (${probeState.expected.length} بايت) — بيانات المستخدم موجودة قبل الترقية`);

    const beforeEntries = countUninstallEntries(guid);
    const beforeVersion = readInstalledVersion(guid);
    if (beforeEntries !== null) console.log(`   إدخالات إزالة التثبيت قبل الترقية: ${beforeEntries}`);
    if (beforeVersion) console.log(`   الإصدار المسجّل قبل الترقية: ${beforeVersion}`);

    // ---------------------------------------- 3) تثبيت 2.2.1 فوقه
    step('تثبيت 2.2.1 فوق النسخة نفسها (نفس /D)');
    const second = runInstaller(newInstaller, installDir);
    if (!second.ok) {
      check(false, `فشل تثبيت 2.2.1: ${second.message}`);
      return 1;
    }

    // ---------------------------------------- 4) التحقق
    step('التحقق من الترقية في المكان');
    const appExeAfter = findAppExe(installDir);
    check(Boolean(appExeAfter), 'ما زال الملف التنفيذي في نفس مجلد التثبيت');
    check(appExeAfter === appExeBefore, 'لم يُنشأ تثبيت ثانٍ في مجلد آخر (نفس الملف التنفيذي)');

    if (appExeAfter) {
      const afterStat = fs.statSync(appExeAfter);
      const replaced = afterStat.mtimeMs !== beforeStat.mtimeMs || afterStat.size !== beforeStat.size;
      check(
        replaced,
        `الملف التنفيذي استُبدل فعليًا (mtime ${beforeStat.mtimeMs} → ${afterStat.mtimeMs}، الحجم ${beforeStat.size} → ${afterStat.size})`
      );
    }

    let probeIntact = false;
    try {
      const current = fs.readFileSync(probePath);
      probeIntact = Boolean(probeState.expected) && current.equals(probeState.expected);
    } catch (error) {
      probeIntact = false;
    }
    check(probeIntact, 'ملف التحقيق في %APPDATA% سليم بايت ببايت بعد الترقية (لم تُفقد البيانات)');

    const afterEntries = countUninstallEntries(guid);
    if (afterEntries !== null) {
      check(afterEntries === 1, `إدخال إزالة تثبيت واحد فقط لهذا التطبيق (العدد: ${afterEntries})`);
    } else {
      warn('لم يُتحقق من عدد إدخالات إزالة التثبيت (استعلام السجل غير متاح).');
    }

    const afterVersion = readInstalledVersion(guid);
    if (afterVersion) {
      const expectedVersion = (path.basename(newInstaller).match(/\d+\.\d+\.\d+/) || ['2.2.1'])[0];
      check(afterVersion === expectedVersion, `الإصدار المسجّل بعد الترقية ${afterVersion} (المتوقع ${expectedVersion})`);
    } else {
      warn('تعذّر قراءة DisplayVersion من السجل — تحقّق الإصدار غير متاح.');
    }

    // ---------------------------------------- 5) إزالة التثبيت + بقاء البيانات
    step('إزالة التثبيت صامتًا والتحقق من بقاء بيانات المستخدم');
    const uninstaller = findUninstaller(installDir);
    if (!uninstaller) {
      warn('لم تُوجد أداة إزالة التثبيت داخل مجلد الاختبار — سيُحذف المجلد فقط.');
    } else {
      const result = runUninstaller(uninstaller);
      if (!result.ok) warn(`تعذّر تشغيل أداة إزالة التثبيت: ${result.message}`);
      const removed = waitFor(() => !fs.existsSync(appExeBefore), 90000);
      if (removed) ok('أُزيل التثبيت المؤقت');
      else warn('ما زال الملف التنفيذي موجودًا بعد أداة إزالة التثبيت — سيُحذف المجلد يدويًا.');
    }
    check(fs.existsSync(probePath), 'بيانات المستخدم ما زالت موجودة بعد إزالة التثبيت (deleteAppDataOnUninstall: false)');
  } finally {
    // ---------------------------------------------------------- تنظيف
    step('تنظيف');
    try {
      if (fs.existsSync(installDir)) {
        fs.rmSync(installDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
        ok('حُذف مجلد التثبيت المؤقت');
      }
    } catch (error) {
      warn(`تعذّر حذف مجلد التثبيت المؤقت (${installDir}): ${error.message}`);
    }

    // السجل: أعِد مفتاح المستخدم إن كان موجودًا قبل الاختبار، أو نظّف مفتاح الاختبار.
    try {
      if (regBackup && fs.existsSync(regBackup)) {
        const imported = reg(['import', regBackup]);
        if (imported.ok) ok('أُعيد مفتاح إزالة التثبيت الأصلي');
        else warn('تعذّر إعادة مفتاح إزالة التثبيت من نسخة .reg');
      } else if (uninstallKeyExists(guid)) {
        const deleted = reg(['delete', `${UNINSTALL_ROOT}\\${guid}`, '/f']);
        if (!deleted.ok) warn('بقي إدخال إزالة التثبيت للاختبار في السجل — احذفه يدويًا إن أزعجك.');
      }
    } catch (error) {
      warn(`خطأ أثناء تنظيف السجل: ${error.message}`);
    }

    restoreProbe(probeState);

    // مجلد العمل كاملًا (خارج مجلد التثبيت، فلا يمسّه uninstaller).
    try {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      }
    } catch (error) {
      warn(`تعذّر حذف مجلد العمل المؤقت (${workDir}): ${error.message}`);
    }
  }

  // ------------------------------------------------------------- النتيجة
  console.log('');
  if (warnings.length) {
    console.log(`⚠ تحذيرات (${warnings.length}):`);
    warnings.forEach((message) => console.log(`   - ${message}`));
  }
  if (failures) {
    console.error(`✖ فشل اختبار ترقية المثبّت — ${failures} فحص/فحوص لم تنجح.`);
    return 1;
  }
  console.log('✓ الترقية في المكان ناجحة: 2.2.1 حلّت محل 2.2.0 دون فقد بيانات.');
  return 0;
}

let code = 1;
try {
  code = main();
} catch (error) {
  console.error('\n✖ خطأ غير متوقع في اختبار الترقية:');
  console.error(error && error.stack ? error.stack : error);
  code = 1;
}
process.exit(code);
