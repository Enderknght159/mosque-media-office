'use strict';

/**
 * Verified move engine (archive / restore) + the 7-day trash.
 *
 * Contract
 * --------
 * archive:start({ type:'archive'|'restore', taskId, section, from, to, rel, sectionRel })
 *   -> { ok:true, data:{ jobId } }   and then works asynchronously
 * archive:cancel({ jobId })          -> { cancelled }
 * archive:restore(payload)           -> same engine with type:'restore'
 * archive:reconcile({ repoPath })    -> { pending:[{ taskId, section, reason }] }
 * trash:move/list/restore/delete/purge
 *
 * Guarantees
 * ----------
 * 1. No byte is removed from the source before every copied file has been re-read
 *    from the destination and matched against its SHA-256 + size.
 * 2. Any failure or cancellation keeps the source intact and only removes the
 *    temporary `.incoming` part files and the final files this job created.
 * 3. Path safety always goes through repo.js `resolveInside` / `assertRepoDir`.
 * 4. The receipt is written before the source is deleted, so a crash leaves a
 *    reconcilable state instead of silent data loss.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Transform, pipeline } = require('stream');
const { promisify } = require('util');

const repo = require('./repo');

const pipelineAsync = promisify(pipeline);

const { assertRepoDir, resolveInside, writeJsonAtomic, isDir, OUTPUT_DIR, STATUS_DIR } = repo;

const ARCHIVE_DIR = '.mmo-archive';
const TRASH_DIR = '.trash';
const INCOMING_DIR = '.incoming';

const SECTIONS = new Set(['sources', OUTPUT_DIR, STATUS_DIR]);
const SECTION_LIST = ['sources', OUTPUT_DIR, STATUS_DIR];

// Never touched when a task folder is walked for its `sources` section.
const RESERVED_ROOT_ENTRIES = new Set([
  OUTPUT_DIR,
  STATUS_DIR,
  TRASH_DIR,
  ARCHIVE_DIR,
  INCOMING_DIR
]);

const CHANNELS = {
  PROGRESS: 'mmo:archive:progress',
  DONE: 'mmo:archive:done',
  TRASH: 'mmo:trash:changed'
};

const PROGRESS_INTERVAL_MS = 200;
const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FREE_SPACE_BASE_MARGIN = 200 * 1024 * 1024;
const FREE_SPACE_RATIO_MARGIN = 0.02;
const MAX_RECORD_CHARS = 512 * 1024;
const COPY_CHUNK = 1024 * 1024;

// ------------------------------------------------------------------ state

/** jobId -> job */
const jobs = new Map();
/** resolved destination root (lowercase) -> jobId (one move per disk) */
const destLocks = new Map();

let getWindowRef = () => null;
let sendOverride = null;

/** Test-only hook, called after a destination file was re-read and matched. */
let verifyHook = null;

function setVerifyHook(fn) {
  verifyHook = typeof fn === 'function' ? fn : null;
}

// -------------------------------------------------------------- utilities

function makeError(message, code) {
  const error = new Error(message);
  if (code) error.code = code;
  return error;
}

function abortError() {
  return makeError('أُلغيت عملية النقل. لم يُحذف أي شيء من المصدر.', 'cancelled');
}

function nowISO() {
  return new Date().toISOString();
}

function splitRel(value) {
  return String(value == null ? '' : value).split(/[\\/]+/).filter(Boolean);
}

function joinRel(parts) {
  return parts.filter(Boolean).join(path.sep);
}

function posixRel(parts) {
  return parts.filter(Boolean).join('/');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function cleanId(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '') || 'id';
}

function samePath(a, b) {
  const left = path.resolve(String(a || ''));
  const right = path.resolve(String(b || ''));
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function nestedInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (!relative) return false;
  if (path.isAbsolute(relative)) return false;
  return !relative.split(/[\\/]+/).includes('..');
}

function formatBytes(bytes) {
  const units = ['بايت', 'ك.ب', 'م.ب', 'غ.ب', 'ت.ب'];
  let value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${Math.round(value)} بايت`;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return null;
  }
}

function unlinkQuiet(file) {
  try {
    fs.unlinkSync(file);
  } catch (error) {}
}

async function rmQuiet(target) {
  try {
    await fs.promises.rm(target, { recursive: true, force: true, maxRetries: 3 });
  } catch (error) {}
}

// ---------------------------------------------------------------- events

function sendEvent(channel, payload) {
  if (typeof sendOverride === 'function') {
    try {
      sendOverride(channel, payload);
    } catch (error) {}
    return;
  }
  try {
    const win = typeof getWindowRef === 'function' ? getWindowRef() : null;
    if (!win) return;
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) return;
    const contents = win.webContents;
    if (!contents) return;
    if (typeof contents.isDestroyed === 'function' && contents.isDestroyed()) return;
    contents.send(channel, payload);
  } catch (error) {}
}

function emitTrashChanged(repoPath) {
  sendEvent(CHANNELS.TRASH, { repoPath });
}

/** Throttled ~200ms progress reporter for one job. */
function makeReporter(job) {
  let lastSentAt = 0;
  let timer = null;
  let pending = null;

  function flush() {
    timer = null;
    if (!pending) return;
    const payload = pending;
    pending = null;
    lastSentAt = Date.now();
    sendEvent(CHANNELS.PROGRESS, payload);
  }

  return {
    report(phase, extra = {}, force = false) {
      const entry = extra || {};
      pending = {
        jobId: job.jobId,
        phase,
        file: entry.file || '',
        filesDone: job.filesDone,
        filesTotal: job.filesTotal,
        bytesDone: job.bytesDone,
        bytesTotal: job.bytesTotal
      };
      const now = Date.now();
      if (force || now - lastSentAt >= PROGRESS_INTERVAL_MS) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        flush();
        return;
      }
      if (!timer) {
        timer = setTimeout(flush, PROGRESS_INTERVAL_MS);
        if (typeof timer.unref === 'function') timer.unref();
      }
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    }
  };
}

function emitDone(job, ok, error, data, code) {
  const payload = {
    jobId: job.jobId,
    ok: Boolean(ok),
    data: data || { bytes: 0, files: 0, receipt: '' }
  };
  if (!ok) {
    payload.error = error || 'فشلت عملية النقل. لم يُحذف أي شيء من المصدر.';
    if (code) payload.code = code;
  }
  sendEvent(CHANNELS.DONE, payload);
}

// -------------------------------------------------------------- filesystem

async function hashFile(abs, signal) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(abs, { highWaterMark: COPY_CHUNK });
    // A destroyed stream may still surface its pending `open` error later; keep a
    // permanent listener so a late ENOENT can never crash the main process.
    stream.on('error', () => {});
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      stream.destroy(abortError());
    };
    const cleanup = () => {
      settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(abortError());
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', (error) => {
      cleanup();
      reject(signal && signal.aborted ? abortError() : error);
    });
    stream.on('end', () => {
      cleanup();
      resolve(hash.digest('hex'));
    });
  });
}

async function fsyncFile(abs) {
  const handle = await fs.promises.open(abs, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function freeBytes(root) {
  try {
    if (typeof fs.promises.statfs !== 'function') return null;
    const stats = await fs.promises.statfs(root);
    const blockSize = Number(stats.bsize) || 0;
    const availableBlocks = Number(stats.bavail ?? stats.bfree);
    if (!blockSize || !Number.isFinite(availableBlocks)) return null;
    return blockSize * Math.max(0, availableBlocks);
  } catch (error) {
    return null;
  }
}

/**
 * Collects a tree: every file (size + mtime) and every *empty* directory.
 * Non-empty directories are recreated implicitly by their files.
 * Symlinks are ignored on purpose (never followed outside the repo).
 */
async function collectTree(abs, relParts, acc) {
  const info = await fs.promises.lstat(abs);
  if (info.isSymbolicLink()) return;
  if (info.isDirectory()) {
    const children = await fs.promises.readdir(abs, { withFileTypes: true });
    if (!children.length) acc.dirs.push({ rel: joinRel(relParts), abs });
    for (const child of children) {
      await collectTree(path.join(abs, child.name), [...relParts, child.name], acc);
    }
    return;
  }
  if (!info.isFile()) return;
  acc.files.push({ rel: joinRel(relParts), abs, size: info.size, mtimeMs: info.mtimeMs });
}

async function measureTree(abs, acc = { bytes: 0, files: 0 }) {
  let info = null;
  try {
    info = await fs.promises.lstat(abs);
  } catch (error) {
    return acc;
  }
  if (info.isSymbolicLink()) return acc;
  if (info.isFile()) {
    acc.bytes += info.size;
    acc.files += 1;
    return acc;
  }
  if (!info.isDirectory()) return acc;
  let children = [];
  try {
    children = await fs.promises.readdir(abs, { withFileTypes: true });
  } catch (error) {
    return acc;
  }
  for (const child of children) await measureTree(path.join(abs, child.name), acc);
  return acc;
}

/** rename, or copy-with-verification + delete across volumes. */
async function movePath(srcAbs, destAbs) {
  await fs.promises.mkdir(path.dirname(destAbs), { recursive: true });
  try {
    await fs.promises.rename(srcAbs, destAbs);
    return 'rename';
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
  }
  await copyTreeVerified(srcAbs, destAbs);
  await fs.promises.rm(srcAbs, { recursive: true, force: true, maxRetries: 3 });
  return 'copy';
}

async function copyTreeVerified(srcAbs, destAbs) {
  const acc = { files: [], dirs: [] };
  await collectTree(srcAbs, [], acc);
  for (const dir of acc.dirs) await fs.promises.mkdir(path.join(destAbs, dir.rel), { recursive: true });
  for (const file of acc.files) {
    const target = path.join(destAbs, file.rel);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.mmo-part`;
    await copyStreamHashed(file.abs, temp, null, null);
    const digest = await hashFile(temp, null);
    const sourceDigest = await hashFile(file.abs, null);
    if (digest !== sourceDigest) {
      await rmQuiet(temp);
      throw makeError(`تعذر التحقق من الملف بعد النسخ: «${file.rel}».`, 'verify-hash');
    }
    try {
      const when = new Date(file.mtimeMs || Date.now());
      await fs.promises.utimes(temp, when, when);
    } catch (error) {}
    await fs.promises.rename(temp, target);
  }
}

async function copyStreamHashed(srcAbs, destAbs, onBytes, signal) {
  if (signal && signal.aborted) throw abortError();
  const hash = crypto.createHash('sha256');
  const meter = new Transform({
    highWaterMark: COPY_CHUNK,
    transform(chunk, encoding, callback) {
      hash.update(chunk);
      if (typeof onBytes === 'function') onBytes(chunk.length);
      callback(null, chunk);
    }
  });
  const reader = fs.createReadStream(srcAbs, { highWaterMark: COPY_CHUNK });
  const writer = fs.createWriteStream(destAbs, { flags: 'w' });
  // Pipeline detaches its own listeners; keep a permanent noop handler on both
  // streams so a late error from an aborted open can never crash the process.
  reader.on('error', () => {});
  writer.on('error', () => {});
  const onAbort = () => {
    reader.destroy(abortError());
    writer.destroy(abortError());
  };
  if (signal) {
    if (signal.aborted) {
      reader.destroy(abortError());
      throw abortError();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    await pipelineAsync(reader, meter, writer);
  } catch (error) {
    throw signal && signal.aborted ? abortError() : error;
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
  }
  return hash.digest('hex');
}

// ------------------------------------------------------------- archive index

function indexPath(root) {
  return path.join(root, ARCHIVE_DIR, 'index.json');
}

function receiptDir(root) {
  return path.join(root, ARCHIVE_DIR, 'index');
}

function readIndexSummary(root) {
  const raw = readJsonFile(indexPath(root));
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) {
    return { schema: 1, updatedAt: '', entries: [] };
  }
  return {
    schema: 1,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    entries: raw.entries.filter((entry) => entry && typeof entry === 'object')
  };
}

function writeReceipt(root, receipt) {
  const safeTask = cleanId(receipt.taskId);
  const dir = receiptDir(root);
  const canonical = path.join(dir, `${safeTask}.json`);
  writeJsonAtomic(canonical, receipt);
  // Per-section copy keeps the receipts of the other sections durable.
  try {
    writeJsonAtomic(path.join(dir, `${safeTask}.${cleanId(receipt.section)}.json`), receipt);
  } catch (error) {}

  const summary = readIndexSummary(root);
  summary.entries = summary.entries.filter((entry) => !(
    String(entry.taskId || '') === String(receipt.taskId || '')
    && String(entry.section || '') === String(receipt.section || '')
  ));
  summary.entries.push({
    taskId: receipt.taskId,
    section: receipt.section,
    rel: receipt.rel,
    sourceRel: receipt.sourceRel,
    destRel: receipt.destRel,
    repoId: receipt.repoId,
    bytes: receipt.bytes,
    files: Array.isArray(receipt.files) ? receipt.files.length : 0,
    at: receipt.at,
    receipt: path.join(ARCHIVE_DIR, 'index', `${safeTask}.json`),
    source: receipt.source
  });
  summary.updatedAt = nowISO();
  writeJsonAtomic(indexPath(root), summary);
  return path.join(ARCHIVE_DIR, 'index', `${safeTask}.json`);
}

function dropIndexEntry(root, taskId, section) {
  try {
    const summary = readIndexSummary(root);
    const before = summary.entries.length;
    summary.entries = summary.entries.filter((entry) => !(
      String(entry.taskId || '') === String(taskId || '')
      && String(entry.section || '') === String(section || '')
    ));
    if (summary.entries.length !== before) {
      summary.updatedAt = nowISO();
      writeJsonAtomic(indexPath(root), summary);
    }
  } catch (error) {}
}

// ------------------------------------------------------------- prepare job

function normalizeSectionRel(payload, section) {
  const parts = splitRel(payload.sectionRel || payload.rel || '');
  if (!parts.length) throw makeError('مسار القسم مطلوب.', 'rel-required');
  // `sources` uses the task folder itself; the other sections may arrive either
  // with or without the trailing section segment.
  if (section === 'sources') return parts;
  const last = parts[parts.length - 1].toLowerCase();
  if (last === section) return parts;
  return [...parts, section];
}

async function prepareJob(payload = {}) {
  // Reserve the destination disk before the (async) pre-flight so two concurrent
  // starts can never target the same drive.
  const reservedRoot = assertRepoDir(payload.to?.path);
  const reservedKey = path.resolve(reservedRoot).toLowerCase();
  if (destLocks.has(reservedKey)) {
    throw makeError('هناك عملية نقل جارية إلى نفس المستودع. انتظر انتهاءها ثم أعد المحاولة.', 'busy');
  }
  const reservation = `res_${crypto.randomBytes(4).toString('hex')}`;
  destLocks.set(reservedKey, reservation);
  try {
    return await buildJobPlan(payload);
  } catch (error) {
    if (destLocks.get(reservedKey) === reservation) destLocks.delete(reservedKey);
    throw error;
  }
}

async function buildJobPlan(payload = {}) {
  const type = payload.type === 'restore' ? 'restore' : 'archive';
  const section = String(payload.section || '').trim().toLowerCase();
  if (!SECTIONS.has(section)) {
    throw makeError('قسم غير معروف. اختر المصادر أو المخرجات أو opencode.', 'section-invalid');
  }
  const taskId = String(payload.taskId || '').trim();
  if (!taskId) throw makeError('معرّف المهمة مطلوب لبدء النقل.', 'task-required');

  const fromRoot = assertRepoDir(payload.from?.path);
  const toRoot = assertRepoDir(payload.to?.path);
  if (samePath(fromRoot, toRoot) || nestedInside(fromRoot, toRoot) || nestedInside(toRoot, fromRoot)) {
    throw makeError('لازم يكون مستودع الوجهة منفصلًا تمامًا عن المستودع المصدر.', 'repo-overlap');
  }

  const sourceParts = normalizeSectionRel(payload, section);
  const sourceRel = joinRel(sourceParts);
  const srcAbs = resolveInside(fromRoot, sourceRel);
  if (samePath(srcAbs, fromRoot)) {
    throw makeError('لا يمكن نقل جذر المستودع نفسه.', 'rel-root');
  }
  if (!isDir(srcAbs)) {
    throw makeError('مجلد القسم غير موجود في المستودع المصدر.', 'source-missing');
  }
  const destBase = resolveInside(toRoot, sourceRel);
  if (samePath(destBase, toRoot)) {
    throw makeError('لا يمكن النقل فوق جذر المستودع.', 'rel-root');
  }

  // ------------------------------------------------------------ enumeration
  const acc = { files: [], dirs: [] };
  let movedEntries = [];
  if (section === 'sources') {
    const children = await fs.promises.readdir(srcAbs, { withFileTypes: true });
    const names = children
      .map((child) => child.name)
      .filter((name) => !RESERVED_ROOT_ENTRIES.has(String(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, 'ar'));
    if (!names.length) throw makeError('لا توجد ملفات في هذا القسم.', 'empty-section');
    movedEntries = names.map((name) => path.join(srcAbs, name));
    for (const name of names) await collectTree(path.join(srcAbs, name), [name], acc);
  } else {
    movedEntries = [srcAbs];
    await collectTree(srcAbs, [], acc);
  }

  if (!acc.files.length && !acc.dirs.length) {
    throw makeError('لا توجد ملفات في هذا القسم.', 'empty-section');
  }

  const files = acc.files.map((file) => {
    const relParts = splitRel(file.rel);
    const destParts = [...sourceParts, ...relParts];
    return {
      rel: file.rel,
      sourceAbs: file.abs,
      size: file.size,
      mtimeMs: file.mtimeMs,
      destAbs: resolveInside(toRoot, joinRel(destParts)),
      destRel: joinRel(destParts),
      partAbs: '',
      sha256: '',
      copiedBytes: 0,
      alreadyCopied: false,
      committed: false
    };
  });
  const dirs = acc.dirs.map((dir) => {
    const destParts = [...sourceParts, ...splitRel(dir.rel)];
    return {
      rel: dir.rel,
      destAbs: resolveInside(toRoot, joinRel(destParts)),
      destRel: joinRel(destParts),
      created: false
    };
  });

  const bytesTotal = files.reduce((sum, file) => sum + file.size, 0);

  // ------------------------------------------------------------- pre-flight
  const free = await freeBytes(toRoot);
  if (free !== null) {
    const margin = Math.max(FREE_SPACE_BASE_MARGIN, Math.ceil(bytesTotal * FREE_SPACE_RATIO_MARGIN));
    if (free < bytesTotal + margin) {
      throw makeError(
        `مساحة الوجهة لا تكفي: المطلوب ${formatBytes(bytesTotal + margin)} والمتاح ${formatBytes(free)}. لم يُنقل أي ملف.`,
        'no-space'
      );
    }
  }

  const incomingRoot = path.join(toRoot, INCOMING_DIR);
  try {
    await fs.promises.mkdir(incomingRoot, { recursive: true });
    const probe = path.join(incomingRoot, `.mmo-probe-${process.pid}-${Date.now().toString(36)}`);
    await fs.promises.writeFile(probe, 'ok');
    await fs.promises.unlink(probe);
  } catch (error) {
    throw makeError('مجلد الوجهة غير قابل للكتابة. تحقق من صلاحيات الهارد ثم أعد المحاولة.', 'dest-not-writable');
  }

  // --------------------------------------------------------------- conflict
  // Merging into an existing destination folder is expected: a task may be
  // archived section by section into the same `<task>/` folder. Only individual
  // destination paths can conflict, and nothing is ever overwritten.
  // A file that already exists with the same size + SHA-256 counts as already
  // copied: it is kept, verified again before the source is deleted, and its
  // hash goes into the receipt like any other file.
  const conflicts = [];
  for (const file of files) {
    let stat = null;
    try {
      stat = await fs.promises.lstat(file.destAbs);
    } catch (error) {
      stat = null;
    }
    if (!stat) continue;
    if (!stat.isFile()) {
      conflicts.push({ rel: file.destRel, reason: 'type' });
      continue;
    }
    if (stat.size !== file.size) {
      conflicts.push({ rel: file.destRel, reason: 'size' });
      continue;
    }
    const destinationHash = await hashFile(file.destAbs, null);
    const sourceHash = await hashFile(file.sourceAbs, null);
    if (destinationHash !== sourceHash) {
      conflicts.push({ rel: file.destRel, reason: 'hash' });
      continue;
    }
    file.sha256 = destinationHash;
    file.alreadyCopied = true;
  }
  for (const dir of dirs) {
    if (fs.existsSync(dir.destAbs) && !isDir(dir.destAbs)) {
      conflicts.push({ rel: dir.destRel, reason: 'type' });
    }
  }
  if (conflicts.length) {
    const first = conflicts[0];
    const names = conflicts.slice(0, 3).map((item) => `«${item.rel}»`).join('، ');
    const reason = first.reason === 'size'
      ? 'بحجم مختلف'
      : first.reason === 'hash'
        ? 'بمحتوى مختلف'
        : 'بتعارض في النوع (ملف/مجلد)';
    throw makeError(
      `الوجهة تحتوي ${names} ${reason}. لم يُكتب فوق أي ملف ولم يُحذف من المصدر شيء. أزل الملفات المتعارضة أو اختر وجهة أخرى.`,
      'conflict'
    );
  }

  // ------------------------------------------------------------------- lock
  const lockKey = path.resolve(toRoot).toLowerCase();
  if (destLocks.get(lockKey) == null) {
    // Reaching here without the reservation means prepareJob was bypassed.
    throw makeError('هناك عملية نقل جارية إلى نفس المستودع. انتظر انتهاءها ثم أعد المحاولة.', 'busy');
  }

  const jobId = `arc_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  const controller = new AbortController();
  const job = {
    jobId,
    type,
    taskId,
    section,
    rel: joinRel(splitRel(payload.rel || '')),
    sourceParts,
    sourceRel,
    srcAbs,
    destBase,
    fromRoot,
    toRoot,
    from: payload.from || {},
    to: payload.to || {},
    movedEntries,
    files,
    dirs,
    bytesTotal,
    bytesDone: 0,
    filesDone: 0,
    filesTotal: files.length,
    incomingRoot,
    parts: [],
    committedFiles: [],
    lockKey,
    controller,
    signal: controller.signal,
    report: null
  };
  job.report = makeReporter(job);
  return job;
}

// ---------------------------------------------------------------- job steps

function ensureNotAborted(job) {
  if (job.signal.aborted) throw abortError();
}

function release(job) {
  jobs.delete(job.jobId);
  if (destLocks.get(job.lockKey) === job.jobId) destLocks.delete(job.lockKey);
}

function cleanupIncoming(job) {
  for (const part of job.parts) unlinkQuiet(part);
  job.parts = [];
  try {
    if (!fs.readdirSync(job.incomingRoot).length) fs.rmdirSync(job.incomingRoot);
  } catch (error) {}
}

async function copyPhase(job) {
  job.report.report('copy', {}, true);
  let index = 0;
  for (const item of job.files) {
    ensureNotAborted(job);
    if (item.alreadyCopied) {
      // Already written by an earlier run and hash-matched in the pre-flight.
      job.bytesDone += item.size;
      job.filesDone += 1;
      job.report.report('copy', { file: item.destRel });
      continue;
    }
    index += 1;
    item.partAbs = path.join(job.incomingRoot, `${job.jobId}-${index}.part`);
    job.parts.push(item.partAbs);
    job.report.report('copy', { file: item.destRel }, true);
    const sha = await copyStreamHashed(item.sourceAbs, item.partAbs, (length) => {
      job.bytesDone += length;
      job.report.report('copy', { file: item.destRel });
    }, job.signal);
    item.sha256 = sha;
    await fsyncFile(item.partAbs);
    job.filesDone += 1;
    job.report.report('copy', { file: item.destRel });
  }
}

async function verifyPhase(job) {
  job.report.report('verify', {}, true);
  job.filesDone = 0;
  job.bytesDone = job.bytesTotal;
  for (const item of job.files) {
    ensureNotAborted(job);
    const target = item.alreadyCopied ? item.destAbs : item.partAbs;
    let stat = null;
    try {
      stat = await fs.promises.stat(target);
    } catch (error) {
      stat = null;
    }
    if (!stat) {
      throw makeError(
        `ملف التحقق مفقود قبل المقارنة: «${item.destRel}». لم يُحذف أي شيء من المصدر.`,
        'verify-missing'
      );
    }
    if (stat.size !== item.size) {
      throw makeError(
        `حجم الملف بعد النسخ لا يطابق الأصل: «${item.destRel}». لم يُحذف أي شيء من المصدر.`,
        'verify-size'
      );
    }
    const digest = await hashFile(target, job.signal);
    if (digest !== item.sha256) {
      throw makeError(
        `تعذر التحقق من الملف بعد النسخ: «${item.destRel}». لم يُحذف أي شيء من المصدر.`,
        'verify-hash'
      );
    }
    item.sha256 = digest;
    if (verifyHook) {
      await verifyHook({
        jobId: job.jobId,
        type: job.type,
        file: item.destRel,
        rel: item.rel,
        size: item.size,
        sha256: digest,
        alreadyCopied: Boolean(item.alreadyCopied),
        aborted: job.signal.aborted,
        signal: job.signal,
        partAbs: item.partAbs,
        sourceAbs: item.sourceAbs
      });
    }
    ensureNotAborted(job);
    job.filesDone += 1;
    job.report.report('verify', { file: item.destRel });
  }
}

async function commitPhase(job) {
  job.report.report('commit', {}, true);
  for (const dir of job.dirs) {
    ensureNotAborted(job);
    await fs.promises.mkdir(dir.destAbs, { recursive: true });
    dir.created = true;
  }
  job.filesDone = 0;
  for (const item of job.files) {
    ensureNotAborted(job);
    if (item.alreadyCopied) {
      job.filesDone += 1;
      job.report.report('commit', { file: item.destRel });
      continue;
    }
    await fs.promises.mkdir(path.dirname(item.destAbs), { recursive: true });
    if (fs.existsSync(item.destAbs)) {
      throw makeError(
        `ظهر ملف بنفس الاسم في الوجهة قبل الإنهاء: «${item.destRel}». لم يُحذف من المصدر شيء.`,
        'conflict'
      );
    }
    const when = new Date(item.mtimeMs || Date.now());
    try {
      await fs.promises.utimes(item.partAbs, when, when);
    } catch (error) {}
    await fs.promises.rename(item.partAbs, item.destAbs);
    job.parts = job.parts.filter((part) => part !== item.partAbs);
    item.committed = true;
    job.committedFiles.push(item);
    job.filesDone += 1;
    job.report.report('commit', { file: item.destRel });
  }
}

function buildReceipt(job) {
  return {
    schema: 1,
    taskId: job.taskId,
    section: job.section,
    repoId: String(job.to.repoId || ''),
    rel: job.rel,
    at: nowISO(),
    bytes: job.bytesTotal,
    files: job.files.map((item) => ({
      path: posixRel(splitRel(item.destRel)),
      sourcePath: posixRel([...job.sourceParts, ...splitRel(item.rel)]),
      size: item.size,
      sha256: item.sha256,
      mtimeMs: Math.round(item.mtimeMs || 0)
    })),
    dirs: job.dirs.map((dir) => posixRel(splitRel(dir.destRel))),
    source: { repoId: String(job.from.repoId || ''), path: job.fromRoot },
    sourceRel: job.sourceRel,
    destRel: job.sourceRel,
    type: job.type,
    jobId: job.jobId
  };
}

async function deleteSource(job) {
  if (job.section === 'sources') {
    for (const entry of job.movedEntries) {
      await fs.promises.rm(entry, { recursive: true, force: true, maxRetries: 3 });
    }
    return;
  }
  await fs.promises.rm(job.srcAbs, { recursive: true, force: true, maxRetries: 3 });
}

async function runJob(job) {
  try {
    job.report.report('prepare', {}, true);
    await copyPhase(job);
    await verifyPhase(job);
    await commitPhase(job);
  } catch (error) {
    await failJob(job, error);
    return;
  }

  job.report.report('cleanup', {}, true);
  let receiptRel = '';
  let receiptError = null;
  if (job.type === 'archive') {
    try {
      receiptRel = writeReceipt(job.toRoot, buildReceipt(job));
    } catch (error) {
      receiptError = error;
    }
  } else {
    dropIndexEntry(job.fromRoot, job.taskId, job.section);
  }

  if (receiptError) {
    await failJob(job, makeError(
      'نُقلت الملفات وتحققت، لكن تعذر كتابة إيصال الأرشيف. أُعيدت الحالة كما كانت والمصدر سليم.',
      'receipt-failed'
    ));
    return;
  }

  let deleteError = null;
  try {
    await deleteSource(job);
  } catch (error) {
    deleteError = error;
  }

  job.report.stop();
  cleanupIncoming(job);
  release(job);

  const data = {
    bytes: job.bytesTotal,
    files: job.files.length,
    receipt: receiptRel
  };
  if (deleteError) {
    emitDone(
      job,
      false,
      'نُقلت الملفات وتحققت بالكامل، لكن تعذر حذف المصدر. احذفه يدويًا بعد التأكد من الوجهة.',
      data,
      'source-delete-failed'
    );
    return;
  }
  emitDone(job, true, '', data);
}

async function failJob(job, error) {
  job.report.stop();
  const cancelled = Boolean(job.signal.aborted) || error?.code === 'cancelled';
  // The source was never touched: drop everything this job created in the destination.
  for (const item of job.committedFiles) {
    await rmQuiet(item.destAbs);
  }
  job.committedFiles = [];
  for (const dir of job.dirs) {
    if (!dir.created) continue;
    try {
      await fs.promises.rmdir(dir.destAbs);
    } catch (cleanupError) {}
  }
  cleanupIncoming(job);
  release(job);
  emitDone(
    job,
    false,
    cancelled ? abortError().message : (error?.message || 'فشلت عملية النقل. لم يُحذف أي شيء من المصدر.'),
    { bytes: 0, files: 0, receipt: '' },
    cancelled ? 'cancelled' : (error?.code || 'failed')
  );
}

// -------------------------------------------------------------------- API

async function start(payload = {}) {
  const job = await prepareJob({ ...payload, type: payload.type === 'restore' ? 'restore' : 'archive' });
  jobs.set(job.jobId, job);
  destLocks.set(job.lockKey, job.jobId);
  // Fire and forget: the renderer waits for `mmo:archive:done`.
  runJob(job).catch((error) => {
    if (jobs.has(job.jobId)) {
      failJob(job, error).catch(() => release(job));
    }
  });
  return { ok: true, data: { jobId: job.jobId } };
}

async function restore(payload = {}) {
  return start({ ...payload, type: 'restore' });
}

function cancel(payload = {}) {
  const jobId = String(payload.jobId || '');
  const job = jobs.get(jobId);
  if (!job) return { ok: true, data: { cancelled: false } };
  try {
    job.controller.abort();
  } catch (error) {}
  return { ok: true, data: { cancelled: true } };
}

async function reconcile(payload = {}) {
  const root = assertRepoDir(payload.repoPath || payload.path);
  const summary = readIndexSummary(root);
  const pending = [];
  for (const entry of summary.entries) {
    const taskId = String(entry.taskId || '');
    const section = String(entry.section || '');
    if (!taskId || !SECTIONS.has(section)) continue;
    const sourceRoot = String(entry.source?.path || '');
    const sourceRel = String(entry.sourceRel || entry.rel || '');
    if (!sourceRoot || !sourceRel) {
      pending.push({ taskId, section, reason: 'receipt-incomplete' });
      continue;
    }
    const safeTask = cleanId(taskId);
    const perSection = readJsonFile(path.join(receiptDir(root), `${safeTask}.${cleanId(section)}.json`));
    const canonical = perSection && String(perSection.section || '') === section
      ? perSection
      : readJsonFile(path.join(receiptDir(root), `${safeTask}.json`));
    const receipt = canonical && String(canonical.section || '') === section ? canonical : null;
    let sourceAbs = '';
    try {
      sourceAbs = resolveInside(sourceRoot, sourceRel);
    } catch (error) {
      pending.push({ taskId, section, reason: 'source-path-invalid' });
      continue;
    }
    // File-precise detection: for `sources` the task folder legitimately stays
    // behind (it still holds output/opencode), so only the archived files count.
    const files = Array.isArray(receipt?.files) ? receipt.files : [];
    let leftover = '';
    for (const file of files) {
      if (!file || typeof file.sourcePath !== 'string') continue;
      let candidate = '';
      try {
        candidate = resolveInside(sourceRoot, file.sourcePath);
      } catch (error) {
        continue;
      }
      if (fs.existsSync(candidate)) {
        leftover = candidate;
        break;
      }
    }
    if (!leftover) {
      // Older receipts have no per-file source paths: fall back to the folder.
      if (!files.length || files.some((file) => !file || typeof file.sourcePath !== 'string')) {
        if (!fs.existsSync(sourceAbs)) continue;
        leftover = sourceAbs;
      } else {
        continue;
      }
    }
    let destExists = false;
    try {
      destExists = fs.existsSync(resolveInside(root, String(entry.destRel || sourceRel)));
    } catch (error) {
      destExists = false;
    }
    pending.push({
      taskId,
      section,
      reason: destExists ? 'both-present' : 'source-present',
      sourcePath: leftover
    });
  }
  return { ok: true, data: { pending } };
}

// ------------------------------------------------------------------ trash

function trashRoot(root) {
  return path.join(root, TRASH_DIR);
}

function trashStamp(date = new Date()) {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

function trashPayloadRel(relParts, section, whole) {
  if (whole) return joinRel(relParts);
  if (section === 'sources') return joinRel(relParts);
  return joinRel([...relParts, section]);
}

function capRecord(record) {
  if (record == null) return null;
  try {
    const text = JSON.stringify(record);
    if (!text) return null;
    if (text.length > MAX_RECORD_CHARS) return null;
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function normalizeEntry(raw, folderName, folderAbs, root) {
  if (!raw || typeof raw !== 'object') return null;
  const createdAt = typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : nowISO();
  const expiresAt = typeof raw.expiresAt === 'string' && raw.expiresAt
    ? raw.expiresAt
    : new Date(new Date(createdAt).getTime() + TRASH_TTL_MS).toISOString();
  return {
    schema: 1,
    id: String(raw.id || `trs_${folderName}`),
    repoId: String(raw.repoId || ''),
    kind: raw.kind === 'group' || raw.kind === 'section' ? raw.kind : 'task',
    taskId: String(raw.taskId || ''),
    groupId: String(raw.groupId || ''),
    section: String(raw.section || ''),
    originalRel: String(raw.originalRel || raw.rel || ''),
    rel: String(raw.rel || raw.originalRel || ''),
    whole: Boolean(raw.whole),
    createdAt,
    expiresAt,
    bytes: Number(raw.bytes) || 0,
    files: Number(raw.files) || 0,
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
    record: raw.record && typeof raw.record === 'object' ? raw.record : null,
    merge: Boolean(raw.merge),
    payloadRel: String(raw.payloadRel || raw.originalRel || raw.rel || ''),
    folder: folderName,
    folderPath: folderAbs,
    repoPath: root
  };
}

function publicEntry(entry) {
  const copy = { ...entry };
  delete copy.folderPath;
  const remaining = new Date(entry.expiresAt).getTime() - Date.now();
  copy.daysLeft = Number.isFinite(remaining) ? Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000))) : 0;
  copy.expired = new Date(entry.expiresAt).getTime() < Date.now();
  return copy;
}

async function readTrashEntries(root, { measure = false } = {}) {
  const dir = trashRoot(root);
  let folders = [];
  try {
    folders = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (error) {
    return [];
  }
  const entries = [];
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const folderAbs = path.join(dir, folder.name);
    const raw = readJsonFile(path.join(folderAbs, 'entry.json'));
    const entry = normalizeEntry(raw, folder.name, folderAbs, root);
    if (!entry) continue;
    if (measure && (!entry.bytes || !entry.files)) {
      const measured = await measureTree(path.join(folderAbs, 'payload'));
      entry.bytes = entry.bytes || measured.bytes;
      entry.files = entry.files || measured.files;
    }
    entries.push(entry);
  }
  entries.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return entries;
}

async function findEntry(root, entryId) {
  const id = String(entryId || '').trim();
  if (!id) return null;
  const entries = await readTrashEntries(root, { measure: false });
  return entries.find((entry) => entry.id === id || entry.folder === id) || null;
}

async function trashMove(payload = {}) {
  const root = assertRepoDir(payload.repoPath || payload.path);
  const relParts = splitRel(payload.rel);
  if (!relParts.length) throw makeError('مسار العنصر المطلوب نقله إلى السلة مطلوب.', 'rel-required');
  if (RESERVED_ROOT_ENTRIES.has(String(relParts[0]).toLowerCase())) {
    throw makeError('لا يمكن نقل مجلدات النظام إلى سلة المحذوفات.', 'reserved-path');
  }
  const rel = joinRel(relParts);
  const srcAbs = resolveInside(root, rel);

  const whole = payload.whole === true;
  const section = String(payload.section || '').trim().toLowerCase();
  if (!whole && !SECTIONS.has(section)) {
    throw makeError('حدّد القسم المطلوب نقله أو اختر حذف المجلد كاملًا.', 'section-invalid');
  }
  if (!isDir(srcAbs)) throw makeError('المجلد المطلوب غير موجود.', 'path-missing');

  const meta = payload.meta && typeof payload.meta === 'object' ? { ...payload.meta } : {};
  const record = capRecord(meta.record);
  const recordOmitted = meta.record != null && record == null;
  delete meta.record;
  if (recordOmitted) meta.recordOmitted = true;

  const stamp = trashStamp();
  const folderAbs = path.join(trashRoot(root), stamp);
  const payloadRel = trashPayloadRel(relParts, section, whole);
  const payloadAbs = path.join(folderAbs, 'payload', payloadRel);

  // Measure first: the entry must be complete even for a cross-volume copy.
  let measureTargets;
  let moves;
  if (whole) {
    measureTargets = [srcAbs];
    moves = [{ src: srcAbs, dest: payloadAbs }];
  } else if (section === 'sources') {
    const children = await fs.promises.readdir(srcAbs, { withFileTypes: true });
    const names = children
      .map((child) => child.name)
      .filter((name) => !RESERVED_ROOT_ENTRIES.has(String(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, 'ar'));
    if (!names.length) throw makeError('لا توجد ملفات في مجلد المصادر.', 'empty-section');
    measureTargets = names.map((name) => path.join(srcAbs, name));
    moves = names.map((name) => ({
      src: path.join(srcAbs, name),
      dest: path.join(payloadAbs, name)
    }));
  } else {
    const sectionAbs = path.join(srcAbs, section);
    if (!isDir(sectionAbs)) {
      throw makeError(`لا يوجد قسم «${section}» داخل هذا المجلد.`, 'section-missing');
    }
    measureTargets = [sectionAbs];
    moves = [{ src: sectionAbs, dest: payloadAbs }];
  }

  const measured = { bytes: 0, files: 0 };
  for (const target of measureTargets) await measureTree(target, measured);

  const doneMoves = [];
  try {
    await fs.promises.mkdir(folderAbs, { recursive: true });
    for (const move of moves) {
      await movePath(move.src, move.dest);
      doneMoves.push(move);
    }
  } catch (error) {
    // Put back whatever already moved, then drop the (now empty) trash folder.
    for (const move of doneMoves.reverse()) {
      try {
        await movePath(move.dest, move.src);
      } catch (restoreError) {}
    }
    await rmQuiet(folderAbs);
    throw error instanceof Error ? error : makeError('تعذر نقل العنصر إلى سلة المحذوفات.', 'trash-failed');
  }

  const createdAt = nowISO();
  const kind = meta.kind === 'group' || meta.kind === 'section' || meta.kind === 'task'
    ? meta.kind
    : whole
      ? 'task'
      : 'section';

  const entry = {
    schema: 1,
    id: `trs_${crypto.randomBytes(6).toString('hex')}`,
    repoId: String(payload.repoId || ''),
    kind,
    taskId: String(meta.taskId || ''),
    groupId: String(meta.groupId || ''),
    section: whole ? '' : section,
    originalRel: payloadRel,
    rel,
    whole,
    merge: !whole && section === 'sources',
    payloadRel,
    createdAt,
    expiresAt: new Date(Date.now() + TRASH_TTL_MS).toISOString(),
    bytes: measured.bytes,
    files: measured.files,
    meta,
    record: record || null
  };

  writeJsonAtomic(path.join(folderAbs, 'entry.json'), entry);
  emitTrashChanged(root);
  return { ok: true, data: { entry: publicEntry(normalizeEntry(entry, stamp, folderAbs, root)) } };
}

async function trashList(payload = {}) {
  const root = assertRepoDir(payload.repoPath || payload.path);
  const entries = await readTrashEntries(root, { measure: true });
  return { ok: true, data: { entries: entries.map(publicEntry) } };
}

async function trashRestore(payload = {}) {
  const root = assertRepoDir(payload.repoPath || payload.path);
  const entry = await findEntry(root, payload.entryId);
  if (!entry) throw makeError('عنصر السلة غير موجود.', 'trash-missing');

  const targetAbs = resolveInside(root, entry.originalRel);
  const payloadAbs = resolveInside(path.join(entry.folderPath, 'payload'), entry.payloadRel || entry.originalRel);

  if (entry.merge) {
    await fs.promises.mkdir(targetAbs, { recursive: true });
    let children = [];
    try {
      children = await fs.promises.readdir(payloadAbs, { withFileTypes: true });
    } catch (error) {
      throw makeError('محتوى عنصر السلة مفقود. لا يمكن الاستعادة.', 'trash-payload-missing');
    }
    for (const child of children) {
      const dest = path.join(targetAbs, child.name);
      if (fs.existsSync(dest)) {
        throw makeError(`يوجد عنصر بالاسم نفسه في الوجهة: «${child.name}». لم تُستعد أي ملفات.`, 'conflict');
      }
    }
    for (const child of children) {
      await movePath(path.join(payloadAbs, child.name), path.join(targetAbs, child.name));
    }
    await rmQuiet(payloadAbs);
  } else {
    if (fs.existsSync(targetAbs)) {
      throw makeError('الوجهة تحتوي مجلدًا بالاسم نفسه. لم تُستعد أي ملفات.', 'conflict');
    }
    await fs.promises.mkdir(path.dirname(targetAbs), { recursive: true });
    await movePath(payloadAbs, targetAbs);
  }

  await rmQuiet(entry.folderPath);
  emitTrashChanged(root);
  return { ok: true, data: { restoredTo: targetAbs, entry: publicEntry(entry) } };
}

async function trashDelete(payload = {}) {
  const root = assertRepoDir(payload.repoPath || payload.path);
  const entry = await findEntry(root, payload.entryId);
  if (!entry) throw makeError('عنصر السلة غير موجود.', 'trash-missing');
  await rmQuiet(entry.folderPath);
  emitTrashChanged(root);
  return { ok: true, data: { removed: 1, id: entry.id } };
}

async function trashPurge(payload = {}) {
  const root = assertRepoDir(payload.repoPath || payload.path);
  const entries = await readTrashEntries(root, { measure: true });
  let bytes = 0;
  let removed = 0;
  for (const entry of entries) {
    bytes += entry.bytes || 0;
    await rmQuiet(entry.folderPath);
    removed += 1;
  }
  emitTrashChanged(root);
  return { ok: true, data: { removed, bytes } };
}

/** Deletes only trash entries whose `expiresAt` already passed. */
async function purgeExpired(payload = {}) {
  const root = assertRepoDir(payload.repoPath || payload.path);
  const entries = await readTrashEntries(root, { measure: true });
  const now = Date.now();
  let removed = 0;
  let bytes = 0;
  for (const entry of entries) {
    const expires = new Date(entry.expiresAt).getTime();
    if (!Number.isFinite(expires) || expires >= now) continue;
    bytes += entry.bytes || 0;
    await rmQuiet(entry.folderPath);
    removed += 1;
  }
  if (removed) emitTrashChanged(root);
  return { ok: true, data: { removed, bytes } };
}

// --------------------------------------------------------------- handlers

function register(ipcMain, guard, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  if (typeof opts.send === 'function') sendOverride = opts.send;
  else if (typeof opts.getWindow === 'function') getWindowRef = opts.getWindow;

  const wrap = typeof guard === 'function'
    ? guard
    : (handler) => async (event, payload) => handler(payload || {});

  ipcMain.handle('archive:start', wrap(start));
  ipcMain.handle('archive:cancel', wrap(cancel));
  ipcMain.handle('archive:restore', wrap(restore));
  ipcMain.handle('archive:reconcile', wrap(reconcile));
  ipcMain.handle('archive:purgeExpired', wrap(purgeExpired));
  ipcMain.handle('trash:move', wrap(trashMove));
  ipcMain.handle('trash:list', wrap(trashList));
  ipcMain.handle('trash:restore', wrap(trashRestore));
  ipcMain.handle('trash:delete', wrap(trashDelete));
  ipcMain.handle('trash:purge', wrap(trashPurge));
}

module.exports = {
  register,
  start,
  cancel,
  restore,
  reconcile,
  purgeExpired,
  // named helpers (used by the renderer-facing handlers + tests)
  sectionList: () => [...SECTION_LIST],
  __setVerifyHook: setVerifyHook
};
