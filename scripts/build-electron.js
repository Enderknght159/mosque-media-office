#!/usr/bin/env node
'use strict';

/* بناء نسخة سطح المكتب عبر electron-builder.
 *
 * الاستخدام:
 *   node scripts/build-electron.js               # مثبّت NSIS + نسخة محمولة
 *   node scripts/build-electron.js --installer   # مثبّت NSIS فقط
 *   node scripts/build-electron.js --portable    # نسخة محمولة فقط
 *   node scripts/build-electron.js --dir         # مجلد غير مضغوط (بدون مثبّت)
 *   node scripts/build-electron.js --icons       # توليد الأيقونات فقط (تجربة سريعة)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'assets');
const LOGO_SVG = path.join(ASSETS_DIR, 'logo.svg');
const ICON_PNG = path.join(ASSETS_DIR, 'icon.png');
const ICON_ICO = path.join(ASSETS_DIR, 'icon.ico');
const OUTPUT_DIR = path.join(ROOT, 'release');
const ICON_SIZE = 1024;
const MAX_ICON_BYTES = 200 * 1024;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const BRAND = { from: '#0b6b57', to: '#0e8a70' };

const flags = new Set(process.argv.slice(2).map((item) => String(item).toLowerCase()));

function log(message) {
  console.log(message);
}

function humanSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} بايت`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} كيلوبايت`;
  return `${(value / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function fatal(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// ------------------------------------------------------------------ icons

function iconSvg(size = ICON_SIZE) {
  const ratio = size / ICON_SIZE;
  const radius = Math.round(224 * ratio);
  // الشعار مرسوم داخل مربع 64×64؛ نكبّره ونوسّطه على المساحة الفعلية للرسم (الخطوط البيضاء).
  const tx = 16 * ratio;
  const ty = 68 * ratio;
  const art = 15.5 * ratio;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="mmo-bg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop stop-color="${BRAND.from}"/>
      <stop offset="1" stop-color="${BRAND.to}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#mmo-bg)"/>
  <g transform="translate(${tx} ${ty}) scale(${art})" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="14.5" r="2.2" fill="#ffffff" stroke="none"/>
    <path d="M17 45V31.5C17 23.5 23.6 17 32 17s15 6.5 15 14.5V45"/>
    <path d="M26.5 45v-8.5a5.5 5.5 0 0 1 11 0V45"/>
    <path d="M13.5 45h37"/>
  </g>
</svg>`;
}

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  entries.forEach((entry, index) => {
    const base = index * 16;
    const dimension = entry.size >= 256 ? 0 : entry.size;
    directory.writeUInt8(dimension, base + 0);
    directory.writeUInt8(dimension, base + 1);
    directory.writeUInt8(0, base + 2);
    directory.writeUInt8(0, base + 3);
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(entry.data.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += entry.data.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
}

async function generateIcons({ force = false } = {}) {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
  if (!fs.existsSync(LOGO_SVG)) {
    throw new Error(`الشعار غير موجود: ${path.relative(ROOT, LOGO_SVG)}`);
  }

  const pngReady = fs.existsSync(ICON_PNG) && fs.statSync(ICON_PNG).size > 0;
  const icoReady = fs.existsSync(ICON_ICO) && fs.statSync(ICON_ICO).size > 0;
  if (!force && pngReady && icoReady) {
    log(`• الأيقونات موجودة مسبقًا: assets/icon.png (${humanSize(fs.statSync(ICON_PNG).size)}) · assets/icon.ico (${humanSize(fs.statSync(ICON_ICO).size)})`);
    return;
  }

  let sharp;
  try {
    sharp = require('sharp');
  } catch (error) {
    throw new Error(
      'تعذر توليد الأيقونة لأن الحزمة sharp غير مثبتة.\n'
      + '  نفّذ: npm install --save-dev sharp --no-audit --no-fund\n'
      + '  أو أضف assets/icon.png يدويًا بمقاس 1024×1024 ثم أعد البناء.'
    );
  }

  const master = await sharp(Buffer.from(iconSvg(ICON_SIZE)))
    .resize(ICON_SIZE, ICON_SIZE, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  if (!force && pngReady) {
    log(`• assets/icon.png موجود (${humanSize(fs.statSync(ICON_PNG).size)})`);
  } else {
    fs.writeFileSync(ICON_PNG, master);
    const pngSize = fs.statSync(ICON_PNG).size;
    if (pngSize > MAX_ICON_BYTES) {
      log(`⚠ حجم أيقونة PNG كبير نسبيًا: ${humanSize(pngSize)}`);
    }
    log(`✓ assets/icon.png — ${ICON_SIZE}×${ICON_SIZE} · ${humanSize(pngSize)}`);
  }

  try {
    const entries = [];
    for (const size of ICO_SIZES) {
      const data = await sharp(master).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      entries.push({ size, data });
    }
    fs.writeFileSync(ICON_ICO, buildIco(entries));
    log(`✓ assets/icon.ico — ${ICO_SIZES.join(', ')} · ${humanSize(fs.statSync(ICON_ICO).size)}`);
  } catch (error) {
    log(`⚠ تعذر توليد assets/icon.ico (${error.message}). سيُستخدم icon.png في البناء.`);
  }
}

// ------------------------------------------------------------------ build

function requestedTargets() {
  if (flags.has('--dir')) return { label: 'مجلد غير مضغوط (unpacked)', types: ['dir'] };
  if (flags.has('--portable')) return { label: 'نسخة محمولة (portable)', types: ['portable'] };
  if (flags.has('--installer')) return { label: 'مثبّت NSIS', types: ['nsis'] };
  return { label: 'مثبّت NSIS + نسخة محمولة', types: ['nsis', 'portable'] };
}

function collectArtifacts(returned) {
  const found = new Set();
  (Array.isArray(returned) ? returned : []).forEach((item) => {
    if (item && typeof item === 'string') found.add(path.resolve(item));
  });
  if (fs.existsSync(OUTPUT_DIR)) {
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (/\.(exe|msi|appx|7z|zip)$/i.test(entry.name)) found.add(absolute);
      }
    };
    walk(OUTPUT_DIR);
  }
  return [...found].filter((file) => fs.existsSync(file)).sort();
}

async function main() {
  if (flags.has('--help') || flags.has('-h')) {
    log('الاستخدام: node scripts/build-electron.js [--installer|--portable|--dir|--icons]');
    return;
  }

  log('المكتب الإعلامي — بناء نسخة سطح المكتب');
  log('────────────────────────────────────────');

  if (flags.has('--icons')) {
    try {
      await generateIcons({ force: true });
    } catch (error) {
      fatal(error.message);
    }
    return;
  }

  try {
    await generateIcons();
  } catch (error) {
    fatal(error.message);
  }

  if (!fs.existsSync(ICON_PNG)) {
    fatal('الأيقونة assets/icon.png غير متوفرة، ولا يمكن توليدها. أضف الأيقونة ثم أعد المحاولة.');
  }

  let electronBuilder;
  try {
    electronBuilder = require('electron-builder');
  } catch (error) {
    fatal('حزمة electron-builder غير مثبتة.\n  نفّذ: npm install --save-dev electron-builder --no-audit --no-fund');
  }

  const { build, Platform, DIR_TARGET } = electronBuilder;
  const choice = requestedTargets();
  const types = choice.types.includes('dir') ? [DIR_TARGET] : choice.types;
  const targets = Platform.WINDOWS.createTarget(types);

  log(`• الهدف: ${choice.label}`);
  log(`• مخرجات البناء: ${path.relative(ROOT, OUTPUT_DIR)}\\`);
  log('• قد يستغرق أول بناء عدة دقائق لتنزيل أدوات electron-builder.');

  let artifacts = [];
  try {
    artifacts = await build({
      projectDir: ROOT,
      targets,
      config: path.join(ROOT, 'electron-builder.yml')
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    fatal('فشل البناء. تحقّق من اتصال الإنترنت (لتنزيل الأدوات) ومن سلامة electron-builder.yml.');
  }

  const files = collectArtifacts(artifacts);
  const unpackedDir = path.join(OUTPUT_DIR, 'win-unpacked');
  const hasUnpacked = fs.existsSync(unpackedDir);

  log('\n✓ اكتمل البناء.');
  log(`مجلد المخرجات: ${OUTPUT_DIR}`);

  if (hasUnpacked) {
    log('مجلد التطبيق غير المضغوط:');
    log(`  - ${path.relative(ROOT, unpackedDir)}\\`);
    const exe = fs.readdirSync(unpackedDir).find((name) => /\.exe$/i.test(name));
    if (exe) log(`      ${exe} — ${humanSize(fs.statSync(path.join(unpackedDir, exe)).size)}`);
  }

  if (!files.length) {
    if (!hasUnpacked) log('لم يُعثر على ملفات نهائية في مجلد المخرجات. راجع سجل البناء أعلاه.');
    return;
  }
  log('الملفات الناتجة:');
  files.forEach((file) => {
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch (error) {}
    log(`  - ${path.relative(ROOT, file)} — ${humanSize(size)}`);
  });
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  fatal('حدث خطأ غير متوقع أثناء البناء.');
});
