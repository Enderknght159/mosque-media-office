'use strict';

/* فحص مساحة المستودعات: يمشي على كل جذر مرة واحدة، ويوزّع الأحجام على
   المصادر/المخرجات/opencode، ويحسب «أخرى» و«السلة» منفصلين.
   لا يعتمد على Electron عند التحميل؛ التسجيل والفحص يستوردان ما يحتاجانه عند الطلب. */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const CACHE_TTL = 60 * 1000;
const PROGRESS_INTERVAL = 250;
const SECTION_KEYS = ['sources', 'output', 'opencode'];
const TRASH_DIR = '.trash';
const SKIP_DIRS = new Set([TRASH_DIR, '.mmo-archive', '.incoming', 'node_modules', '.git']);

const cache = new Map();
let engineOptions = {};
let repoApi = null;

// --------------------------------------------------------------- utilities

function makeError(message, code) {
  const error = new Error(message);
  if (code) error.code = code;
  return error;
}

/** يحمّل repo.js عند الحاجة فقط، حتى يبقى تحميل هذا الملف بلا Electron. */
function repoLib() {
  if (!repoApi) repoApi = require('./repo');
  return repoApi;
}

function cleanPath(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return path.resolve(text);
  } catch (error) {
    return '';
  }
}

function splitParts(relPath) {
  return String(relPath || '').split(/[\\/]+/).filter(Boolean);
}

function keyOf(parts) {
  return parts.join('/').toLowerCase();
}

function emptySections() {
  return { sources: 0, output: 0, opencode: 0, other: 0, trash: 0, total: 0 };
}

function emptyTaskSections() {
  return {
    sources: { bytes: 0, files: 0 },
    output: { bytes: 0, files: 0 },
    opencode: { bytes: 0, files: 0 }
  };
}

function addSections(target, source) {
  if (!source) return target;
  ['sources', 'output', 'opencode', 'other', 'trash', 'total'].forEach((key) => {
    target[key] += Number(source[key]) || 0;
  });
  return target;
}

function repoIdOf(repo, index) {
  const value = String(repo?.id || repo?.repoId || '').trim();
  return value || `repo_${index}`;
}

function cacheKey(root) {
  return process.platform === 'win32' ? root.toLowerCase() : root;
}

function planSignature(plan) {
  const parts = [];
  plan.forEach((value, key) => parts.push(`${key}>${value.section}:${value.taskId}`));
  parts.sort();
  return parts.join('|');
}

/** مسار قسم مؤرشف داخل مستودع الأرشيف، مع احتساب أن rel قد ينتهي باسم القسم. */
function archivedSectionParts(info, section) {
  const base = splitParts(info?.rel);
  if (!base.length) return [];
  if (section === 'sources') return base;
  const last = base[base.length - 1].toLowerCase();
  return last === section ? base : base.concat(section);
}

function findArchiveIndex(info, repos) {
  const repoId = String(info?.repoId || '').trim();
  const archiveId = String(info?.archiveId || '').trim();
  if (repoId) {
    for (let index = 0; index < repos.length; index += 1) {
      if (String(repos[index]?.repoId || '').trim() === repoId) return index;
    }
  }
  if (archiveId) {
    for (let index = 0; index < repos.length; index += 1) {
      if (String(repos[index]?.id || '').trim() === archiveId) return index;
    }
  }
  if (repoId) {
    for (let index = 0; index < repos.length; index += 1) {
      if (String(repos[index]?.id || '').trim() === repoId) return index;
    }
  }
  return -1;
}

// --------------------------------------------------------------- planning

/** يبني خريطة «بادئة مسار نسبي → قسم مهمة» لهذا المستودع. */
function buildPlan(repo, { primary, repos, tasks }) {
  const plan = new Map();
  const isPrimary = repo === primary;
  for (const task of tasks) {
    const taskId = String(task?.id || '').trim();
    if (!taskId) continue;
    if (isPrimary) {
      const base = splitParts(task?.folder);
      if (!base.length) continue;
      plan.set(keyOf(base), { taskId, section: 'sources' });
      plan.set(keyOf(base.concat('output')), { taskId, section: 'output' });
      plan.set(keyOf(base.concat('opencode')), { taskId, section: 'opencode' });
      continue;
    }
    const archived = task?.archived;
    if (!archived || typeof archived !== 'object' || Array.isArray(archived)) continue;
    for (const section of SECTION_KEYS) {
      const info = archived[section];
      if (!info || typeof info !== 'object') continue;
      if (findArchiveIndex(info, repos) !== repos.indexOf(repo)) continue;
      const parts = section === 'sources' ? splitParts(info.rel) : archivedSectionParts(info, section);
      if (!parts.length) continue;
      plan.set(keyOf(parts), { taskId, section });
    }
  }
  return plan;
}

/** يطابق ملفًا مع أعمق قسم معروف (output/opencode يتغلبان على جذر المهمة). */
function matchSection(parts, plan) {
  if (!plan || !plan.size) return null;
  for (let index = parts.length; index >= 1; index -= 1) {
    const hit = plan.get(keyOf(parts.slice(0, index)));
    if (hit) return hit;
  }
  return null;
}

// --------------------------------------------------------------- walking

async function sizeOfTree(rootAbs) {
  let bytes = 0;
  const stack = [rootAbs];
  while (stack.length) {
    const dir = stack.pop();
    let handle = null;
    try {
      handle = await fs.promises.opendir(dir);
    } catch (error) {
      continue;
    }
    try {
      let dirent = null;
      while ((dirent = await handle.read()) !== null) {
        if (dirent.isSymbolicLink()) continue;
        const child = path.join(dir, String(dirent.name || ''));
        if (dirent.isDirectory()) {
          stack.push(child);
          continue;
        }
        if (!dirent.isFile()) continue;
        try {
          const stat = await fs.promises.stat(child);
          bytes += Number(stat.size) || 0;
        } catch (error) {}
      }
    } catch (error) {
      // مجلد فرعي غير مقروء: نتخطاه ونكمل.
    } finally {
      try {
        await handle.close();
      } catch (error) {}
    }
  }
  return bytes;
}

async function walkRepo(repoRoot, plan, ignoredRootFiles, onTick) {
  const sections = emptySections();
  const taskSections = {};
  let files = 0;
  let bytes = 0;
  const stack = [{ abs: repoRoot, parts: [] }];

  while (stack.length) {
    const dir = stack.pop();
    const atRoot = dir.parts.length === 0;
    let handle = null;
    try {
      handle = await fs.promises.opendir(dir.abs);
    } catch (error) {
      continue;
    }
    try {
      let dirent = null;
      while ((dirent = await handle.read()) !== null) {
        const name = String(dirent.name || '');
        if (!name) continue;
        const lower = name.toLowerCase();
        const childAbs = path.join(dir.abs, name);
        const childParts = dir.parts.concat(name);

        if (dirent.isSymbolicLink()) continue;

        if (dirent.isDirectory()) {
          if (atRoot && lower === TRASH_DIR) {
            sections.trash += await sizeOfTree(childAbs);
            continue;
          }
          if (lower.startsWith('.') || SKIP_DIRS.has(lower)) continue;
          stack.push({ abs: childAbs, parts: childParts });
          continue;
        }

        if (!dirent.isFile()) continue;
        if (atRoot && (lower.startsWith('.') || ignoredRootFiles.has(lower))) continue;

        let size = 0;
        try {
          const stat = await fs.promises.stat(childAbs);
          if (!stat.isFile()) continue;
          size = Number(stat.size) || 0;
        } catch (error) {
          continue;
        }

        files += 1;
        bytes += size;
        const hit = matchSection(childParts, plan);
        if (hit) {
          if (!taskSections[hit.taskId]) taskSections[hit.taskId] = emptyTaskSections();
          const bag = taskSections[hit.taskId][hit.section];
          bag.bytes += size;
          bag.files += 1;
          sections[hit.section] += size;
        } else {
          sections.other += size;
        }
        if (onTick && files % 64 === 0) onTick(files, bytes);
      }
    } catch (error) {
      // انقطاع أو صلاحيات: نترك هذا المجلد ونكمل الفحص.
    } finally {
      try {
        await handle.close();
      } catch (error) {}
    }
  }

  if (onTick) onTick(files, bytes);
  return { sections, taskSections, files, bytes };
}

async function capacityOf(root) {
  const space = { free: 0, capacity: 0, dev: '' };
  if (typeof fs.promises.statfs === 'function') {
    try {
      const stat = await fs.promises.statfs(root);
      const block = Number(stat.bsize) || 0;
      space.capacity = Math.max(0, (Number(stat.blocks) || 0) * block);
      const available = Number.isFinite(Number(stat.bavail)) ? Number(stat.bavail) : Number(stat.bfree) || 0;
      space.free = Math.max(0, available * block);
    } catch (error) {
      space.free = 0;
      space.capacity = 0;
    }
  }
  try {
    const stat = await fs.promises.stat(root);
    space.dev = String(stat.dev ?? '');
  } catch (error) {}
  return space;
}

// --------------------------------------------------------------- progress

function windowForProgress() {
  try {
    if (typeof engineOptions.getWindow === 'function') {
      const win = engineOptions.getWindow();
      if (win && (typeof win.isDestroyed !== 'function' || !win.isDestroyed())) return win;
    }
  } catch (error) {}
  try {
    const { BrowserWindow } = require('electron');
    const list = BrowserWindow && typeof BrowserWindow.getAllWindows === 'function' ? BrowserWindow.getAllWindows() : [];
    for (const win of list) {
      if (win && (typeof win.isDestroyed !== 'function' || !win.isDestroyed())) return win;
    }
  } catch (error) {}
  return null;
}

function progressReporter() {
  let lastAt = 0;
  return (repo, files, bytes) => {
    const now = Date.now();
    if (now - lastAt < PROGRESS_INTERVAL) return;
    lastAt = now;
    const win = windowForProgress();
    if (!win) return;
    try {
      if (!win.webContents || typeof win.webContents.send !== 'function') return;
      win.webContents.send('mmo:storage:progress', {
        repoId: String(repo?.repoId || repo?.id || ''),
        phase: 'scan',
        files,
        bytes
      });
    } catch (error) {}
  };
}

// --------------------------------------------------------------- scan

async function scan(payload = {}) {
  const repos = Array.isArray(payload.repos) ? payload.repos.filter((repo) => repo && typeof repo === 'object') : [];
  if (!repos.length) throw makeError('لا يوجد مستودع مرتبط لفحصه.', 'no-repo');

  const force = Boolean(payload.force);
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  const api = repoLib();
  const ignoredRootFiles = new Set(
    [api.MANIFEST_NAME, api.MIRROR_NAME].filter(Boolean).map((name) => String(name).toLowerCase())
  );
  const primary = repos.find((repo) => repo.role === 'primary')
    || repos.find((repo) => String(repo.id || '') === 'primary')
    || repos[0]
    || null;

  const scannedAt = new Date().toISOString();
  const data = {
    scannedAt,
    totals: { used: 0, free: 0, capacity: 0 },
    sections: emptySections(),
    repos: {},
    tasks: {}
  };
  const internals = new Map();
  const devices = new Set();
  const tick = progressReporter();

  for (let index = 0; index < repos.length; index += 1) {
    const repo = repos[index];
    const id = repoIdOf(repo, index);
    const root = cleanPath(repo.path);
    const online = Boolean(root) && api.isDir(root);
    const entry = {
      used: 0,
      free: 0,
      capacity: 0,
      sections: emptySections(),
      online,
      scannedAt: new Date().toISOString()
    };
    const internal = { id, root, online, taskSections: {}, repo };
    internals.set(index, internal);

    if (online) {
      const plan = buildPlan(repo, { primary, repos, tasks });
      const signature = planSignature(plan);
      const key = cacheKey(root);
      const cached = cache.get(key);
      let walked = null;

      if (!force && cached && cached.signature === signature && Date.now() - cached.at < CACHE_TTL) {
        walked = cached.result;
      } else {
        walked = await walkRepo(root, plan, ignoredRootFiles, (files, bytes) => tick(repo, files, bytes));
        cache.set(key, { at: Date.now(), signature, result: walked });
      }

      internal.taskSections = walked.taskSections;
      const sections = walked.sections;
      const used = sections.sources + sections.output + sections.opencode + sections.other;
      sections.total = used + sections.trash;

      const space = await capacityOf(root);
      entry.used = used;
      entry.sections = sections;
      entry.free = space.free;
      entry.capacity = space.capacity;

      const deviceKey = space.dev || `path:${key}`;
      if (!devices.has(deviceKey)) {
        devices.add(deviceKey);
        data.totals.free += space.free;
        data.totals.capacity += space.capacity;
      }
    }

    data.totals.used += entry.used;
    addSections(data.sections, entry.sections);
    data.repos[id] = entry;
  }

  const primaryInternal = primary ? internals.get(repos.indexOf(primary)) : null;

  for (const task of tasks) {
    const id = String(task?.id || '').trim();
    if (!id) continue;
    const archived = task?.archived && typeof task.archived === 'object' && !Array.isArray(task.archived)
      ? task.archived
      : {};
    const folder = String(task?.folder || '');
    const result = { sources: 0, output: 0, opencode: 0, total: 0, files: 0, exists: false };

    if (primaryInternal && primaryInternal.online && folder) {
      try {
        result.exists = api.isDir(path.join(primaryInternal.root, folder));
      } catch (error) {}
    }

    for (const section of SECTION_KEYS) {
      const info = archived[section];
      let bytes = 0;
      let files = 0;

      if (info && typeof info === 'object') {
        const targetIndex = findArchiveIndex(info, repos);
        const target = targetIndex >= 0 ? internals.get(targetIndex) : null;
        if (target && target.online) {
          const bag = target.taskSections[id]?.[section];
          bytes = Number(bag?.bytes) || 0;
          files = Number(bag?.files) || 0;
          if (!result.exists) {
            const parts = section === 'sources' ? splitParts(info.rel) : archivedSectionParts(info, section);
            if (parts.length) {
              try {
                result.exists = api.isDir(path.join(target.root, ...parts));
              } catch (error) {}
            }
          }
        } else {
          // المستودع الخارجي غير متصل: نُبقي آخر أرقام معروفة من سجل الأرشفة.
          bytes = Number(info.bytes) || 0;
          files = Number(info.files) || 0;
        }
      } else if (primaryInternal && primaryInternal.online && folder) {
        const bag = primaryInternal.taskSections[id]?.[section];
        bytes = Number(bag?.bytes) || 0;
        files = Number(bag?.files) || 0;
      }

      result[section] = bytes;
      result.total += bytes;
      result.files += files;
    }

    data.tasks[id] = result;
  }

  return { ok: true, data };
}

// --------------------------------------------------------------- locate

async function locate(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const api = repoLib();
  const locations = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    let root = '';
    try {
      root = api.assertRepoDir(item.path);
    } catch (error) {
      continue; // جذر مفقود أو غير متاح: نتخطى العنصر وحده.
    }
    let absolute = '';
    try {
      absolute = api.resolveInside(root, item.rel);
    } catch (error) {
      continue; // مسار خارج المستودع: مرفوض.
    }
    let exists = false;
    try {
      await fs.promises.stat(absolute);
      exists = true;
    } catch (error) {}
    locations.push({
      ...item,
      id: String(item.id || ''),
      role: item.role === 'archive' ? 'archive' : 'primary',
      label: String(item.label || ''),
      path: root,
      rel: String(item.rel || ''),
      sections: Array.isArray(item.sections) ? item.sections.slice() : [],
      absolute,
      exists
    });
  }

  return { ok: true, data: { locations } };
}

// --------------------------------------------------------------- volume

function runPowerShell(script, timeout) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', script],
      { timeout, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(String(stdout || ''));
      }
    );
  });
}

async function volumeInfo(target) {
  const space = await capacityOf(target);
  return { label: '', serial: '', fs: '', total: space.capacity, free: space.free };
}

async function volume(payload = {}) {
  const root = cleanPath(payload.path);
  if (!root) return { ok: true, data: { label: '', serial: '', fs: '', total: 0, free: 0 } };

  if (process.platform === 'win32') {
    const drive = path.parse(root).root.replace(/[\\/]+$/, '');
    if (/^[A-Za-z]:$/.test(drive)) {
      const script = `Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${drive}'" | `
        + 'Select-Object VolumeName,VolumeSerialNumber,FileSystem,Size,FreeSpace | ConvertTo-Json -Compress';
      try {
        const stdout = await runPowerShell(script, 4000);
        const parsed = JSON.parse(String(stdout || '').trim());
        const row = Array.isArray(parsed) ? parsed[0] : parsed;
        if (row && typeof row === 'object') {
          return {
            ok: true,
            data: {
              label: String(row.VolumeName || ''),
              serial: String(row.VolumeSerialNumber || ''),
              fs: String(row.FileSystem || ''),
              total: Math.max(0, Number(row.Size) || 0),
              free: Math.max(0, Number(row.FreeSpace) || 0)
            }
          };
        }
      } catch (error) {
        // PowerShell غير متاح أو القرص غير موجود: نرجع إلى statfs.
      }
    }
  }

  return { ok: true, data: await volumeInfo(root) };
}

// --------------------------------------------------------------- handlers

function register(ipcMain, guard, options = {}) {
  engineOptions = options && typeof options === 'object' ? options : {};
  ipcMain.handle('storage:scan', guard(scan));
  ipcMain.handle('storage:locate', guard(locate));
  ipcMain.handle('storage:volume', guard(volume));
}

module.exports = {
  register,
  scan,
  locate,
  volume
};
