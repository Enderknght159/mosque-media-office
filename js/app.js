const App = (() => {
  const appRoot = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  const toastRoot = document.getElementById('toast-root');

  const state = {
    route: 'dashboard',
    tasks: {
      status: 'all',
      groupId: 'all',
      userId: 'all',
      search: '',
      sort: 'updated',
      view: 'cards'
    },
    report: {
      period: 'month',
      from: '',
      to: '',
      groupId: 'all',
      userId: 'all'
    },
    drawerOpen: false,
    demoBannerHidden: false,
    focusSearch: false
  };

  const onboarding = {
    mosqueName: '',
    members: [],
    demo: true
  };

  let data = null;
  const modalLayers = [];

  function defaultTaskFilters() {
    return { status: 'all', groupId: 'all', userId: 'all', search: '', sort: 'updated', view: 'cards' };
  }

  function defaultReportFilters() {
    return { period: 'month', from: '', to: '', groupId: 'all', userId: 'all' };
  }

  function effectiveDark(mode) {
    return mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function applyTheme(mode = 'auto') {
    const safeMode = ['auto', 'light', 'dark'].includes(mode) ? mode : 'auto';
    const dark = effectiveDark(safeMode);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themeMode = safeMode;
    try {
      localStorage.setItem('mmo_theme', safeMode);
    } catch (error) {}
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', dark ? '#0b0b0d' : '#f5f5f7');
    return safeMode;
  }

  function applyFavicon(logoUrl) {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = logoUrl || 'assets/logo.svg';
    const typeMatch = logoUrl ? /^data:(image\/[^;]+)/i.exec(logoUrl) : null;
    link.type = typeMatch ? typeMatch[1] : 'image/svg+xml';
  }

  function resizeLogo(dataUrl, size = 256) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        const scale = Math.min(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.clearRect(0, 0, size, size);
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => resolve(dataUrl);
      image.src = dataUrl;
    });
  }

  async function ensureUnlocked() {
    if (!data) return false;
    if (!Data.securityEnabled() || Data.isUnlocked()) return true;
    const ok = await Modals.requestUnlock();
    if (ok) refresh();
    return ok;
  }

  function updateOnboardingThemeButton() {
    const button = document.getElementById('onboarding-theme');
    if (!button) return;
    const dark = document.documentElement.dataset.theme === 'dark';
    button.innerHTML = Icons.svg(dark ? 'sun' : 'moon', 19);
    button.setAttribute('title', dark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن');
  }

  function toast(message, options = {}) {
    const type = options.type || 'info';
    const iconMap = { success: 'check-circle', error: 'alert-circle', warning: 'alert', info: 'info' };
    const node = document.createElement('div');
    node.className = `toast toast-${type}`;
    node.innerHTML = `
      <span class="toast-icon">${Icons.svg(options.icon || iconMap[type] || 'info', 18)}</span>
      <p>${Utils.esc(message)}</p>
      <button class="toast-close" type="button" aria-label="إغلاق التنبيه">${Icons.svg('close', 14)}</button>`;
    toastRoot.appendChild(node);
    const remove = () => {
      node.classList.remove('visible');
      setTimeout(() => node.remove(), 220);
    };
    node.querySelector('.toast-close').addEventListener('click', remove);
    requestAnimationFrame(() => node.classList.add('visible'));
    const duration = options.duration || 3800;
    setTimeout(remove, duration);
    const visible = [...toastRoot.querySelectorAll('.toast')];
    if (visible.length > 4) visible.slice(0, visible.length - 4).forEach((item) => item.remove());
  }

  function openModal({ title, subtitle = '', eyebrow = '', body = '', footer = '', size = 'md', className = '', onMount = null, onDismiss = null }) {
    const titleId = Utils.uid('modal-title');
    const layer = document.createElement('div');
    layer.className = 'modal-layer';
    layer.innerHTML = `
      <div class="modal-backdrop"></div>
      <section class="modal-sheet modal-${size} ${className}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <header class="modal-head">
          <div class="modal-head-text">
            ${eyebrow ? `<span class="modal-eyebrow">${Utils.esc(eyebrow)}</span>` : ''}
            <h2 id="${titleId}">${Utils.esc(title)}</h2>
            ${subtitle ? `<p>${Utils.esc(subtitle)}</p>` : ''}
          </div>
          <button class="icon-btn modal-close" type="button" data-close-modal aria-label="إغلاق">${Icons.svg('close', 18)}</button>
        </header>
        <div class="modal-body">${body}</div>
        ${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}
      </section>`;
    modalRoot.appendChild(layer);
    modalLayers.push({ el: layer, onDismiss });
    document.body.classList.add('modal-open');
    if (onMount) onMount(layer);
    requestAnimationFrame(() => layer.classList.add('visible'));
    setTimeout(() => {
      const preferred = layer.querySelector('[autofocus]')
        || layer.querySelector('.modal-body input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), .modal-body textarea, .modal-body select')
        || layer.querySelector('.modal-footer .btn.primary, .modal-footer .btn.danger')
        || layer.querySelector('.modal-footer .btn')
        || layer.querySelector('button');
      if (preferred && !layer.querySelector(':focus')) preferred.focus({ preventScroll: true });
    }, 80);
    return layer;
  }

  function closeModal() {
    const layer = modalLayers.pop();
    if (!layer) return;
    layer.el.remove();
    if (typeof layer.onDismiss === 'function') layer.onDismiss();
    if (!modalLayers.length) document.body.classList.remove('modal-open');
  }

  function closeAllModals() {
    while (modalLayers.length) {
      const layer = modalLayers.pop();
      layer.el.remove();
      if (typeof layer.onDismiss === 'function') layer.onDismiss();
    }
    document.body.classList.remove('modal-open');
  }

  function confirm({ title, message, confirmText = 'تأكيد', cancelText = 'إلغاء', danger = false, eyebrow = 'تأكيد' }) {
    return new Promise((resolve) => {
      let settled = false;
      let modalRef = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
        if (modalRef) closeModal();
      };
      const footer = `
        <div class="modal-footer-actions">
          <button class="btn ghost" type="button" data-confirm-no>${Utils.esc(cancelText)}</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-confirm-yes>${Utils.esc(confirmText)}</button>
        </div>`;
      modalRef = openModal({
        title,
        eyebrow,
        body: `<div class="confirm-box"><span class="confirm-icon ${danger ? 'danger' : ''}">${Icons.svg(danger ? 'alert' : 'info', 22)}</span><p>${Utils.esc(message)}</p></div>`,
        footer,
        size: 'sm',
        className: 'confirm-sheet',
        onDismiss: () => finish(false)
      });
      modalRef.querySelector('[data-confirm-yes]').addEventListener('click', () => {
        if (settled) return;
        settled = true;
        resolve(true);
        closeModal();
      });
      modalRef.querySelector('[data-confirm-no]').addEventListener('click', () => finish(false));
    });
  }

  function getRoute() {
    const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
    return Views.meta[raw] ? raw : 'dashboard';
  }

  function navigate(route) {
    closeDrawer();
    if (getRoute() !== route) {
      location.hash = `#/${route}`;
    } else {
      state.route = route;
      render({ scrollTop: true, animate: true });
    }
  }

  function render({ scrollTop = false, animate = false } = {}) {
    if (!data) return;
    const scrollY = window.scrollY;
    state.animatePage = Boolean(animate);
    state.route = getRoute();
    const meta = Views.pageMeta(state.route);
    appRoot.innerHTML = Views.render(state.route, data, state);
    document.body.classList.remove('onboarding-active');
    document.title = `${meta.label} · ${data.settings.mosqueName}`;
    if (scrollTop) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      window.scrollTo({ top: scrollY, behavior: 'auto' });
    }
    if (state.focusSearch) {
      state.focusSearch = false;
      const input = document.getElementById('task-search');
      if (input) {
        input.focus({ preventScroll: true });
        const length = input.value.length;
        input.setSelectionRange(length, length);
      }
    }
    if (state.drawerOpen) {
      appRoot.querySelector('.app')?.classList.add('drawer-open');
    }
  }

  function refresh() {
    if (!data) return;
    render({ scrollTop: false });
  }

  function openDrawer() {
    state.drawerOpen = true;
    appRoot.querySelector('.app')?.classList.add('drawer-open');
    document.body.classList.add('drawer-open');
    closeUserMenu();
    closeMenus();
  }

  function closeDrawer() {
    state.drawerOpen = false;
    appRoot.querySelector('.app')?.classList.remove('drawer-open');
    document.body.classList.remove('drawer-open');
  }

  function closeMenus() {
    document.querySelectorAll('.menu-wrap.open').forEach((item) => item.classList.remove('open'));
  }

  function closeUserMenu() {
    const wrap = document.querySelector('.user-menu-wrap.open');
    if (!wrap) return;
    wrap.classList.remove('open');
    wrap.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
  }

  const saveSettingsDebounced = Utils.debounce(() => {
    if (data) Data.save();
  }, 450);

  const taskSearchDebounced = Utils.debounce(() => {
    state.focusSearch = true;
    refresh();
  }, 240);

  function renderOnboarding() {
    closeDrawer();
    closeMenus();
    document.body.classList.add('onboarding-active');
    document.title = 'تهيئة المكتب الإعلامي';
    appRoot.innerHTML = onboardingMarkup();
    bindOnboarding();
  }

  function onboardingMemberChips() {
    if (!onboarding.members.length) return '<span class="onboarding-empty-members">لم تضف أعضاء بعد</span>';
    return onboarding.members.map((name, index) => `
      <span class="onboarding-member">
        <i style="--member-color:${Data.PALETTE[index % Data.PALETTE.length].value}">${Utils.esc(Utils.initials(name))}</i>
        <span>${Utils.esc(name)}</span>
        <button type="button" data-onboard-remove="${index}" aria-label="إزالة ${Utils.esc(name)}">${Icons.svg('close', 12)}</button>
      </span>`).join('');
  }

  function onboardingMarkup() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const demoChecked = onboarding.members.length > 0 && onboarding.demo;
    return `
      <div class="onboarding">
        <div class="onboarding-shell">
          <aside class="onboarding-visual" aria-hidden="true">
            <div class="onboarding-visual-glow"></div>
            <div class="onboarding-visual-top">
              ${Icons.logo('logo-on-dark')}
              <div class="onboarding-wordmark"><strong>المكتب الإعلامي</strong><span>متابعة الإنتاج والنشر</span></div>
              <span class="onboarding-version">نسخة المكتب</span>
            </div>
            <div class="onboarding-hero-copy">
              <span class="onboarding-kicker">${Icons.svg('sparkles', 15)} تنظيم بلا تعقيد</span>
              <h1>مسار واضح لكل إنجاز في خدمة المسجد</h1>
              <p>من التصوير إلى النشر، تابع كل مرحلة، واعرف من أنجزها ومتى، دون أوراق أو مجموعات متفرقة.</p>
            </div>
            <div class="onboarding-preview">
              <div class="preview-main">
                <div class="preview-main-head">
                  <span class="preview-chip">دروس الفجر</span>
                  <span class="preview-status">${Icons.svg('clock', 12)} قيد العمل</span>
                </div>
                <h3>درس الفجر: تفسير سورة الفاتحة</h3>
                <div class="preview-stage"><span class="done">${Icons.svg('check', 12)}</span><span>تصوير الدرس</span><small>أحمد · أمس</small></div>
                <div class="preview-stage"><span class="done">${Icons.svg('check', 12)}</span><span>تفريغ الفيديو</span><small>عبدالله · اليوم</small></div>
                <div class="preview-stage current"><span>3</span><span>مونتاج الدرس</span><small>المرحلة الحالية</small></div>
                <div class="preview-stage"><span>4</span><span>نشر الدرس</span><small>لاحقًا</small></div>
                <div class="preview-progress"><span style="width:50%"></span></div>
                <div class="preview-foot"><span>2 من 4 مراحل</span><span class="preview-avatars"><i style="background:#0a84ff">أ</i><i style="background:#ff9f0a">ع</i><i style="background:#6c63ff">م</i></span></div>
              </div>
              <div class="preview-float preview-report">
                <span class="preview-report-label">إنجاز هذا الشهر</span>
                <div class="preview-bars"><i style="height:32%"></i><i style="height:52%"></i><i style="height:44%"></i><i style="height:70%"></i><i style="height:88%"></i><i style="height:64%"></i></div>
                <strong>38 <small>مرحلة</small></strong>
              </div>
              <div class="preview-float preview-team">
                <span class="preview-avatars"><i style="background:#30b85a">أ</i><i style="background:#ff375f">س</i></span>
                <div><strong>3 أعضاء</strong><small>يتابعون الإنتاج</small></div>
              </div>
            </div>
            <div class="onboarding-visual-foot">
              <span>${Icons.svg('database', 14)} بيانات محلية</span>
              <span>${Icons.svg('download', 14)} تصدير كامل</span>
              <span>${Icons.svg('smartphone', 14)} يعمل على الجوال</span>
            </div>
          </aside>
          <main class="onboarding-panel">
            <div class="onboarding-panel-top">
              <div class="onboarding-brand">
                ${Icons.logo()}
                <div><strong>متابعة المكتب الإعلامي</strong><span>نظام إنتاج وتوثيق</span></div>
              </div>
              <button class="icon-btn" type="button" id="onboarding-theme" data-action="toggle-theme" aria-label="تبديل المظهر">${Icons.svg(dark ? 'sun' : 'moon', 19)}</button>
            </div>
            <div class="onboarding-form-wrap">
              <span class="page-eyebrow">تهيئة سريعة</span>
              <h2>أنشئ مساحة المكتب</h2>
              <p class="onboarding-lead">اسم المسجد وأعضاء الفريق فقط. يمكنك تعديل كل شيء لاحقًا من الإعدادات.</p>
              <form id="onboarding-form" class="onboarding-form" novalidate>
                <div class="form-error" role="alert"></div>
                <label class="field">
                  <span>اسم المسجد</span>
                  <input type="text" id="onboarding-mosque" maxlength="80" placeholder="مثال: مسجد الحي" value="${Utils.esc(onboarding.mosqueName)}" autocomplete="off" autofocus>
                </label>
                <div class="field">
                  <span>أعضاء الفريق <small>اختياري الآن</small></span>
                  <div class="onboarding-member-input">
                    <input type="text" id="onboarding-member-input" maxlength="50" placeholder="اكتب اسم العضو..." autocomplete="off">
                    <button class="btn secondary" type="button" data-onboard-add>${Icons.svg('plus', 15)} إضافة</button>
                  </div>
                  <div class="onboarding-members" id="onboarding-members">${onboardingMemberChips()}</div>
                  <p class="field-hint">${Icons.svg('info', 13)} بدون كلمات مرور. تُستخدم الأسماء لتوثيق من أنجز كل مرحلة.</p>
                </div>
                <label class="demo-toggle ${onboarding.members.length ? '' : 'disabled'}">
                  <span class="demo-toggle-copy">
                    <strong>إضافة بيانات تجريبية</strong>
                    <small id="onboarding-demo-caption">${onboarding.members.length ? 'مهام ومجموعات جاهزة لاستعراض النظام.' : 'أضف عضوًا واحدًا على الأقل لتفعيل البيانات التجريبية.'}</small>
                  </span>
                  <input type="checkbox" id="onboarding-demo" ${demoChecked ? 'checked' : ''} ${onboarding.members.length ? '' : 'disabled'}>
                  <span class="switch-ui" aria-hidden="true"></span>
                </label>
                <button class="btn primary onboarding-submit" type="submit">ابدأ الاستخدام ${Icons.svg('arrow-left', 17)}</button>
              </form>
              <p class="onboarding-footnote">${Icons.svg('lock', 13)} بياناتك تبقى على هذا الجهاز، ويمكنك تصدير نسخة كاملة في أي وقت.</p>
            </div>
          </main>
        </div>
      </div>`;
  }

  function renderOnboardingMembers() {
    const container = document.getElementById('onboarding-members');
    const demo = document.getElementById('onboarding-demo');
    const caption = document.getElementById('onboarding-demo-caption');
    const toggle = document.querySelector('.demo-toggle');
    if (container) container.innerHTML = onboardingMemberChips();
    if (demo) {
      demo.disabled = onboarding.members.length === 0;
      demo.checked = onboarding.members.length > 0 && onboarding.demo;
    }
    if (caption) {
      caption.textContent = onboarding.members.length
        ? 'مهام ومجموعات جاهزة لاستعراض النظام.'
        : 'أضف عضوًا واحدًا على الأقل لتفعيل البيانات التجريبية.';
    }
    if (toggle) toggle.classList.toggle('disabled', onboarding.members.length === 0);
  }

  function bindOnboarding() {
    const form = document.getElementById('onboarding-form');
    const input = document.getElementById('onboarding-member-input');
    const addButton = document.querySelector('[data-onboard-add]');
    const members = document.getElementById('onboarding-members');
    const demo = document.getElementById('onboarding-demo');

    const addMember = () => {
      const value = input?.value.trim();
      if (!value) {
        input?.focus();
        return;
      }
      if (onboarding.members.some((name) => name.toLowerCase() === value.toLowerCase())) {
        toast('هذا الاسم موجود بالفعل.', { type: 'warning' });
        input.select();
        return;
      }
      onboarding.members.push(value);
      onboarding.demo = true;
      if (input) {
        input.value = '';
        input.focus();
      }
      renderOnboardingMembers();
    };

    addButton?.addEventListener('click', addMember);
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addMember();
      }
    });
    members?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-onboard-remove]');
      if (!button) return;
      const index = Number(button.dataset.onboardRemove);
      onboarding.members.splice(index, 1);
      renderOnboardingMembers();
    });
    demo?.addEventListener('change', () => {
      onboarding.demo = demo.checked;
    });
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const error = form.querySelector('.form-error');
      const mosqueInput = document.getElementById('onboarding-mosque');
      const mosqueName = mosqueInput.value.trim();
      onboarding.mosqueName = mosqueName;
      if (!mosqueName) {
        error.innerHTML = `${Icons.svg('alert-circle', 16)} <span>اكتب اسم المسجد للمتابعة.</span>`;
        error.classList.add('visible');
        mosqueInput.focus();
        return;
      }
      error.classList.remove('visible');
      const withDemo = Boolean(demo && !demo.disabled && demo.checked && onboarding.members.length);
      data = Data.createWorkspace({
        mosqueName,
        members: onboarding.members,
        withDemo
      });
      state.tasks = defaultTaskFilters();
      state.report = defaultReportFilters();
      state.demoBannerHidden = false;
      state.drawerOpen = false;
      applyTheme(data.settings.theme || document.documentElement.dataset.themeMode || 'auto');
      applyFavicon(data.settings.logo);
      closeAllModals();
      try {
        history.replaceState(null, '', `${location.pathname}${location.search}#/dashboard`);
      } catch (replaceError) {
        location.hash = '#/dashboard';
      }
      render({ scrollTop: true, animate: true });
      toast('تم إنشاء مساحة المكتب الإعلامي.', { type: 'success', icon: 'check-circle' });
    });
  }

  async function exportJSON() {
    if (!data) return;
    IO.exportJSON(data);
    Data.setBackup('json');
    refresh();
    toast('تم تصدير نسخة JSON كاملة.', { type: 'success', icon: 'download' });
  }

  async function exportExcel() {
    if (!data) return;
    IO.exportExcel(data);
    Data.setBackup('excel');
    refresh();
    toast('تم تصدير ملف Excel متعدد الجداول.', { type: 'success', icon: 'file-spreadsheet' });
  }

  function pickLogo() {
    chooseFile('image/*', async (file) => {
      if (!file.type.startsWith('image/')) throw new Error('اختر ملف صورة صالحًا.');
      const raw = await Utils.readFileAsDataURL(file);
      const resized = await resizeLogo(raw, 256);
      if (!resized.startsWith('data:image/')) throw new Error('تعذر تجهيز الصورة.');
      if (resized.length > 900000) throw new Error('حجم الصورة كبير جدًا. اختر صورة أصغر.');
      Data.setSetting('logo', resized);
      applyFavicon(resized);
      refresh();
      toast('تم تعيين شعار المسجد كأيقونة للتطبيق.', { type: 'success', icon: 'image' });
    });
  }

  function chooseFile(accept, onFile) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        await onFile(file);
      } catch (error) {
        showImportError(error.message || 'تعذر استيراد الملف.');
      }
    });
    document.body.appendChild(input);
    input.click();
  }

  function showImportError(message) {
    openModal({
      title: 'تعذر الاستيراد',
      subtitle: 'لم يتم تغيير بياناتك الحالية.',
      eyebrow: 'استيراد',
      body: `<div class="import-error">${Icons.svg('alert-circle', 20)} <p>${Utils.esc(message)}</p></div>`,
      footer: `<div class="modal-footer-actions"><button class="btn primary" data-close-modal>حسنًا</button></div>`,
      size: 'sm'
    });
  }

  function applyImported(normalized) {
    data = Data.replace(normalized);
    applyTheme(data.settings.theme || document.documentElement.dataset.themeMode || 'auto');
    applyFavicon(data.settings.logo);
    closeAllModals();
    state.tasks = defaultTaskFilters();
    state.report = defaultReportFilters();
    state.demoBannerHidden = false;
    navigate('dashboard');
    toast(`تم استيراد البيانات من ${data.settings.mosqueName}.`, { type: 'success', icon: 'check-circle' });
  }

  function importJSONFlow() {
    chooseFile('.json,application/json', async (file) => {
      const result = await IO.importJSON(file);
      Modals.openImportConfirm({
        summary: result.summary,
        fileName: file.name,
        type: 'json',
        onConfirm: () => applyImported(result.normalized)
      });
    });
  }

  function importExcelFlow() {
    chooseFile('.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', async (file) => {
      const result = await IO.importExcel(file);
      Modals.openImportConfirm({
        summary: result.summary,
        fileName: file.name,
        type: 'excel',
        onConfirm: () => applyImported(result.normalized)
      });
    });
  }

  function resetDataFlow() {
    confirm({
      title: 'إعادة تعيين النظام',
      message: 'سيتم حذف جميع المهام والمجموعات والقوالب والأعضاء والاختصارات من هذا الجهاز. لا يمكن التراجع عن هذا الإجراء.',
      confirmText: 'حذف كل البيانات',
      eyebrow: 'إجراء حساس',
      danger: true
    }).then((ok) => {
      if (!ok) return;
      Data.reset();
      data = null;
      closeAllModals();
      closeDrawer();
      closeMenus();
      closeUserMenu();
      state.route = 'dashboard';
      state.tasks = defaultTaskFilters();
      state.report = defaultReportFilters();
      state.demoBannerHidden = false;
      onboarding.mosqueName = '';
      onboarding.members = [];
      onboarding.demo = true;
      applyFavicon(null);
      renderOnboarding();
      toast('تمت إعادة تعيين النظام.', { type: 'info' });
    });
  }

  async function clearDemoFlow() {
    if (!data) return;
    const count = data.tasks.filter((task) => task.isDemo).length;
    if (!count) {
      toast('لا توجد مهام تجريبية.', { type: 'info' });
      return;
    }
    const ok = await confirm({
      title: 'مسح المهام التجريبية',
      message: `سيتم حذف ${count} مهمة تجريبية فقط، مع الحفاظ على الأعضاء والمجموعات والقوالب والاختصارات.`,
      confirmText: 'مسح المهام التجريبية',
      danger: true
    });
    if (!ok) return;
    const removed = Data.clearDemo();
    refresh();
    toast(`تم مسح ${removed} مهمة تجريبية.`, { type: 'success' });
  }

  async function deleteTaskFlow(taskId, source) {
    const task = Data.findTask(taskId);
    if (!task) return;
    const ok = await confirm({
      title: 'حذف المهمة',
      message: `سيتم حذف «${task.title}» نهائيًا مع سجل مراحلها وإنجازاتها.`,
      confirmText: 'حذف المهمة',
      danger: true
    });
    if (!ok) return;
    Data.deleteTask(taskId);
    closeAllModals();
    refresh();
    toast('تم حذف المهمة.', { type: 'success' });
  }

  async function deleteGroupFlow(groupId) {
    const group = Data.findGroup(groupId);
    if (!group) return;
    const summary = Data.groupSummary(groupId);
    const ok = await confirm({
      title: 'حذف المجموعة',
      message: summary.total
        ? `سيتم حذف مجموعة «${group.name}» و${summary.total} مهمة مرتبطة بها. لا يمكن التراجع.`
        : `سيتم حذف مجموعة «${group.name}». لا توجد مهام مرتبطة بها.`,
      confirmText: 'حذف المجموعة',
      danger: true
    });
    if (!ok) return;
    const result = Data.deleteGroup(groupId);
    if (state.tasks.groupId === groupId) state.tasks.groupId = 'all';
    if (state.report.groupId === groupId) state.report.groupId = 'all';
    refresh();
    toast(result.tasksDeleted ? `تم حذف المجموعة و${result.tasksDeleted} مهمة.` : 'تم حذف المجموعة.', { type: 'success' });
  }

  async function deleteTemplateFlow(templateId) {
    const template = Data.findTemplate(templateId);
    if (!template) return;
    const used = data.groups.filter((group) => group.templateId === templateId);
    if (used.length) {
      toast(`لا يمكن حذف القالب لأنه مستخدم في ${used.length} مجموعات. غيّر قالبها أولًا.`, { type: 'warning', duration: 5200 });
      return;
    }
    const ok = await confirm({
      title: 'حذف القالب',
      message: `سيتم حذف قالب «${template.name}» نهائيًا. المهام الحالية غير مرتبطة به ولن تتأثر.`,
      confirmText: 'حذف القالب',
      danger: true
    });
    if (!ok) return;
    const result = Data.deleteTemplate(templateId);
    if (!result.ok) {
      toast('تعذر حذف القالب.', { type: 'error' });
      return;
    }
    refresh();
    toast('تم حذف القالب.', { type: 'success' });
  }

  async function deleteUserFlow(userId) {
    const user = Data.findUser(userId);
    if (!user) return;
    const hasHistory = data.tasks.some((task) => task.stages.some((stage) => stage.completedBy === userId));
    if (hasHistory) {
      toast('لا يمكن حذف عضو لديه سجل إنجاز. يمكنك تعديل اسمه بدلًا من ذلك للحفاظ على التوثيق.', { type: 'warning', duration: 5600 });
      return;
    }
    const ok = await confirm({
      title: 'حذف العضو',
      message: `سيتم حذف «${user.name}» وإلغاء إسناد المهام المفتوحة إليه.`,
      confirmText: 'حذف العضو',
      danger: true
    });
    if (!ok) return;
    const result = Data.deleteUser(userId);
    if (!result.ok) {
      toast('تعذر حذف العضو.', { type: 'error' });
      return;
    }
    if (state.tasks.userId === userId) state.tasks.userId = 'all';
    if (state.report.userId === userId) state.report.userId = 'all';
    refresh();
    toast('تم حذف العضو.', { type: 'success' });
  }

  async function deleteLinkFlow(linkId) {
    const link = Data.findLink(linkId);
    if (!link) return;
    const ok = await confirm({
      title: 'حذف الاختصار',
      message: `سيتم حذف اختصار «${link.name}».`,
      confirmText: 'حذف',
      danger: true
    });
    if (!ok) return;
    Data.deleteLink(linkId);
    refresh();
    toast('تم حذف الاختصار.', { type: 'success' });
  }

  async function reopenStageFlow(taskId, stageId, source) {
    const task = Data.findTask(taskId);
    const stage = task?.stages.find((item) => item.id === stageId);
    if (!task || !stage) return;
    const ok = await confirm({
      title: 'إعادة فتح المرحلة',
      message: `سيتم إلغاء إنجاز «${stage.name}» والمراحل التي تليها، مع حذف توثيق من أنجزها.`,
      confirmText: 'إعادة الفتح',
      danger: true
    });
    if (!ok) return;
    const result = Data.reopenStage(taskId, stageId);
    closeAllModals();
    refresh();
    if (source === 'detail') Modals.openTaskDetail(taskId);
    if (result.ok) toast(`أُعيد فتح ${result.count} مرحلة.`, { type: 'success' });
  }

  async function duplicateTaskFlow(taskId, source) {
    const copy = Data.duplicateTask(taskId);
    if (!copy) return;
    if (source === 'detail') {
      closeAllModals();
      refresh();
      Modals.openTaskDetail(copy.id);
    } else {
      refresh();
    }
    toast('تم إنشاء نسخة جديدة من المهمة.', { type: 'success', icon: 'copy' });
  }

  async function handleAction(action, element) {
    if (action === 'toggle-theme') {
      const dark = document.documentElement.dataset.theme === 'dark';
      const next = dark ? 'light' : 'dark';
      if (data) {
        Data.setTheme(next);
        applyTheme(next);
        refresh();
      } else {
        applyTheme(next);
        updateOnboardingThemeButton();
      }
      return;
    }
    if (!data) return;
    switch (action) {
      case 'open-drawer':
        openDrawer();
        break;
      case 'close-drawer':
        closeDrawer();
        break;
      case 'toggle-user-menu': {
        const wrap = element.closest('.user-menu-wrap');
        const open = wrap.classList.contains('open');
        closeUserMenu();
        closeMenus();
        if (!open) {
          wrap.classList.add('open');
          element.setAttribute('aria-expanded', 'true');
        }
        break;
      }
      case 'select-user': {
        const userId = element.dataset.userId;
        Data.setActiveUser(userId);
        closeMenus();
        closeUserMenu();
        refresh();
        const user = Data.findUser(userId);
        if (user) toast(`العضو النشط الآن: ${user.name}`, { type: 'info', icon: 'user-check' });
        break;
      }
      case 'add-task': {
        const groupId = element.dataset.groupId || (state.route === 'tasks' && state.tasks.groupId !== 'all' ? state.tasks.groupId : null);
        Modals.openTaskForm({ groupId });
        break;
      }
      case 'open-task':
        Modals.openTaskDetail(element.dataset.taskId);
        break;
      case 'edit-task':
        Modals.openTaskForm({ taskId: element.dataset.taskId, returnToDetail: element.dataset.source === 'detail' });
        break;
      case 'duplicate-task':
        duplicateTaskFlow(element.dataset.taskId, element.dataset.source);
        break;
      case 'delete-task':
        deleteTaskFlow(element.dataset.taskId, element.dataset.source);
        break;
      case 'quick-complete': {
        const task = Data.findTask(element.dataset.taskId);
        const next = task ? Data.nextStage(task) : null;
        if (task && next) Modals.openCompleteStage(task.id, next.id, { returnToDetail: false });
        break;
      }
      case 'complete-stage':
        Modals.openCompleteStage(element.dataset.taskId, element.dataset.stageId, { returnToDetail: element.dataset.source === 'detail' });
        break;
      case 'reopen-stage':
        reopenStageFlow(element.dataset.taskId, element.dataset.stageId, element.dataset.source);
        break;
      case 'stage-cell':
        Modals.openStageCell(element.dataset.taskId, element.dataset.stageId);
        break;
      case 'open-member':
        closeUserMenu();
        Modals.openMemberProfile(element.dataset.userId);
        break;
      case 'set-task-view':
        state.tasks.view = element.dataset.view === 'table' ? 'table' : 'cards';
        refresh();
        break;
      case 'set-task-filter':
        state.tasks[element.dataset.filter] = element.dataset.value;
        refresh();
        break;
      case 'filter-status':
        state.tasks.status = element.dataset.status;
        refresh();
        break;
      case 'clear-task-filters': {
        const view = state.tasks.view;
        state.tasks = { ...defaultTaskFilters(), view };
        refresh();
        break;
      }
      case 'view-group-tasks':
        state.tasks = { ...defaultTaskFilters(), groupId: element.dataset.groupId };
        navigate('tasks');
        break;
      case 'add-group':
        Modals.openGroupForm();
        break;
      case 'edit-group':
        Modals.openGroupForm(element.dataset.groupId);
        break;
      case 'delete-group':
        deleteGroupFlow(element.dataset.groupId);
        break;
      case 'add-template':
        Modals.openTemplateForm();
        break;
      case 'edit-template':
        Modals.openTemplateForm(element.dataset.templateId);
        break;
      case 'delete-template':
        deleteTemplateFlow(element.dataset.templateId);
        break;
      case 'add-user':
        if (!(await ensureUnlocked())) break;
        closeUserMenu();
        Modals.openUserForm();
        break;
      case 'edit-user':
        if (!(await ensureUnlocked())) break;
        Modals.openUserForm(element.dataset.userId);
        break;
      case 'delete-user':
        if (!(await ensureUnlocked())) break;
        deleteUserFlow(element.dataset.userId);
        break;
      case 'add-link':
        Modals.openLinkForm();
        break;
      case 'edit-link':
        Modals.openLinkForm(element.dataset.linkId);
        break;
      case 'delete-link':
        deleteLinkFlow(element.dataset.linkId);
        break;
      case 'export-json':
        exportJSON();
        break;
      case 'export-excel':
        exportExcel();
        break;
      case 'import-json':
        if (!(await ensureUnlocked())) break;
        importJSONFlow();
        break;
      case 'import-excel':
        if (!(await ensureUnlocked())) break;
        importExcelFlow();
        break;
      case 'export-report-excel': {
        if (!data) break;
        const report = Data.report(state.report);
        IO.exportReportExcel(report, data);
        toast('تم تجهيز تقرير Excel.', { type: 'success', icon: 'file-spreadsheet' });
        break;
      }
      case 'print-report':
        closeMenus();
        window.print();
        break;
      case 'set-report-period':
        state.report.period = element.dataset.period;
        if (state.report.period === 'custom' && (!state.report.from || !state.report.to)) {
          state.report.from = Utils.toISODate(Utils.startOfMonth());
          state.report.to = Utils.todayISO();
        }
        refresh();
        break;
      case 'set-theme': {
        const theme = element.dataset.themeValue;
        Data.setTheme(theme);
        applyTheme(theme);
        refresh();
        break;
      }
      case 'clear-demo':
        if (!(await ensureUnlocked())) break;
        clearDemoFlow();
        break;
      case 'dismiss-demo':
        state.demoBannerHidden = true;
        refresh();
        break;
      case 'reset-data':
        if (!(await ensureUnlocked())) break;
        resetDataFlow();
        break;
      case 'unlock-settings': {
        const ok = await Modals.requestUnlock();
        if (ok) {
          refresh();
          toast('تم فتح قفل الإعدادات مؤقتًا.', { type: 'success', icon: 'lock-open' });
        }
        break;
      }
      case 'lock-settings':
        Data.lock();
        refresh();
        toast('تم قفل الإعدادات.', { type: 'info', icon: 'lock' });
        break;
      case 'set-password':
        Modals.openSetPassword();
        break;
      case 'remove-password': {
        if (!(await ensureUnlocked())) break;
        const ok = await confirm({
          title: 'إزالة كلمة المرور',
          message: 'سيتم إلغاء قفل الإعدادات نهائيًا حتى تعيّن كلمة مرور جديدة.',
          confirmText: 'إزالة كلمة المرور',
          danger: true
        });
        if (!ok) break;
        Data.clearPassword();
        refresh();
        toast('تم إزالة كلمة المرور.', { type: 'success', icon: 'key' });
        break;
      }
      case 'change-logo':
        pickLogo();
        break;
      case 'remove-logo':
        Data.setSetting('logo', '');
        applyFavicon(null);
        refresh();
        toast('تمت إزالة الشعار المخصص.', { type: 'info', icon: 'image' });
        break;
      default:
        break;
    }
    if (element.closest('.menu-pop')) closeMenus();
  }

  function onClick(event) {
    if (event.target.classList.contains('modal-backdrop')) {
      closeModal();
      return;
    }
    const closeButton = event.target.closest('[data-close-modal]');
    if (closeButton) {
      event.preventDefault();
      closeModal();
      return;
    }
    const actionElement = event.target.closest('[data-action]');
    if (actionElement) {
      const action = actionElement.dataset.action;
      if (action === 'toggle-menu') {
        event.preventDefault();
        const wrap = actionElement.closest('.menu-wrap');
        const open = wrap.classList.contains('open');
        closeMenus();
        closeUserMenu();
        if (!open) wrap.classList.add('open');
        return;
      }
      if (action === 'toggle-user-menu') {
        event.preventDefault();
        const wrap = actionElement.closest('.user-menu-wrap');
        const open = wrap.classList.contains('open');
        closeUserMenu();
        closeMenus();
        if (!open) {
          wrap.classList.add('open');
          actionElement.setAttribute('aria-expanded', 'true');
        }
        return;
      }
      if (action === 'open-drawer') {
        event.preventDefault();
        openDrawer();
        return;
      }
      if (action === 'close-drawer') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      event.preventDefault();
      Promise.resolve(handleAction(action, actionElement)).catch((error) => {
        console.error(error);
        toast('حدث خطأ غير متوقع. حاول مرة أخرى.', { type: 'error' });
      });
      return;
    }
    if (!event.target.closest('.menu-wrap')) closeMenus();
    if (!event.target.closest('.user-menu-wrap')) closeUserMenu();
    if (event.target.closest('[data-nav]')) {
      closeDrawer();
      closeUserMenu();
      closeMenus();
    }
  }

  function onChange(event) {
    if (!data) return;
    const target = event.target;
    if (target.id === 'task-group-filter') {
      state.tasks.groupId = target.value;
      refresh();
    } else if (target.id === 'task-user-filter') {
      state.tasks.userId = target.value;
      refresh();
    } else if (target.id === 'task-sort') {
      state.tasks.sort = target.value;
      refresh();
    } else if (target.id === 'report-group') {
      state.report.groupId = target.value;
      refresh();
    } else if (target.id === 'report-user') {
      state.report.userId = target.value;
      refresh();
    } else if (target.id === 'report-from') {
      state.report.period = 'custom';
      state.report.from = target.value;
      if (state.report.to && state.report.from > state.report.to) state.report.to = state.report.from;
      refresh();
    } else if (target.id === 'report-to') {
      state.report.period = 'custom';
      state.report.to = target.value;
      if (state.report.from && state.report.to < state.report.from) state.report.from = state.report.to;
      refresh();
    } else if (target.id === 'settings-mosque-name') {
      target.value = data.settings.mosqueName;
      saveSettingsDebounced();
    } else if (target.id === 'settings-tagline') {
      target.value = data.settings.tagline;
      saveSettingsDebounced();
    }
  }

  function onInput(event) {
    if (!data) return;
    const target = event.target;
    if (target.id === 'task-search') {
      state.tasks.search = target.value;
      taskSearchDebounced();
      return;
    }
    if (target.id === 'settings-mosque-name') {
      const value = target.value.trim() || 'مسجد الحي';
      data.settings.mosqueName = value;
      document.querySelectorAll('.js-mosque-name').forEach((node) => {
        node.textContent = value;
      });
      document.title = `${Views.pageMeta(state.route).label} · ${value}`;
      saveSettingsDebounced();
      return;
    }
    if (target.id === 'settings-tagline') {
      const value = target.value.trim() || 'المكتب الإعلامي';
      data.settings.tagline = value;
      document.querySelectorAll('.js-office-name').forEach((node) => {
        node.textContent = value;
      });
      saveSettingsDebounced();
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (modalLayers.length) {
        event.preventDefault();
        closeModal();
        return;
      }
      if (state.drawerOpen) {
        closeDrawer();
        return;
      }
      closeMenus();
      closeUserMenu();
      return;
    }
    if (event.key === 'Tab' && modalLayers.length) {
      const layer = modalLayers[modalLayers.length - 1].el;
      const focusable = [...layer.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList?.contains('task-card')) {
      event.preventDefault();
      Modals.openTaskDetail(event.target.dataset.taskId);
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList?.contains('member-card')) {
      event.preventDefault();
      Modals.openMemberProfile(event.target.dataset.userId);
    }
  }

  function onHashChange() {
    if (!data) return;
    closeAllModals();
    closeDrawer();
    closeMenus();
    closeUserMenu();
    state.route = getRoute();
    render({ scrollTop: true, animate: true });
  }

  function setupSystemTheme() {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const mode = data?.settings.theme || localStorage.getItem('mmo_theme') || 'auto';
      if (mode !== 'auto') return;
      applyTheme('auto');
      if (data) {
        refresh();
      } else {
        updateOnboardingThemeButton();
      }
    };
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handler);
    } else if (typeof query.addListener === 'function') {
      query.addListener(handler);
    }
  }

  function bind() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('hashchange', onHashChange);
  }

  function init() {
    bind();
    const storedMode = localStorage.getItem('mmo_theme') || 'auto';
    applyTheme(storedMode);
    data = Data.load();
    if (!data || !data.settings.onboarded) {
      renderOnboarding();
      setupSystemTheme();
      return;
    }
    applyTheme(data.settings.theme || storedMode);
    applyFavicon(data.settings.logo);
    state.route = getRoute();
    if (!Views.meta[location.hash.replace(/^#\/?/, '').split('?')[0]]) {
      try {
        history.replaceState(null, '', `${location.pathname}${location.search}#/${state.route}`);
      } catch (error) {}
    }
    render({ scrollTop: false, animate: true });
    setupSystemTheme();
  }

  window.App = {
    state,
    data: () => data,
    render,
    refresh,
    navigate,
    toast,
    openModal,
    closeModal,
    closeAllModals,
    confirm,
    applyTheme
  };

  document.addEventListener('DOMContentLoaded', init);

  return window.App;
})();
