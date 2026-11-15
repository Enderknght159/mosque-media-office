/* أقسام الإعدادات: مستودع الملفات + الأتمتة والذكاء الاصطناعي.
 * تُركَّب في صفحة الإعدادات عبر Views.settings → SettingsSections.repoMarkup/aiMarkup،
 * وتُدار أحداثها من App.handleAction بعد تفويض data-action.
 * البطاقتان مضغوطتان: أزرار ثانوية بأيقونة فقط، والسماح بالموديلات عبر مفتاح .switch.
 */
const SettingsSections = (() => {
  'use strict';

  const MANIFEST_NAME = 'mosque-media-office.repo.json';
  const DESKTOP_ONLY = 'هذه الميزة تعمل داخل تطبيق سطح المكتب فقط.';
  const DESKTOP_NOTE = 'يعمل داخل تطبيق سطح المكتب فقط.';

  // حالة فحص الاتصال محفوظة في الذاكرة فقط (بيانات settings.ai لا تحتفظ بها بعد إعادة التحميل).
  let healthState = null;
  let boundTarget = null;
  let searchQuery = '';

  // ------------------------------------------------------------- helpers

  function repoApi() {
    try {
      if (window.Repo) return window.Repo;
      return typeof Repo === 'undefined' ? null : Repo;
    } catch (error) {
      return null;
    }
  }

  function opencodeApi() {
    try {
      if (window.Opencode) return window.Opencode;
      return typeof Opencode === 'undefined' ? null : Opencode;
    } catch (error) {
      return null;
    }
  }

  function isDesktop() {
    return Boolean(window.MMO && window.MMO.isDesktop);
  }

  function esc(value) {
    return Utils.esc(value == null ? '' : String(value));
  }

  function toast(message, type = 'info', icon = '') {
    try {
      App.toast(message, { type, icon: icon || undefined });
    } catch (error) {
      console.warn(message);
    }
  }

  function refresh() {
    try {
      App.refresh();
    } catch (error) {}
  }

  function num(value) {
    return Utils.formatNumber(Number(value) || 0);
  }

  function repoState(data) {
    const repo = data && data.settings ? data.settings.repo : null;
    return repo && repo.path ? repo : null;
  }

  function aiState(data) {
    const settings = (data && data.settings) || {};
    const ai = settings.ai || {};
    return {
      lastModel: String(ai.lastModel || ''),
      opencodePath: String(ai.opencodePath || ''),
      filter: {
        mode: ai.filter && ai.filter.mode === 'allow' ? 'allow' : 'all',
        allowed: Array.isArray(ai.filter && ai.filter.allowed) ? ai.filter.allowed.slice() : [],
        blocked: Array.isArray(ai.filter && ai.filter.blocked) ? ai.filter.blocked.slice() : []
      },
      modelsCache: {
        at: (ai.modelsCache && ai.modelsCache.at) || null,
        list: Array.isArray(ai.modelsCache && ai.modelsCache.list) ? ai.modelsCache.list.slice() : []
      }
    };
  }

  // زر بأيقونة فقط: كل زر يحمل title + aria-label إلزاميًا.
  function iconBtn(action, icon, label, options = {}) {
    const classes = `icon-btn ${options.size || 'sm'}${options.danger ? ' danger-text' : ''}`;
    const title = options.title || label;
    const off = options.disabled ? ' disabled' : '';
    const size = options.iconSize || 15;
    return `<button type="button" class="${classes}" data-action="${esc(action)}" title="${esc(title)}" aria-label="${esc(label)}"${off}>${Icons.svg(icon, size)}</button>`;
  }

  function statusChip(tone, text, title = '') {
    const attr = title ? ` title="${esc(title)}"` : '';
    return `<span class="status-chip ss-status-${tone}"${attr}><i></i>${esc(text)}</span>`;
  }

  function browserNote() {
    return `<p class="ss-note">${Icons.svg('monitor', 15)}<span>${DESKTOP_NOTE}</span></p>`;
  }

  // ------------------------------------------------------------- repository

  function repoMarkup(data) {
    const repo = repoState(data);
    const linked = Boolean(repo);
    const desktop = isDesktop();
    const disabled = !desktop;
    const api = repoApi();
    const canRepair = Boolean(api && typeof api.refreshMissing === 'function');
    const autoRename = repo ? repo.autoRename !== false : true;

    const path = repo ? String(repo.path) : '';
    const syncText = repo && repo.lastSyncAt ? Utils.relativeTime(repo.lastSyncAt) : 'لم تُجرَ مزامنة بعد';
    const syncTitle = repo && repo.lastSyncAt ? `آخر مزامنة: ${Utils.fmtDateTime(repo.lastSyncAt)}` : 'لم تُجرَ مزامنة بعد';

    const linkedBody = `
      <div class="ss-row ss-row-between">
        <div class="ss-inline">
          ${statusChip('ok', 'مربوط')}
          <span class="ss-meta" title="${esc(syncTitle)}">${Icons.svg('clock', 12)}${esc(syncText)}</span>
        </div>
        <div class="icon-actions">
          ${iconBtn('repo-sync', 'refresh', 'مزامنة المستودع الآن', { title: 'مزامنة الآن', disabled })}
          ${iconBtn('repo-relink', 'folder', 'تغيير مجلد المستودع', { title: 'تغيير المستودع', disabled })}
          ${iconBtn('repo-reveal', 'folder-open', 'فتح مجلد المستودع', { title: 'فتح المجلد', disabled })}
          ${iconBtn('repo-unlink', 'trash', 'فك ربط المستودع', { title: 'فك الربط', danger: true, disabled })}
        </div>
      </div>
      <div class="ss-mono-row" dir="ltr" title="${esc(path)}">
        <span class="ss-mono-text">${esc(path)}</span>
      </div>
      <div class="ss-switch-row">
        <span class="ss-switch-label">إعادة تسمية المجلدات مع تغيير العنوان</span>
        <button type="button" class="switch" role="switch" aria-checked="${autoRename}" data-action="repo-auto-rename"
          title="إعادة تسمية المجلدات مع تغيير العنوان" aria-label="إعادة تسمية المجلدات مع تغيير العنوان"${disabled ? ' disabled' : ''}></button>
      </div>
      <div class="ss-row ss-row-between ss-row-quiet">
        <span class="ss-meta">${Icons.svg('info', 13)}مجلدات ناقصة</span>
        ${iconBtn(canRepair ? 'repo-repair' : 'repo-sync', 'refresh', 'فحص وإعادة إنشاء المجلدات', { title: 'فحص وإعادة إنشاء المجلدات', disabled })}
      </div>`;

    const emptyBody = `
      <p class="ss-lead">اختر مجلدًا على جهازك ليُنشئ التطبيق داخله مجلدًا لكل مجموعة ومهمة.</p>
      <div class="ss-actions">
        <button type="button" class="btn primary sm" data-action="repo-link"${disabled ? ' disabled' : ''}>${Icons.svg('folder-open', 15)} اختيار مجلد المستودع</button>
      </div>
      <p class="ss-note">${Icons.svg('info', 15)}<span>يُنشأ داخل المجلد ملف <code class="ss-code" dir="ltr">${esc(MANIFEST_NAME)}</code> يربطه بالتطبيق.</span></p>`;

    return `
      <section class="settings-card card" data-section="repo" aria-labelledby="settings-repo-title">
        <div class="card-head">
          <div>
            <h2 id="settings-repo-title">مستودع الملفات</h2>
            <p>مجلد واحد على جهازك يجمع الملفات والمهام.</p>
          </div>
          <span class="settings-icon">${Icons.svg('folder-open', 19)}</span>
        </div>
        ${desktop ? '' : browserNote()}
        ${linked ? linkedBody : emptyBody}
      </section>`;
  }

  // ------------------------------------------------------------- ai / opencode

  function providerOf(model) {
    const id = String(model || '');
    const slash = id.indexOf('/');
    if (slash > 0) return id.slice(0, slash);
    const hash = id.indexOf('#');
    return (hash > 0 ? id.slice(0, hash) : id) || 'opencode';
  }

  function isModelAllowed(model, filter) {
    const id = String(model || '');
    if (!id) return false;
    const blocked = Array.isArray(filter.blocked) ? filter.blocked : [];
    const allowed = Array.isArray(filter.allowed) ? filter.allowed : [];
    if (blocked.includes(id)) return false;
    if (filter.mode === 'allow') return allowed.includes(id);
    return true;
  }

  function currentHealth() {
    if (healthState) return healthState;
    const api = opencodeApi();
    try {
      const last = api && typeof api.lastHealth === 'function' ? api.lastHealth() : null;
      return last && (last.checkedAt || last.available) ? last : null;
    } catch (error) {
      return null;
    }
  }

  function healthChip() {
    const health = currentHealth();
    if (!health) return statusChip('unknown', 'غير معروف', 'لم يُفحص الاتصال بعد');
    if (health.available) {
      return statusChip('ok', health.version ? `متصل · ${health.version}` : 'متصل', health.version || 'متصل');
    }
    return statusChip('off', 'غير متصل', health.message || 'opencode غير متصل');
  }

  function connectionBlock(ai, disabled) {
    const health = currentHealth();
    const checked = health && health.checkedAt ? `آخر فحص ${Utils.relativeTime(health.checkedAt)}` : 'لم يُفحص بعد';
    const failure = health && !health.available ? String(health.message || '') : '';

    return `
      <div class="ss-row ss-row-between">
        <div class="ss-inline">
          ${healthChip()}
          <span class="ss-meta" title="${esc(checked)}">${Icons.svg('clock', 12)}${esc(checked)}</span>
        </div>
        ${iconBtn('ai-check', 'refresh', 'فحص اتصال opencode', { title: 'فحص الاتصال', disabled })}
      </div>
      ${failure ? `<p class="ss-note ss-note-error">${Icons.svg('alert', 15)}<span>${esc(failure)}</span></p>` : ''}
      <div class="ss-input-row">
        <input type="text" id="ai-opencode-path" class="ss-input ss-mono" value="${esc(ai.opencodePath)}" placeholder="opencode"
          dir="ltr" autocomplete="off" spellcheck="false" aria-label="مسار تنفيذ opencode"${disabled ? ' disabled' : ''}>
        ${iconBtn('ai-save-path', 'check', 'حفظ مسار opencode', { title: 'حفظ المسار', disabled })}
      </div>
      <p class="ss-note">${Icons.svg('info', 15)}<span>اتركه فارغًا للكشف التلقائي من PATH.</span></p>`;
  }

  function modelRow(model, filter, disabled, hidden = false) {
    const allowed = isModelAllowed(model, filter);
    const label = allowed ? `منع الموديل ${model}` : `السماح بالموديل ${model}`;
    return `
      <div class="ai-model-row${allowed ? '' : ' is-blocked'}" data-model="${esc(model)}"${hidden ? ' hidden' : ''}>
        <span class="ai-model-name" dir="ltr" title="${esc(model)}">${esc(model)}</span>
        <span class="ss-provider" dir="ltr" title="${esc(providerOf(model))}">${esc(providerOf(model))}</span>
        <button type="button" class="switch" role="switch" aria-checked="${allowed}" data-action="ai-model-toggle" data-model="${esc(model)}"
          title="${allowed ? 'مسموح' : 'ممنوع'}" aria-label="${esc(label)}"${disabled ? ' disabled' : ''}></button>
      </div>`;
  }

  function modelsBlock(ai, disabled) {
    const list = ai.modelsCache.list;
    const allowedModels = list.filter((model) => isModelAllowed(model, ai.filter));
    const blockedCount = list.length - allowedModels.length;
    const cacheText = ai.modelsCache.at ? Utils.relativeTime(ai.modelsCache.at) : 'لا قائمة محفوظة';
    const cacheTitle = ai.modelsCache.at ? Utils.fmtDateTime(ai.modelsCache.at) : 'لم تُجلب القائمة من opencode بعد';
    const hasLast = Boolean(ai.lastModel) && allowedModels.includes(ai.lastModel);
    const query = searchQuery.trim().toLowerCase();
    const visibleModels = query ? list.filter((model) => model.toLowerCase().includes(query)) : list;

    const defaultOptions = [
      `<option value=""${ai.lastModel ? '' : ' selected'}>بدون موديل افتراضي</option>`,
      ...allowedModels.map((model) => `<option value="${esc(model)}"${model === ai.lastModel ? ' selected' : ''}>${esc(model)}</option>`),
      !hasLast && ai.lastModel
        ? `<option value="${esc(ai.lastModel)}" selected>${esc(ai.lastModel)} — غير مسموح حاليًا</option>`
        : ''
    ].join('');

    const rows = list.map((model) => modelRow(model, ai.filter, disabled, Boolean(query) && !model.toLowerCase().includes(query))).join('');

    const listBody = list.length
      ? `<div class="ai-model-list" id="ai-model-list">${rows}</div>
        <p class="ss-note ai-model-filtered-empty" id="ai-model-no-results"${visibleModels.length ? ' hidden' : ''}>${Icons.svg('search', 15)}<span>لا يوجد موديل يطابق بحثك.</span></p>`
      : `<div class="ss-empty" id="ai-model-empty">
          <span class="ss-empty-icon">${Icons.svg('cpu', 17)}</span>
          <span>لم تُجلب الموديلات بعد.</span>
        </div>`;

    return `
      <div class="ai-models-toolbar">
        <label class="ss-search">
          ${Icons.svg('search', 15)}
          <input id="ai-model-search" type="search" placeholder="ابحث باسم الموديل…" value="${esc(searchQuery)}" autocomplete="off" aria-label="بحث في الموديلات"${disabled ? ' disabled' : ''}>
          <span class="ss-search-count" id="ai-model-count" title="عدد الموديلات المعروضة">${num(visibleModels.length)}</span>
        </label>
        <div class="ss-mode" role="group" aria-label="طريقة تصفية الموديلات">
          <button type="button" class="${ai.filter.mode === 'all' ? 'is-active' : ''}" data-action="ai-filter-mode" data-mode="all"
            aria-pressed="${ai.filter.mode === 'all'}"${disabled ? ' disabled' : ''}>السماح للجميع</button>
          <button type="button" class="${ai.filter.mode === 'allow' ? 'is-active' : ''}" data-action="ai-filter-mode" data-mode="allow"
            aria-pressed="${ai.filter.mode === 'allow'}"${disabled ? ' disabled' : ''}>قائمة مسموحة فقط</button>
        </div>
        ${iconBtn('ai-models-refresh', 'refresh', 'تحديث قائمة الموديلات', { title: 'تحديث قائمة الموديلات', disabled })}
      </div>
      <div class="ss-chips">
        <span class="chip muted" title="الموديلات المسموحة">${Icons.svg('check', 12)}${num(allowedModels.length)}</span>
        <span class="chip muted" title="الموديلات الممنوعة">${Icons.svg('close', 12)}${num(blockedCount)}</span>
        <span class="chip muted" title="${esc(cacheTitle)}">${Icons.svg('clock', 12)}${esc(cacheText)}</span>
      </div>
      ${listBody}
      <div class="ss-select-row">
        <label class="ss-field-label" for="ai-default-model">الموديل الافتراضي</label>
        <select id="ai-default-model" data-action="ai-default-model" aria-label="الموديل الافتراضي"${disabled ? ' disabled' : ''}>${defaultOptions}</select>
      </div>
      <p class="ss-note-text">الموديلات الممنوعة لا تظهر عند بدء الأتمتة حفاظًا على التوكنات.</p>`;
  }

  function aiMarkup(data) {
    const ai = aiState(data);
    const desktop = isDesktop();
    const disabled = !desktop;

    return `
      <section class="settings-card card is-wide" data-section="ai" aria-labelledby="settings-ai-title">
        <div class="card-head">
          <div>
            <h2 id="settings-ai-title">الأتمتة والذكاء الاصطناعي</h2>
            <p>اتصال opencode والموديلات المتاحة للتشغيل.</p>
          </div>
          <span class="settings-icon">${Icons.svg('cpu', 19)}</span>
        </div>
        ${desktop ? '' : browserNote()}
        ${connectionBlock(ai, disabled)}
        ${modelsBlock(ai, disabled)}
      </section>`;
  }

  // ------------------------------------------------------------- actions

  function guarded(promise) {
    Promise.resolve(promise).catch((error) => {
      console.error(error);
      toast('تعذر تنفيذ العملية. حاول مرة أخرى.', 'error');
    });
  }

  async function repoLink(mode) {
    const api = repoApi();
    if (!isDesktop() || !api) {
      toast(DESKTOP_ONLY, 'info', 'monitor');
      return;
    }
    const fn = mode === 'relink'
      ? (typeof api.relink === 'function' ? api.relink : null)
      : (typeof api.link === 'function' ? api.link : null);
    if (!fn) {
      toast('وحدة المستودع غير جاهزة في هذه النسخة.', 'warning');
      return;
    }
    // وحدة Repo تتولى رسائل النجاح/الإلغاء وتحديث الواجهة، فلا نكرر التنبيهات هنا.
    const result = await fn.call(api);
    if (!result) toast('تعذر ربط المستودع. حاول مرة أخرى.', 'error');
    refresh();
  }

  async function repoSync() {
    const api = repoApi();
    if (!isDesktop() || !api) {
      toast(DESKTOP_ONLY, 'info', 'monitor');
      return;
    }
    let linked = Boolean(repoState(window.App && window.App.data ? window.App.data() : null));
    if (!linked && typeof api.status === 'function') {
      try {
        linked = Boolean(api.status() && api.status().linked);
      } catch (error) {
        linked = false;
      }
    }
    if (!linked) {
      toast('لا يوجد مستودع مربوط. اربط مستودعًا أولًا.', 'info', 'folder-open');
      return;
    }
    if (typeof api.sync !== 'function') {
      toast('وحدة المستودع غير جاهزة في هذه النسخة.', 'warning');
      return;
    }
    // Repo.sync يطبع ملخص المزامنة بنفسه عند silent:false.
    const result = await api.sync({ silent: false });
    if (!result) toast('تعذرت مزامنة المستودع.', 'error');
    refresh();
  }

  async function repoRepair() {
    const api = repoApi();
    if (!isDesktop() || !api) {
      toast(DESKTOP_ONLY, 'info', 'monitor');
      return;
    }
    if (typeof api.refreshMissing !== 'function') return repoSync();
    // Repo.refreshMissing يطبع نتيجة الفحص بنفسه.
    const result = await api.refreshMissing();
    if (!result) toast('تعذر فحص مجلدات المستودع.', 'error');
    refresh();
  }

  async function repoReveal() {
    const api = repoApi();
    const data = window.App && window.App.data ? window.App.data() : null;
    const repo = repoState(data);
    if (!isDesktop()) {
      toast(DESKTOP_ONLY, 'info', 'monitor');
      return;
    }
    if (api && typeof api.openRepo === 'function') {
      await api.openRepo();
      return;
    }
    if (repo && window.MMO && window.MMO.repo) {
      const result = await window.MMO.repo.reveal({ repoPath: repo.path, relPath: '' });
      if (result && result.ok === false) toast(result.message || 'تعذر فتح المجلد.', 'error');
      return;
    }
    toast('وحدة المستودع غير جاهزة في هذه النسخة.', 'warning');
  }

  async function repoUnlink() {
    const data = window.App && window.App.data ? window.App.data() : null;
    const repo = repoState(data);
    if (!repo) {
      toast('لا يوجد مستودع مربوط.', 'info');
      return;
    }
    if (!isDesktop()) {
      toast(DESKTOP_ONLY, 'info', 'monitor');
      return;
    }
    const ok = await App.confirm({
      title: 'فك ربط المستودع',
      message: 'سيُلغى الربط بهذا المجلد وتُمسح سجلات مسارات المجلدات من التطبيق. لن تُحذف أي ملفات من جهازك.',
      confirmText: 'فك الربط',
      eyebrow: 'المستودع',
      danger: true
    });
    if (!ok) return;
    const api = repoApi();
    if (api && typeof api.unlink === 'function') {
      // Repo.unlink يتولى مسح السجل والتنبيه والتحديث.
      const unlinked = api.unlink();
      if (unlinked === false) toast('تعذر فك ربط المستودع.', 'error');
      refresh();
      return;
    }
    Data.unlinkRepo();
    refresh();
    toast('تم فك ربط المستودع. الملفات باقية في مكانها.', 'success', 'folder-open');
  }

  function repoAutoRename() {
    const data = window.App && window.App.data ? window.App.data() : null;
    const repo = repoState(data);
    const next = !(repo && repo.autoRename !== false);
    Data.setRepoSettings({ autoRename: next });
    refresh();
    toast(next ? 'سيُعاد تسمية مجلدات المهام عند تغيير عنوانها.' : 'لن تُعاد تسمية مجلدات المهام تلقائيًا.', 'info', 'edit');
  }

  function currentOpencodePath() {
    const data = window.App && window.App.data ? window.App.data() : null;
    return aiState(data).opencodePath;
  }

  function saveOpencodePath(value) {
    const path = String(value == null ? '' : value).trim();
    Data.setAiSettings({ opencodePath: path });
    refresh();
    toast(path ? 'تم حفظ مسار opencode.' : 'سيُكتشف opencode من PATH تلقائيًا.', 'success', 'check');
  }

  async function aiCheck() {
    if (!isDesktop() || !window.MMO || !window.MMO.opencode) {
      toast(DESKTOP_ONLY, 'info', 'monitor');
      return;
    }
    const api = opencodeApi();
    const opencodePath = currentOpencodePath();
    const viaModule = Boolean(api && typeof api.health === 'function');
    let result = null;
    if (viaModule) {
      result = await api.health({ silent: false });
    } else {
      result = await window.MMO.opencode.health({ opencodePath });
    }
    const info = result && result.ok && result.data ? result.data : (result && result.data ? result.data : null);
    healthState = {
      available: Boolean(info && info.available),
      version: String((info && info.version) || ''),
      command: String((info && info.command) || ''),
      message: result && result.ok === false ? String(result.message || '') : String((info && info.message) || ''),
      checkedAt: String((info && info.checkedAt) || new Date().toISOString())
    };
    // Opencode.health يطبع نتيجة الفحص بنفسه (silent:false)، فنطبع فقط في المسار المباشر.
    if (!viaModule) {
      if (healthState.available) {
        toast(`opencode متصل${healthState.version ? ` — ${healthState.version}` : ''}.`, 'success', 'check-circle');
      } else {
        toast(healthState.message || 'opencode غير متصل. اضبط مساره أو ثبّته.', 'error', 'alert-circle');
      }
    }
    refresh();
  }

  function normalizeModels(result) {
    const clean = (value) => (Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []);
    if (!result) return [];
    if (Array.isArray(result)) return clean(result);
    if (Array.isArray(result.all)) return clean(result.all);
    if (result.ok && result.data) {
      if (Array.isArray(result.data.models)) return clean(result.data.models);
      if (Array.isArray(result.data.all)) return clean(result.data.all);
    }
    if (Array.isArray(result.models)) return clean(result.models);
    return [];
  }

  async function aiModelsRefresh() {
    if (!isDesktop() || !window.MMO || !window.MMO.opencode) {
      toast(DESKTOP_ONLY, 'info', 'monitor');
      return;
    }
    const api = opencodeApi();
    const opencodePath = currentOpencodePath();
    const viaModule = Boolean(api && typeof api.models === 'function');
    let result = null;
    if (viaModule) {
      result = await api.models({ refresh: true });
    } else {
      result = await window.MMO.opencode.models({ opencodePath, refresh: true });
    }
    const list = normalizeModels(result);
    if (!list.length) {
      toast((result && result.message) || 'لم تُعِد opencode أي موديل. تأكد من تثبيته وتسجيل الدخول.', 'warning', 'alert');
      refresh();
      return;
    }
    // Opencode.models يحفظ الكاش بنفسه؛ نكتبه فقط في المسار المباشر.
    if (!viaModule) Data.setAiSettings({ modelsCache: { at: new Date().toISOString(), list } });
    const served = result && result.source === 'cache';
    if (served) {
      toast(result.message || `تُعرض القائمة المحفوظة (${num(list.length)} موديل) لتعذر التحديث.`, 'warning', 'alert');
    } else {
      toast(`تم تحديث قائمة الموديلات (${num(list.length)}).`, 'success', 'refresh');
    }
    refresh();
  }

  function aiFilterMode(element) {
    const mode = element && element.dataset && element.dataset.mode === 'allow' ? 'allow' : 'all';
    const data = window.App && window.App.data ? window.App.data() : null;
    const ai = aiState(data);
    Data.setAiSettings({ filter: { mode } });
    refresh();
    if (mode === 'allow' && !ai.filter.allowed.length) {
      toast('قائمة السماح فارغة: لن يظهر أي موديل في نافذة الأتمتة حتى تسمح بأحدها.', 'warning', 'filter');
    } else {
      toast(mode === 'allow' ? 'يظهر فقط الموديلات المسموحة.' : 'كل الموديلات متاحة ما لم تُمنع.', 'info', 'filter');
    }
  }

  function aiModelToggle(element) {
    const model = String((element && element.dataset && element.dataset.model) || '').trim();
    if (!model) return;
    const data = window.App && window.App.data ? window.App.data() : null;
    const ai = aiState(data);
    const allowed = isModelAllowed(model, ai.filter);
    const nextAllowed = ai.filter.allowed.filter((item) => item !== model);
    const nextBlocked = ai.filter.blocked.filter((item) => item !== model);
    if (allowed) {
      nextBlocked.push(model);
    } else if (ai.filter.mode === 'allow') {
      nextAllowed.push(model);
    }
    Data.setAiSettings({ filter: { allowed: nextAllowed, blocked: nextBlocked } });
    refresh();
    toast(allowed ? `مُنع الموديل ${model}.` : `سُمح بالموديل ${model}.`, allowed ? 'info' : 'success', allowed ? 'close' : 'check');
  }

  function aiDefaultModel(element) {
    const raw = element
      ? (element.dataset && typeof element.dataset.model === 'string' ? element.dataset.model : element.value)
      : '';
    const model = String(raw == null ? '' : raw).trim();
    const data = window.App && window.App.data ? window.App.data() : null;
    const ai = aiState(data);
    if (model && !isModelAllowed(model, ai.filter)) {
      toast('هذا الموديل ممنوع. اسمح به أولًا.', 'warning', 'alert');
      refresh();
      return;
    }
    Data.setAiSettings({ lastModel: model });
    toast(model ? `الموديل الافتراضي: ${model}` : 'أُلغي الموديل الافتراضي.', 'success', 'robot');
  }

  function handleAction(action, element) {
    switch (action) {
      case 'repo-link':
        guarded(repoLink('link'));
        return true;
      case 'repo-relink':
        guarded(repoLink('relink'));
        return true;
      case 'repo-sync':
        guarded(repoSync());
        return true;
      case 'repo-repair':
        guarded(repoRepair());
        return true;
      case 'repo-reveal':
        guarded(repoReveal());
        return true;
      case 'repo-unlink':
        guarded(repoUnlink());
        return true;
      case 'repo-auto-rename':
        repoAutoRename();
        return true;
      case 'ai-check':
        guarded(aiCheck());
        return true;
      case 'ai-save-path': {
        const row = element ? element.closest('.ss-input-row') : null;
        const input = (row && row.querySelector('#ai-opencode-path')) || document.getElementById('ai-opencode-path');
        saveOpencodePath(input ? input.value : '');
        return true;
      }
      case 'ai-models-refresh':
        guarded(aiModelsRefresh());
        return true;
      case 'ai-filter-mode':
        aiFilterMode(element);
        return true;
      case 'ai-model-toggle':
        aiModelToggle(element);
        return true;
      case 'ai-default-model':
        // النقر على القائمة نفسها لا يغيّر شيئًا؛ الحفظ يتم عند change في bind.
        if (element && element.tagName === 'SELECT') return true;
        aiDefaultModel(element);
        return true;
      default:
        return false;
    }
  }

  // ------------------------------------------------------------- binding

  function filterModels(query) {
    const term = String(query || '').trim().toLowerCase();
    const rows = [...document.querySelectorAll('.ai-model-row')];
    let shown = 0;
    rows.forEach((row) => {
      const text = String(row.dataset.model || '').toLowerCase();
      const hit = !term || text.includes(term);
      row.hidden = !hit;
      if (hit) shown += 1;
    });
    const counter = document.getElementById('ai-model-count');
    if (counter) counter.textContent = num(shown);
    const noResults = document.getElementById('ai-model-no-results');
    if (noResults) noResults.hidden = !(rows.length && !shown);
  }

  function bind(root) {
    const target = root || document;
    if (boundTarget) return;
    boundTarget = target;

    target.addEventListener('input', (event) => {
      const input = event.target && event.target.closest ? event.target.closest('#ai-model-search') : null;
      if (!input) return;
      searchQuery = input.value;
      filterModels(input.value);
    });

    target.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const input = event.target && event.target.closest ? event.target.closest('#ai-opencode-path') : null;
      if (!input) return;
      event.preventDefault();
      saveOpencodePath(input.value);
    });

    target.addEventListener('change', (event) => {
      const select = event.target && event.target.closest ? event.target.closest('#ai-default-model') : null;
      if (select) aiDefaultModel(select);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bind(document));
  } else {
    bind(document);
  }

  const api = {
    repoMarkup,
    aiMarkup,
    handleAction,
    bind
  };

  window.SettingsSections = api;
  return api;
})();
