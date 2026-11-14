'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const MANIFEST_NAME = 'mosque-media-office.repo.json';
const MIRROR_NAME = 'mosque-media-office.data.json';
const OUTPUT_DIR = 'output';
const STATUS_DIR = 'opencode';
const LOGS_DIR = 'logs';
const NO_GROUP_FOLDER = 'بدون مجموعة';
const FALLBACK_NAME = 'بدون اسم';
const MAX_NAME_LENGTH = 60;
const MAX_MIRROR_BYTES = 40 * 1024 * 1024;
const MANIFEST_KIND = 'mosque-media-office-repo';

const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

// --------------------------------------------------------------- utilities

function makeError(message, code) {
  const error = new Error(message);
  if (code) error.code = code;
  return error;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function appVersion() {
  try {
    return String(app.getVersion() || '');
  } catch (error) {
    return '';
  }
}

function isDir(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch (error) {
    return false;
  }
}

function writeFileAtomic(file, contents) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now().toString(36)}.tmp`);
  fs.writeFileSync(tmp, contents, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (error) {
    fs.copyFileSync(tmp, file);
    try {
      fs.unlinkSync(tmp);
    } catch (cleanupError) {}
  }
}

function writeJsonAtomic(file, value) {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

// ------------------------------------------------------- active repo state

let activeRepoLoaded = false;
let activeRepoPath = '';

function activeRepoFile() {
  return path.join(app.getPath('userData'), 'active-repo.json');
}

function readActiveRepoFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(activeRepoFile(), 'utf8'));
    return raw && typeof raw.path === 'string' ? raw.path.trim() : '';
  } catch (error) {
    return '';
  }
}

function getActiveRepoPath() {
  if (!activeRepoLoaded) {
    activeRepoLoaded = true;
    activeRepoPath = readActiveRepoFile();
  }
  return activeRepoPath;
}

function setActiveRepoPath(repoPath) {
  const clean = String(repoPath || '').trim();
  activeRepoLoaded = true;
  activeRepoPath = clean;
  try {
    writeJsonAtomic(activeRepoFile(), { path: clean, updatedAt: new Date().toISOString() });
  } catch (error) {}
}

// --------------------------------------------------------------- naming

function sanitizeName(value) {
  let text = String(value ?? '');
  text = text.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ');
  text = text.replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');
  if (!text) return '';
  const upper = text.toUpperCase();
  if (RESERVED_NAMES.has(upper) || RESERVED_NAMES.has(upper.split('.')[0])) text = `${text}-`;
  if (text.length > MAX_NAME_LENGTH) {
    text = text.slice(0, MAX_NAME_LENGTH);
    if (/[\ud800-\udbff]$/u.test(text)) text = text.slice(0, -1);
    text = text.replace(/[\s.]+$/g, '');
  }
  return text;
}

function sanitizeFolder(value) {
  return sanitizeName(value) || FALLBACK_NAME;
}

function suffixName(base, index) {
  const suffix = ` (${index})`;
  let root = base;
  if (root.length + suffix.length > MAX_NAME_LENGTH) {
    root = root.slice(0, Math.max(1, MAX_NAME_LENGTH - suffix.length)).replace(/[\s.]+$/g, '');
  }
  return `${root}${suffix}`;
}

function cleanId(id) {
  return String(id || '').replace(/[^A-Za-z0-9_-]/g, '') || 'id';
}

function uniqueRootName(repoRoot, base, reserved) {
  let name = base;
  let index = 2;
  while (reserved.has(name.toLowerCase()) || fs.existsSync(path.join(repoRoot, name))) {
    name = suffixName(base, index);
    index += 1;
    if (index > 500) break;
  }
  return name;
}

// --------------------------------------------------------------- paths

function splitRel(relPath) {
  return String(relPath || '').split(/[\\/]+/).filter(Boolean);
}

function joinRel(parts) {
  return parts.filter(Boolean).join(path.sep);
}

function relKey(relPath) {
  return splitRel(relPath).join('/').toLowerCase();
}

function safeFolderName(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parts = splitRel(text);
  return parts.length === 1 ? parts[0] : '';
}

function safeRelPath(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parts = splitRel(text);
  return parts.length ? joinRel(parts) : '';
}

function assertRepoDir(repoPath) {
  const clean = String(repoPath || '').trim();
  if (!clean) throw makeError('مسار المستودع مطلوب.', 'repo-path-required');
  const resolved = path.resolve(clean);
  if (!isDir(resolved)) throw makeError('مجلد المستودع غير موجود.', 'repo-path-missing');
  return resolved;
}

function resolveInside(repoRoot, relPath) {
  const relative = String(relPath || '').trim().replace(/[\\/]+/g, path.sep);
  if (relative.split(path.sep).some((part) => part === '..')) {
    throw makeError('مسار خارج المستودع مرفوض.', 'path-escape');
  }
  const absolute = path.resolve(repoRoot, relative);
  const inside = path.relative(repoRoot, absolute);
  if (inside.startsWith('..') || path.isAbsolute(inside)) {
    throw makeError('مسار خارج المستودع مرفوض.', 'path-escape');
  }
  return absolute;
}

function dateKey(value) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

// --------------------------------------------------------------- manifest

function manifestPath(repoRoot) {
  return path.join(repoRoot, MANIFEST_NAME);
}

function createManifest() {
  const now = new Date().toISOString();
  return {
    schema: 1,
    kind: MANIFEST_KIND,
    repoId: `rpo_${crypto.randomBytes(8).toString('hex')}`,
    name: 'المكتب الإعلامي',
    app: { name: 'mosque-media-office', version: appVersion() },
    machine: { host: os.hostname(), platform: process.platform },
    createdAt: now,
    updatedAt: now,
    noGroupFolder: '',
    groups: {},
    tasks: {}
  };
}

function normalizeManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rawGroups = raw.groups && typeof raw.groups === 'object' && !Array.isArray(raw.groups) ? raw.groups : null;
  const rawTasks = raw.tasks && typeof raw.tasks === 'object' && !Array.isArray(raw.tasks) ? raw.tasks : null;
  if (raw.kind !== MANIFEST_KIND && !rawGroups && !rawTasks) return null;
  const now = new Date().toISOString();
  const fallback = createManifest();
  return {
    schema: Number(raw.schema) || 1,
    kind: MANIFEST_KIND,
    repoId: typeof raw.repoId === 'string' && raw.repoId.trim() ? raw.repoId.trim() : fallback.repoId,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fallback.name,
    app: raw.app && typeof raw.app === 'object'
      ? { name: String(raw.app.name || 'mosque-media-office'), version: String(raw.app.version || '') }
      : fallback.app,
    machine: raw.machine && typeof raw.machine === 'object'
      ? { host: String(raw.machine.host || ''), platform: String(raw.machine.platform || '') }
      : fallback.machine,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : now,
    noGroupFolder: typeof raw.noGroupFolder === 'string' ? raw.noGroupFolder : '',
    groups: rawGroups ? { ...rawGroups } : {},
    tasks: rawTasks ? { ...rawTasks } : {}
  };
}

function loadManifest(repoRoot, options = {}) {
  const file = manifestPath(repoRoot);
  if (!fs.existsSync(file)) return null;
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (options.strict) throw makeError('ملف المستودع غير صالح أو تالف.', 'manifest-invalid');
    return null;
  }
  const manifest = normalizeManifest(raw);
  if (!manifest && options.strict) throw makeError('ملف المستودع غير صالح.', 'manifest-invalid');
  return manifest;
}

// --------------------------------------------------------------- sync core

function ensureTaskDirs(taskAbs, warnings, title) {
  try {
    fs.mkdirSync(path.join(taskAbs, OUTPUT_DIR), { recursive: true });
    fs.mkdirSync(path.join(taskAbs, STATUS_DIR, LOGS_DIR), { recursive: true });
  } catch (error) {
    warnings.push(`تعذر إنشاء مجلدات العمل داخل «${title}».`);
  }
}

function uniqueChildName(parentAbs, parentRel, base, taken) {
  const set = taken.get(relKey(parentRel)) || new Set();
  let name = base;
  let index = 2;
  while (set.has(name.toLowerCase()) || fs.existsSync(path.join(parentAbs, name))) {
    name = suffixName(base, index);
    index += 1;
    if (index > 500) break;
  }
  return name;
}

function syncRepo(payload = {}) {
  const repoRoot = assertRepoDir(payload.repoPath);
  const autoRename = payload.autoRename !== false;
  const groupsPayload = Array.isArray(payload.groups) ? payload.groups : [];
  const tasksPayload = Array.isArray(payload.tasks) ? payload.tasks : [];

  const manifest = loadManifest(repoRoot, { strict: true }) || createManifest();
  if (!manifest.groups || typeof manifest.groups !== 'object') manifest.groups = {};
  if (!manifest.tasks || typeof manifest.tasks !== 'object') manifest.tasks = {};

  const actions = [];
  const warnings = [];
  const now = new Date().toISOString();

  const groupFolderById = new Map();
  const groupIndex = {};
  const groupAbsolute = {};
  const reservedRoot = new Set();
  const groupRenames = new Map();
  const groupIds = new Set();

  groupsPayload.forEach((group) => {
    const id = String(group?.id || '').trim();
    if (!id) return;
    groupIds.add(id);
    const name = String(group?.name || '').trim();
    const entry = manifest.groups[id] && typeof manifest.groups[id] === 'object' ? manifest.groups[id] : {};
    const oldFolder = safeFolderName(entry.folder);
    const base = sanitizeName(name) || `مجموعة ${cleanId(id)}`;
    let folder = '';

    if (oldFolder && isDir(path.join(repoRoot, oldFolder))) {
      folder = oldFolder;
      if (autoRename && !sameName(folder, base)) {
        const sourceAbs = path.join(repoRoot, folder);
        const destAbs = path.join(repoRoot, base);
        const occupied = fs.existsSync(destAbs) && !samePath(destAbs, sourceAbs);
        if (reservedRoot.has(base.toLowerCase()) || occupied) {
          warnings.push(`لم تُعد تسمية مجلد المجموعة «${name}» لأن «${base}» مستخدم مسبقًا.`);
        } else {
          try {
            fs.renameSync(sourceAbs, destAbs);
            actions.push({ type: 'renamed', target: 'group', id, from: folder, to: base });
            groupRenames.set(folder.toLowerCase(), base);
            folder = base;
          } catch (error) {
            warnings.push(`تعذرت إعادة تسمية مجلد المجموعة «${name}».`);
          }
        }
      }
    } else if (oldFolder) {
      warnings.push(`مجلد المجموعة «${name}» كان مفقودًا وأُعيد إنشاؤه.`);
      folder = oldFolder;
      fs.mkdirSync(path.join(repoRoot, folder), { recursive: true });
    } else {
      folder = uniqueRootName(repoRoot, base, reservedRoot);
      fs.mkdirSync(path.join(repoRoot, folder), { recursive: true });
      actions.push({ type: 'created', target: 'group', id, from: '', to: folder });
    }

    reservedRoot.add(folder.toLowerCase());
    groupFolderById.set(id, folder);
    groupIndex[id] = folder;
    groupAbsolute[id] = path.join(repoRoot, folder);
    manifest.groups[id] = { name, folder };
  });

  if (groupRenames.size) {
    Object.values(manifest.tasks).forEach((entry) => {
      const folder = safeRelPath(entry?.folder);
      if (!folder) return;
      const parts = splitRel(folder);
      if (parts.length < 2) return;
      const renamed = groupRenames.get(parts[0].toLowerCase());
      if (!renamed) return;
      parts[0] = renamed;
      entry.folder = joinRel(parts);
    });
  }

  let noGroupFolder = safeFolderName(manifest.noGroupFolder);
  if (noGroupFolder && reservedRoot.has(noGroupFolder.toLowerCase())) noGroupFolder = '';
  function ensureNoGroupFolder() {
    if (noGroupFolder && isDir(path.join(repoRoot, noGroupFolder))) return noGroupFolder;
    if (!noGroupFolder) {
      if (!reservedRoot.has(NO_GROUP_FOLDER.toLowerCase()) && isDir(path.join(repoRoot, NO_GROUP_FOLDER))) {
        noGroupFolder = NO_GROUP_FOLDER;
      } else {
        noGroupFolder = uniqueRootName(repoRoot, NO_GROUP_FOLDER, reservedRoot);
      }
      reservedRoot.add(noGroupFolder.toLowerCase());
    }
    fs.mkdirSync(path.join(repoRoot, noGroupFolder), { recursive: true });
    manifest.noGroupFolder = noGroupFolder;
    return noGroupFolder;
  }

  const takenByParent = new Map();
  function claimName(parentRel, name) {
    const key = relKey(parentRel);
    if (!takenByParent.has(key)) takenByParent.set(key, new Set());
    takenByParent.get(key).add(String(name || '').toLowerCase());
  }
  function releaseName(parentRel, name) {
    const set = takenByParent.get(relKey(parentRel));
    if (set) set.delete(String(name || '').toLowerCase());
  }

  Object.values(manifest.tasks).forEach((entry) => {
    const folder = safeRelPath(entry?.folder);
    if (!folder) return;
    const parts = splitRel(folder);
    if (parts.length < 2) return;
    const name = parts.pop();
    claimName(joinRel(parts), name);
  });

  const taskIds = new Set();
  const taskIndex = {};
  const taskAbsolute = {};
  const taskWarnings = [];

  tasksPayload.forEach((task) => {
    const id = String(task?.id || '').trim();
    if (!id) return;
    taskIds.add(id);
    const title = String(task?.title || '').trim();
    const rawGroupId = String(task?.groupId || '');
    const groupId = groupFolderById.has(rawGroupId) ? rawGroupId : '';
    const parentRel = groupId ? groupFolderById.get(groupId) : ensureNoGroupFolder();
    const datePart = dateKey(task?.createdAt);
    const desiredName = `${datePart} - ${sanitizeFolder(title)}`;
    const prev = manifest.tasks[id] && typeof manifest.tasks[id] === 'object' ? manifest.tasks[id] : {};
    let folder = safeRelPath(prev.folder);
    let absolute = folder ? resolveInside(repoRoot, folder) : '';

    if (folder) {
      const parts = splitRel(folder);
      releaseName(joinRel(parts.slice(0, -1)), parts[parts.length - 1]);
    }

    if (folder && !isDir(absolute)) {
      taskWarnings.push(`مجلد المهمة «${title}» كان مفقودًا وأُعيد إنشاؤه.`);
      folder = '';
      absolute = '';
    }

    if (folder) {
      const parts = splitRel(folder);
      const oldName = parts.pop();
      const oldParentRel = joinRel(parts);

      if (relKey(oldParentRel) !== relKey(parentRel)) {
        const destAbs = path.join(resolveInside(repoRoot, parentRel), oldName);
        if (fs.existsSync(destAbs)) {
          warnings.push(`لم يُنقل مجلد المهمة «${title}» لأن مساره الجديد مستخدم مسبقًا.`);
        } else {
          fs.mkdirSync(path.dirname(destAbs), { recursive: true });
          try {
            fs.renameSync(absolute, destAbs);
            const fromFolder = folder;
            folder = joinRel([...splitRel(parentRel), oldName]);
            absolute = destAbs;
            actions.push({ type: 'moved', target: 'task', id, from: fromFolder, to: folder });
          } catch (error) {
            warnings.push(`تعذر نقل مجلد المهمة «${title}» إلى مجموعتها الجديدة.`);
          }
        }
      }

      const currentName = splitRel(folder).pop();
      if (autoRename && currentName !== desiredName) {
        const parentAbs = path.dirname(absolute);
        const destAbs = path.join(parentAbs, desiredName);
        const occupied = fs.existsSync(destAbs) && !samePath(destAbs, absolute);
        if (occupied) {
          warnings.push(`لم تُعد تسمية مجلد المهمة «${title}» لأن الاسم المقترح مستخدم مسبقًا.`);
        } else {
          try {
            fs.renameSync(absolute, destAbs);
            const fromFolder = folder;
            const parts = splitRel(folder);
            parts[parts.length - 1] = desiredName;
            folder = joinRel(parts);
            absolute = destAbs;
            actions.push({ type: 'renamed', target: 'task', id, from: fromFolder, to: folder });
          } catch (error) {
            warnings.push(`تعذرت إعادة تسمية مجلد المهمة «${title}».`);
          }
        }
      }
    } else {
      const parentAbs = resolveInside(repoRoot, parentRel);
      const name = uniqueChildName(parentAbs, parentRel, desiredName, takenByParent);
      fs.mkdirSync(path.join(parentAbs, name), { recursive: true });
      folder = joinRel([...splitRel(parentRel), name]);
      absolute = path.join(parentAbs, name);
      actions.push({ type: 'created', target: 'task', id, from: '', to: folder });
    }

    const parts = splitRel(folder);
    const finalName = parts.pop();
    claimName(joinRel(parts), finalName);
    ensureTaskDirs(absolute, taskWarnings, title);

    manifest.tasks[id] = {
      title,
      groupId: groupId || null,
      folder,
      createdDate: datePart,
      updatedAt: now
    };
    taskIndex[id] = folder;
    taskAbsolute[id] = absolute;
  });

  Object.keys(manifest.groups).forEach((id) => {
    if (!groupIds.has(id)) delete manifest.groups[id];
  });
  Object.keys(manifest.tasks).forEach((id) => {
    if (!taskIds.has(id)) delete manifest.tasks[id];
  });

  manifest.updatedAt = now;
  writeJsonAtomic(manifestPath(repoRoot), manifest);
  setActiveRepoPath(repoRoot);

  return {
    ok: true,
    data: {
      repoPath: repoRoot,
      manifest,
      groups: groupIndex,
      tasks: taskIndex,
      absolute: { groups: groupAbsolute, tasks: taskAbsolute },
      actions,
      warnings: [...warnings, ...taskWarnings]
    }
  };
}

function sameName(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function samePath(a, b) {
  const left = path.resolve(String(a || ''));
  const right = path.resolve(String(b || ''));
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

// --------------------------------------------------------------- handlers

async function handlePick() {
  const options = {
    title: 'اختر مجلد المستودع',
    buttonLabel: 'ربط المجلد',
    properties: ['openDirectory', 'createDirectory']
  };
  const owner = BrowserWindow.getAllWindows()[0] || null;
  const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
  if (!result || result.canceled || !Array.isArray(result.filePaths) || !result.filePaths.length) {
    return { ok: true, data: { path: null, canceled: true } };
  }
  return { ok: true, data: { path: result.filePaths[0] } };
}

async function handleDetect(payload = {}) {
  const repoRoot = assertRepoDir(payload.path);
  const manifest = loadManifest(repoRoot);
  return {
    ok: true,
    data: {
      path: repoRoot,
      manifest,
      isRepo: Boolean(manifest),
      writable: probeWritable(repoRoot)
    }
  };
}

function probeWritable(target) {
  const probe = path.join(target, `.mmo-write-${process.pid}-${Date.now().toString(36)}.tmp`);
  try {
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    return true;
  } catch (error) {
    try {
      fs.unlinkSync(probe);
    } catch (cleanupError) {}
    return false;
  }
}

async function handleLink(payload = {}) {
  const repoRoot = assertRepoDir(payload.path);
  const existing = loadManifest(repoRoot, { strict: true });
  let manifest = existing;
  let created = false;
  if (!manifest) {
    manifest = createManifest();
    created = true;
  }
  writeJsonAtomic(manifestPath(repoRoot), manifest);
  setActiveRepoPath(repoRoot);
  return { ok: true, data: { path: repoRoot, manifest, created } };
}

async function handleSyncCall(payload = {}) {
  return syncRepo(payload);
}

async function handleOpen(payload = {}) {
  const repoRoot = assertRepoDir(payload.repoPath);
  const kind = String(payload.kind || '');
  let target = resolveInside(repoRoot, payload.relPath);
  if (kind === 'task-output') {
    target = path.join(target, OUTPUT_DIR);
  } else if (kind === 'task-opencode') {
    target = path.join(target, STATUS_DIR);
  }
  if (!fs.existsSync(target)) {
    if (kind === 'task-output' || kind === 'task-opencode') {
      fs.mkdirSync(target, { recursive: true });
    } else {
      throw makeError('المجلد غير موجود.', 'path-missing');
    }
  }
  const error = await shell.openPath(target);
  if (error) throw makeError('تعذر فتح المجلد.', 'open-failed');
  return { ok: true };
}

async function handleReveal(payload = {}) {
  const repoRoot = assertRepoDir(payload.repoPath);
  const target = resolveInside(repoRoot, payload.relPath);
  if (!fs.existsSync(target)) throw makeError('المسار غير موجود.', 'path-missing');
  if (isDir(target)) {
    const error = await shell.openPath(target);
    if (error) throw makeError('تعذر فتح المجلد.', 'open-failed');
  } else {
    shell.showItemInFolder(target);
  }
  return { ok: true };
}

async function handleReadManifest(payload = {}) {
  const repoRoot = assertRepoDir(payload.repoPath);
  return { ok: true, data: { manifest: loadManifest(repoRoot) } };
}

async function handlePathFor(payload = {}) {
  const repoRoot = assertRepoDir(payload.repoPath);
  const absolute = resolveInside(repoRoot, payload.relPath);
  return { ok: true, data: { absolute, exists: fs.existsSync(absolute) } };
}

async function handleReadMirror() {
  const repoPath = getActiveRepoPath();
  if (!repoPath || !isDir(repoPath)) return { ok: true, data: { snapshot: null, path: null } };
  const target = path.join(repoPath, MIRROR_NAME);
  let snapshot = null;
  try {
    snapshot = fs.readFileSync(target, 'utf8');
  } catch (error) {
    snapshot = null;
  }
  if (!snapshot) snapshot = null;
  return { ok: true, data: { snapshot, path: target } };
}

async function handleWriteMirror(payload = {}) {
  const snapshot = payload.snapshot;
  if (typeof snapshot !== 'string') throw makeError('لقطة البيانات غير صالحة.', 'snapshot-invalid');
  if (Buffer.byteLength(snapshot, 'utf8') >= MAX_MIRROR_BYTES) {
    throw makeError('حجم البيانات أكبر من الحد المسموح للنسخة المحلية.', 'snapshot-too-large');
  }
  const repoPath = getActiveRepoPath();
  if (!repoPath || !isDir(repoPath)) return { ok: true, data: { path: null, skipped: true } };
  const target = path.join(repoPath, MIRROR_NAME);
  writeFileAtomic(target, snapshot);
  return { ok: true, data: { path: target } };
}

async function handleForget() {
  activeRepoLoaded = true;
  activeRepoPath = '';
  try {
    fs.rmSync(activeRepoFile(), { force: true });
  } catch (error) {}
  return { ok: true, data: { forgotten: true } };
}

function register(ipcMain, guard) {
  ipcMain.handle('repo:pick', guard(handlePick));
  ipcMain.handle('repo:detect', guard(handleDetect));
  ipcMain.handle('repo:link', guard(handleLink));
  ipcMain.handle('repo:sync', guard(handleSyncCall));
  ipcMain.handle('repo:open', guard(handleOpen));
  ipcMain.handle('repo:reveal', guard(handleReveal));
  ipcMain.handle('repo:readManifest', guard(handleReadManifest));
  ipcMain.handle('repo:pathFor', guard(handlePathFor));
  ipcMain.handle('repo:forget', guard(handleForget));
  ipcMain.handle('store:readMirror', guard(handleReadMirror));
  ipcMain.handle('store:writeMirror', guard(handleWriteMirror));
}

module.exports = {
  register,
  MANIFEST_NAME,
  MIRROR_NAME,
  OUTPUT_DIR,
  STATUS_DIR
};
