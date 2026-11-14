/* أقسام الإعدادات: مستودع الملفات + الأتمتة والذكاء الاصطناعي.
 * تُركَّب في صفحة الإعدادات عبر Views.settings → SettingsSections.repoMarkup/aiMarkup،
 * وتُدار أحداثها من App.handleAction بعد تفويض data-action.
 */
const SettingsSections = (() => {
  'use strict';

  const MANIFEST_NAME = 'mosque-media-office.repo.json';
  const MIRROR_NAME = 'mosque-media-office.data.json';
  const OUTPUT_DIR = 'output';
  const OPENCODE_DIR = 'opencode';
  const DESKTOP_ONLY = 'هذه الميزة تعمل داخل تطبيق سطح المكتب فقط.';

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

  function repoFolderName() {
    const api = repoApi();
    const name = api && (api.FOLDER_NAME || api.folderName || api.REPO_FOLDER_NAME);
    return name ? String(name) : '';
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

  function desktopNote(extra = '') {
    return `
      <div class="info-banner">
        <span>${Icons.svg('monitor', 18)}</span>
        <p>${DESKTOP_ONLY}${extra ? ` ${esc(extra)}` : ''}</p>
      </div>`;
  }

  function num(value) {
    return Utils.formatNumber(Number(value) || 0);
  }

  // ------------------------------------------------------------- repository

  function repoMarkup(data) {
    const repo = repoState(data);
    const linked = Boolean(repo);
    const desktop = isDesktop();
    const off = desktop ? '' : ' disabled';
    const api = repoApi();
    const canRepair = Boolean(api && typeof api.refreshMissing === 'function');
    const autoRename = repo ? repo.autoRename !== false : true;
    const repoTitle = 'مستودع الملفات';

    const linkedAt = repo && repo.linkedAt
      ? `${Utils.relativeTime(repo.linkedAt)}`
      : 'غير معروف';
    const linkedTitle = repo && repo.linkedAt ? Utils.fmtDateTime(repo.linkedAt) : '';
    const syncText = repo && repo.lastSyncAt ? Utils.relativeTime(repo.lastSyncAt) : 'لم تُجرَ مزامنة بعد';
    const syncTitle = repo && repo.lastSyncAt ? Utils.fmtDateTime(repo.lastSyncAt) : '';

    const linkedBody = !linked ? '' : `
      <div class="repo-summary" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span class="status-chip" style="--status-color:var(--green)"><i></i>مربوط</span>
        <span class="chip" title="${esc(linkedTitle)}">${Icons.svg('calendar', 12)} رُبط ${esc(linkedAt)}</span>
        <span class="chip" title="${esc(syncTitle)}">${Icons.svg('refresh', 12)} آخر مزامنة: ${esc(syncText)}</span>
        ${repo && repo.repoId ? `<span class="chip muted" dir="ltr">${esc(repo.repoId)}</span>` : ''}
      </div>
      <div class="link-row repo-path-row" style="margin-top:10px">
        <span class="settings-icon">${Icons.svg('folder-open', 17)}</span>
        <div class="link-info">
          <strong>مسار المستودع</strong>
          <span dir="ltr" title="${esc(repo.path)}" style="font-family:ui-monospace,SFMono-Regular,Consolas,'Courier New',monospace;font-size:9.5px">${esc(repo.path)}</span>
        </div>
        <button class="icon-btn sm" data-action="repo-reveal" title="فتح المجلد" aria-label="فتح مجلد المستودع"${off}>${Icons.svg('external-link', 16)}</button>
      </div>
      <div class="repo-actions" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:11px">
        <button class="btn primary sm" data-action="repo-sync"${off}>${Icons.svg('refresh', 14)} مزامنة الآن</button>
        <button class="btn secondary sm" data-action="repo-relink"${off}>${Icons.svg('folder-open', 14)} تغيير المستودع</button>
        <button class="btn secondary sm" data-action="repo-reveal"${off}>${Icons.svg('external', 14)} فتح المجلد</button>
        <button class="btn ghost sm danger-text" data-action="repo-unlink"${off}>${Icons.svg('trash', 14)} فك الربط</button>
      </div>
      <div class="repo-missing" style="display:flex;align-items:center;justify-content:space-between;gap:9px;flex-wrap:wrap;margin-top:12px;padding-top:11px;border-top:1px solid var(--border)">
        <div class="repo-missing-text" style="min-width:0">
          <strong style="font-size:10.5px;font-weight:650">مجلدات ناقصة</strong>
          <p class="field-hint">راجع مجلدات المجموعات والمهام، وأعد إنشاء ما حُذف منها دون المساس بالملفات.</p>
        </div>
        <button class="btn secondary sm" data-action="${canRepair ? 'repo-repair' : 'repo-sync'}"${off}>${Icons.svg('refresh', 14)} فحص وإعادة إنشاء</button>
      </div>
      <button type="button" class="repo-toggle" data-action="repo-auto-rename" role="switch" aria-checked="${autoRename}"${off}
        style="display:flex;align-items:center;gap:12px;width:100%;margin-top:11px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);color:var(--text);text-align:start">
        <span class="demo-toggle-copy" style="flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.5">
          <strong style="font-size:10.5px;font-weight:650">إعادة تسمية مجلدات المهام عند تغيير عنوانها</strong>
          <small style="font-size:8.5px;color:var(--text-3)">عند التعطيل يبقى اسم المجلد كما هو حتى لو تغيّر عنوان المهمة.</small>
        </span>
        <span aria-hidden="true" style="position:relative;width:39px;height:23px;flex:0 0 auto;border-radius:999px;background:${autoRename ? 'var(--green)' : 'var(--surface-3)'};transition:background .2s ease">
          <span style="position:absolute;top:3px;${autoRename ? 'inset-inline-end:3px' : 'inset-inline-start:3px'};width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:inset-inline-start .2s ease"></span>
        </span>
      </button>`;

    const emptyBody = linked ? '' : `
      <div class="info-banner">
        <span>${Icons.svg('folder-open', 18)}</span>
        <p>المستودع مجلد على هذا الجهاز يحتوي على مجلد لكل مجموعة، وداخل كل مجموعة مجلد لكل مهمة. تربطه مرة واحدة، فينشئ التطبيق بقية المجلدات ويحدّثها تلقائيًا.</p>
      </div>
      <div class="repo-init" style="display:flex;flex-wrap:wrap;gap:6px;margin:11px 0">
        <span class="chip">${Icons.svg('file', 13)} <span dir="ltr" style="unicode-bidi:isolate">${MANIFEST_NAME}</span></span>
        <span class="chip" title="ملف مرآة البيانات الذي يكتبه التطبيق">${Icons.svg('database', 13)} <span dir="ltr" style="unicode-bidi:isolate">${MIRROR_NAME}</span></span>
        <span class="chip">${Icons.svg('folder', 13)} <span dir="ltr" style="unicode-bidi:isolate">${OUTPUT_DIR}/</span></span>
        <span class="chip">${Icons.svg('terminal', 13)} <span dir="ltr" style="unicode-bidi:isolate">${OPENCODE_DIR}/</span></span>
      </div>
      <div class="repo-actions" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:9px">
        <button class="btn primary" data-action="repo-link"${off}>${Icons.svg('folder-open', 16)} اختيار مجلد المستودع</button>
      </div>
      <p class="field-hint">${Icons.svg('info', 13)} لن يُحذف أو يُنقل أي ملف موجود مسبقًا. تُضاف العناصر أعلاه إلى المستودع، ويُنشأ داخل كل مهمة مجلد للمخرجات ومجلد لعمل الأتمتة.</p>`;

    return `
      <section class="settings-section settings-repo" style="grid-column:1/-1;display:flex;flex-direction:column;gap:10px;min-width:0" aria-labelledby="settings-repo-title">
        <div class="section-head">
          <div>
            <h2 id="settings-repo-title">المستودع</h2>
            <p>مجلد واحد على جهازك يجمع ملفات كل مجموعة وكل مهمة.</p>
          </div>
          <span class="chip muted" title="${esc(repoFolderName() || (linked ? repo.path : 'مستودع الملفات'))}">${Icons.svg('folder', 12)} ${linked ? 'مربوط' : 'غير مربوط'}</span>
        </div>
        <section class="settings-card card" data-section="repo" aria-label="${repoTitle}">
          <div class="card-head">
            <div>
              <h2>${repoTitle}</h2>
              <p>${linked ? 'كل مهمة لها مجلد مستقل للمصادر والمخرجات.' : 'اربط مجلدًا ليُرتَّب كل شيء تلقائيًا: مجموعة ← مهمة ← مخرجات.'}</p>
            </div>
            <span class="settings-icon">${Icons.svg('folder-open', 19)}</span>
          </div>
          ${desktop ? '' : desktopNote('افتح نسخة سطح المكتب لربط المستودع ومزامنته.')}
          ${linked ? linkedBody : emptyBody}
        </section>
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

  function healthChip() {
    const health = currentHealth();
    if (!health) {
      return `<span class="status-chip" style="--status-color:var(--text-3)"><i></i>غير معروف</span>`;
    }
    if (health.available) {
      return `<span class="status-chip" style="--status-color:var(--green)"><i></i>متصل${health.version ? ` · ${esc(health.version)}` : ''}</span>`;
    }
    return `<span class="status-chip" style="--status-color:var(--red)"><i></i>غير متصل</span>`;
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

  function connectionCard(ai, desktop, off) {
    const health = currentHealth();
    const checked = health && health.checkedAt ? `آخر فحص ${Utils.relativeTime(health.checkedAt)}` : 'لم يُفحص بعد';
    const failure = health && !health.available
      ? (health.message || 'لم يُعثر على opencode. ثبّته أو اضبط مساره أدناه.')
      : '';
    return `
      <section class="settings-card card" data-section="ai-connection" aria-labelledby="settings-ai-conn-title">
        <div class="card-head">
          <div>
            <h2 id="settings-ai-conn-title">اتصال opencode</h2>
            <p>يُنفَّذ الذكاء الاصطناعي محليًا عبر opencode المثبّت على الجهاز.</p>
          </div>
          <span class="settings-icon">${Icons.svg('terminal', 19)}</span>
        </div>
        <div class="ai-conn-row" style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          ${healthChip()}
          ${health && health.command ? `<span class="chip muted" dir="ltr" title="${esc(health.command)}">${esc(health.command)}</span>` : ''}
          <span class="chip muted">${Icons.svg('clock', 12)} ${esc(checked)}</span>
          <button class="btn secondary sm" data-action="ai-check"${off}>${Icons.svg('activity', 14)} فحص الاتصال</button>
        </div>
        ${failure ? `<p class="field-hint danger-text" style="margin-top:8px">${Icons.svg('alert-circle', 13)} ${esc(failure)}</p>` : ''}
        <div class="field" style="margin-top:12px">
          <span>مسار تنفيذ opencode <small>اختياري</small></span>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <input type="text" id="ai-opencode-path" value="${esc(ai.opencodePath)}" placeholder="opencode" dir="ltr" autocomplete="off" spellcheck="false"
              style="flex:1;min-width:180px;font-family:ui-monospace,SFMono-Regular,Consolas,'Courier New',monospace;font-size:10.5px"${off}>
            <button class="btn secondary sm" data-action="ai-save-path"${off}>${Icons.svg('check', 14)} حفظ</button>
          </div>
          <p class="field-hint">${Icons.svg('info', 13)} يُكتشف تلقائيًا من PATH عند تركه فارغًا، أو اكتب المسار الكامل لملف opencode التنفيذي.</p>
        </div>
      </section>`;
  }

  function modelRow(model, filter, hidden = false) {
    const allowed = isModelAllowed(model, filter);
    return `
      <div class="ai-model-row${allowed ? '' : ' is-blocked'}" data-model="${esc(model)}"
        style="display:${hidden ? 'none' : 'flex'};align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid var(--border)${allowed ? '' : ';opacity:.6'}">
        <span class="ai-model-name" dir="ltr" title="${esc(model)}"
          style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Consolas,'Courier New',monospace;font-size:10.5px;${allowed ? '' : 'text-decoration:line-through'}">${esc(model)}</span>
        <span class="chip">${esc(providerOf(model))}</span>
        <button class="btn ${allowed ? 'ghost' : 'secondary'} sm" data-action="ai-model-toggle" data-model="${esc(model)}"
          aria-pressed="${allowed}" title="${allowed ? 'منع هذا الموديل' : 'السماح بهذا الموديل'}"
          ${allowed ? 'style="color:var(--green)"' : ''}>${Icons.svg(allowed ? 'check' : 'close', 13)} ${allowed ? 'مسموح' : 'ممنوع'}</button>
      </div>`;
  }

  function modelsCard(ai, desktop, off) {
    const list = ai.modelsCache.list;
    const allowedModels = list.filter((model) => isModelAllowed(model, ai.filter));
    const cacheAt = ai.modelsCache.at
      ? `آخر تحديث للقائمة ${Utils.relativeTime(ai.modelsCache.at)}`
      : 'لم تُجلب القائمة من opencode بعد.';
    const blockedCount = list.length - allowedModels.length;
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

    const rows = list.length
      ? list.map((model) => modelRow(model, ai.filter, Boolean(query) && !model.toLowerCase().includes(query))).join('')
      : '';

    return `
      <section class="settings-card card" data-section="ai-models" aria-labelledby="settings-ai-models-title">
        <div class="card-head">
          <div>
            <h2 id="settings-ai-models-title">الموديلات المتاحة</h2>
            <p>الموديلات الممنوعة لا تظهر في نافذة بدء الأتمتة، لحماية استهلاك التوكنات.</p>
          </div>
          <span class="chip" id="ai-model-count">${num(visibleModels.length)} موديل</span>
        </div>
        <div class="ai-models-toolbar" style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          <label class="search-box" style="flex:1;min-width:190px">
            ${Icons.svg('search', 17)}
            <input id="ai-model-search" type="search" placeholder="ابحث باسم الموديل أو المزوّد…" value="${esc(searchQuery)}" autocomplete="off">
          </label>
          <div class="segmented" role="group" aria-label="طريقة تصفية الموديلات">
            <button class="${ai.filter.mode === 'all' ? 'active' : ''}" data-action="ai-filter-mode" data-mode="all"${off}>السماح للجميع</button>
            <button class="${ai.filter.mode === 'allow' ? 'active' : ''}" data-action="ai-filter-mode" data-mode="allow"${off}>قائمة مسموحة فقط</button>
          </div>
          <button class="btn secondary sm" data-action="ai-models-refresh"${off}>${Icons.svg('refresh', 14)} تحديث القائمة</button>
        </div>
        <div class="ai-models-meta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:9px">
          <span class="chip muted">${Icons.svg('clock', 12)} ${esc(cacheAt)}</span>
          <span class="chip muted">${Icons.svg('check', 12)} ${num(allowedModels.length)} مسموح</span>
          <span class="chip muted">${Icons.svg('close', 12)} ${num(blockedCount)} ممنوع</span>
          <span class="chip muted" title="الوضع الحالي">${Icons.svg('filter', 12)} ${ai.filter.mode === 'allow' ? 'قائمة مسموحة فقط' : 'السماح للجميع'}</span>
        </div>
        <div class="empty-state compact" id="ai-model-empty" style="${list.length ? 'display:none' : ''};margin-top:9px">
          <span class="empty-icon">${Icons.svg('cpu', 18)}</span>
          <div>
            <h3>لم تُجلب قائمة الموديلات بعد</h3>
            <p>اجلب الموديلات من opencode، ثم اسمح بما تحتاجه فقط.</p>
          </div>
          <div class="empty-actions">
            <button class="btn secondary sm" data-action="ai-models-refresh"${off}>${Icons.svg('download', 14)} جلب من opencode</button>
          </div>
        </div>
        ${list.length ? `<div class="ai-model-list" style="max-height:330px;overflow-y:auto;margin-top:9px;border-top:1px solid var(--border)">${rows}</div>` : ''}
        <div class="ai-model-filtered-empty field-hint" id="ai-model-no-results" style="${list.length && !visibleModels.length ? 'display:flex' : 'display:none'};margin-top:9px">${Icons.svg('search', 13)} لا يوجد موديل يطابق بحثك.</div>
        <div class="field ai-default-field" style="margin-top:12px;padding-top:11px;border-top:1px solid var(--border)">
          <span>الموديل الافتراضي عند بدء الأتمتة</span>
          <select id="ai-default-model" aria-label="الموديل الافتراضي"${off}>${defaultOptions}</select>
          <p class="field-hint">${Icons.svg('info', 13)} يُقترح هذا الموديل تلقائيًا، ويمكن تغييره في كل تشغيل. تُحفظ آخر قيمة اخترتها.</p>
        </div>
      </section>`;
  }

  function aiMarkup(data) {
    const ai = aiState(data);
    const desktop = isDesktop();
    const off = desktop ? '' : ' disabled';
    const health = currentHealth();
    const healthLabel = !health ? 'غير معروف' : (health.available ? 'جاهز' : 'غير متصل');
    return `
      <section class="settings-section settings-ai" style="grid-column:1/-1;display:flex;flex-direction:column;gap:13px;min-width:0" aria-labelledby="settings-ai-title">
        <div class="section-head">
          <div>
            <h2 id="settings-ai-title">الأتمتة والذكاء الاصطناعي</h2>
            <p>اتصال opencode، الموديلات المسموحة، والموديل الافتراضي لتشغيل المهام.</p>
          </div>
          <span class="chip muted">${healthLabel}</span>
        </div>
        ${desktop ? '' : desktopNote('افتح التطبيق على سطح المكتب لفحص الاتصال وجلب الموديلات.')}
        ${connectionCard(ai, desktop, off)}
        ${modelsCard(ai, desktop, off)}
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
        const scope = element ? element.closest('.field') : null;
        const input = scope ? scope.querySelector('#ai-opencode-path') : document.getElementById('ai-opencode-path');
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
      row.style.display = hit ? 'flex' : 'none';
      if (hit) shown += 1;
    });
    const counter = document.getElementById('ai-model-count');
    if (counter) counter.textContent = `${num(shown)} موديل`;
    const noResults = document.getElementById('ai-model-no-results');
    if (noResults) noResults.style.display = rows.length && !shown ? 'flex' : 'none';
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
