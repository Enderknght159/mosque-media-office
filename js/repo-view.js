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
    { key: 'sources', label: 'المصادر' },
    { key: 'output', label: 'المخرجات' },
    { key: 'opencode', label: 'opencode' },
    { key: 'other', label: 'أخرى' },
    { key: 'trash', label: 'السلة' }
  ];
  const OP_TYPES = {
    archive: { icon: 'archive', label: 'أرشفة قسم' },
    restore: { icon: 'trash-restore', label: 'استعادة قسم' },
    'trash-section': { icon: 'trash', label: 'نقل قسم إلى السلة' },
    'trash-task': { icon: 'trash', label: 'نقل مهمة إلى السلة' },
    'trash-group': { icon: 'trash', label: 'نقل مجموعة إلى السلة' },
    'restore-trash': { icon: 'trash-restore', label: 'استعادة من السلة' },
    'link-archive': { icon: 'hard-drive', label: 'ربط مستودع خارجي' },
    'relink-archive': { icon: 'link', label: 'إعادة ربط مستودع' },
    'unlink-archive': { icon: 'unlink', label: 'فك ربط مستودع' }
  };

  /* حالة العرض محفوظة بين عمليات الرسم. */
  const expanded = new Set();
  let sort = { key: 'total', dir: 'desc' };
  let trashEntries = new Map();
  let trashToken = 0;
  let activeRoot = null;
  let storageUnsubscribe = null;
  let autoScanRunning = false;
  let lastScanRequest = 0;

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

  function size(bytes, hasSnapshot) {
    return hasSnapshot ? human(bytes) : '—';
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

  function plural(count, one, two, few, many) {
    return Utils.plural(count, one, two, few, many);
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

  function aggregateSections(entries) {
    const out = { sources: 0, output: 0, opencode: 0, other: 0, trash: 0 };
    entries.forEach((entry) => {
      if (!entry.sections) return;
      SEGMENTS.forEach((segment) => {
        out[segment.key] += num(entry.sections[segment.key]);
      });
    });
    return out;
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

  function heroMarkup(snap, entries) {
    const hasSnapshot = Boolean(snap?.scannedAt);
    if (!hasSnapshot) {
      return `
        <section class="repo-hero card" aria-labelledby="repo-capacity-title">
          <div class="repo-hero-head">
            <div class="repo-hero-copy">
              <span class="repo-eyebrow">سعة المستودعات</span>
              <h2 id="repo-capacity-title">جاري الفحص…</h2>
              <p>تُحسب المساحة من المستودع الأساسي والمستودعات الخارجية المتصلة.</p>
            </div>
            <span class="repo-hero-pct">—</span>
          </div>
          <div class="repo-skeleton" aria-hidden="true"><span></span><span></span></div>
          <div class="repo-hero-foot">
            <span class="repo-hero-hint">${Icons.svg('info', 13)} لم يُسجَّل فحص سابق بعد.</span>
            <button type="button" class="btn secondary sm" data-action="repo-scan">${Icons.svg('refresh', 14)} فحص المساحة الآن</button>
          </div>
        </section>`;
    }

    const online = (entries || []).filter((entry) => entry.online);
    const snapSections = snap.sections || {};
    const aggregated = aggregateSections(online);
    const aggregatedTotal = SEGMENTS.reduce((sum, segment) => sum + num(aggregated[segment.key]), 0);
    const sections = aggregatedTotal ? aggregated : snapSections;

    let capacity = online.reduce((sum, entry) => sum + entry.capacity, 0);
    let used = online.reduce((sum, entry) => sum + entry.used, 0);
    let free = online.reduce((sum, entry) => sum + entry.free, 0);
    const sectionTotal = SEGMENTS.reduce((sum, segment) => sum + num(sections[segment.key]), 0);
    const totals = snap.totals || {};
    if (!capacity && num(totals.capacity)) capacity = num(totals.capacity);
    if (!used && num(totals.used)) used = num(totals.used);
    if (!used && sectionTotal) used = sectionTotal;
    if (!free && num(totals.free)) free = num(totals.free);
    if (!used && !capacity) used = sectionTotal;

    const usedPct = capacity ? pct(used, capacity) : (used ? 100 : 0);
    const detail = { ...sections };
    if (!sectionTotal && used) detail.other = used;
    const detailTotal = sectionTotal || used || 1;
    const segments = SEGMENTS.filter((segment) => num(detail[segment.key]) > 0).map((segment) => {
      const width = Utils.clamp(num(detail[segment.key]) / detailTotal * 100, 0, 100);
      return `<span class="repo-capacity-seg is-${segment.key}" style="--seg:${width.toFixed(2)}%"></span>`;
    }).join('') || '<span class="repo-capacity-seg is-other" style="--seg:100%"></span>';
    const onlineLabel = online.length === 1
      ? 'مستودع واحد متصل'
      : online.length === 2
        ? 'مستودعان متصلان'
        : `${Utils.formatNumber(online.length)} مستودعات متصلة`;

    return `
      <section class="repo-hero card" aria-labelledby="repo-capacity-title">
        <div class="repo-hero-head">
          <div class="repo-hero-copy">
            <span class="repo-eyebrow">سعة المستودعات</span>
            <h2 id="repo-capacity-title">${human(used)} من ${capacity ? human(capacity) : '—'}</h2>
            <p>${free ? `${human(free)} متاحة` : 'السعة غير معروفة'} · ${onlineLabel} · آخر فحص ${esc(relative(snap.scannedAt, 'لم يُفحص بعد'))}</p>
          </div>
          <span class="repo-hero-pct" title="نسبة المستخدم من السعة">${usedPct}%</span>
        </div>
        <div class="repo-capacity-bar" role="progressbar" aria-valuenow="${usedPct}" aria-valuemin="0" aria-valuemax="100" aria-label="المستخدم ${human(used)} من ${capacity ? human(capacity) : 'سعة غير معروفة'}" title="آخر فحص: ${esc(dateTitle(snap.scannedAt))}">
          <span class="repo-capacity-used" style="--used:${usedPct}%">${segments}</span>
        </div>
        <div class="repo-legend">
          ${SEGMENTS.map((segment) => `
            <span class="repo-legend-item">
              <i class="repo-legend-dot is-${segment.key}"></i>
              <span>${segment.label}</span>
              <b>${human(detail[segment.key])}</b>
            </span>`).join('')}
        </div>
      </section>`;
  }

  function primaryCard(repo, entry, snap) {
    const hasSnapshot = Boolean(snap?.scannedAt);
    const online = entry ? entry.online : true;
    const used = entry?.used || 0;
    const free = entry?.free || 0;
    const capacity = entry?.capacity || 0;
    const usedPct = capacity ? pct(used, capacity) : 0;
    const syncText = relative(repo.lastSyncAt, 'لم تُجرَ مزامنة بعد');
    return `
      <section class="repo-card card repo-card-primary" aria-labelledby="repo-primary-title">
        <div class="repo-card-head">
          <span class="repo-card-icon">${Icons.svg('hard-drive', 20)}</span>
          <div class="repo-card-copy">
            <div class="repo-card-title-row">
              <h2 id="repo-primary-title">${esc(repo.label || 'المستودع الأساسي')}</h2>
              ${statusChip(online)}
            </div>
            ${pathLine(repo.path)}
          </div>
        </div>
        <div class="repo-meta-grid">
          <span class="repo-meta"><small>المستخدم</small><strong>${size(used, hasSnapshot)}</strong>${hasSnapshot && capacity ? `<em>${usedPct}% من السعة</em>` : ''}</span>
          <span class="repo-meta"><small>المتاح</small><strong>${size(free, hasSnapshot)}</strong></span>
          <span class="repo-meta" title="${esc(dateTitle(repo.lastSyncAt))}"><small>آخر مزامنة</small><strong>${esc(syncText)}</strong></span>
          <span class="repo-meta" title="${esc(dateTitle(snap?.scannedAt))}"><small>آخر فحص</small><strong>${esc(hasSnapshot ? relative(snap.scannedAt) : 'لم يُفحص بعد')}</strong></span>
        </div>
        <div class="icon-actions repo-card-actions">
          ${iconBtn('repo-open-primary', 'folder-open', 'فتح مجلد المستودع الأساسي')}
          ${iconBtn('repo-scan', 'refresh', 'فحص المساحة الآن')}
          ${iconBtn('repo-change-primary', 'folder', 'تغيير مجلد المستودع')}
          ${iconBtn('repo-unlink-primary', 'unlink', 'فك ربط المستودع الأساسي', { danger: true })}
        </div>
      </section>`;
  }

  function archiveCard(archive, entry, data) {
    const hasSnapshot = Boolean(snapshotOf(data)?.scannedAt);
    const online = entry ? entry.online : archive.status !== 'offline';
    const capacity = entry?.capacity || 0;
    const free = entry?.free || 0;
    const lastSeen = archive.lastSeenAt || archive.lastScanAt || null;
    const usage = usageFor(archive, data?.tasks || []);
    return `
      <article class="repo-card card repo-card-archive ${online ? '' : 'is-offline'}" aria-labelledby="repo-archive-${esc(archive.id)}">
        <div class="repo-card-head">
          <span class="repo-card-icon">${Icons.svg('hard-drive', 19)}</span>
          <div class="repo-card-copy">
            <div class="repo-card-title-row">
              <h3 id="repo-archive-${esc(archive.id)}">${esc(archive.label || 'مستودع خارجي')}</h3>
              ${statusChip(online)}
            </div>
            ${pathLine(archive.path)}
          </div>
        </div>
        <div class="repo-archive-stats">
          <span class="repo-meta"><small>السعة</small><strong>${online ? size(capacity, hasSnapshot) : '—'}</strong></span>
          <span class="repo-meta"><small>المتاح</small><strong>${online ? size(free, hasSnapshot) : '—'}</strong></span>
          <span class="repo-meta" title="${esc(dateTitle(lastSeen))}"><small>آخر ظهور</small><strong>${esc(relative(lastSeen, 'لم يُرَ بعد'))}</strong></span>
        </div>
        <div class="repo-archive-counts">
          <span class="chip">${Icons.svg('tasks', 12)} ${esc(plural(usage.tasks, 'مهمة واحدة', 'مهمتان', 'مهام', 'مهمة'))}</span>
          <span class="chip">${Icons.svg('layers', 12)} ${esc(plural(usage.sections, 'قسم واحد', 'قسمان', 'أقسام', 'قسمًا'))}</span>
        </div>
        ${online ? '' : `<p class="repo-offline-note">${Icons.svg('alert', 14)}<span>القرص غير موصول — الملفات لم تُفقد. أعد ربطه عند توصيله.</span></p>`}
        <div class="icon-actions repo-card-actions">
          ${iconBtn('repo-open-archive', 'folder-open', `فتح مجلد ${archive.label || 'المستودع الخارجي'}`, { data: `data-archive-id="${esc(archive.id)}"` })}
          ${iconBtn('repo-relink-archive', 'link', `إعادة ربط ${archive.label || 'المستودع الخارجي'}`, { data: `data-archive-id="${esc(archive.id)}"` })}
          ${iconBtn('repo-unlink-archive', 'unlink', `فك ربط ${archive.label || 'المستودع الخارجي'}`, { data: `data-archive-id="${esc(archive.id)}"`, danger: true })}
        </div>
      </article>`;
  }

  function archivesMarkup(data, entries) {
    const archives = data?.settings?.archives || [];
    return `
      <section class="repo-archives" aria-labelledby="repo-archives-title">
        <div class="repo-section-head">
          <div>
            <h2 id="repo-archives-title">الأرشيف الخارجي</h2>
            <p>${archives.length ? 'ملفات طويلة الأمد على أقراص منفصلة، مع تحقق كامل عند النقل والاستعادة.' : 'اربط قرصًا خارجيًا لأرشفة الملفات الكبيرة دون فقدها.'}</p>
          </div>
        </div>
        <div class="repo-archive-grid">
          ${archives.map((archive) => archiveCard(archive, (entries || []).find((entry) => entry.id === archive.id), data)).join('')}
          <button type="button" class="repo-add-card" data-action="repo-link-archive">
            <span class="repo-add-icon">${Icons.svg('plus', 20)}</span>
            <span class="repo-add-copy"><strong>ربط مستودع خارجي جديد</strong><small>قرص خارجي أو مجلد أرشيف طويل الأمد.</small></span>
          </button>
        </div>
      </section>`;
  }

  function sortHeader(key, label, numeric = false) {
    const active = sort.key === key;
    const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const icon = active ? (sort.dir === 'asc' ? 'chevron-up' : 'chevron-down') : 'sort';
    return `<th scope="col" class="${numeric ? 'repo-num' : ''}" aria-sort="${ariaSort}">
      <button type="button" class="repo-sort" data-action="repo-sort" data-sort="${key}" title="ترتيب حسب ${esc(label)}" aria-label="ترتيب حسب ${esc(label)}">${esc(label)}${Icons.svg(icon, 11, active ? 'is-active' : '')}</button>
    </th>`;
  }

  function sectionRowMarkup(task, section) {
    const key = section.key;
    const info = task.archived?.[key] || null;
    const live = hasLiveRun(task.id);
    const bytes = info ? (num(info.bytes) || num(task.storage?.[key])) : num(task.storage?.[key]);
    const archive = info ? storageApi()?.archiveFor?.(info.archiveId || info.repoId) || null : null;
    const archivedLabel = archive?.label ? ` في ${archive.label}` : '';
    const label = sectionLabel(key);
    const archiveBtn = info
      ? iconBtn('repo-restore-section', 'trash-restore', `استعادة ${label}`, { size: 'xs', iconSize: 14, data: `data-task-id="${esc(task.id)}" data-section="${key}"` })
      : iconBtn('repo-archive-section', 'archive', `أرشفة ${label}`, {
        size: 'xs',
        iconSize: 14,
        data: `data-task-id="${esc(task.id)}" data-section="${key}"`,
        disabled: live,
        title: live ? 'أوقف التشغيل أولًا' : `أرشفة ${label}`,
        ariaLabel: live ? `أرشفة ${label} — أوقف التشغيل أولًا` : `أرشفة ${label}`
      });
    return `
      <tr class="repo-section-row">
        <td></td>
        <td colspan="6">
          <div class="repo-section-line">
            <span class="repo-section-icon">${Icons.svg(section.icon, 15)}</span>
            <span class="repo-section-label">${esc(label)}</span>
            ${info ? `<span class="chip repo-archived-badge" title="مؤرشف${esc(archivedLabel)}">${Icons.svg('archive', 11)} مؤرشف</span>` : ''}
            <span class="repo-section-size">${human(bytes)}</span>
            <span class="repo-row-actions">
              ${iconBtn('repo-open-section', 'folder-open', `فتح مجلد ${label}`, { size: 'xs', iconSize: 14, data: `data-task-id="${esc(task.id)}" data-section="${key}"` })}
              ${archiveBtn}
              ${iconBtn('repo-trash-section', 'trash', `حذف ${label} إلى السلة`, { size: 'xs', iconSize: 14, data: `data-task-id="${esc(task.id)}" data-section="${key}"`, danger: true })}
            </span>
          </div>
        </td>
      </tr>`;
  }

  function taskRowMarkup(task, maxTotal) {
    const isOpen = expanded.has(task.id);
    const group = groupOf(task);
    const total = num(task.storage?.total);
    const share = maxTotal ? pct(total, maxTotal) : 0;
    const archivedCount = Object.keys(task.archived || {}).length;
    const fullyArchived = SECTIONS.every((key) => Boolean(task.archived?.[key]));
    const badges = [
      fullyArchived ? `<span class="chip repo-archived-badge">${Icons.svg('archive', 11)} مؤرشفة</span>` : '',
      !fullyArchived && archivedCount ? `<span class="chip muted" title="أقسام مؤرشفة">${Icons.svg('archive', 11)} ${Utils.formatNumber(archivedCount)} أقسام</span>` : ''
    ].filter(Boolean).join('');
    const sections = storageApi()?.sectionsFor?.(task) || SECTIONS.map((key) => ({
      key,
      label: sectionLabel(key),
      icon: SECTION_ICONS[key],
      bytes: num(task.storage?.[key]),
      archived: task.archived?.[key] || null
    }));
    return `
      <tr class="repo-task-row ${isOpen ? 'is-open' : ''}">
        <td class="repo-expand-cell">
          <button type="button" class="icon-btn xs repo-expand" data-action="repo-expand-task" data-task-id="${esc(task.id)}" title="${isOpen ? 'إخفاء الأقسام' : 'عرض الأقسام'}" aria-label="${isOpen ? 'إخفاء أقسام المهمة' : 'عرض أقسام المهمة'}" aria-expanded="${isOpen}">
            ${Icons.svg(isOpen ? 'chevron-up' : 'chevron-down', 14)}
          </button>
        </td>
        <td class="repo-task-cell">
          <button type="button" class="repo-task-title" data-action="repo-open-task" data-task-id="${esc(task.id)}" title="${esc(task.title)}">${esc(task.title)}</button>
          ${badges ? `<span class="repo-task-badges">${badges}</span>` : ''}
        </td>
        <td>${Views.groupChip(group)}</td>
        <td class="repo-num">${human(task.storage?.sources)}</td>
        <td class="repo-num">${human(task.storage?.output)}</td>
        <td class="repo-num">${human(task.storage?.opencode)}</td>
        <td class="repo-num repo-total-cell">
          <strong>${human(total)}</strong>
          <span class="repo-share" title="${share}% من أكبر مهمة في القائمة">${Views.progressBar(share, 'var(--text-3)', 'xs')}</span>
        </td>
      </tr>
      ${isOpen ? sections.map((section) => sectionRowMarkup(task, section)).join('') : ''}`;
  }

  function tasksTableMarkup(data, snap) {
    const hasSnapshot = Boolean(snap?.scannedAt);
    const tasks = hasSnapshot ? rankedTasks(data) : [];
    const maxTotal = tasks.reduce((max, task) => Math.max(max, num(task.storage?.total)), 0);
    const body = tasks.length
      ? tasks.map((task) => taskRowMarkup(task, maxTotal)).join('')
      : '';
    return `
      <section class="repo-table-card card" aria-labelledby="repo-tasks-title">
        <div class="card-head">
          <div>
            <h2 id="repo-tasks-title">أكبر المهام استهلاكًا</h2>
            <p>أعلى 25 مهمة من حيث المساحة، مع تفصيل الأقسام وإجراءات الأرشفة والسلة.</p>
          </div>
          <span class="repo-table-count">${hasSnapshot ? `${Utils.formatNumber(tasks.length)} مهمة` : 'قيد الفحص'}</span>
        </div>
        ${tasks.length ? `
          <div class="table-wrap">
            <table class="data-table repo-table">
              <thead>
                <tr>
                  <th scope="col" class="repo-expand-cell"><span class="sr-only">توسيع</span></th>
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
        <span class="repo-trash-icon">${Icons.svg(kindIcon, 15)}</span>
        <div class="repo-trash-text">
          <strong title="${esc(title)}">${esc(title)}</strong>
          <span class="repo-path repo-trash-path" dir="ltr" title="${esc(entry.originalRel)}">${esc(entry.originalRel || '—')}</span>
        </div>
        <div class="repo-trash-side">
          <span class="repo-trash-size">${human(entry.bytes)}</span>
          <span class="chip repo-days">${Icons.svg('clock', 11)} ${esc(daysLabel(entry))}</span>
          <span class="repo-trash-repo-label">${esc(entry.repoLabel || '')}</span>
        </div>
        <span class="repo-trash-actions">
          ${iconBtn('repo-trash-restore', 'trash-restore', `استعادة ${title}`, { size: 'xs', iconSize: 14, data: `data-trash-key="${esc(key)}"` })}
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
            <span class="repo-trash-repo">${Icons.svg('hard-drive', 13)} ${esc(group.label)}</span>
            <span class="repo-trash-group-meta">${Utils.formatNumber(group.rows.length)} عنصر · ${human(bytes)}</span>
            <button type="button" class="btn ghost sm danger-text repo-trash-purge" data-action="repo-trash-purge" data-repo-path="${esc(group.path)}" title="إفراغ سلة ${esc(group.label)}" aria-label="إفراغ سلة ${esc(group.label)}">${Icons.svg('trash', 13)} إفراغ السلة</button>
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
        <p class="repo-trash-note">${Icons.svg('clock', 13)} تُحذف العناصر تلقائيًا بعد 7 أيام.</p>
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
            <p>آخر 10 عمليات أرشفة أو استعادة أو حذف، بحجمها ووقتها.</p>
          </div>
        </div>
        <div class="repo-ops-list">
          ${log.length ? log.map((entry) => {
            const meta = opText(entry);
            return `
              <div class="repo-op-row">
                <span class="repo-op-icon ${entry.ok === false ? 'is-failed' : ''}">${Icons.svg(meta.icon, 14)}</span>
                <span class="repo-op-text">
                  <strong>${esc(meta.text)}</strong>
                  ${entry.message ? `<small>${esc(entry.message)}</small>` : ''}
                </span>
                <span class="repo-op-size">${num(entry.bytes) ? human(entry.bytes) : ''}</span>
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
    return `
      <div class="repo-page">
        ${head}
        ${heroMarkup(snap, entries)}
        ${primaryCard(repo, primary, snap)}
        ${archivesMarkup(current, entries)}
        ${tasksTableMarkup(current, snap)}
        ${trashSectionMarkup()}
        ${opsMarkup(current)}
      </div>`;
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
    node.textContent = `${plural(rows.length, 'عنصر واحد', 'عنصران', 'عناصر', 'عنصرًا')} · ${human(bytes)}`;
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

  async function handleRootClick(event) {
    const element = event.target.closest('[data-action]');
    if (!element) return;
    if (!element.closest('.repo-page')) return;
    const action = element.dataset.action || '';
    if (!action.startsWith('repo-')) return;
    event.preventDefault();
    event.stopPropagation();
    if (element.disabled) return;

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
      case 'repo-unlink-primary': {
        const repo = repoApi();
        if (!repo || typeof repo.unlink !== 'function') {
          toast('فك الربط متاح في تطبيق سطح المكتب فقط.', 'info');
          return;
        }
        const ok = await repo.unlink();
        if (ok) toast('أُزيل ربط المستودع الأساسي. الملفات بقيت في مكانها.', 'info', 'unlink');
        return;
      }
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
        if (!api || typeof api.unlinkArchive !== 'function') {
          toast('فك الربط متاح في تطبيق سطح المكتب فقط.', 'info');
          return;
        }
        await api.unlinkArchive(element.dataset.archiveId);
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
      case 'repo-expand-task': {
        const taskId = element.dataset.taskId;
        if (!taskId) return;
        if (expanded.has(taskId)) expanded.delete(taskId);
        else expanded.add(taskId);
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

  function bind(root) {
    if (!root) return;
    activeRoot = root;
    if (!root.__repoViewBound) {
      root.__repoViewBound = true;
      root.addEventListener('click', onRootClick);
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
