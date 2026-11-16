/* واجهة التخزين والأرشيف والسلة في الواجهة الرسومية.
   كل العمليات الحسّاسة تُنفَّذ في العملية الرئيسية؛ هذا الملف ينسّق فقط. */
const Storage = (() => {
  const UNIT = ['بايت', 'ك.ب', 'م.ب', 'غ.ب', 'ت.ب'];
  const SECTION_LABELS = { sources: 'المصادر', output: 'المخرجات', opencode: 'opencode' };
  const SECTION_ICONS = { sources: 'folder-source', output: 'folder-output', opencode: 'terminal' };
  let scanning = false;
  let lastScanAt = null;
  let scanError = '';
  let menu = null;
  let unbindMenu = null;

  function mmo() {
    try {
      return window.MMO || null;
    } catch (error) {
      return null;
    }
  }

  function available() {
    return Boolean(mmo()?.storage);
  }

  function data() {
    try {
      return Data.get();
    } catch (error) {
      return null;
    }
  }

  function repo() {
    return data()?.settings?.repo || null;
  }

  function archives() {
    return data()?.settings?.archives || [];
  }

  function snapshot() {
    return data()?.settings?.storage || null;
  }

  function hasSnapshot() {
    return Boolean(snapshot()?.scannedAt);
  }

  function human(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${Math.round(value)} بايت`;
    const exponent = Math.min(UNIT.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    const size = value / (1024 ** exponent);
    const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
    return `${size.toFixed(digits)} ${UNIT[exponent]}`;
  }

  /** «—» عند غياب لقطة، حتى لا تظهر أصفار مضللة قبل أول فحص. */
  function format(bytes) {
    if (!hasSnapshot()) return '—';
    return human(bytes);
  }

  function taskBytes(task) {
    return Math.max(0, Number(task?.storage?.total) || 0);
  }

  function groupBytes(groupId) {
    try {
      return Data.storageForGroup(groupId);
    } catch (error) {
      return 0;
    }
  }

  function percent(part, total) {
    const whole = Number(total) || 0;
    if (!whole) return 0;
    return Utils.clamp(Math.round((Number(part) || 0) / whole * 100), 0, 100);
  }

  function sectionsFor(task) {
    const storage = task?.storage || {};
    return ['sources', 'output', 'opencode'].map((key) => ({
      key,
      label: SECTION_LABELS[key],
      icon: SECTION_ICONS[key],
      bytes: Math.max(0, Number(storage[key]) || 0),
      archived: task?.archived?.[key] || null
    }));
  }

  function sectionLabel(section) {
    return SECTION_LABELS[section] || section || '';
  }

  function archiveFor(idOrRepoId) {
    if (!idOrRepoId) return null;
    return archives().find((item) => item.id === idOrRepoId || item.repoId === idOrRepoId) || null;
  }

  function primaryRepo() {
    const active = repo();
    return active?.path ? { id: 'primary', role: 'primary', label: active.label || 'المستودع الأساسي', path: active.path } : null;
  }

  function onlineArchive() {
    return archives().find((item) => item.path && item.status !== 'offline') || null;
  }

  function repoById(id) {
    if (!id || id === 'primary') return primaryRepo();
    const archive = archiveFor(id);
    return archive?.path ? { id: archive.id, role: 'archive', label: archive.label, path: archive.path, repoId: archive.repoId } : null;
  }

  function joinPath(base, rel) {
    const root = String(base || '').replace(/[\\/]+$/, '');
    const rest = String(rel || '').replace(/^[\\/]+/, '');
    if (!root) return rest;
    if (!rest) return root;
    return `${root}\\${rest}`;
  }

  // ------------------------------------------------------------- scan
  function scanPayload({ force = false } = {}) {
    const current = data();
    if (!current) return null;
    const repos = [];
    const active = current.settings.repo;
    if (active?.path) repos.push({ id: 'primary', repoId: active.repoId || '', path: active.path, role: 'primary', label: active.label || 'المستودع الأساسي' });
    (current.settings.archives || []).forEach((archive) => {
      if (!archive.path) return;
      repos.push({ id: archive.id, repoId: archive.repoId || '', path: archive.path, role: 'archive', label: archive.label || 'مستودع خارجي' });
    });
    if (!repos.length) return null;
    return {
      force,
      repos,
      tasks: current.tasks.map((task) => ({
        id: task.id,
        folder: task.folder || '',
        groupId: task.groupId || '',
        archived: task.archived || {}
      })),
      groups: current.groups.map((group) => ({ id: group.id, folder: group.folder || '' }))
    };
  }

  async function scan({ force = false, silent = false, refresh = true } = {}) {
    if (!available() || scanning) return { ok: false, code: scanning ? 'busy' : 'desktop-only' };
    const payload = scanPayload({ force });
    if (!payload) return { ok: false, code: 'no-repo' };
    scanning = true;
    scanError = '';
    try {
      const result = await mmo().storage.scan(payload);
      if (!result || result.ok === false) {
        scanError = result?.message || 'تعذر فحص المساحة.';
        if (!silent) App.toast(scanError, { type: 'error' });
        return { ok: false, message: scanError };
      }
      const snapshotData = result.data || {};
      Data.setStorageSnapshot(snapshotData);
      lastScanAt = snapshotData.scannedAt || new Date().toISOString();
      dispatch();
      if (refresh) App.refresh();
      return { ok: true, data: snapshotData };
    } catch (error) {
      scanError = error?.message || 'تعذر فحص المساحة.';
      if (!silent) App.toast(scanError, { type: 'error' });
      return { ok: false, message: scanError };
    } finally {
      scanning = false;
    }
  }

  function scanState() {
    return { scanning, at: lastScanAt || snapshot()?.scannedAt || null, error: scanError };
  }

  function dispatch() {
    try {
      window.dispatchEvent(new CustomEvent('mmo:storage-updated', { detail: snapshot() }));
    } catch (error) {}
  }

  function onChange(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback(snapshot());
    window.addEventListener('mmo:storage-updated', listener);
    return () => window.removeEventListener('mmo:storage-updated', listener);
  }

  // ---------------------------------------------------------- locate / open
  function candidatesFor({ taskId = '', groupId = '' } = {}) {
    const current = data();
    const active = primaryRepo();
    const list = [];
    if (taskId) {
      const task = current?.tasks.find((item) => item.id === taskId);
      if (task) {
        if (active && task.folder) {
          list.push({
            ...active,
            rel: task.folder,
            sections: ['sources', 'output', 'opencode'].filter((key) => !task.archived?.[key])
          });
        }
        (current.settings.archives || []).forEach((archive) => {
          if (!archive.path) return;
          const keys = ['sources', 'output', 'opencode'].filter((key) => {
            const info = task.archived?.[key];
            if (!info) return false;
            return (info.repoId && info.repoId === archive.repoId) || (info.archiveId && info.archiveId === archive.id);
          });
          const rels = [...new Set(keys.map((key) => task.archived[key].rel).filter(Boolean))];
          if (!rels.length) {
            if (task.folder) list.push({ id: archive.id, role: 'archive', label: archive.label, path: archive.path, rel: task.folder, sections: [] });
            return;
          }
          rels.forEach((rel) => {
            list.push({
              id: archive.id,
              role: 'archive',
              label: archive.label,
              path: archive.path,
              rel,
              sections: keys.filter((key) => task.archived[key].rel === rel)
            });
          });
        });
      }
    } else if (groupId) {
      const group = current?.groups.find((item) => item.id === groupId);
      if (group?.folder) {
        if (active) list.push({ ...active, rel: group.folder, sections: [] });
        (current.settings.archives || []).forEach((archive) => {
          if (archive.path) list.push({ id: archive.id, role: 'archive', label: archive.label, path: archive.path, rel: group.folder, sections: [] });
        });
      }
    }
    return list;
  }

  async function locate({ taskId = '', groupId = '' } = {}) {
    const items = candidatesFor({ taskId, groupId });
    if (!items.length) return [];
    if (!available()) return [];
    try {
      const result = await mmo().storage.locate({ items });
      if (result?.ok && Array.isArray(result.data?.locations)) return result.data.locations;
    } catch (error) {}
    const checked = [];
    for (const item of items) {
      try {
        const result = await mmo().repo.pathFor({ repoPath: item.path, relPath: item.rel });
        const exists = Boolean(result?.ok && result.data?.exists);
        if (exists) checked.push({ ...item, exists, absolute: result.data.absolute });
      } catch (error) {}
    }
    return checked;
  }

  function closeMenu() {
    if (menu) {
      menu.remove();
      menu = null;
    }
    if (unbindMenu) {
      unbindMenu();
      unbindMenu = null;
    }
  }

  function openMenu(anchor, locations) {
    closeMenu();
    const layer = document.createElement('div');
    layer.className = 'menu-pop card location-menu';
    layer.setAttribute('role', 'menu');
    layer.innerHTML = locations.map((item, index) => `
      <button type="button" role="menuitem" data-location="${index}">
        <span class="location-menu-icon">${Icons.svg(item.role === 'archive' ? 'hard-drive' : 'folder-open', 16)}</span>
        <span class="location-menu-text">
          <strong>${Utils.esc(item.label || (item.role === 'archive' ? 'مستودع خارجي' : 'المستودع الأساسي'))}</strong>
          <small dir="ltr">${Utils.esc(joinPath(item.path, item.rel))}</small>
          ${item.sections?.length ? `<span class="location-menu-sections">${item.sections.map((key) => SECTION_LABELS[key] || key).join(' · ')}</span>` : ''}
        </span>
      </button>`).join('');
    document.body.appendChild(layer);
    const rect = anchor.getBoundingClientRect();
    const width = layer.offsetWidth || 300;
    const height = layer.offsetHeight || 120;
    let left = rect.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
    layer.style.left = `${Math.round(left)}px`;
    layer.style.top = `${Math.round(top)}px`;
    layer.addEventListener('click', (event) => {
      const button = event.target.closest('[data-location]');
      if (!button) return;
      const item = locations[Number(button.dataset.location)];
      closeMenu();
      if (item) openLocation(item);
    });
    const onDocument = (event) => {
      if (!layer.contains(event.target) && event.target !== anchor && !anchor.contains(event.target)) closeMenu();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') closeMenu();
    };
    const timer = setTimeout(() => document.addEventListener('click', onDocument, true), 0);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', closeMenu, { once: true });
    unbindMenu = () => {
      clearTimeout(timer);
      document.removeEventListener('click', onDocument, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', closeMenu);
    };
    menu = layer;
    return layer;
  }

  async function openLocation(item) {
    if (!item?.path || !item?.rel) return { ok: false };
    try {
      const result = await mmo().repo.open({ repoPath: item.path, relPath: item.rel });
      if (!result?.ok) App.toast(result?.message || 'تعذر فتح المجلد.', { type: 'error' });
      return result;
    } catch (error) {
      App.toast(error?.message || 'تعذر فتح المجلد.', { type: 'error' });
      return { ok: false };
    }
  }

  async function openFolder({ taskId = '', groupId = '' } = {}, anchor = null) {
    if (!available()) {
      if (taskId) return window.Repo?.openTask?.(taskId);
      return window.Repo?.openGroup?.(groupId);
    }
    const locations = await locate({ taskId, groupId });
    if (!locations.length) {
      App.toast('لم يُعثر على مجلد المهمة في أي مستودع بعد. جرّب مزامنة المجلدات.', { type: 'info', icon: 'folder' });
      return { ok: false, code: 'missing' };
    }
    if (locations.length === 1) return openLocation(locations[0]);
    if (!anchor) return openLocation(locations[0]);
    openMenu(anchor, locations);
    return { ok: true, menu: true };
  }

  // --------------------------------------------------------- archive jobs
  function startArchiveJob(payload) {
    return new Promise((resolve) => {
      const service = mmo()?.archive;
      if (!service) {
        resolve({ ok: false, message: 'الأرشفة متاحة في تطبيق سطح المكتب فقط.' });
        return;
      }
      service.start(payload).then((started) => {
        if (!started?.ok) {
          resolve({ ok: false, message: started?.message || 'تعذر بدء عملية النقل.' });
          return;
        }
        const jobId = started.data?.jobId;
        if (!jobId) {
          resolve({ ok: true });
          return;
        }
        let off = () => {};
        if (typeof service.onDone !== 'function') {
          resolve({ ok: true });
          return;
        }
        const timer = setTimeout(() => {
          off();
          resolve({ ok: false, message: 'انتهت مهلة انتظار عملية النقل.' });
        }, 1000 * 60 * 60 * 6);
        off = service.onDone((event) => {
          if (!event || event.jobId !== jobId) return;
          off();
          clearTimeout(timer);
          resolve(event);
        });
      }).catch((error) => resolve({ ok: false, message: error?.message || 'تعذر بدء عملية النقل.' }));
    });
  }

  async function archiveSection(taskId, section, { confirm = true, silent = false } = {}) {
    if (!hasSnapshot()) await scan({ silent: true, refresh: false });
    const current = data();
    const task = current?.tasks.find((item) => item.id === taskId);
    const active = primaryRepo();
    if (!task || !active) {
      if (!silent) App.toast('اربط المستودع الأساسي أولًا.', { type: 'error' });
      return { ok: false, code: 'no-repo' };
    }
    if (task.archived?.[section]) {
      if (!silent) App.toast('هذا القسم مؤرشف بالفعل.', { type: 'info' });
      return { ok: false, code: 'already-archived' };
    }
    let target = onlineArchive();
    if (!target) {
      const linked = await linkArchive();
      if (!linked?.ok) return { ok: false, code: 'no-archive' };
      target = onlineArchive();
    }
    const bytes = Number(task.storage?.[section]) || 0;
    if (!bytes) {
      if (!silent) App.toast('لا توجد ملفات في هذا القسم.', { type: 'info', icon: 'folder' });
      return { ok: false, code: 'empty-section' };
    }
    if (confirm) {
      const ok = await App.confirm({
        title: `أرشفة ${SECTION_LABELS[section] || section}`,
        eyebrow: 'أرشفة بعيدة المدى',
        message: `سيُنقل «${task.title}» — ${SECTION_LABELS[section] || section} (${human(bytes)}) إلى «${target.label}» مع التحقق من كل ملف بالهاش قبل حذف المصدر.`,
        confirmText: 'ابدأ النقل',
        danger: false
      });
      if (!ok) return { ok: false, code: 'cancelled' };
    }
    const result = await startArchiveJob({
      type: 'archive',
      taskId,
      section,
      from: { repoId: 'primary', path: active.path },
      to: { repoId: target.repoId || target.id, path: target.path },
      rel: task.folder,
      sectionRel: section === 'sources' ? task.folder : [task.folder, section].filter(Boolean).join('\\')
    });
    if (!result.ok) {
      if (!silent) App.toast(result.message || 'فشلت عملية الأرشفة. لم يُحذف أي ملف من المصدر.', { type: 'error', duration: 6200 });
      return result;
    }
    const info = {
      repoId: target.repoId || target.id,
      archiveId: target.id,
      rel: task.folder,
      at: new Date().toISOString(),
      bytes: Number(result.data?.bytes) || bytes,
      files: Number(result.data?.files) || 0,
      receipt: result.data?.receipt || ''
    };
    Data.markArchived(taskId, section, info);
    Data.logStorage({ type: 'archive', taskId, section, bytes: info.bytes, ok: true, message: `إلى ${target.label}` });
    if (!silent) {
      App.toast(`تمت أرشفة ${SECTION_LABELS[section] || section} والتحقق منها بالهاش.`, { type: 'success', icon: 'archive' });
      await scan({ silent: true, refresh: true });
    }
    dispatch();
    return result;
  }

  async function archiveTask(taskId, { confirm = true, silent = false } = {}) {
    if (!hasSnapshot()) await scan({ silent: true, refresh: false });
    const task = data()?.tasks.find((item) => item.id === taskId);
    if (!task) return { ok: false };
    const sections = ['sources', 'output', 'opencode'].filter((key) => !task.archived?.[key] && Number(task.storage?.[key]) > 0);
    if (!sections.length) {
      if (!silent) App.toast('لا توجد أقسام قابلة للأرشفة.', { type: 'info' });
      return { ok: false, code: 'nothing' };
    }
    if (confirm) {
      const bytes = sections.reduce((sum, key) => sum + (Number(task.storage?.[key]) || 0), 0);
      const ok = await App.confirm({
        title: 'أرشفة المهمة',
        eyebrow: 'أرشفة بعيدة المدى',
        message: `ستُنقل أقسام (${sections.map((key) => SECTION_LABELS[key]).join(' · ')}) بحجم ${human(bytes)} إلى المستودع الخارجي، مع التحقق من كل ملف قبل حذفه من المصدر.`,
        confirmText: 'أرشفة المهمة'
      });
      if (!ok) return { ok: false, code: 'cancelled' };
    }
    let done = 0;
    for (const section of sections) {
      const result = await archiveSection(taskId, section, { confirm: false, silent: true });
      if (!result.ok) {
        if (!silent) App.toast(result.message || `تعذر أرشفة ${SECTION_LABELS[section]}.`, { type: 'error', duration: 6200 });
        return { ok: false, done, message: result.message };
      }
      done += 1;
    }
    if (!silent) {
      App.toast(`تمت أرشفة المهمة (${done} أقسام).`, { type: 'success', icon: 'archive' });
      await scan({ silent: true, refresh: true });
    }
    return { ok: true, done };
  }

  async function archiveGroup(groupId, { confirm = true, silent = false } = {}) {
    if (!hasSnapshot()) await scan({ silent: true, refresh: false });
    const list = (data()?.tasks || []).filter((task) => task.groupId === groupId);
    if (!list.length) {
      if (!silent) App.toast('لا توجد مهام في هذه المجموعة.', { type: 'info' });
      return { ok: false, code: 'empty' };
    }
    if (confirm) {
      const bytes = list.reduce((sum, task) => sum + (Number(task.storage?.total) || 0), 0);
      const ok = await App.confirm({
        title: 'أرشفة المجموعة',
        eyebrow: 'أرشفة بعيدة المدى',
        message: `ستُنقل ملفات ${list.length} مهمة (${human(bytes)}) إلى المستودع الخارجي مع التحقق بالهاش قبل حذف أي ملف.`,
        confirmText: 'أرشفة المجموعة'
      });
      if (!ok) return { ok: false, code: 'cancelled' };
    }
    let archived = 0;
    for (const task of list) {
      const result = await archiveTask(task.id, { confirm: false, silent: true });
      if (result.ok) archived += 1;
    }
    if (!silent) {
      App.toast(`تمت أرشفة ${archived} من ${list.length} مهام.`, { type: archived ? 'success' : 'warning', icon: 'archive' });
      await scan({ silent: true, refresh: true });
    }
    return { ok: archived > 0, archived };
  }

  async function restoreSection(taskId, section, { confirm = true, silent = false } = {}) {
    const task = data()?.tasks.find((item) => item.id === taskId);
    const info = task?.archived?.[section];
    const active = primaryRepo();
    if (!task || !info || !active) {
      if (!silent) App.toast('لا يوجد أرشيف لهذا القسم.', { type: 'info' });
      return { ok: false };
    }
    const source = repoById(info.archiveId || info.repoId);
    if (!source?.path) {
      if (!silent) App.toast('المستودع الخارجي غير متصل. أعد ربطه أولًا.', { type: 'error' });
      return { ok: false, code: 'offline' };
    }
    if (confirm) {
      const ok = await App.confirm({
        title: `استعادة ${SECTION_LABELS[section] || section}`,
        eyebrow: 'استعادة من الأرشيف',
        message: `سيُعاد القسم (${human(info.bytes)}) من «${source.label}» إلى المستودع الأساسي بعد التحقق بالهاش.`,
        confirmText: 'استعادة'
      });
      if (!ok) return { ok: false, code: 'cancelled' };
    }
    const result = await startArchiveJob({
      type: 'restore',
      taskId,
      section,
      from: { repoId: info.repoId || source.id, path: source.path },
      to: { repoId: 'primary', path: active.path },
      rel: info.rel || task.folder,
      sectionRel: section === 'sources' ? (info.rel || task.folder) : [info.rel || task.folder, section].filter(Boolean).join('\\')
    });
    if (!result.ok) {
      if (!silent) App.toast(result.message || 'تعذرت الاستعادة.', { type: 'error' });
      return result;
    }
    Data.unmarkArchived(taskId, section);
    Data.logStorage({ type: 'restore', taskId, section, bytes: Number(result.data?.bytes) || info.bytes, ok: true, message: `من ${source.label}` });
    if (!silent) {
      App.toast('تمت استعادة القسم والتحقق من ملفاته.', { type: 'success', icon: 'trash-restore' });
      await scan({ silent: true, refresh: true });
    }
    return result;
  }

  // ------------------------------------------------------------- trash
  async function trashSection(taskId, section, { confirm = true, silent = false } = {}) {
    const task = data()?.tasks.find((item) => item.id === taskId);
    if (!task) return { ok: false };
    const archived = task.archived?.[section] || null;
    const source = archived ? repoById(archived.archiveId || archived.repoId) : primaryRepo();
    if (!source?.path) {
      if (!silent) App.toast('المستودع غير متاح.', { type: 'error' });
      return { ok: false, code: 'offline' };
    }
    const bytes = Number(task.storage?.[section]) || Number(archived?.bytes) || 0;
    if (!bytes) {
      if (!silent) App.toast('لا توجد ملفات في هذا القسم.', { type: 'info' });
      return { ok: false, code: 'empty' };
    }
    if (confirm) {
      const ok = await App.confirm({
        title: `حذف ${SECTION_LABELS[section] || section}`,
        eyebrow: 'سلة المحذوفات',
        message: `سيُنقل القسم (${human(bytes)}) إلى سلة المحذوفات ويمكن استعادته خلال 7 أيام. المهمة نفسها لن تُحذف.`,
        confirmText: 'نقل إلى السلة',
        danger: true
      });
      if (!ok) return { ok: false, code: 'cancelled' };
    }
    const rel = archived ? archived.rel : task.folder;
    const result = await runTrashMove({
      repoPath: source.path,
      rel,
      section,
      whole: false,
      meta: { kind: 'section', taskId, section, archived, taskTitle: task.title }
    });
    if (!result.ok) {
      if (!silent) App.toast(result.message || 'تعذر نقل القسم إلى السلة.', { type: 'error' });
      return result;
    }
    if (archived) Data.unmarkArchived(taskId, section);
    Data.logStorage({ type: 'trash-section', taskId, section, bytes, ok: true, message: source.label });
    if (!silent) {
      App.toast('نُقل القسم إلى سلة المحذوفات.', { type: 'success', icon: 'trash' });
      await scan({ silent: true, refresh: true });
    }
    return result;
  }

  function runTrashMove({ repoPath, rel, section = '', whole = false, meta = {} }) {
    return new Promise((resolve) => {
      const service = mmo()?.trash;
      if (!service) {
        resolve({ ok: false, message: 'سلة المحذوفات متاحة في تطبيق سطح المكتب فقط.' });
        return;
      }
      service.move({ repoPath, rel, section, whole, meta }).then((result) => {
        resolve(result?.ok ? { ok: true, entry: result.data?.entry } : { ok: false, message: result?.message });
      }).catch((error) => resolve({ ok: false, message: error?.message }));
    });
  }

  async function trashTask(taskId, { confirm = true, silent = false } = {}) {
    const task = data()?.tasks.find((item) => item.id === taskId);
    if (!task) return { ok: false };
    const active = primaryRepo();
    if (confirm) {
      const bytes = Number(task.storage?.total) || 0;
      const archivedCount = Object.keys(task.archived || {}).length;
      const ok = await App.confirm({
        title: 'حذف المهمة',
        eyebrow: 'سلة المحذوفات',
        message: `سيُنقل مجلد المهمة${bytes ? ` (${human(bytes)})` : ''} إلى سلة المحذوفات لمدة 7 أيام، ثم يُحذف سجلها.${archivedCount ? ' الأقسام المؤرشفة تبقى في المستودع الخارجي حتى تحذفها من هناك.' : ''}`,
        confirmText: 'نقل إلى السلة',
        danger: true
      });
      if (!ok) return { ok: false, code: 'cancelled' };
    }
    let moved = false;
    if (active && task.folder) {
      const result = await runTrashMove({
        repoPath: active.path,
        rel: task.folder,
        whole: true,
        meta: { kind: 'task', taskId, taskTitle: task.title, record: { task } }
      });
      if (!result.ok) {
        if (!silent) App.toast(result.message || 'تعذر نقل مجلد المهمة إلى السلة.', { type: 'error' });
        return result;
      }
      moved = true;
    }
    Data.logStorage({ type: 'trash-task', taskId, bytes: Number(task.storage?.total) || 0, ok: true, message: task.title });
    Data.deleteTask(taskId);
    if (!silent) {
      App.toast(moved ? 'نُقلت المهمة إلى سلة المحذوفات.' : 'حُذف سجل المهمة.', { type: 'success', icon: 'trash' });
      await scan({ silent: true, refresh: true });
    }
    return { ok: true, moved };
  }

  async function trashGroup(groupId, { confirm = true, silent = false } = {}) {
    const current = data();
    const group = current?.groups.find((item) => item.id === groupId);
    if (!group) return { ok: false };
    const list = (current.tasks || []).filter((task) => task.groupId === groupId);
    if (confirm) {
      const bytes = list.reduce((sum, task) => sum + (Number(task.storage?.total) || 0), 0);
      const ok = await App.confirm({
        title: 'حذف المجموعة',
        eyebrow: 'سلة المحذوفات',
        message: `ستُنقل ملفات ${list.length} مهمة ومجلد المجموعة${bytes ? ` (${human(bytes)})` : ''} إلى سلة المحذوفات لمدة 7 أيام، ثم تُحذف سجلاتها.`,
        confirmText: 'نقل إلى السلة',
        danger: true
      });
      if (!ok) return { ok: false, code: 'cancelled' };
    }
    const active = primaryRepo();
    if (active) {
      for (const task of list) {
        if (!task.folder) continue;
        const moved = await runTrashMove({
          repoPath: active.path,
          rel: task.folder,
          whole: true,
          meta: { kind: 'task', taskId: task.id, taskTitle: task.title, record: { task }, groupId }
        });
        if (!moved.ok) {
          if (!silent) App.toast(moved.message || 'تعذر نقل إحدى المهام إلى السلة. لم تُحذف المجموعة.', { type: 'error', duration: 6200 });
          return { ok: false, message: moved.message };
        }
      }
      if (group.folder) {
        const moved = await runTrashMove({
          repoPath: active.path,
          rel: group.folder,
          whole: true,
          meta: { kind: 'group', groupId, groupName: group.name, record: { group, tasks: list } }
        });
        if (!moved.ok) {
          if (!silent) App.toast(moved.message || 'تعذر نقل مجلد المجموعة إلى السلة. لم تُحذف المجموعة.', { type: 'error', duration: 6200 });
          return { ok: false, message: moved.message };
        }
      }
    }
    Data.logStorage({ type: 'trash-group', bytes: list.reduce((sum, task) => sum + (Number(task.storage?.total) || 0), 0), ok: true, message: group.name });
    Data.deleteGroup(groupId);
    if (!silent) {
      App.toast('نُقلت المجموعة ومهامها إلى سلة المحذوفات.', { type: 'success', icon: 'trash' });
      await scan({ silent: true, refresh: true });
    }
    return { ok: true };
  }

  async function trashList() {
    if (!available() || !mmo()?.trash) return [];
    const repos = [];
    const active = primaryRepo();
    if (active) repos.push(active);
    archives().forEach((archive) => {
      if (archive.path) repos.push({ id: archive.id, role: 'archive', label: archive.label, path: archive.path, repoId: archive.repoId });
    });
    for (const item of repos) {
      try {
        if (typeof mmo().archive?.purgeExpired === 'function') await mmo().archive.purgeExpired({ repoPath: item.path });
      } catch (error) {}
    }
    const rows = [];
    for (const item of repos) {
      try {
        const result = await mmo().trash.list({ repoPath: item.path });
        if (result?.ok && Array.isArray(result.data?.entries)) {
          result.data.entries.forEach((entry) => rows.push({ ...entry, repoPath: item.path, repoLabel: item.label, repoRole: item.role }));
        }
      } catch (error) {}
    }
    rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return rows;
  }

  async function trashRestore(entry) {
    if (!entry?.repoPath || !entry?.id) return { ok: false };
    try {
      const result = await mmo().trash.restore({ repoPath: entry.repoPath, entryId: entry.id });
      if (!result?.ok) {
        App.toast(result?.message || 'تعذرت الاستعادة.', { type: 'error' });
        return result;
      }
      const record = entry.record || {};
      if (entry.kind === 'task' && record.task) Data.restoreTaskRecord(record.task);
      if (entry.kind === 'group' && record.group) Data.restoreGroupRecord(record);
      if (entry.kind === 'section' && entry.meta?.archived) Data.markArchived(entry.meta.taskId, entry.meta.section, entry.meta.archived);
      Data.logStorage({ type: 'restore-trash', bytes: entry.bytes, ok: true, message: entry.originalRel || '' });
      App.toast('تمت الاستعادة.', { type: 'success', icon: 'trash-restore' });
      await scan({ silent: true, refresh: true });
      return result;
    } catch (error) {
      App.toast(error?.message || 'تعذرت الاستعادة.', { type: 'error' });
      return { ok: false };
    }
  }

  async function trashDelete(entry) {
    if (!entry?.repoPath || !entry?.id) return { ok: false };
    const ok = await App.confirm({
      title: 'حذف نهائي',
      eyebrow: 'سلة المحذوفات',
      message: `سيُحذف «${entry.originalRel || entry.id}» نهائيًا ولا يمكن استعادته.`,
      confirmText: 'حذف نهائي',
      danger: true
    });
    if (!ok) return { ok: false };
    const result = await mmo().trash.delete({ repoPath: entry.repoPath, entryId: entry.id });
    if (!result?.ok) App.toast(result?.message || 'تعذر الحذف النهائي.', { type: 'error' });
    else {
      App.toast('حُذف نهائيًا.', { type: 'success', icon: 'trash' });
      await scan({ silent: true, refresh: true });
    }
    return result;
  }

  async function trashPurge(repoPath) {
    if (!repoPath) return { ok: false };
    const ok = await App.confirm({
      title: 'إفراغ سلة المحذوفات',
      eyebrow: 'سلة المحذوفات',
      message: 'ستُحذف كل عناصر السلة نهائيًا. لا يمكن التراجع.',
      confirmText: 'إفراغ السلة',
      danger: true
    });
    if (!ok) return { ok: false };
    const result = await mmo().trash.purge({ repoPath });
    if (!result?.ok) App.toast(result?.message || 'تعذر إفراغ السلة.', { type: 'error' });
    else {
      App.toast('أُفرغت السلة.', { type: 'success', icon: 'trash' });
      await scan({ silent: true, refresh: true });
    }
    return result;
  }

  // ------------------------------------------------------------- linking
  async function detectFolder() {
    const picked = await mmo().repo.pick();
    if (!picked?.ok || !picked.data?.path) return { ok: false, canceled: true };
    const path = picked.data.path;
    const detected = await mmo().repo.detect({ path });
    if (!detected?.ok) {
      App.toast(detected?.message || 'تعذر قراءة المجلد.', { type: 'error' });
      return { ok: false };
    }
    return { ok: true, path: detected.data?.path || path, data: detected.data || {} };
  }

  async function linkArchive() {
    if (!available()) {
      App.toast('ربط المستودع الخارجي متاح في تطبيق سطح المكتب فقط.', { type: 'error' });
      return { ok: false };
    }
    const found = await detectFolder();
    if (!found.ok) return found;
    const manifest = found.data.manifest;
    const path = found.path;
    const primary = primaryRepo();
    if (primary && ((manifest?.repoId && manifest.repoId === repo()?.repoId) || path === primary.path)) {
      App.toast('هذا هو المستودع الأساسي نفسه. اختر مجلدًا آخر للأرشيف.', { type: 'error' });
      return { ok: false };
    }
    const already = archives().find((item) => (manifest?.repoId && item.repoId === manifest.repoId) || item.path === path);
    if (already) {
      App.toast('هذا المستودع مربوط بالفعل.', { type: 'info' });
      return { ok: true, archive: already };
    }
    const label = String(manifest?.name || '').trim() || path.split(/[\\/]/).filter(Boolean).pop() || 'مستودع خارجي';
    const ok = await App.confirm({
      title: 'ربط مستودع خارجي',
      eyebrow: 'أرشفة طويلة الأمد',
      message: `سيُسجَّل «${label}» في ${path} كمستودع أرشيف.${manifest ? ' وُجد ملف تعريف سابق، وسيُستخدم معرّفه.' : ' سيُنشأ ملف تعريف جديد داخل المجلد.'}`,
      confirmText: 'ربط المستودع'
    });
    if (!ok) return { ok: false, canceled: true };
    let repoId = manifest?.repoId || '';
    if (!manifest) {
      const registered = await mmo().repo.register({ path, role: 'archive', label });
      if (!registered?.ok) {
        App.toast(registered?.message || 'تعذر إنشاء ملف تعريف المستودع.', { type: 'error' });
        return { ok: false };
      }
      repoId = registered.data?.manifest?.repoId || '';
    }
    const archive = Data.addArchive({ repoId, path, label });
    Data.logStorage({ type: 'link-archive', ok: true, message: `${label} — ${path}` });
    App.toast('تم ربط المستودع الخارجي.', { type: 'success', icon: 'hard-drive' });
    await scan({ silent: true, refresh: true });
    return { ok: true, archive };
  }

  async function relinkArchive(archiveId) {
    const archive = archiveFor(archiveId);
    if (!archive) return { ok: false };
    const found = await detectFolder();
    if (!found.ok) return found;
    const manifest = found.data.manifest;
    if (manifest?.repoId && archive.repoId && manifest.repoId !== archive.repoId) {
      const ok = await App.confirm({
        title: 'مستودع مختلف',
        eyebrow: 'إعادة ربط',
        message: 'ملف التعريف في هذا المجلد يخص مستودعًا آخر. هل تريد ربطه بدلًا من المستودع الحالي؟ لن تُحذف أي ملفات.',
        confirmText: 'ربط على أي حال',
        danger: true
      });
      if (!ok) return { ok: false };
    }
    let repoId = manifest?.repoId || archive.repoId || '';
    if (!manifest) {
      const registered = await mmo().repo.register({ path: found.path, role: 'archive', label: archive.label });
      if (!registered?.ok) {
        App.toast(registered?.message || 'تعذر قراءة المستودع.', { type: 'error' });
        return { ok: false };
      }
      repoId = registered.data?.manifest?.repoId || repoId;
    }
    Data.updateArchive(archive.id, { path: found.path, repoId, status: 'online', lastSeenAt: new Date().toISOString() });
    Data.logStorage({ type: 'relink-archive', ok: true, message: `${archive.label} — ${found.path}` });
    App.toast('أُعيد ربط المستودع الخارجي.', { type: 'success', icon: 'hard-drive' });
    await scan({ silent: true, refresh: true });
    return { ok: true };
  }

  async function unlinkArchive(archiveId) {
    const archive = archiveFor(archiveId);
    if (!archive) return { ok: false };
    const ok = await App.confirm({
      title: 'فك ربط المستودع',
      eyebrow: 'أرشفة طويلة الأمد',
      message: `سيفقد التطبيق الوصول إلى «${archive.label}». الملفات تبقى كما هي على القرص، ويمكن ربطها لاحقًا.`,
      confirmText: 'فك الربط',
      danger: true
    });
    if (!ok) return { ok: false };
    Data.removeArchive(archive.id);
    Data.logStorage({ type: 'unlink-archive', ok: true, message: archive.label });
    App.toast('فُك ربط المستودع.', { type: 'success' });
    return { ok: true };
  }

  return {
    available,
    human,
    format,
    hasSnapshot,
    snapshot,
    scannedAt: () => lastScanAt || snapshot()?.scannedAt || null,
    scanState,
    scan,
    scanPayload,
    onChange,
    taskBytes,
    groupBytes,
    percent,
    sectionsFor,
    sectionLabel,
    archiveFor,
    primaryRepo,
    onlineArchive,
    repoById,
    joinPath,
    locate,
    openFolder,
    openLocation,
    linkArchive,
    relinkArchive,
    unlinkArchive,
    archiveSection,
    archiveTask,
    archiveGroup,
    restoreSection,
    trashSection,
    trashTask,
    trashGroup,
    trashList,
    trashRestore,
    trashDelete,
    trashPurge
  };
})();

try {
  if (typeof window !== 'undefined') window.Storage = Storage;
} catch (error) {}
