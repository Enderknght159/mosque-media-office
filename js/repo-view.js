/* تبويب المستودع والأرشيف — عرض فقط.
   كل العمليات الحسّاسة (نقل/أرشفة/سلة) تُنفَّذ عبر Storage، والربط عبر Repo.
   page() متزامنة وتعيد HTML فقط، وbind(root) تربط الأحداث وتجلب السلة. */
const RepoView = (() => {
  'use strict';

  const MANIFEST_NAME = 'mosque-media-office.repo.json';
  const SECTIONS = ['sources', 'output', 'opencode'];
  const SECTION_LABELS = { sources: 'المصادر', output: 'المخرجات', opencode: 'opencode' };
  const SECTION_ICONS = { sources: 'folder-source', output: 'folder-output', opencode: 'terminal' };
  const SORT_KEYS = ['title', 'group', 'sources', 'output', 'opencode', 'total'];
  const SEGMENTS = [
    { key: 'sources', label: 'المصادر', icon: 'folder-source' },
    { key: 'output', label: 'المخرجات', icon: 'folder-output' },
    { key: 'opencode', label: 'opencode', icon: 'terminal' },
    { key: 'other', label: 'أخرى', icon: 'layers' },
    { key: 'trash', label: 'السلة', icon: 'trash' }
  ];
  const OP_TYPES = {
    archive: { icon: 'archive', label: 'أرشفة قسم' },
    restore: { icon: 'undo', label: 'استعادة قسم' },
    'trash-section': { icon: 'trash', label: 'نقل قسم إلى السلة' },
    'trash-task': { icon: 'trash', label: 'نقل مهمة إلى السلة' },
    'trash-group': { icon: 'trash', label: 'نقل مجموعة إلى السلة' },
    'restore-trash': { icon: 'undo', label: 'استعادة من السلة' },
    'link-archive': { icon: 'hard-drive', label: 'ربط مستودع خارجي' },
    'relink-archive': { icon: 'link', label: 'إعادة ربط مستودع' },
    'unlink-archive': { icon: 'unlink', label: 'فك ربط مستودع' }
  };

  /* حالة العرض محفوظة بين عمليات الرسم. */
  const selected = new Set();
  let sort = { key: 'total', dir: 'desc' };
  let trashEntries = new Map();
  let trashToken = 0;
  let activeRoot = null;
  let storageUnsubscribe = null;
  let autoScanRunning = false;
  let lastScanRequest = 0;
  let sectionMenu = null;

  // ------------------------------------------------------------ helpers
  function esc(value) {
    return Utils.esc(value == null ? '' : String(value));
  }

  function num(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function storageApi() {
    try {
      if (window.Storage) return window.Storage;
      return typeof Storage === 'undefined' ? null : Storage;
    } catch (error) {
      return null;
    }
  }

  function dataApi() {
    try {
      if (window.Data) return window.Data;
      return typeof Data === 'undefined' ? null : Data;
    } catch (error) {
      return null;
    }
  }

  function appApi() {
    try {
      if (window.App) return window.App;
      return typeof App === 'undefined' ? null : App;
    } catch (error) {
      return null;
    }
  }

  function currentData() {
    try {
      return dataApi()?.get?.() || null;
    } catch (error) {
      return null;
    }
  }

  function human(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    const api = storageApi();
    if (api && typeof api.human === 'function') return api.human(value);
    return Utils.humanSize(value);
  }

  function pct(part, total) {
    const whole = Number(total) || 0;
    if (!whole) return 0;
    const api = storageApi();
    if (api && typeof api.percent === 'function') return api.percent(part, whole);
    return Utils.clamp(Math.round((Number(part) || 0) / whole * 100), 0, 100);
  }

  function relative(when, fallback = 'لم يُسجَّل') {
    if (!when) return fallback;
    const text = Utils.relativeTime(when);
    return text || fallback;
  }

  function dateTitle(when) {
    return when ? Utils.fmtDateTime(when) : '';
  }

  function sectionLabel(key) {
    return SECTION_LABELS[key] || key || '';
  }

  function toast(message, type = 'info', icon = '') {
    try {
      window.App?.toast?.(message, { type, icon: icon || undefined });
    } catch (error) {}
  }

  function refreshView() {
    try {
      window.App?.refresh?.();
    } catch (error) {}
  }

  function repoApi() {
    try {
      return window.Repo || null;
    } catch (error) {
      return null;
    }
  }

  function modalsApi() {
    try {
      if (window.Modals) return window.Modals;
      return typeof Modals === 'undefined' ? null : Modals;
    } catch (error) {
      return null;
    }
  }

  function findTask(taskId) {
    try {
      return dataApi()?.findTask?.(taskId) || null;
    } catch (error) {
      return null;
    }
  }

  function groupOf(task) {
    try {
      return task ? dataApi()?.findGroup?.(task.groupId) || null : null;
    } catch (error) {
      return null;
    }
  }

  function groupName(task) {
    return groupOf(task)?.name || 'بدون مجموعة';
  }

  function hasLiveRun(taskId) {
    try {
      return (dataApi()?.automationsForTask?.(taskId) || [])
        .some((job) => ['running', 'queued'].includes(job.status));
    } catch (error) {
      return false;
    }
  }

  function iconBtn(action, icon, label, options = {}) {
    const sizeClass = options.size || 'sm';
    const danger = options.danger ? ' danger-text' : '';
    const title = options.title || label;
    const aria = options.ariaLabel || label;
    const data = options.data ? `${options.data} ` : '';
    const disabled = options.disabled ? ' disabled' : '';
    return `<button type="button" class="icon-btn ${sizeClass}${danger}" data-action="${esc(action)}" ${data}title="${esc(title)}" aria-label="${esc(aria)}"${disabled}>${Icons.svg(icon, options.iconSize || 15)}</button>`;
  }

  function statusChip(online) {
    return `<span class="status-chip repo-status ${online ? 'is-online' : 'is-offline'}"><i></i>${online ? 'متصل' : 'غير متصل'}</span>`;
  }

  function pathLine(path) {
    return `<span class="repo-path" dir="ltr" title="${esc(path)}">${esc(path)}</span>`;
  }

  function syncLine(when, fallback) {
    return `<span class="repo-sync" title="${esc(dateTitle(when) || fallback)}">${Icons.svg('refresh', 12)}<span>${esc(relative(when, fallback))}</span></span>`;
  }

  // ------------------------------------------------------------- models
  function snapshotOf(data) {
    return data?.settings?.storage || null;
  }

  function repoEntries(data) {
    const settings = data?.settings || {};
    const snap = snapshotOf(data);
    const list = [];
    const repo = settings.repo || null;
    if (repo?.path) {
      const item = snap?.repos?.primary || null;
      list.push({
        id: 'primary',
        role: 'primary',
        label: repo.label || 'المستودع الأساسي',
        path: repo.path,
        online: item ? item.online !== false : true,
        capacity: num(item?.capacity) || num(repo.volume?.total),
        used: num(item?.used),
        free: item ? num(item.free) : num(repo.volume?.free),
        sections: item?.sections || null
      });
    }
    (settings.archives || []).forEach((archive) => {
      if (!archive?.path) return;
      const item = snap?.repos?.[archive.id]
        || (archive.repoId ? snap?.repos?.[archive.repoId] : null)
        || null;
      list.push({
        id: archive.id,
        role: 'archive',
        label: archive.label || 'مستودع خارجي',
        path: archive.path,
        online: item ? item.online !== false : archive.status !== 'offline',
        capacity: num(item?.capacity) || num(archive.volume?.total),
        used: num(item?.used),
        free: item ? num(item.free) : num(archive.volume?.free),
        sections: item?.sections || null
      });
    });
    return list;
  }

  function usageFor(archive, tasks) {
    let archivedTasks = 0;
    let sections = 0;
    (tasks || []).forEach((task) => {
      let hit = 0;
      SECTIONS.forEach((key) => {
        const info = task.archived?.[key];
        if (!info) return;
        if ((archive.id && info.archiveId === archive.id)
          || (archive.repoId && info.repoId === archive.repoId)) hit += 1;
      });
      if (hit) {
        archivedTasks += 1;
        sections += hit;
      }
    });
    return { tasks: archivedTasks, sections };
  }

  function rankedTasks(data) {
    const list = (data?.tasks || []).filter((task) => num(task.storage?.total) > 0);
    const direction = sort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let diff = 0;
      if (sort.key === 'title') {
        diff = String(a.title || '').localeCompare(String(b.title || ''), 'ar');
      } else if (sort.key === 'group') {
        diff = groupName(a).localeCompare(groupName(b), 'ar');
      } else {
        diff = num(a.storage?.[sort.key]) - num(b.storage?.[sort.key]);
      }
      if (diff !== 0) return direction * diff;
      return num(b.storage?.total) - num(a.storage?.total);
    });
    return list.slice(0, 25);
  }

  // -------------------------------------------------------------- donut
  function donutValues(entry) {
    const values = {};
    SEGMENTS.forEach((segment) => {
      values[segment.key] = num(entry?.sections?.[segment.key]);
    });
    let total = SEGMENTS.reduce((sum, segment) => sum + values[segment.key], 0);
    const used = num(entry?.used);
    if (!total && used) {
      values.other = used;
      total = used;
    }
    return { values, total };
  }

  function donutMarkup({ entry, hasSnapshot, online, sizeClass = 'lg' }) {
    const { values, total } = donutValues(entry);
    const used = num(entry?.used);
    const free = num(entry?.free);
    const usedText = hasSnapshot && online ? human(used) : '—';
    const freeText = hasSnapshot && online ? human(free) : '—';
    const detail = SEGMENTS.filter((segment) => values[segment.key] > 0)
      .map((segment) => `${segment.label} ${human(values[segment.key])}`);
    const label = !online
      ? 'المستودع غير متصل — لا تتوفر مساحة محدثة'
      : !hasSnapshot
        ? 'لم تُفحص المساحة بعد'
        : `المستخدم ${usedText}، المتاح ${freeText}${detail.length ? `، التوزيع: ${detail.join('، ')}` : ''}`;
    let acc = 0;
    const stops = SEGMENTS.map((segment) => {
      acc += total ? (values[segment.key] / total) * 100 : 0;
      return `--b-${segment.key}:${acc.toFixed(2)}%`;
    }).join(';');
    const empty = total ? '' : ' is-empty';
    return `
      <div class="repo-donut ${esc(sizeClass)}${empty}" role="img" aria-label="${esc(label)}" style="${stops}" title="${esc(label)}">
        <span class="repo-donut-center">
          <strong dir="ltr">${esc(usedText)}</strong>
          <small dir="ltr">/ ${esc(freeText)}</small>
        </span>
      </div>`;
  }

  function legendMarkup(entry, hasSnapshot, online) {
    const { values } = donutValues(entry);
    const items = SEGMENTS.filter((segment) => values[segment.key] > 0);
    if (!items.length) return '';
    return `
      <div class="repo-legend" aria-label="توزيع المساحة">
        ${items.map((segment) => `
          <span class="repo-legend-item is-${segment.key}">
            <i class="repo-legend-dot is-${segment.key}"></i>
            ${Icons.svg(segment.icon, 10, 'repo-legend-icon')}
            <span>${esc(segment.label)}</span>
            <b dir="ltr">${esc(hasSnapshot && online ? human(values[segment.key]) : '—')}</b>
          </span>`).join('')}
      </div>`;
  }

  function countMarkup(icon, count, title) {
    return `<span class="repo-count" title="${esc(title)}">${Icons.svg(icon, 12)}<b dir="ltr">${Utils.formatNumber(num(count))}</b></span>`;
  }

  // -------------------------------------------------------------- page
  function actionsMarkup() {
    return `
      ${iconBtn('repo-scan', 'refresh', 'فحص المساحة الآن', { size: '', iconSize: 18, title: 'فحص المساحة الآن' })}
      <button type="button" class="btn primary" data-action="repo-link-archive">${Icons.svg('plus', 16)} ربط مستودع خارجي</button>`;
  }

  function noRepoMarkup() {
    return `
      <section class="card repo-empty">
        <div class="empty-state repo-empty-state">
          <span class="empty-icon">${Icons.svg('hard-drive', 26)}</span>
          <div>
            <h3>لم يُربط مستودع بعد</h3>
            <p>اختر مجلدًا على هذا الجهاز ليحتوي ملفات المكتب الإعلامي، ثم يُنشئ التطبيق داخله مجلدًا لكل مجموعة ومهمة.</p>
            <p class="repo-empty-hint">سيُكتب داخل المجلد ملف <code dir="ltr">${esc(MANIFEST_NAME)}</code> يربطه بالتطبيق.</p>
          </div>
          <div class="empty-actions">
            <button type="button" class="btn primary" data-action="repo-link-primary">${Icons.svg('folder-open', 16)} اختيار مجلد المستودع</button>
          </div>
        </div>
      </section>`;
  }

  function primaryCard(repo, entry, snap) {
    const hasSnapshot = Boolean(snap?.scannedAt);
    const online = entry ? entry.online : true;
    return `
      <article class="repo-card card repo-card-primary" aria-labelledby="repo-primary-title">
        <div class="repo-card-head">
          <span class="repo-card-icon">${Icons.svg('hard-drive', 20)}</span>
          <div class="repo-card-copy">
            <div class="repo-card-title-row">
              <h2 id="repo-primary-title">${esc(repo.label || 'المستودع الأساسي')}</h2>
              <span class="chip repo-primary-chip">الأساسي</span>
              ${statusChip(online)}
            </div>
            ${pathLine(repo.path)}
          </div>
        </div>
        <div class="repo-card-main">
          ${donutMarkup({ entry, hasSnapshot, online, sizeClass: 'lg' })}
          ${legendMarkup(entry, hasSnapshot, online)}
        </div>
        <div class="icon-actions repo-card-actions">
          ${iconBtn('repo-open-primary', 'folder-open', 'فتح مجلد المستودع الأساسي')}
          ${iconBtn('repo-scan', 'refresh', 'فحص المساحة الآن')}
          ${iconBtn('repo-change-primary', 'swap', 'تغيير مجلد المستودع')}
          ${iconBtn('repo-unlink-primary', 'unlink', 'فك ربط المستودع الأساسي', { danger: true })}
        </div>
        <div class="repo-card-foot">${syncLine(repo.lastSyncAt, 'لم تُجرَ مزامنة بعد')}</div>
      </article>`;
  }

  function archiveCard(archive, entry, data) {
    const snap = snapshotOf(data);
    const hasSnapshot = Boolean(snap?.scannedAt);
    const online = entry ? entry.online : archive.status !== 'offline';
    const lastSeen = archive.lastSeenAt || archive.lastScanAt || null;
    const usage = usageFor(archive, data?.tasks || []);
    const label = archive.label || 'مستودع خارجي';
    return `
      <article class="repo-card card repo-card-archive ${online ? '' : 'is-offline'}" aria-labelledby="repo-archive-${esc(archive.id)}">
        <div class="repo-card-head">
          <span class="repo-card-icon">${Icons.svg('hard-drive', 18)}</span>
          <div class="repo-card-copy">
            <div class="repo-card-title-row">
              <h3 id="repo-archive-${esc(archive.id)}">${esc(label)}</h3>
              ${statusChip(online)}
            </div>
            ${pathLine(archive.path)}
          </div>
        </div>
        <div class="repo-card-main repo-card-main-compact">
          ${donutMarkup({ entry, hasSnapshot, online, sizeClass: 'sm' })}
          <div class="repo-archive-side">
            <div class="repo-counts">
              ${countMarkup('tasks', usage.tasks, `${Utils.formatNumber(usage.tasks)} مهمة مؤرشفة`)}
              ${countMarkup('archive', usage.sections, `${Utils.formatNumber(usage.sections)} قسم مؤرشف`)}
            </div>
            ${online ? '' : `<p class="repo-offline-note">${Icons.svg('alert', 13)}<span>القرص غير موصول — الملفات سليمة.</span></p>`}
          </div>
        </div>
        <div class="icon-actions repo-card-actions">
          ${iconBtn('repo-open-archive', 'folder-open', `فتح مجلد ${label}`, { data: `data-archive-id="${esc(archive.id)}"` })}
          ${iconBtn('repo-relink-archive', 'link', `إعادة ربط ${label}`, { data: `data-archive-id="${esc(archive.id)}"` })}
          ${iconBtn('repo-unlink-archive', 'unlink', `فك ربط ${label}`, { data: `data-archive-id="${esc(archive.id)}"`, danger: true })}
        </div>
        <div class="repo-card-foot">${syncLine(lastSeen, 'لم يُرَ بعد')}</div>
      </article>`;
  }

  function sortHeader(key, label, numeric = false) {
    const active = sort.key === key;
    const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const icon = active ? (sort.dir === 'asc' ? 'chevron-up' : 'chevron-down') : 'sort';
    return `<th scope="col" class="${numeric ? 'repo-num' : ''}" aria-sort="${ariaSort}">
      <button type="button" class="repo-sort" data-action="repo-sort" data-sort="${key}" title="ترتيب حسب ${esc(label)}" aria-label="ترتيب حسب ${esc(label)}">${Icons.svg(icon, 11, active ? 'is-active' : '')}${esc(label)}</button>
    </th>`;
  }

  function sectionCellMarkup(task, section) {
    const info = task.archived?.[section] || null;
    const bytes = info ? (num(info.bytes) || num(task.storage?.[section])) : num(task.storage?.[section]);
    const label = sectionLabel(section);
    return `
      <td class="repo-num repo-section-cell">
        <button type="button" class="repo-size-btn ${info ? 'is-archived' : ''}" data-action="repo-section-menu" data-task-id="${esc(task.id)}" data-section="${esc(section)}" aria-haspopup="menu" aria-expanded="false" title="${esc(`خيارات ${label}`)}" aria-label="${esc(`خيارات ${label}`)}">
          ${info ? Icons.svg('archive', 11, 'repo-size-flag') : ''}
          ${Icons.svg('chevron-down', 11, 'repo-size-chevron')}
          <span class="repo-size" dir="ltr">${esc(human(bytes))}</span>
        </button>
      </td>`;
  }

  function taskRowMarkup(task, maxTotal) {
    const group = groupOf(task);
    const total = num(task.storage?.total);
    const share = maxTotal ? pct(total, maxTotal) : 0;
    const archivedCount = Object.keys(task.archived || {}).length;
    const fullyArchived = SECTIONS.every((key) => Boolean(task.archived?.[key]));
    const badges = [
      fullyArchived ? `<span class="chip repo-archived-badge">${Icons.svg('archive', 11)} مؤرشفة</span>` : '',
      !fullyArchived && archivedCount ? `<span class="chip muted" title="أقسام مؤرشفة">${Icons.svg('archive', 11)} ${Utils.formatNumber(archivedCount)}</span>` : ''
    ].filter(Boolean).join('');
    const checked = selected.has(task.id);
    return `
      <tr class="repo-task-row ${checked ? 'is-selected' : ''}">
        <td class="repo-check-col">
          <input type="checkbox" class="repo-check" data-check="task" data-task-id="${esc(task.id)}" ${checked ? 'checked' : ''} title="تحديد المهمة" aria-label="${esc(`تحديد ${task.title}`)}">
        </td>
        <td class="repo-task-cell">
          <button type="button" class="repo-task-title" data-action="repo-open-task" data-task-id="${esc(task.id)}" title="${esc(task.title)}">${esc(task.title)}</button>
          ${badges ? `<span class="repo-task-badges">${badges}</span>` : ''}
        </td>
        <td>${Views.groupChip(group)}</td>
        ${sectionCellMarkup(task, 'sources')}
        ${sectionCellMarkup(task, 'output')}
        ${sectionCellMarkup(task, 'opencode')}
        <td class="repo-num repo-total-cell">
          <div class="repo-total-wrap">
            <strong dir="ltr">${esc(human(total))}</strong>
            <span class="repo-share" style="--share:${share}%" title="${share}% من أكبر مهمة في القائمة"><i></i></span>
          </div>
        </td>
      </tr>`;
  }

  function bulkBarMarkup() {
    if (!selected.size) return '';
    return `
      <div class="repo-bulk-bar" role="region" aria-label="إجراءات المهام المحددة">
        <span class="repo-bulk-count">${Utils.formatNumber(selected.size)} محددة</span>
        <div class="repo-bulk-actions">
          <button type="button" class="btn sm" data-action="repo-bulk-archive">${Icons.svg('archive', 14)} أرشفة المحدد</button>
          <button type="button" class="btn sm danger" data-action="repo-bulk-trash">${Icons.svg('trash', 14)} حذف المحدد</button>
          <button type="button" class="btn ghost sm" data-action="repo-clear-selection">إلغاء التحديد</button>
        </div>
      </div>`;
  }

  function tasksTableMarkup(data, snap) {
    const hasSnapshot = Boolean(snap?.scannedAt);
    const tasks = hasSnapshot ? rankedTasks(data) : [];
    const existing = new Set((data?.tasks || []).map((task) => task.id));
    [...selected].forEach((id) => {
      if (!existing.has(id)) selected.delete(id);
    });
    const maxTotal = tasks.reduce((max, task) => Math.max(max, num(task.storage?.total)), 0);
    const visibleIds = tasks.map((task) => task.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    const body = tasks.length ? tasks.map((task) => taskRowMarkup(task, maxTotal)).join('') : '';
    return `
      <section class="repo-table-card card" aria-labelledby="repo-tasks-title">
        <div class="card-head">
          <div>
            <h2 id="repo-tasks-title">أكبر المهام استهلاكًا</h2>
            <p>أعلى 25 مهمة حسب المساحة، مع خيارات كل قسم.</p>
          </div>
          <span class="repo-table-count">${hasSnapshot ? `${Utils.formatNumber(tasks.length)} مهمة` : 'قيد الفحص'}</span>
        </div>
        ${bulkBarMarkup()}
        ${tasks.length ? `
          <div class="table-wrap">
            <table class="data-table repo-table">
              <thead>
                <tr>
                  <th scope="col" class="repo-check-col">
                    <input type="checkbox" class="repo-check repo-select-all" data-action="repo-select-all" ${allSelected ? 'checked' : ''} title="تحديد الكل" aria-label="تحديد كل المهام المعروضة">
                  </th>
                  ${sortHeader('title', 'المهمة')}
                  ${sortHeader('group', 'المجموعة')}
                  ${sortHeader('sources', 'المصادر', true)}
                  ${sortHeader('output', 'المخرجات', true)}
                  ${sortHeader('opencode', 'opencode', true)}
                  ${sortHeader('total', 'الإجمالي', true)}
                </tr>
              </thead>
              <tbody>${body}</tbody>
            </table>
          </div>` : Views.emptyState({
          icon: 'hard-drive',
          title: hasSnapshot ? 'لا توجد مهام بمساحة معروفة' : 'جاري حساب مساحة المهام…',
          text: hasSnapshot ? 'ستظهر هنا المهام التي تحتوي ملفات في المستودع.' : 'يكتمل العرض بعد انتهاء الفحص الأول.',
          compact: true
        })}
      </section>`;
  }

  function daysLabel(entry) {
    if (entry?.expired) return 'انتهت المدة';
    let days = Number(entry?.daysLeft);
    if (!Number.isFinite(days)) {
      const expires = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : 0;
      days = expires ? Math.max(0, Math.ceil((expires - Date.now()) / Utils.dayMs)) : 0;
    }
    if (days <= 0) return 'ينتهي اليوم';
    if (days === 1) return 'بقي يوم واحد';
    if (days === 2) return 'بقي يومان';
    if (days <= 10) return `بقي ${Utils.formatNumber(days)} أيام`;
    return `بقي ${Utils.formatNumber(days)} يومًا`;
  }

  function trashRowMarkup(entry) {
    const key = `${entry.repoPath || ''}::${entry.id || ''}`;
    const title = entry.meta?.taskTitle || entry.meta?.groupName || entry.originalRel || entry.id || 'عنصر محذوف';
    const kindIcon = entry.kind === 'group' ? 'layers' : entry.kind === 'section' ? 'folder' : 'tasks';
    return `
      <div class="repo-trash-row">
        <span class="repo-trash-icon">${Icons.svg(kindIcon, 14)}</span>
        <div class="repo-trash-text">
          <strong title="${esc(title)}">${esc(title)}</strong>
          <span class="repo-path repo-trash-path" dir="ltr" title="${esc(entry.originalRel)}">${esc(entry.originalRel || '—')}</span>
        </div>
        <div class="repo-trash-side">
          <span class="repo-trash-size" dir="ltr">${esc(human(entry.bytes))}</span>
          <span class="chip repo-days">${Icons.svg('clock', 11)} ${esc(daysLabel(entry))}</span>
        </div>
        <span class="repo-trash-actions">
          ${iconBtn('repo-trash-restore', 'undo', `استعادة ${title}`, { size: 'xs', iconSize: 14, data: `data-trash-key="${esc(key)}"` })}
          ${iconBtn('repo-trash-delete', 'trash', `حذف ${title} نهائيًا`, { size: 'xs', iconSize: 14, data: `data-trash-key="${esc(key)}"`, danger: true })}
        </span>
      </div>`;
  }

  function trashEmptyMarkup() {
    return Views.emptyState({
      icon: 'trash',
      title: 'سلة المحذوفات فارغة',
      text: 'لا توجد عناصر محذوفة الآن.',
      compact: true
    });
  }

  function trashMarkup(rows) {
    if (!rows.length) return trashEmptyMarkup();
    const groups = new Map();
    rows.forEach((entry) => {
      const key = entry.repoPath || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          label: entry.repoLabel || 'مستودع',
          path: entry.repoPath || '',
          rows: []
        });
      }
      groups.get(key).rows.push(entry);
    });
    return [...groups.values()].map((group) => {
      const bytes = group.rows.reduce((sum, entry) => sum + num(entry.bytes), 0);
      return `
        <div class="repo-trash-group">
          <div class="repo-trash-head">
            <span class="repo-trash-repo">${Icons.svg('hard-drive', 12)} ${esc(group.label)}</span>
            <span class="repo-trash-group-meta">${Utils.formatNumber(group.rows.length)} · ${esc(human(bytes))}</span>
            ${iconBtn('repo-trash-purge', 'trash', `إفراغ سلة ${group.label}`, { size: 'xs', iconSize: 13, danger: true, data: `data-repo-path="${esc(group.path)}"`, title: `إفراغ سلة ${group.label}` })}
          </div>
          <div class="repo-trash-rows">${group.rows.map(trashRowMarkup).join('')}</div>
        </div>`;
    }).join('');
  }

  function trashSectionMarkup() {
    return `
      <section class="repo-trash-card card" aria-labelledby="repo-trash-title">
        <div class="card-head">
          <div>
            <h2 id="repo-trash-title">سلة المحذوفات</h2>
            <p>العناصر تبقى قابلة للاستعادة قبل انتهاء المدة.</p>
          </div>
          <span class="chip repo-trash-summary" data-repo-trash-summary hidden></span>
        </div>
        <p class="repo-trash-note">${Icons.svg('clock', 12)} تُحذف تلقائيًا بعد 7 أيام.</p>
        <div id="repo-trash-list" class="repo-trash-list" aria-live="polite" aria-busy="true">
          <div class="repo-trash-loading">${Icons.svg('refresh', 13)} جارٍ تحميل السلة…</div>
        </div>
      </section>`;
  }

  function opText(entry) {
    const meta = OP_TYPES[entry.type] || { icon: 'activity', label: 'عملية' };
    let text = meta.label;
    if (entry.section) text += ` · ${sectionLabel(entry.section)}`;
    const task = entry.taskId ? findTask(entry.taskId) : null;
    if (task?.title) text += ` — ${task.title}`;
    return { icon: meta.icon, text };
  }

  function opsMarkup(data) {
    const log = (data?.settings?.storageLog || []).slice(-10).reverse();
    return `
      <section class="repo-ops-card card" aria-labelledby="repo-ops-title">
        <div class="card-head">
          <div>
            <h2 id="repo-ops-title">آخر العمليات</h2>
            <p>آخر 10 عمليات أرشفة أو استعادة أو حذف.</p>
          </div>
        </div>
        <div class="repo-ops-list">
          ${log.length ? log.map((entry) => {
            const meta = opText(entry);
            return `
              <div class="repo-op-row">
                <span class="repo-op-icon ${entry.ok === false ? 'is-failed' : ''}">${Icons.svg(meta.icon, 13)}</span>
                <span class="repo-op-text" title="${esc(meta.text)}">
                  <strong>${esc(meta.text)}</strong>
                  ${entry.message ? `<small>${esc(entry.message)}</small>` : ''}
                </span>
                <span class="repo-op-size" dir="ltr">${num(entry.bytes) ? esc(human(entry.bytes)) : ''}</span>
                <span class="repo-op-time" title="${esc(dateTitle(entry.at))}">${esc(relative(entry.at, ''))}${entry.ok === false ? ' · فشل' : ''}</span>
              </div>`;
          }).join('') : Views.emptyState({
            icon: 'history',
            title: 'لا توجد عمليات مسجلة',
            text: 'ستظهر هنا عمليات الأرشفة والاستعادة والسلة.',
            compact: true
          })}
        </div>
      </section>`;
  }

  function page(data, state) {
    const current = data || currentData() || {};
    const repo = current.settings?.repo || null;
    const snap = snapshotOf(current);
    const head = Views.pageHead(
      'المستودع',
      'مساحة الوسائط، الأرشيف الخارجي، وسلة المحذوفات.',
      actionsMarkup(),
      'التخزين'
    );

    if (!repo || !repo.path) {
      return `<div class="repo-page">${head}${noRepoMarkup()}</div>`;
    }

    const entries = repoEntries(current);
    const primary = entries.find((entry) => entry.role === 'primary') || null;
    const archives = current.settings?.archives || [];
    return `
      <div class="repo-page">
        ${head}
        <div class="repo-cards-grid">
          ${primaryCard(repo, primary, snap)}
          ${archives.map((archive) => archiveCard(archive, entries.find((entry) => entry.id === archive.id) || null, current)).join('')}
        </div>
        ${tasksTableMarkup(current, snap)}
        <div class="repo-bottom-grid">
          ${trashSectionMarkup()}
          ${opsMarkup(current)}
        </div>
      </div>`;
  }

  // -------------------------------------------------------------- menus
  function closeSectionMenu() {
    if (!sectionMenu) return;
    const { el, cleanup, anchor } = sectionMenu;
    sectionMenu = null;
    try {
      cleanup?.();
    } catch (error) {}
    try {
      el?.remove();
    } catch (error) {}
    if (anchor?.isConnected) anchor.setAttribute('aria-expanded', 'false');
  }

  function sectionMenuItems(task, section) {
    const info = task.archived?.[section] || null;
    const live = hasLiveRun(task.id);
    const label = sectionLabel(section);
    const items = [
      info
        ? { action: 'repo-menu-archive', icon: 'archive', label: `أرشفة ${label}`, disabled: true, title: 'القسم مؤرشف بالفعل' }
        : live
          ? { action: 'repo-menu-archive', icon: 'archive', label: `أرشفة ${label}`, disabled: true, title: 'أوقف التشغيل أولًا' }
          : { action: 'repo-menu-archive', icon: 'archive', label: `أرشفة ${label}` },
      info
        ? { action: 'repo-menu-restore', icon: 'undo', label: `استعادة ${label}` }
        : { action: 'repo-menu-restore', icon: 'undo', label: `استعادة ${label}`, disabled: true, title: 'القسم غير مؤرشف' },
      { action: 'repo-menu-trash', icon: 'trash', label: `حذف ${label}`, danger: true },
      { action: 'repo-menu-open', icon: 'folder-open', label: 'فتح المجلد' }
    ];
    return items;
  }

  function openSectionMenu(anchor, taskId, section) {
    closeSectionMenu();
    const task = findTask(taskId);
    if (!task) return;
    const items = sectionMenuItems(task, section);
    const layer = document.createElement('div');
    layer.className = 'menu-pop card repo-section-menu';
    layer.setAttribute('role', 'menu');
    layer.setAttribute('aria-label', `خيارات ${sectionLabel(section)}`);
    layer.innerHTML = items.map((item) => `
      <button type="button" role="menuitem" data-action="${esc(item.action)}" ${item.disabled ? 'disabled' : ''} title="${esc(item.title || item.label)}" aria-label="${esc(item.title || item.label)}" class="${item.danger ? 'danger' : ''}">
        ${Icons.svg(item.icon, 15)}<span>${esc(item.label)}</span>
      </button>`).join('');
    document.body.appendChild(layer);

    const rect = anchor.getBoundingClientRect();
    const width = layer.offsetWidth || 176;
    const height = layer.offsetHeight || 132;
    let left = rect.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    let top = rect.bottom + 5;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 5);
    layer.style.setProperty('--menu-left', `${Math.round(left)}px`);
    layer.style.setProperty('--menu-top', `${Math.round(top)}px`);
    anchor.setAttribute('aria-expanded', 'true');

    const onDocClick = (event) => {
      if (layer.contains(event.target) || event.target === anchor || anchor.contains(event.target)) return;
      closeSectionMenu();
    };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeSectionMenu();
      if (anchor.isConnected) anchor.focus({ preventScroll: true });
    };
    const onViewport = () => closeSectionMenu();
    const timer = setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onViewport);
    document.addEventListener('scroll', onViewport, true);

    layer.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled) return;
      const action = button.dataset.action || '';
      closeSectionMenu();
      let pending = null;
      if (action === 'repo-menu-archive') pending = archiveSection(taskId, section);
      else if (action === 'repo-menu-restore') pending = restoreSection(taskId, section);
      else if (action === 'repo-menu-trash') pending = trashSection(taskId, section);
      else if (action === 'repo-menu-open') pending = openSectionFolder(task, section);
      Promise.resolve(pending).catch((error) => {
        console.error(error);
        toast('تعذر إكمال العملية. حاول مرة أخرى.', 'error');
      });
    });

    sectionMenu = {
      el: layer,
      anchor,
      cleanup: () => {
        clearTimeout(timer);
        document.removeEventListener('click', onDocClick, true);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onViewport);
        document.removeEventListener('scroll', onViewport, true);
      }
    };
  }

  // -------------------------------------------------------------- bind
  function trashKey(entry) {
    return `${entry.repoPath || ''}::${entry.id || ''}`;
  }

  function updateTrashSummary(root, rows) {
    const node = root?.querySelector?.('[data-repo-trash-summary]');
    if (!node) return;
    if (!rows.length) {
      node.hidden = true;
      node.textContent = '';
      return;
    }
    const bytes = rows.reduce((sum, entry) => sum + num(entry.bytes), 0);
    node.textContent = `${Utils.formatNumber(rows.length)} · ${human(bytes)}`;
    node.hidden = false;
  }

  async function loadTrash(root) {
    if (!root) return;
    const list = root.querySelector('#repo-trash-list');
    if (!list) return;
    const token = ++trashToken;
    const api = storageApi();
    if (!api || typeof api.trashList !== 'function') {
      list.innerHTML = trashEmptyMarkup();
      list.setAttribute('aria-busy', 'false');
      updateTrashSummary(root, []);
      return;
    }
    try {
      const rows = await api.trashList();
      if (token !== trashToken) return;
      if (activeRoot !== root) return;
      const target = root.querySelector('#repo-trash-list');
      if (!target) return;
      const safeRows = Array.isArray(rows) ? rows : [];
      trashEntries = new Map(safeRows.map((entry) => [trashKey(entry), entry]));
      target.innerHTML = trashMarkup(safeRows);
      target.setAttribute('aria-busy', 'false');
      updateTrashSummary(root, safeRows);
    } catch (error) {
      if (token !== trashToken) return;
      const target = root.querySelector('#repo-trash-list');
      if (target) {
        target.innerHTML = trashEmptyMarkup();
        target.setAttribute('aria-busy', 'false');
      }
      updateTrashSummary(root, []);
    }
  }

  function onStorageChange() {
    const root = activeRoot;
    if (!root) return;
    if (root.isConnected === false) return;
    if (!root.querySelector('#repo-trash-list')) return;
    loadTrash(root);
  }

  async function openRepoRoot(path, rel = '') {
    const api = window.MMO?.repo;
    if (!api || typeof api.open !== 'function') {
      toast('فتح المجلدات متاح في تطبيق سطح المكتب فقط.', 'info');
      return;
    }
    try {
      const result = await api.open({ repoPath: path, relPath: rel || '' });
      if (!result?.ok) toast(result?.message || 'تعذر فتح المجلد.', 'error');
    } catch (error) {
      toast(error?.message || 'تعذر فتح المجلد.', 'error');
    }
  }

  async function openSectionFolder(task, section) {
    const info = task.archived?.[section] || null;
    if (info) {
      const archive = storageApi()?.repoById?.(info.archiveId || info.repoId) || null;
      if (!archive?.path) {
        toast('المستودع الخارجي غير متصل. أعد ربطه أولًا.', 'error');
        return;
      }
      const base = info.rel || task.folder || '';
      if (!base) {
        toast('لا يوجد مسار محفوظ لهذا القسم.', 'info');
        return;
      }
      const rel = section === 'sources' ? base : [base, section].filter(Boolean).join('\\');
      const api = window.MMO?.repo;
      if (!api || typeof api.open !== 'function') {
        toast('فتح المجلدات متاح في تطبيق سطح المكتب فقط.', 'info');
        return;
      }
      try {
        const result = await api.open({ repoPath: archive.path, relPath: rel });
        if (!result?.ok) toast(result?.message || 'تعذر فتح المجلد.', 'error');
      } catch (error) {
        toast(error?.message || 'تعذر فتح المجلد.', 'error');
      }
      return;
    }
    const repo = repoApi();
    try {
      if (section === 'output' && typeof repo?.openTaskOutput === 'function') {
        await repo.openTaskOutput(task.id);
        return;
      }
      if (section === 'opencode' && typeof repo?.openTaskOpencode === 'function') {
        await repo.openTaskOpencode(task.id);
        return;
      }
      if (typeof repo?.openTask === 'function') {
        await repo.openTask(task.id);
        return;
      }
    } catch (error) {
      toast(error?.message || 'تعذر فتح المجلد.', 'error');
      return;
    }
    const primary = storageApi()?.primaryRepo?.() || null;
    if (!primary?.path || !task.folder) {
      toast('لم يُعثر على مجلد المهمة.', 'info');
      return;
    }
    const rel = section === 'sources' ? task.folder : [task.folder, section].join('\\');
    await openRepoRoot(primary.path, rel);
  }

  async function archiveSection(taskId, section) {
    const api = storageApi();
    if (!api || typeof api.archiveSection !== 'function') {
      toast('الأرشفة متاحة في تطبيق سطح المكتب فقط.', 'info');
      return;
    }
    const task = findTask(taskId);
    if (!task) return;
    if (task.archived?.[section]) {
      toast('هذا القسم مؤرشف بالفعل.', 'info');
      return;
    }
    if (hasLiveRun(taskId)) {
      toast('أوقف التشغيل أولًا.', 'warning');
      return;
    }
    await api.archiveSection(taskId, section);
    refreshView();
  }

  async function trashSection(taskId, section) {
    const api = storageApi();
    if (!api || typeof api.trashSection !== 'function') {
      toast('سلة المحذوفات متاحة في تطبيق سطح المكتب فقط.', 'info');
      return;
    }
    await api.trashSection(taskId, section);
    refreshView();
  }

  async function restoreSection(taskId, section) {
    const api = storageApi();
    if (!api || typeof api.restoreSection !== 'function') {
      toast('الاستعادة متاحة في تطبيق سطح المكتب فقط.', 'info');
      return;
    }
    await api.restoreSection(taskId, section);
    refreshView();
  }

  async function bulkArchive() {
    const ids = [...selected];
    if (!ids.length) return;
    const api = storageApi();
    if (!api || typeof api.archiveTasks !== 'function') {
      toast('الأرشفة متاحة في تطبيق سطح المكتب فقط.', 'info');
      return;
    }
    const result = await api.archiveTasks(ids);
    if (result?.ok) {
      selected.clear();
      refreshView();
    }
  }

  async function bulkTrash() {
    const ids = [...selected];
    if (!ids.length) return;
    const api = storageApi();
    if (!api || typeof api.trashTasks !== 'function') {
      toast('سلة المحذوفات متاحة في تطبيق سطح المكتب فقط.', 'info');
      return;
    }
    const result = await api.trashTasks(ids);
    if (result?.ok) {
      selected.clear();
      refreshView();
    }
  }

  async function confirmAction(message, title, confirmText) {
    const app = appApi();
    if (!app || typeof app.confirm !== 'function') return false;
    return Boolean(await app.confirm({ title, message, confirmText, danger: true }));
  }

  async function unlinkArchive(archiveId) {
    const api = storageApi();
    if (!api || typeof api.unlinkArchive !== 'function') {
      toast('فك الربط متاح في تطبيق سطح المكتب فقط.', 'info');
      return;
    }
    const archive = api.archiveFor?.(archiveId) || null;
    const label = archive?.label || 'المستودع الخارجي';
    const ok = await confirmAction(
      `سيفقد التطبيق الوصول إلى «${label}». الملفات تبقى كما هي على القرص، ويمكن ربطها لاحقًا.`,
      'فك ربط المستودع',
      'فك الربط'
    );
    if (!ok) return;
    await api.unlinkArchive(archiveId);
  }

  async function unlinkPrimary() {
    const data = dataApi();
    if (data?.securityEnabled?.() && !data.isUnlocked?.()) {
      const ok = await modalsApi()?.requestUnlock?.();
      if (!ok) return;
    }
    const repo = repoApi();
    if (!repo || typeof repo.unlink !== 'function') {
      toast('فك الربط متاح في تطبيق سطح المكتب فقط.', 'info');
      return;
    }
    const ok = await confirmAction(
      'سيفقد التطبيق الوصول إلى المستودع الأساسي. الملفات تبقى على القرص، لكن الروابط والمزامنة ستتوقف حتى تعيد الربط.',
      'فك ربط المستودع الأساسي',
      'فك الربط'
    );
    if (!ok) return;
    const done = await repo.unlink();
    if (done) toast('أُزيل ربط المستودع الأساسي. الملفات بقيت في مكانها.', 'info', 'unlink');
  }

  function selectableIds() {
    const data = currentData();
    const hasSnapshot = Boolean(snapshotOf(data || {})?.scannedAt);
    if (!data || !hasSnapshot) return [];
    return rankedTasks(data).map((task) => task.id);
  }

  async function handleRootClick(event) {
    const element = event.target.closest('[data-action]');
    if (!element) {
      closeSectionMenu();
      return;
    }
    if (!element.closest('.repo-page')) return;
    const action = element.dataset.action || '';
    if (!action.startsWith('repo-')) return;
    if (element.matches('input[type="checkbox"]')) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (element.disabled) return;

    if (action !== 'repo-section-menu' && !action.startsWith('repo-menu-')) closeSectionMenu();

    const api = storageApi();

    switch (action) {
      case 'repo-scan': {
        if (!api || typeof api.scan !== 'function') {
          toast('فحص المساحة متاح في تطبيق سطح المكتب فقط.', 'info');
          return;
        }
        const result = await api.scan({ force: true });
        if (result?.ok) toast('تم تحديث فحص المساحة.', 'success', 'hard-drive');
        else if (result?.code === 'busy') toast('الفحص جارٍ بالفعل.', 'info', 'refresh');
        return;
      }
      case 'repo-link-primary':
        await repoApi()?.link?.();
        return;
      case 'repo-change-primary':
        await repoApi()?.link?.();
        return;
      case 'repo-open-primary': {
        const repo = repoApi();
        if (typeof repo?.openRepo === 'function') {
          await repo.openRepo();
          return;
        }
        const primary = api?.primaryRepo?.() || null;
        if (primary?.path) await openRepoRoot(primary.path);
        else toast('لم يُربط مستودع بعد.', 'info');
        return;
      }
      case 'repo-unlink-primary':
        await unlinkPrimary();
        return;
      case 'repo-link-archive':
        if (!api || typeof api.linkArchive !== 'function') {
          toast('ربط المستودع الخارجي متاح في تطبيق سطح المكتب فقط.', 'info');
          return;
        }
        await api.linkArchive();
        return;
      case 'repo-open-archive': {
        const id = element.dataset.archiveId;
        const archive = api?.archiveFor?.(id) || (currentData()?.settings?.archives || []).find((item) => item.id === id) || null;
        if (!archive?.path) {
          toast('لم يُعثر على المستودع الخارجي.', 'error');
          return;
        }
        await openRepoRoot(archive.path);
        return;
      }
      case 'repo-relink-archive':
        if (!api || typeof api.relinkArchive !== 'function') {
          toast('إعادة الربط متاحة في تطبيق سطح المكتب فقط.', 'info');
          return;
        }
        await api.relinkArchive(element.dataset.archiveId);
        return;
      case 'repo-unlink-archive':
        await unlinkArchive(element.dataset.archiveId);
        return;
      case 'repo-sort': {
        const key = element.dataset.sort;
        if (!SORT_KEYS.includes(key)) return;
        if (sort.key === key) {
          sort = { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
        } else {
          sort = { key, dir: key === 'title' || key === 'group' ? 'asc' : 'desc' };
        }
        refreshView();
        return;
      }
      case 'repo-open-task': {
        const modals = modalsApi();
        if (modals && typeof modals.openTaskDetail === 'function') {
          modals.openTaskDetail(element.dataset.taskId);
        }
        return;
      }
      case 'repo-section-menu': {
        if (sectionMenu && sectionMenu.anchor === element) {
          closeSectionMenu();
          return;
        }
        openSectionMenu(element, element.dataset.taskId, element.dataset.section);
        return;
      }
      case 'repo-clear-selection':
        selected.clear();
        refreshView();
        return;
      case 'repo-bulk-archive':
        await bulkArchive();
        return;
      case 'repo-bulk-trash':
        await bulkTrash();
        return;
      case 'repo-archive-section':
        await archiveSection(element.dataset.taskId, element.dataset.section);
        return;
      case 'repo-trash-section':
        await trashSection(element.dataset.taskId, element.dataset.section);
        return;
      case 'repo-restore-section':
        await restoreSection(element.dataset.taskId, element.dataset.section);
        return;
      case 'repo-open-section': {
        const task = findTask(element.dataset.taskId);
        if (!task) return;
        await openSectionFolder(task, element.dataset.section);
        return;
      }
      case 'repo-trash-restore': {
        if (!api || typeof api.trashRestore !== 'function') {
          toast('الاستعادة متاحة في تطبيق سطح المكتب فقط.', 'info');
          return;
        }
        const entry = trashEntries.get(element.dataset.trashKey);
        if (!entry) {
          toast('لم يُعثر على العنصر. أعد تحميل السلة.', 'info');
          return;
        }
        const result = await api.trashRestore(entry);
        if (result?.ok) {
          refreshView();
          await loadTrash(activeRoot);
        }
        return;
      }
      case 'repo-trash-delete': {
        if (!api || typeof api.trashDelete !== 'function') {
          toast('الحذف النهائي متاح في تطبيق سطح المكتب فقط.', 'info');
          return;
        }
        const entry = trashEntries.get(element.dataset.trashKey);
        if (!entry) {
          toast('لم يُعثر على العنصر. أعد تحميل السلة.', 'info');
          return;
        }
        const result = await api.trashDelete(entry);
        if (result?.ok) {
          refreshView();
          await loadTrash(activeRoot);
        }
        return;
      }
      case 'repo-trash-purge': {
        if (!api || typeof api.trashPurge !== 'function') {
          toast('إفراغ السلة متاح في تطبيق سطح المكتب فقط.', 'info');
          return;
        }
        const result = await api.trashPurge(element.dataset.repoPath);
        if (result?.ok) {
          refreshView();
          await loadTrash(activeRoot);
        }
        return;
      }
      default:
        return;
    }
  }

  function onRootClick(event) {
    Promise.resolve(handleRootClick(event)).catch((error) => {
      console.error(error);
      toast('تعذر إكمال العملية. حاول مرة أخرى.', 'error');
    });
  }

  function onRootChange(event) {
    const input = event.target.closest('input.repo-check');
    if (!input) return;
    if (input.dataset.action === 'repo-select-all') {
      const ids = selectableIds();
      if (input.checked) ids.forEach((id) => selected.add(id));
      else selected.clear();
      refreshView();
      return;
    }
    const taskId = input.dataset.taskId;
    if (!taskId) return;
    if (input.checked) selected.add(taskId);
    else selected.delete(taskId);
    refreshView();
  }

  function bind(root) {
    if (!root) return;
    closeSectionMenu();
    activeRoot = root;
    if (!root.__repoViewBound) {
      root.__repoViewBound = true;
      root.addEventListener('click', onRootClick);
      root.addEventListener('change', onRootChange);
    }
    if (!storageUnsubscribe) {
      const api = storageApi();
      if (api && typeof api.onChange === 'function') {
        storageUnsubscribe = api.onChange(onStorageChange);
      }
    }
    const api = storageApi();
    const linked = Boolean(api?.primaryRepo?.());
    const scannedAt = typeof api?.scannedAt === 'function' ? api.scannedAt() : null;
    const stale = !scannedAt || (Date.now() - new Date(scannedAt).getTime() > 60 * 1000);
    const throttle = Date.now() - lastScanRequest < 60 * 1000;
    if (linked && stale && !autoScanRunning && !throttle && typeof api?.scan === 'function') {
      autoScanRunning = true;
      lastScanRequest = Date.now();
      Promise.resolve(api.scan({ silent: true, refresh: false })).then((result) => {
        autoScanRunning = false;
        lastScanRequest = Date.now();
        if (result?.ok) refreshView();
      }).catch(() => {
        autoScanRunning = false;
        lastScanRequest = Date.now();
      });
    }
    loadTrash(root);
  }

  return { page, bind };
})();

try {
  if (typeof window !== 'undefined') window.RepoView = RepoView;
} catch (error) {}
