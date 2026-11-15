const Repo = (() => {
  const DESKTOP_ONLY = 'مجلدات المهام تحتاج تطبيق سطح المكتب.';
  const NOT_LINKED = 'لم يتم ربط مستودع الملفات بعد.';
  const GENERIC_ERROR = 'تعذر إكمال العملية.';

  let absolutes = { groups: {}, tasks: {} };
  let syncJob = null;
  let queuedSilent = null;
  let autoTimer = null;
  let repoExists = true;

  function api() {
    return window.MMO && window.MMO.repo ? window.MMO.repo : null;
  }

  function available() {
    const repoApi = api();
    return Boolean(repoApi && typeof repoApi.sync === 'function');
  }

  function toast(message, options = {}) {
    if (window.App && typeof window.App.toast === 'function') window.App.toast(message, options);
  }

  function refreshUI() {
    if (window.App && typeof window.App.refresh === 'function') window.App.refresh();
  }

  function cleanMessage(error) {
    const raw = String(error && error.message ? error.message : error || '').trim();
    if (!raw) return GENERIC_ERROR;
    const match = /Error:\s*([\s\S]+)$/.exec(raw);
    const text = (match ? match[1] : raw).replace(/^Error:\s*/, '').trim();
    return text || GENERIC_ERROR;
  }

  function fail(error) {
    const message = cleanMessage(error);
    toast(message, { type: 'error', duration: 5200 });
    return message;
  }

  function desktopOnly(fallback) {
    toast(DESKTOP_ONLY, { type: 'info' });
    return fallback;
  }

  function data() {
    try {
      return Data.get();
    } catch (error) {
      return null;
    }
  }

  function repoPath() {
    const repo = data() && data().settings ? data().settings.repo : null;
    return String(repo && repo.path ? repo.path : '');
  }

  function folderFor(target) {
    try {
      return Data.folderFor(target) || '';
    } catch (error) {
      return '';
    }
  }

  function sep() {
    return window.MMO && window.MMO.platform === 'win32' ? '\\' : '/';
  }

  function joinPath(base, rel) {
    if (!base) return String(rel || '');
    if (!rel) return String(base);
    return `${String(base).replace(/[\\/]+$/, '')}${sep()}${String(rel).replace(/^[\\/]+/, '')}`;
  }

  function plural(count, one, two, few, many) {
    if (window.Utils && typeof window.Utils.plural === 'function') {
      return window.Utils.plural(count, one, two, few, many);
    }
    return `${count} ${many}`;
  }

  function resetCaches() {
    absolutes = { groups: {}, tasks: {} };
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
    queuedSilent = null;
    repoExists = true;
  }

  function status() {
    const current = data();
    const repo = current && current.settings ? current.settings.repo : null;
    const path = String(repo && repo.path ? repo.path : '');
    return {
      linked: Boolean(path),
      path,
      exists: Boolean(path) && repoExists,
      lastSyncAt: (repo && repo.lastSyncAt) || null,
      repoId: (repo && repo.repoId) || '',
      autoRename: !repo || repo.autoRename !== false
    };
  }

  // ------------------------------------------------------------- sync

  function syncSummary(resultData) {
    const count = Object.keys(resultData.tasks || {}).length;
    const created = (resultData.actions || []).filter((action) => action.type === 'created').length;
    const warnings = Array.isArray(resultData.warnings) ? resultData.warnings.length : 0;
    const label = plural(count, 'مجلد مهمة واحد', 'مجلدَي مهام', 'مجلدات مهام', 'مجلد مهام');
    if (warnings) {
      return { message: `تمت مزامنة ${label} مع ${warnings} تنبيه.`, type: 'warning' };
    }
    if (created) {
      const made = plural(created, 'مجلد جديد', 'مجلدين جديدين', 'مجلدات جديدة', 'مجلدًا جديدًا');
      return { message: `تمت مزامنة ${label} وإنشاء ${made}.`, type: 'success' };
    }
    return { message: `تمت مزامنة ${label}.`, type: 'success' };
  }

  async function runSync(silent) {
    try {
      const current = data();
      const repo = current && current.settings ? current.settings.repo : null;
      if (!current || !repo || !repo.path) return { ok: false, code: 'no-repo' };
      const groupNames = new Map(current.groups.map((group) => [group.id, group.name]));
      const result = await window.MMO.repo.sync({
        repoPath: repo.path,
        autoRename: repo.autoRename !== false,
        groups: current.groups.map((group) => ({
          id: group.id,
          name: group.name,
          createdAt: group.createdAt || ''
        })),
        tasks: current.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          groupId: task.groupId || null,
          groupName: task.groupId ? (groupNames.get(task.groupId) || '') : '',
          date: task.date || '',
          createdAt: task.createdAt || ''
        }))
      });
      if (!result || !result.ok) throw new Error(result && result.message ? result.message : 'تعذرت مزامنة المجلدات.');
      const resultData = result.data || {};
      absolutes = {
        groups: resultData.absolute && resultData.absolute.groups ? resultData.absolute.groups : {},
        tasks: resultData.absolute && resultData.absolute.tasks ? resultData.absolute.tasks : {}
      };
      repoExists = true;
      Data.applyFolderIndex({
        groups: resultData.groups || {},
        tasks: resultData.tasks || {},
        syncedAt: new Date().toISOString()
      });
      if (!silent) {
        const summary = syncSummary(resultData);
        toast(summary.message, { type: summary.type, duration: summary.type === 'warning' ? 5200 : 3800 });
        refreshUI();
      }
      return { ok: true, data: resultData };
    } catch (error) {
      const message = cleanMessage(error);
      if (/غير موجود/.test(message)) repoExists = false;
      if (!silent) toast(message, { type: 'error', duration: 5200 });
      return { ok: false, message };
    }
  }

  function sync(options = {}) {
    const silent = options.silent === true;
    if (!available()) {
      if (!silent) desktopOnly(false);
      return Promise.resolve({ ok: false, code: 'desktop-only' });
    }
    if (!repoPath()) {
      if (!silent) toast(NOT_LINKED, { type: 'info' });
      return Promise.resolve({ ok: false, code: 'no-repo' });
    }
    if (syncJob) {
      queuedSilent = queuedSilent === null ? silent : Boolean(queuedSilent && silent);
      return syncJob;
    }
    syncJob = (async () => {
      let result = await runSync(silent);
      while (queuedSilent !== null) {
        const nextSilent = queuedSilent;
        queuedSilent = null;
        result = await runSync(nextSilent);
      }
      return result;
    })().then((result) => {
      syncJob = null;
      return result;
    }, (error) => {
      syncJob = null;
      return { ok: false, message: cleanMessage(error) };
    });
    return syncJob;
  }

  function autoSync() {
    if (!available() || !repoPath()) return;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      autoTimer = null;
      sync({ silent: true });
    }, 1500);
  }

  // ------------------------------------------------------------- link

  async function linkPath(target) {
    const detection = await window.MMO.repo.detect(target);
    if (!detection || !detection.ok) throw new Error(detection && detection.message ? detection.message : 'تعذر قراءة المجلد المختار.');
    if (detection.data && detection.data.writable === false) {
      toast('المجلد المختار غير قابل للكتابة.', { type: 'error' });
      return { ok: false, path: target };
    }
    const linked = await window.MMO.repo.link(target);
    if (!linked || !linked.ok) throw new Error(linked && linked.message ? linked.message : 'تعذر ربط المجلد.');
    const linkedData = linked.data || {};
    const autoRename = (() => {
      const repo = data() && data().settings ? data().settings.repo : null;
      return !repo || repo.autoRename !== false;
    })();
    resetCaches();
    Data.linkRepo({
      path: linkedData.path || target,
      repoId: linkedData.manifest ? linkedData.manifest.repoId || '' : '',
      autoRename
    });
    const result = await sync({ silent: true });
    repoExists = Boolean(result && result.ok);
    if (!result || !result.ok) {
      toast('تم ربط المجلد، لكن تعذرت مزامنة مجلدات المهام. حاول المزامنة من الإعدادات.', { type: 'warning', duration: 5600 });
      refreshUI();
      return { ok: false, path: linkedData.path || target };
    }
    toast(
      detection.data && detection.data.isRepo ? 'تم ربط مستودع موجود ومزامنة مجلداته.' : 'تم إنشاء مستودع جديد ومزامنة مجلداته.',
      { type: 'success', icon: 'folder' }
    );
    refreshUI();
    return { ok: true, path: linkedData.path || target };
  }

  async function link() {
    if (!available()) return desktopOnly(false);
    try {
      const picked = await window.MMO.repo.pick();
      if (!picked || !picked.ok) throw new Error(picked && picked.message ? picked.message : 'تعذر اختيار المجلد.');
      const target = picked.data ? picked.data.path : '';
      if (!target) return { ok: true, canceled: true, cancelled: true };
      return await linkPath(target);
    } catch (error) {
      fail(error);
      return { ok: false };
    }
  }

  async function relink() {
    return link();
  }

  async function unlink() {
    try {
      try {
        await window.MMO?.repo?.forget?.();
      } catch (error) {}
      Data.unlinkRepo();
      resetCaches();
      toast('تم فصل المستودع، وبقيت الملفات في مكانها.', { type: 'info' });
      refreshUI();
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }

  // ------------------------------------------------------- ensure folders

  async function ensureTask(taskId) {
    if (!available()) return desktopOnly('');
    const path = repoPath();
    if (!path) {
      toast(NOT_LINKED, { type: 'info' });
      return '';
    }
    try {
      const task = (data() ? data().tasks : []).find((item) => item.id === taskId);
      if (!task) {
        toast('المهمة غير موجودة.', { type: 'error' });
        return '';
      }
      const rel = folderFor({ taskId });
      if (rel) {
        const check = await window.MMO.repo.pathFor({ repoPath: path, relPath: rel });
        if (check && check.ok && check.data && check.data.exists) {
          absolutes.tasks[taskId] = check.data.absolute;
          return rel;
        }
      }
      const result = await sync({ silent: true });
      if (!result || !result.ok) {
        toast('تعذر تجهيز مجلد المهمة.', { type: 'error', duration: 5200 });
        return '';
      }
      const folder = folderFor({ taskId });
      if (!folder) toast('تعذر تحديد مجلد المهمة.', { type: 'error' });
      return folder;
    } catch (error) {
      fail(error);
      return '';
    }
  }

  async function ensureGroup(groupId) {
    if (!available()) return desktopOnly('');
    const path = repoPath();
    if (!path) {
      toast(NOT_LINKED, { type: 'info' });
      return '';
    }
    try {
      const group = (data() ? data().groups : []).find((item) => item.id === groupId);
      if (!group) {
        toast('المجموعة غير موجودة.', { type: 'error' });
        return '';
      }
      const rel = folderFor({ groupId });
      if (rel) {
        const check = await window.MMO.repo.pathFor({ repoPath: path, relPath: rel });
        if (check && check.ok && check.data && check.data.exists) {
          absolutes.groups[groupId] = check.data.absolute;
          return rel;
        }
      }
      const result = await sync({ silent: true });
      if (!result || !result.ok) {
        toast('تعذر تجهيز مجلد المجموعة.', { type: 'error', duration: 5200 });
        return '';
      }
      const folder = folderFor({ groupId });
      if (!folder) toast('تعذر تحديد مجلد المجموعة.', { type: 'error' });
      return folder;
    } catch (error) {
      fail(error);
      return '';
    }
  }

  // ------------------------------------------------------------- opening

  async function openPath(relPath, kind) {
    const path = repoPath();
    if (!path) {
      toast(NOT_LINKED, { type: 'info' });
      return false;
    }
    const payload = { repoPath: path, relPath };
    if (kind) payload.kind = kind;
    const result = await window.MMO.repo.open(payload);
    if (!result || !result.ok) throw new Error(result && result.message ? result.message : 'تعذر فتح المجلد.');
    return true;
  }

  async function openTask(taskId) {
    if (!available()) return desktopOnly(false);
    try {
      if (!repoPath()) {
        toast(NOT_LINKED, { type: 'info' });
        return false;
      }
      const rel = await ensureTask(taskId);
      if (!rel) return false;
      return await openPath(rel);
    } catch (error) {
      fail(error);
      return false;
    }
  }

  async function openTaskOutput(taskId) {
    if (!available()) return desktopOnly(false);
    try {
      if (!repoPath()) {
        toast(NOT_LINKED, { type: 'info' });
        return false;
      }
      const rel = await ensureTask(taskId);
      if (!rel) return false;
      return await openPath(rel, 'task-output');
    } catch (error) {
      fail(error);
      return false;
    }
  }

  async function openTaskOpencode(taskId) {
    if (!available()) return desktopOnly(false);
    try {
      if (!repoPath()) {
        toast(NOT_LINKED, { type: 'info' });
        return false;
      }
      const rel = await ensureTask(taskId);
      if (!rel) return false;
      return await openPath(rel, 'task-opencode');
    } catch (error) {
      fail(error);
      return false;
    }
  }

  async function openGroup(groupId) {
    if (!available()) return desktopOnly(false);
    try {
      if (!repoPath()) {
        toast(NOT_LINKED, { type: 'info' });
        return false;
      }
      const rel = await ensureGroup(groupId);
      if (!rel) return false;
      return await openPath(rel);
    } catch (error) {
      fail(error);
      return false;
    }
  }

  async function openRepo() {
    if (!available()) return desktopOnly(false);
    try {
      if (!repoPath()) {
        toast(NOT_LINKED, { type: 'info' });
        return false;
      }
      return await openPath('');
    } catch (error) {
      fail(error);
      return false;
    }
  }

  async function refreshMissing() {
    if (!available()) return desktopOnly(false);
    if (!repoPath()) {
      toast(NOT_LINKED, { type: 'info' });
      return { ok: false, message: NOT_LINKED };
    }
    const result = await sync({ silent: true });
    if (!result || !result.ok) {
      toast('تعذر فحص مجلدات المستودع.', { type: 'error', duration: 5200 });
      return { ok: false, message: 'تعذر فحص مجلدات المستودع.' };
    }
    const resultData = result.data || {};
    const warnings = Array.isArray(resultData.warnings) ? resultData.warnings.length : 0;
    const created = (resultData.actions || []).filter((action) => action.type === 'created').length;
    if (warnings) {
      toast(`تم الفحص مع ${warnings} تنبيه يحتاج مراجعة.`, { type: 'warning', duration: 5200 });
    } else if (created) {
      const made = plural(created, 'مجلدًا ناقصًا', 'مجلدين ناقصين', 'مجلدات ناقصة', 'مجلدًا ناقصًا');
      toast(`تم إنشاء ${made}.`, { type: 'success' });
    } else {
      toast('كل مجلدات المستودع موجودة.', { type: 'success' });
    }
    refreshUI();
    return { ok: true, created, warnings };
  }

  // ------------------------------------------------------------- helpers

  function abs(taskId) {
    if (!repoPath()) return '';
    if (absolutes.tasks[taskId]) return absolutes.tasks[taskId];
    const rel = folderFor({ taskId });
    return rel ? joinPath(repoPath(), rel) : '';
  }

  function absGroup(groupId) {
    if (!repoPath()) return '';
    if (absolutes.groups[groupId]) return absolutes.groups[groupId];
    const rel = folderFor({ groupId });
    return rel ? joinPath(repoPath(), rel) : '';
  }

  function displayPath(target, options = {}) {
    let rel = '';
    if (typeof target === 'string') rel = target;
    else if (target && target.taskId) rel = folderFor({ taskId: target.taskId });
    else if (target && target.groupId) rel = folderFor({ groupId: target.groupId });
    if (!rel) return '';
    const text = options.absolute === false ? rel : joinPath(repoPath(), rel);
    const limit = Number(options.limit) || 72;
    return text.length > limit ? `…${text.slice(-limit)}` : text;
  }

  return {
    available,
    status,
    link,
    relink,
    unlink,
    sync,
    autoSync,
    ensureTask,
    ensureGroup,
    openTask,
    openTaskOutput,
    openTaskOpencode,
    openGroup,
    openRepo,
    refreshMissing,
    abs,
    absGroup,
    displayPath
  };
})();
