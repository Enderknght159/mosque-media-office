const Views = (() => {
  const meta = {
    dashboard: { label: 'نظرة عامة', section: 'المتابعة', title: 'نظرة عامة', subtitle: 'متابعة لحظية لمسارات الإنتاج والنشر في المكتب الإعلامي.' },
    tasks: { label: 'المهام', section: 'المتابعة', title: 'المهام', subtitle: 'كل المهام ومراحلها في مكان واحد، مع وضوح كامل لما تم وما تبقى.' },
    groups: { label: 'المجموعات', section: 'المتابعة', title: 'المجموعات', subtitle: 'مجموعات العمل المبنية على قوالب موحدة لسير إنتاج منظم.' },
    templates: { label: 'القوالب', section: 'المتابعة', title: 'القوالب', subtitle: 'مراحل جاهزة تُضمن ثبات سير العمل في كل مجموعة.' },
    team: { label: 'الأعضاء', section: 'الفريق', title: 'فريق المكتب', subtitle: 'أسماء بلا كلمات مرور، مع توثيق اسم العضو عند كل إنجاز.' },
    reports: { label: 'التقارير', section: 'الفريق', title: 'التقارير والإحصاءات', subtitle: 'قراءة أعمق للإنجاز حسب الفترة والمجموعة والعضو.' },
    automation: { label: 'الأتمتة', section: 'الإنتاج', title: 'الأتمتة', subtitle: 'تشغيل الذكاء الاصطناعي على مهام المكتب، ومتابعة التكلفة والنتائج.' },
    settings: { label: 'الإعدادات', section: 'النظام', title: 'الإعدادات', subtitle: 'تخصيص هوية المسجد والاختصارات وإدارة نسخ البيانات.' }
  };

  const statusColors = {
    done: '#30b85a',
    progress: '#0a84ff',
    new: '#8e8e93',
    danger: '#ff453a',
    warning: '#ff9f0a'
  };

  function pageMeta(route) {
    return meta[route] || meta.dashboard;
  }

  function avatar(user, size = 'md', extraClass = '') {
    if (!user) {
      return `<span class="avatar avatar-${size} avatar-empty ${extraClass}" title="غير مسند">${Icons.svg('user', size === 'lg' || size === 'xl' ? 22 : 14)}</span>`;
    }
    return `<span class="avatar avatar-${size} ${extraClass}" style="--avatar-color:${Utils.esc(user.color)}" title="${Utils.esc(user.name)}">${Utils.esc(Utils.initials(user.name))}</span>`;
  }

  function groupChip(group) {
    if (!group) return `<span class="chip muted">${Icons.svg('layers', 13)} بدون مجموعة</span>`;
    return `<span class="chip group-chip" style="--chip-color:${Utils.esc(group.color)}"><i></i>${Utils.esc(group.name)}</span>`;
  }

  function statusChip(status) {
    const item = Data.STATUS[status] || Data.STATUS.new;
    return `<span class="status-chip" style="--status-color:${item.color}"><i></i>${item.label}</span>`;
  }

  function progressBar(value, color = 'var(--accent)', size = '') {
    const pct = Utils.clamp(Number(value) || 0, 0, 100);
    return `<div class="progress ${size}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%;background:${color}"></span></div>`;
  }

  function iconButton(name, action, title, attrs = '', extra = '') {
    return `<button class="icon-btn ${extra}" data-action="${action}" ${attrs} title="${Utils.esc(title)}" aria-label="${Utils.esc(title)}">${Icons.svg(name, 18)}</button>`;
  }

  // ===== Automation helpers =====

  const automationStates = {
    queued: { label: 'في الانتظار', color: '#8e8e93' },
    running: { label: 'جارٍ', color: '#0a84ff' },
    done: { label: 'مكتمل', color: '#30b85a' },
    failed: { label: 'فشل', color: '#ff453a' },
    cancelled: { label: 'ملغى', color: '#ff9f0a' },
    interrupted: { label: 'متوقف', color: '#ff9f0a' }
  };

  function automationModule() {
    if (window.Opencode) return window.Opencode;
    if (typeof Opencode !== 'undefined') return Opencode;
    return null;
  }

  function formatCost(usd) {
    const value = Number(usd) || 0;
    const formatter = automationModule()?.formatCost;
    if (typeof formatter === 'function') {
      try {
        return formatter(value);
      } catch (error) {}
    }
    if (!value) return '$0';
    return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
  }

  /** تنسيق ثابت لمحور التكلفة حتى لا تختلط الكسور ($0.000 / $0.050 / $0.100). */
  function costAxis(usd) {
    return `$${(Number(usd) || 0).toFixed(3)}`;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (!total) return '—';
    if (total < 60) return `${Utils.formatNumber(total)} ث`;
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${Utils.formatNumber(minutes)} د`;
    const hours = Math.floor(minutes / 60);
    return `${Utils.formatNumber(hours)} س ${Utils.formatNumber(minutes % 60)} د`;
  }

  function jobPercent(job) {
    return Utils.clamp(Math.round(Number(job?.progress) || 0), 0, 100);
  }

  function automationStatusChip(status) {
    const state = automationStates[status] || automationStates.queued;
    return `<span class="status-chip task-run-status" style="--status-color:${state.color}"><i></i>${state.label}</span>`;
  }

  function runningChip(job, { compact = false } = {}) {
    if (!job) return '';
    const pct = jobPercent(job);
    const phase = job.phase || 'جارٍ التشغيل';
    return `<span class="task-run-chip ${compact ? 'compact' : ''}" title="${Utils.esc(`${phase} · ${pct}%`)}"><i class="task-run-dot"></i><b>${pct}%</b></span>`;
  }

  function folderButton({ taskId = '', groupId = '', name = '', folder = '', size = 'mini', iconSize = 15 } = {}) {
    const title = folder ? `${name} · ${folder}` : name;
    const attrs = [taskId ? `data-task-id="${taskId}"` : '', groupId ? `data-group-id="${groupId}"` : ''].filter(Boolean).join(' ');
    return `<button class="icon-btn ${size} task-folder-btn ${folder ? 'has-folder' : ''}" data-action="${taskId ? 'open-task-folder' : 'open-group-folder'}" ${attrs} title="${Utils.esc(title)}" aria-label="${Utils.esc(title)}">${Icons.svg('folder-open', iconSize)}</button>`;
  }

  function automationButton({ taskId = '', title = 'أتمتة المهمة بالذكاء الاصطناعي', size = 'mini', iconSize = 15, running = null } = {}) {
    if (running) {
      return `<span class="task-run-spinner" title="${Utils.esc(`${running.phase || 'جارٍ التشغيل'} · ${jobPercent(running)}%`)}" aria-label="جارٍ التشغيل">${Icons.svg('robot', iconSize)}</span>`;
    }
    return `<button class="icon-btn ${size} task-auto-btn" data-action="start-automation" data-task-id="${taskId}" title="${Utils.esc(title)}" aria-label="${Utils.esc(title)}">${Icons.svg('robot', iconSize)}</button>`;
  }

  function emptyState({ icon = 'sparkles', title, text, action = '', compact = false }) {
    return `
      <div class="empty-state ${compact ? 'compact' : ''}">
        <span class="empty-icon">${Icons.svg(icon, compact ? 20 : 26)}</span>
        <div>
          <h3>${Utils.esc(title)}</h3>
          ${text ? `<p>${Utils.esc(text)}</p>` : ''}
        </div>
        ${action ? `<div class="empty-actions">${action}</div>` : ''}
      </div>`;
  }

  function pageHead(title, subtitle, actions = '', extra = '') {
    return `
      <div class="page-head">
        <div class="page-head-text">
          ${extra ? `<div class="page-eyebrow">${extra}</div>` : ''}
          <h1>${Utils.esc(title)}</h1>
          <p>${Utils.esc(subtitle)}</p>
        </div>
        ${actions ? `<div class="page-actions">${actions}</div>` : ''}
      </div>`;
  }

  function statCard({ icon, color, label, value, note, trend }) {
    return `
      <div class="stat-card card" style="--stat-color:${color}">
        <div class="stat-card-top">
          <span class="stat-icon">${Icons.svg(icon, 20)}</span>
          ${trend ? `<span class="stat-trend">${trend}</span>` : ''}
        </div>
        <strong class="stat-value">${value}</strong>
        <span class="stat-label">${Utils.esc(label)}</span>
        <span class="stat-note">${note}</span>
      </div>`;
  }

  function logo(data) {
    const custom = data?.settings?.logo;
    if (custom) {
      return `<span class="logo-mark logo-custom" aria-hidden="true"><img src="${Utils.esc(custom)}" alt=""></span>`;
    }
    return Icons.logo();
  }

  function badgeChip(badge) {
    return `<span class="badge-chip">${Icons.svg('award', 11)}${Utils.esc(badge)}</span>`;
  }

  function badgeList(badges, limit = 4) {
    const list = Array.isArray(badges) ? badges : [];
    if (!list.length) return '';
    return `<div class="badge-list">${list.slice(0, limit).map(badgeChip).join('')}${list.length > limit ? `<span class="badge-chip more">+${Utils.formatNumber(list.length - limit)}</span>` : ''}</div>`;
  }

  function navLink(route, current, icon, label, badge = '') {
    return `<a class="nav-link ${current === route ? 'active' : ''}" href="#/${route}" data-nav="${route}">${Icons.svg(icon, 19)}<span>${label}</span>${badge}</a>`;
  }

  function renderSidebar(route, data) {
    const activeCount = data.tasks.filter((task) => Data.taskStatus(task) !== 'done').length;
    const runningCount = data.automations.filter((job) => job.status === 'running' || job.status === 'queued').length;
    const lastBackup = data.settings.lastBackupAt
      ? `<span title="${Utils.esc(Utils.fmtDateTime(data.settings.lastBackupAt))}">${Utils.relativeTime(data.settings.lastBackupAt)}</span>`
      : '<span>لم تُنشأ بعد</span>';
    return `
      <aside class="sidebar no-print" aria-label="التنقل الرئيسي">
        <a class="brand" href="#/dashboard" data-nav="dashboard">
          ${logo(data)}
          <span class="brand-text">
            <span class="brand-office js-office-name">${Utils.esc(data.settings.tagline || 'المكتب الإعلامي')}</span>
            <strong class="js-mosque-name">${Utils.esc(data.settings.mosqueName)}</strong>
          </span>
        </a>
        <nav class="nav">
          <div class="nav-section">المتابعة</div>
          ${navLink('dashboard', route, 'home', 'نظرة عامة')}
          ${navLink('tasks', route, 'tasks', 'المهام', activeCount ? `<span class="nav-badge">${Utils.formatNumber(activeCount)}</span>` : '')}
          ${navLink('groups', route, 'layers', 'المجموعات')}
          ${navLink('templates', route, 'template', 'القوالب')}
          <div class="nav-section">الإنتاج</div>
          ${navLink('automation', route, 'robot', 'الأتمتة', runningCount ? `<span class="nav-badge nav-badge-live">${Utils.formatNumber(runningCount)}</span>` : '')}
          <div class="nav-section">الفريق</div>
          ${navLink('team', route, 'users', 'الأعضاء')}
          ${navLink('reports', route, 'chart', 'التقارير')}
          <div class="nav-section">النظام</div>
          ${navLink('settings', route, 'settings', 'الإعدادات')}
        </nav>
        <div class="sidebar-foot">
          <div class="sidebar-backup">
            <div class="sidebar-backup-head">
              <span>نسخة احتياطية</span>
              ${lastBackup}
            </div>
            <button class="icon-btn sidebar-backup-btn" data-action="export-json" title="تصدير نسخة JSON" aria-label="تصدير نسخة JSON">${Icons.svg('download', 16)}</button>
          </div>
          <div class="sidebar-local">${Icons.svg('database', 13)} البيانات محفوظة على هذا الجهاز</div>
        </div>
      </aside>`;
  }

  function renderTopbar(route, data, state) {
    const active = data.users.find((user) => user.id === data.activeUserId) || null;
    const isDark = document.documentElement.dataset.theme === 'dark';
    const currentMeta = pageMeta(route);
    const userOptions = data.users.length
      ? data.users.map((user) => `
          <button class="user-option ${user.id === data.activeUserId ? 'selected' : ''}" data-action="select-user" data-user-id="${user.id}">
            ${avatar(user, 'sm')}
            <span>${Utils.esc(user.name)}</span>
            ${user.id === data.activeUserId ? Icons.svg('check', 15) : ''}
          </button>`).join('')
      : `<div class="popover-empty">${Icons.svg('user-plus', 18)} لا يوجد أعضاء بعد</div>`;
    return `
      <header class="topbar no-print">
        <button class="icon-btn menu-btn" data-action="open-drawer" title="فتح القائمة" aria-label="فتح القائمة">${Icons.svg('menu', 20)}</button>
        <div class="crumb"><span>${currentMeta.section}</span><i>/</i><strong class="crumb-page">${currentMeta.label}</strong><strong class="crumb-mosque">${Utils.esc(data.settings.mosqueName)}</strong></div>
        <div class="topbar-spacer"></div>
        <div class="user-menu-wrap">
          <button class="user-chip ${active ? '' : 'empty'}" data-action="toggle-user-menu" aria-haspopup="true" aria-expanded="false">
            ${active ? avatar(active, 'sm') : `<span class="avatar avatar-sm avatar-dashed">${Icons.svg('user', 14)}</span>`}
            <span class="user-chip-text">${active ? Utils.esc(active.name) : 'اختر المستخدم'}</span>
            ${Icons.svg('chevron-down', 14, 'chevron')}
          </button>
          <div class="user-popover card">
            <div class="popover-label">من يعمل الآن؟</div>
            <div class="user-options">${userOptions}</div>
            <div class="popover-divider"></div>
            <button class="popover-action" data-action="add-user">${Icons.svg('user-plus', 17)} إضافة عضو</button>
            <a class="popover-action" href="#/team" data-nav="team">${Icons.svg('users', 17)} إدارة الأعضاء</a>
          </div>
        </div>
        <button class="icon-btn" data-action="toggle-theme" title="${isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}" aria-label="${isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}">
          ${Icons.svg(isDark ? 'sun' : 'moon', 19)}
        </button>
        <button class="icon-btn topbar-add" data-action="add-task" title="مهمة جديدة" aria-label="مهمة جديدة">${Icons.svg('plus', 19)}</button>
      </header>`;
  }

  function renderBottomNav(route, data) {
    const moreRoutes = ['templates', 'team', 'settings'];
    const moreActive = moreRoutes.includes(route);
    return `
      <nav class="bottom-nav no-print" aria-label="تنقل الجوال">
        <a class="bottom-nav-link ${route === 'dashboard' ? 'active' : ''}" href="#/dashboard" data-nav="dashboard">${Icons.svg('home', 20)}<span>الرئيسية</span></a>
        <a class="bottom-nav-link ${route === 'tasks' ? 'active' : ''}" href="#/tasks" data-nav="tasks">${Icons.svg('tasks', 20)}<span>المهام</span></a>
        <a class="bottom-nav-link ${route === 'groups' ? 'active' : ''}" href="#/groups" data-nav="groups">${Icons.svg('layers', 20)}<span>المجموعات</span></a>
        <a class="bottom-nav-link ${route === 'reports' ? 'active' : ''}" href="#/reports" data-nav="reports">${Icons.svg('chart', 20)}<span>التقارير</span></a>
        <a class="bottom-nav-link ${route === 'automation' ? 'active' : ''}" href="#/automation" data-nav="automation">${Icons.svg('robot', 20)}<span>الأتمتة</span></a>
        <button class="bottom-nav-link ${moreActive ? 'active' : ''}" data-action="open-drawer">${Icons.svg('grid', 20)}<span>المزيد</span></button>
      </nav>`;
  }

  function layout(route, content, data, state) {
    return `
      <div class="app ${state.drawerOpen ? 'drawer-open' : ''}">
        ${renderSidebar(route, data)}
        <div class="drawer-backdrop" data-action="close-drawer" aria-hidden="true"></div>
        <div class="main">
          ${renderTopbar(route, data, state)}
          <main class="content" id="main-content">${content}</main>
        </div>
        ${renderBottomNav(route, data)}
      </div>`;
  }

  function shortcutDisplay(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'file:') return decodeURIComponent(parsed.pathname).replace(/^\//, '') || 'ملف محلي';
      return parsed.hostname.replace(/^www\./, '') || parsed.href;
    } catch (error) {
      return url;
    }
  }

  function shortcutIcon(link) {
    const name = Icons.paths[link.icon] ? link.icon : 'globe';
    return `<span class="shortcut-icon">${Icons.svg(name, 20)}</span>`;
  }

  function shortcutTile(link) {
    return `
      <a class="shortcut card" href="${Utils.esc(link.url)}" target="_blank" rel="noopener noreferrer" title="${Utils.esc(link.name)}">
        ${shortcutIcon(link)}
        <span class="shortcut-body">
          <strong>${Utils.esc(link.name)}</strong>
          <span>${Utils.esc(shortcutDisplay(link.url))}</span>
        </span>
        ${Icons.svg('external-link', 16, 'shortcut-arrow')}
      </a>`;
  }

  function shortcutsSection(data) {
    const links = data.settings.links || [];
    return `
      <section class="shortcuts-section">
        <div class="section-head">
          <div>
            <h2>اختصارات المكتب</h2>
            <p>روابط سريعة للمنصات والملفات والأدوات.</p>
          </div>
          <a class="text-link" href="#/settings" data-nav="settings">إدارة ${Icons.svg('chevron-left', 14)}</a>
        </div>
        <div class="shortcuts-grid">
          ${links.map(shortcutTile).join('')}
          <button class="shortcut shortcut-add" data-action="add-link">
            <span class="shortcut-icon">${Icons.svg('plus', 20)}</span>
            <span class="shortcut-body"><strong>إضافة اختصار</strong><span>صفحة، ملف، أو أداة</span></span>
          </button>
        </div>
      </section>`;
  }

  function taskCard(task) {
    const group = Data.findGroup(task.groupId);
    const assignee = Data.findUser(task.assigneeId);
    const progress = Data.taskProgress(task);
    const status = Data.taskStatus(task);
    const next = Data.nextStage(task);
    const due = Utils.dueMeta(task);
    const priority = Data.PRIORITIES[task.priority];
    const activeJob = Data.activeAutomation(task.id);
    const color = group?.color || 'var(--accent)';
    const dateISO = task.date || '';
    const dateTitle = dateISO ? `تاريخ المهمة: ${Utils.fmtDate(dateISO)}` : '';
    const stageDots = task.stages.map((stage) => {
      const stateClass = stage.done ? 'done' : (next?.id === stage.id ? 'current' : '');
      return `<i class="stage-dot ${stateClass}" style="--stage-color:${color}" title="${Utils.esc(stage.name)}"></i>`;
    }).join('');
    return `
      <article class="task-card card" data-action="open-task" data-task-id="${task.id}" tabindex="0" role="button" aria-label="فتح المهمة ${Utils.esc(task.title)}">
        <div class="task-card-top">
          ${groupChip(group)}
          <div class="task-card-tools">
            ${task.priority !== 'normal' ? `<span class="priority-mark" style="--priority-color:${priority.color}" title="الأولوية: ${priority.label}"></span>` : ''}
            ${next ? `<button class="icon-btn mini card-complete" data-action="quick-complete" data-task-id="${task.id}" title="إكمال المرحلة التالية" aria-label="إكمال المرحلة التالية">${Icons.svg('check', 15)}</button>` : ''}
            ${folderButton({ taskId: task.id, name: 'فتح مجلد المهمة', folder: task.folder || '', size: 'mini', iconSize: 15 })}
            ${automationButton({ taskId: task.id, title: activeJob ? 'جارٍ تشغيل أتمتة لهذه المهمة' : 'أتمتة المهمة بالذكاء الاصطناعي', size: 'mini', iconSize: 15 })}
            ${activeJob ? runningChip(activeJob, { compact: true }) : ''}
            <div class="menu-wrap">
              <button class="icon-btn mini" data-action="toggle-menu" title="خيارات المهمة" aria-label="خيارات المهمة">${Icons.svg('more', 17)}</button>
              <div class="menu-pop card">
                <button data-action="edit-task" data-task-id="${task.id}">${Icons.svg('edit', 16)} تعديل</button>
                <button data-action="duplicate-task" data-task-id="${task.id}">${Icons.svg('copy', 16)} تكرار</button>
                <button class="danger" data-action="delete-task" data-task-id="${task.id}">${Icons.svg('trash', 16)} حذف</button>
              </div>
            </div>
          </div>
        </div>
        <h3 class="task-title">${Utils.esc(task.title)}</h3>
        <div class="task-stage-line">
          ${status === 'done'
            ? `<span class="task-done-label">${Icons.svg('check-circle', 15)} اكتملت المهمة</span>`
            : next
              ? `<span>المرحلة الحالية</span><strong>${Utils.esc(next.name)}</strong>`
              : '<span>لم تبدأ المراحل بعد</span>'}
        </div>
        <div class="task-progress-row">
          ${progressBar(progress.pct, color)}
          <span>${progress.done}/${progress.total}</span>
        </div>
        <div class="stage-dots" aria-label="مراحل المهمة">${stageDots}</div>
        <footer class="task-footer">
          <span class="task-assignee">${avatar(assignee, 'xs')}<span>${assignee ? Utils.esc(assignee.name) : 'غير مسند'}</span></span>
          <span class="task-footer-meta">
            ${dateISO ? `<span class="task-date-chip" title="${Utils.esc(dateTitle)}" aria-label="${Utils.esc(dateTitle)}">${Icons.svg('calendar', 12)}<span class="task-date-text">${Utils.esc(Utils.fmtDayMonth(dateISO))}</span></span>` : ''}
            ${task.dueDate ? `<span class="due-chip tone-${due.tone}" title="تاريخ الاستحقاق">${Icons.svg('calendar', 13)} ${Utils.esc(due.text)}</span>` : ''}
          </span>
        </footer>
      </article>`;
  }

  function taskRow(task) {
    const group = Data.findGroup(task.groupId);
    const assignee = Data.findUser(task.assigneeId);
    const progress = Data.taskProgress(task);
    const next = Data.nextStage(task);
    const due = Utils.dueMeta(task);
    const activeJob = Data.activeAutomation(task.id);
    const dateISO = task.date || '';
    const dateTitle = dateISO ? `تاريخ المهمة: ${Utils.fmtDate(dateISO)}` : '';
    return `
      <div class="task-row" role="button" tabindex="0" data-action="open-task" data-task-id="${task.id}" aria-label="فتح المهمة ${Utils.esc(task.title)}">
        <span class="task-row-mark" style="background:${group?.color || 'var(--accent)'}"></span>
        <span class="task-row-main">
          <strong>${Utils.esc(task.title)}</strong>
          <span>${Utils.esc(group?.name || 'بدون مجموعة')}${next ? ` · ${Utils.esc(next.name)}` : ''}</span>
        </span>
        <span class="task-row-progress">
          <span class="task-row-progress-bar">${progressBar(progress.pct, group?.color || 'var(--accent)', 'xs')}</span>
          <small>${progress.done}/${progress.total}</small>
        </span>
        <span class="task-row-dates">
          ${dateISO ? `<span class="task-date-chip" title="${Utils.esc(dateTitle)}" aria-label="${Utils.esc(dateTitle)}">${Icons.svg('calendar', 12)}<span class="task-date-text">${Utils.esc(Utils.fmtDayMonth(dateISO))}</span></span>` : ''}
          ${task.dueDate ? `<span class="due-chip tone-${due.tone}" title="تاريخ الاستحقاق">${Icons.svg('calendar', 13)} ${Utils.esc(due.text)}</span>` : ''}
        </span>
        ${avatar(assignee, 'xs')}
        <span class="task-row-tools">
          ${folderButton({ taskId: task.id, name: 'فتح مجلد المهمة', folder: task.folder || '', size: 'xs', iconSize: 14 })}
          ${automationButton({ taskId: task.id, running: activeJob, size: 'xs', iconSize: 14 })}
          ${activeJob ? runningChip(activeJob, { compact: true }) : ''}
        </span>
      </div>`;
  }

  function filterMenu({ icon, label, items, value, action = 'set-task-filter', filterKey = '' }) {
    const selected = items.find((item) => item.value === value) || items[0];
    return `
      <div class="menu-wrap filter-menu">
        <button class="filter-select" data-action="toggle-menu" aria-haspopup="true" title="${Utils.esc(label)}">
          ${Icons.svg(icon, 15)}
          <span>${Utils.esc(selected.label)}</span>
          ${Icons.svg('chevron-down', 13, 'chevron')}
        </button>
        <div class="menu-pop filter-pop card">
          ${items.map((item) => `
            <button class="${item.value === value ? 'selected' : ''}" data-action="${action}" data-filter="${filterKey}" data-value="${Utils.esc(item.value)}">
              ${item.dot
                ? `<span class="filter-dot" style="--dot-color:${Utils.esc(item.dot)}">${Utils.esc(item.initials || '')}</span>`
                : Icons.svg(item.icon || icon, 16)}
              <span>${Utils.esc(item.label)}</span>
              ${item.value === value ? Icons.svg('check', 14) : ''}
            </button>`).join('')}
        </div>
      </div>`;
  }

  function taskStatusSections(list) {
    const definitions = [
      { key: 'progress', label: 'قيد العمل', icon: 'clock', color: statusColors.progress },
      { key: 'new', label: 'لم تبدأ', icon: 'circle', color: statusColors.new },
      { key: 'done', label: 'مكتملة', icon: 'check-circle', color: statusColors.done }
    ];
    return definitions.map((definition) => {
      const items = list.filter((task) => Data.taskStatus(task) === definition.key);
      if (!items.length) return '';
      return `
        <section class="task-section">
          <div class="task-section-head" style="--section-color:${definition.color}">
            <span class="task-section-icon">${Icons.svg(definition.icon, 16)}</span>
            <h2>${definition.label}</h2>
            <span class="task-section-count">${Utils.formatNumber(items.length)}</span>
            <span class="task-section-line"></span>
          </div>
          <div class="tasks-grid">${items.map(taskCard).join('')}</div>
        </section>`;
    }).join('');
  }

  function taskStageColumns(list, filters) {
    const names = [];
    const seen = new Set();
    if (filters.groupId !== 'all') {
      const group = Data.findGroup(filters.groupId);
      const template = group ? Data.findTemplate(group.templateId) : null;
      (template?.stages || []).forEach((stage) => {
        if (seen.has(stage.name)) return;
        seen.add(stage.name);
        names.push(stage.name);
      });
    }
    list.forEach((task) => {
      task.stages.forEach((stage) => {
        if (seen.has(stage.name)) return;
        seen.add(stage.name);
        names.push(stage.name);
      });
    });
    return names;
  }

  function stageTableCell(task, column) {
    const stage = task.stages.find((item) => item.name === column);
    if (!stage) return '<td class="stage-cell-na">·</td>';
    const next = Data.nextStage(task);
    const doneUser = stage.done ? Data.findUser(stage.completedBy) : null;
    const defaultUser = !stage.done ? Data.findUser(Data.stageAssignee(task, stage)) : null;
    if (stage.done) {
      const user = doneUser || { name: stage.completedByName || 'عضو سابق', color: '#8e8e93' };
      return `
        <td>
          <button class="stage-cell-btn done" data-action="stage-cell" data-task-id="${task.id}" data-stage-id="${stage.id}" title="تعديل منجز «${Utils.esc(stage.name)}»">
            ${avatar(user, 'xs')}
            <span>${Utils.esc(Utils.shortName(user.name, 12))}</span>
          </button>
        </td>`;
    }
    if (next && next.id === stage.id) {
      return `
        <td>
          <button class="stage-cell-btn current" data-action="stage-cell" data-task-id="${task.id}" data-stage-id="${stage.id}" title="إكمال «${Utils.esc(stage.name)}»">
            ${defaultUser ? avatar(defaultUser, 'xs') : Icons.svg('plus', 13)}
            <span>${defaultUser ? Utils.esc(Utils.shortName(defaultUser.name, 12)) : 'إكمال'}</span>
          </button>
        </td>`;
    }
    return `
      <td>
        <span class="stage-cell-btn pending" title="${defaultUser ? `مسندة إلى ${Utils.esc(defaultUser.name)}` : 'بانتظار المراحل السابقة'}">
          ${defaultUser ? avatar(defaultUser, 'xs') : ''}
          <span>${defaultUser ? Utils.esc(Utils.shortName(defaultUser.name, 12)) : Icons.svg('minus', 12)}</span>
        </span>
      </td>`;
  }

  function taskTable(list, filters) {
    const columns = taskStageColumns(list, filters);
    return `
      <div class="task-table-card card">
        <div class="task-table-note">${Icons.svg('info', 14)} انقر على أي خلية في الجدول لعرض العضو المنجز وتعديله.</div>
        <div class="task-table-scroll">
          <table class="task-table">
            <thead>
              <tr>
                <th class="sticky-col">المهمة</th>
                <th>المجموعة</th>
                ${columns.map((column) => {
                  const type = Data.stageType(column);
                  return `<th><span class="stage-head">${Icons.svg(type.icon, 13)}${Utils.esc(column)}</span></th>`;
                }).join('')}
                <th>التقدم</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((task) => {
                const group = Data.findGroup(task.groupId);
                const progress = Data.taskProgress(task);
                const isDone = Data.taskStatus(task) === 'done';
                return `
                  <tr class="${isDone ? 'is-done' : ''}">
                    <td class="sticky-col">
                      <button class="task-table-title" data-action="open-task" data-task-id="${task.id}">
                        <strong>${isDone ? `<span class="done-mark">${Icons.svg('check-circle', 13)}</span>` : ''}${Utils.esc(task.title)}</strong>
                        <small>${isDone ? 'مكتملة' : `الحالية: ${Utils.esc(Data.nextStage(task)?.name || '—')}`}</small>
                      </button>
                    </td>
                    <td>${groupChip(group)}</td>
                    ${columns.map((column) => stageTableCell(task, column)).join('')}
                    <td><span class="table-progress">${progress.done}/${progress.total}</span></td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function demoBanner(data, state) {
    const demoCount = data.tasks.filter((task) => task.isDemo).length;
    if (!data.settings.demo || !demoCount || state.demoBannerHidden) return '';
    return `
      <div class="demo-banner">
        <span class="demo-icon">${Icons.svg('sparkles', 19)}</span>
        <div class="demo-text">
          <strong>هذه بيانات تجريبية</strong>
          <p>جرّب المهام والتقارير بحرية، وامسحها عندما تبدأ بالبيانات الحقيقية.</p>
        </div>
        <button class="icon-btn sm danger-text" data-action="clear-demo" title="مسح ${Utils.formatNumber(demoCount)} مهام تجريبية" aria-label="مسح ${Utils.formatNumber(demoCount)} مهام تجريبية">${Icons.svg('trash', 15)}</button>
        <button class="icon-btn sm" data-action="dismiss-demo" title="إخفاء التنبيه" aria-label="إخفاء التنبيه">${Icons.svg('close', 15)}</button>
      </div>`;
  }

  function dashboardAutomationCard() {
    const all = Data.get()?.automations || [];
    const stats = Data.automationStats({ days: 30 });
    const activeNow = all.filter((job) => job.status === 'running' || job.status === 'queued').length;
    const series = Data.automationDailySeries(7, 'cost').map((point) => ({
      label: Utils.fmtWeekday(`${point.label}T12:00:00`),
      value: point.value
    }));
    const latest = all.slice().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] || null;
    const head = `
      <div class="card-head">
        <div><h2>${Icons.svg('robot', 15)} استهلاك الأتمتة</h2><p>تكلفة تشغيل الذكاء الاصطناعي خلال آخر 30 يومًا</p></div>
        <a class="text-link" href="#/automation" data-nav="automation">كل الأتمتة ${Icons.svg('chevron-left', 13)}</a>
      </div>`;
    if (!all.length) {
      return `
        <section class="card dash-automation-card">
          ${head}
          ${emptyState({
            icon: 'robot',
            title: 'لا توجد عمليات أتمتة بعد',
            text: 'ابدأ الأتمتة من أي مهمة عبر زر الروبوت في بطاقة المهمة أو من تفاصيلها.',
            action: `<a class="btn secondary sm" href="#/automation" data-nav="automation">${Icons.svg('robot', 15)} صفحة الأتمتة</a>`,
            compact: true
          })}
        </section>`;
    }
    return `
      <section class="card dash-automation-card">
        ${head}
        <div class="dash-automation-numbers">
          <div class="dash-automation-cost">
            <span>التكلفة</span>
            <strong>${formatCost(stats.costUSD)}</strong>
            <small>${Utils.formatNumber(stats.total)} تشغيل · متوسط ${formatCost(stats.avgCostUSD)}</small>
          </div>
          <div class="dash-automation-metrics">
            <span><b>${Utils.formatNumber(stats.total)}</b><small>تشغيل</small></span>
            <span><b>${stats.successPct}%</b><small>نجاح</small></span>
            <span class="${activeNow ? 'is-live' : ''}"><b>${Utils.formatNumber(activeNow)}</b><small>جارٍ الآن</small></span>
          </div>
        </div>
        <div class="dash-automation-chart">
          ${Charts.line({
            points: stats.costUSD > 0 ? series : [],
            height: 128,
            color: '#6c63ff',
            ariaLabel: 'تكلفة الأتمتة اليومية خلال آخر 7 أيام',
            emptyText: 'لا توجد تكلفة مسجلة هذا الأسبوع',
            valueFormat: (value) => costAxis(value),
            minStep: 0.0001
          })}
        </div>
        <div class="dash-automation-note">
          ${latest
            ? `${Icons.svg('clock', 12)} آخر تشغيل ${Utils.relativeTime(latest.startedAt)}${latest.model ? ` · ${Utils.esc(latest.model)}` : ''}`
            : 'لم يبدأ أي تشغيل بعد.'}
        </div>
      </section>`;
  }

  function dashboard(data, state) {
    const overview = Data.overview();
    const groups = Data.allGroupSummaries();
    const activity = Data.activityLastDays(14);
    const activityTotal = activity.reduce((sum, point) => sum + point.value, 0);
    const userSummaries = Data.allUserSummaries()
      .sort((a, b) => b.stages30 - a.stages30 || b.stages - a.stages)
      .slice(0, 5);
    const maxUserStages = Math.max(1, ...userSummaries.map((item) => item.stages30 || item.stages));
    const activeTasks = Data.sortTasks(data.tasks.filter((task) => Data.taskStatus(task) !== 'done'), 'due').slice(0, 5);
    const activeUser = Data.findUser(data.activeUserId);
    const waitingTasks = activeUser ? Data.tasksWaitingOn(activeUser.id) : [];
    const dateLine = `${Utils.fmtDate(new Date(), { weekday: true })}${Utils.fmtHijri() ? ` · ${Utils.fmtHijri()}` : ''}`;
    const segments = [
      { label: 'مكتملة', value: overview.done, color: statusColors.done },
      { label: 'قيد العمل', value: overview.progress, color: statusColors.progress },
      { label: 'لم تبدأ', value: overview.fresh, color: statusColors.new }
    ];
    const empty = overview.total === 0;

    return `
      ${pageHead('نظرة عامة', dateLine, `<button class="icon-btn" data-action="add-task" title="إضافة مهمة" aria-label="إضافة مهمة">${Icons.svg('plus', 18)}</button>`, data.settings.tagline)}
      ${demoBanner(data, state)}
      <div class="stats-grid">
        ${statCard({
          icon: 'clock',
          color: statusColors.progress,
          label: 'مهام قيد العمل',
          value: Utils.formatNumber(overview.activeCount),
          note: `${Utils.formatNumber(overview.progress)} بدأت فعليًا · ${Utils.formatNumber(overview.fresh)} لم تبدأ`,
          trend: overview.overdue ? `${overview.overdue} متأخرة` : ''
        })}
        ${statCard({
          icon: 'check-circle',
          color: statusColors.done,
          label: 'مهام مكتملة',
          value: Utils.formatNumber(overview.done),
          note: `${overview.taskPct}% من إجمالي ${Utils.formatNumber(overview.total)} مهمة`
        })}
        ${statCard({
          icon: 'target',
          color: '#6c63ff',
          label: 'المراحل المنجزة',
          value: Utils.formatNumber(overview.stageDone),
          note: `${overview.stagePct}% من ${Utils.formatNumber(overview.stageTotal)} مرحلة`
        })}
        ${statCard({
          icon: 'alert',
          color: overview.overdue ? statusColors.danger : statusColors.done,
          label: 'مهام متأخرة',
          value: Utils.formatNumber(overview.overdue),
          note: overview.overdue ? 'تحتاج إلى متابعة عاجلة' : 'لا توجد مهام متأخرة'
        })}
      </div>
      ${shortcutsSection(data)}
      ${empty ? `
        <section class="card empty-dashboard">
          <span class="empty-dashboard-icon">${Icons.svg('sparkles', 28)}</span>
          <h2>ابدأ أول مهمة في المكتب الإعلامي</h2>
          <p>اختر مجموعة، وسيُطبّق قالبها تلقائيًا على المهمة. يمكنك بعد ذلك متابعة كل مرحلة وتوثيق من أنجزها.</p>
          <div class="empty-dashboard-actions">
            <button class="btn primary" data-action="add-task">${Icons.svg('plus', 16)} إنشاء مهمة</button>
            <a class="btn secondary" href="#/templates" data-nav="templates">${Icons.svg('template', 16)} مراجعة القوالب</a>
          </div>
        </section>` : `
        <div class="dash-grid">
          <section class="card chart-card dash-activity">
            <div class="card-head">
              <div>
                <h2>نشاط الإنجاز</h2>
                <p>المراحل المكتملة خلال آخر 14 يومًا</p>
              </div>
              <div class="chart-total"><strong>${Utils.formatNumber(activityTotal)}</strong><span>مرحلة</span></div>
            </div>
            ${Charts.line({ points: activity, ariaLabel: 'المراحل المكتملة خلال آخر 14 يومًا', color: '#0a84ff' })}
          </section>
          <section class="card chart-card">
            <div class="card-head">
              <div>
                <h2>حالة المهام</h2>
                <p>توزيع المهام حسب مرحلة التقدم</p>
              </div>
              <a class="icon-btn sm" href="#/tasks" data-nav="tasks" title="عرض المهام" aria-label="عرض المهام">${Icons.svg('arrow-left', 17)}</a>
            </div>
            <div class="donut-area">
              ${Charts.donut({
                segments,
                centerLabel: `${overview.taskPct}%`,
                centerSub: 'نسبة الإنجاز',
                ariaLabel: 'توزيع حالات المهام'
              })}
              <div class="legend">
                ${segments.map((segment) => `<div class="legend-row"><span><i style="background:${segment.color}"></i>${segment.label}</span><strong>${Utils.formatNumber(segment.value)}</strong></div>`).join('')}
              </div>
            </div>
          </section>
        </div>
        <div class="dash-grid two">
          <section class="card">
            <div class="card-head">
              <div><h2>تقدم المجموعات</h2><p>نسبة اكتمال المهام في كل مجموعة</p></div>
              <a class="text-link" href="#/groups" data-nav="groups">إدارة ${Icons.svg('chevron-left', 13)}</a>
            </div>
            <div class="group-progress-list">
              ${groups.length ? groups.map((item) => `
                <button class="group-progress-row" data-action="view-group-tasks" data-group-id="${item.group.id}">
                  <span class="group-dot" style="background:${item.group.color}"></span>
                  <span class="group-progress-name">${Utils.esc(item.group.name)}<small>${item.done} من ${item.total} مهمة</small></span>
                  <span class="group-progress-bar">${progressBar(item.pct, item.group.color, 'sm')}</span>
                  <strong>${item.pct}%</strong>
                </button>`).join('') : emptyState({ icon: 'layers', title: 'لا توجد مجموعات', text: 'أنشئ مجموعة لتبدأ تنظيم المهام.', compact: true })}
            </div>
          </section>
          <section class="card">
            <div class="card-head">
              <div><h2>الأعضاء الأكثر إنجازًا</h2><p>المراحل المنجزة خلال آخر 30 يومًا</p></div>
              <a class="text-link" href="#/team" data-nav="team">الفريق ${Icons.svg('chevron-left', 13)}</a>
            </div>
            <div class="member-list">
              ${userSummaries.length ? userSummaries.map((item) => `
                <div class="member-row">
                  ${avatar(item.user, 'sm')}
                  <span class="member-name">${Utils.esc(item.user.name)}<small>${item.stages30} مرحلة هذا الشهر</small></span>
                  <span class="member-bar">${progressBar(Utils.percent(item.stages30 || item.stages, maxUserStages), item.user.color, 'sm')}</span>
                  <strong>${Utils.formatNumber(item.stages30 || item.stages)}</strong>
                </div>`).join('') : emptyState({ icon: 'users', title: 'لا يوجد أعضاء', text: 'أضف أسماء الفريق لتوثيق الإنجاز.', compact: true })}
            </div>
          </section>
        </div>
        ${waitingTasks.length ? `
          <section class="card waiting-tasks-card">
            <div class="card-head">
              <div>
                <h2>${Icons.svg('user-check', 16)} مهام تنتظرك${activeUser ? ` يا ${Utils.esc(activeUser.name)}` : ''}</h2>
                <p>المرحلة التالية في هذه المهام مسندة إليك من إعدادات المجموعات.</p>
              </div>
              <span class="waiting-count">${Utils.formatNumber(waitingTasks.length)}</span>
            </div>
            <div class="task-list">
              ${waitingTasks.slice(0, 6).map(taskRow).join('')}
            </div>
          </section>` : ''}
        <div class="dash-grid two dash-automation-grid">
          <section class="card active-tasks-card dash-tasks-card">
            <div class="card-head">
              <div><h2>مهام قيد المتابعة</h2><p>أقرب المهام موعدًا، مع المرحلة الحالية لكل مهمة</p></div>
              <a class="text-link" href="#/tasks" data-nav="tasks">كل المهام ${Icons.svg('chevron-left', 13)}</a>
            </div>
            <div class="task-list dash-tasks-list">
              ${activeTasks.length ? activeTasks.map(taskRow).join('') : emptyState({ icon: 'check-circle', title: 'لا توجد مهام جارية', text: 'كل المهام مكتملة حاليًا.', compact: true })}
            </div>
          </section>
          ${dashboardAutomationCard()}
        </div>`}
    `;
  }

  function tasks(data, state) {
    const filters = state.tasks;
    const baseFilters = { ...filters, status: 'all' };
    const base = Data.filterTasks(baseFilters);
    const counts = {
      all: base.length,
      new: base.filter((task) => Data.taskStatus(task) === 'new').length,
      progress: base.filter((task) => Data.taskStatus(task) === 'progress').length,
      done: base.filter((task) => Data.taskStatus(task) === 'done').length,
      overdue: base.filter((task) => Data.isOverdue(task)).length
    };
    const list = Data.filterTasks(filters);
    const filtersActive = filters.status !== 'all' || filters.groupId !== 'all' || filters.userId !== 'all' || Boolean(filters.search);
    const tabs = [
      { key: 'all', label: 'الكل', count: counts.all },
      { key: 'new', label: 'لم تبدأ', count: counts.new },
      { key: 'progress', label: 'قيد العمل', count: counts.progress },
      { key: 'done', label: 'مكتملة', count: counts.done },
      { key: 'overdue', label: 'متأخرة', count: counts.overdue }
    ];
    const view = filters.view === 'table' ? 'table' : 'cards';
    const groupItems = [
      { value: 'all', label: 'كل المجموعات', icon: 'layers' },
      ...data.groups.map((group) => ({ value: group.id, label: group.name, dot: group.color }))
    ];
    const userItems = [
      { value: 'all', label: 'كل الأعضاء', icon: 'users' },
      ...data.users.map((user) => ({ value: user.id, label: user.name, dot: user.color, initials: Utils.initials(user.name) }))
    ];
    const sortItems = [
      { value: 'updated', label: 'الأحدث تحديثًا', icon: 'clock' },
      { value: 'due', label: 'تاريخ الاستحقاق', icon: 'calendar' },
      { value: 'priority', label: 'الأولوية', icon: 'flag' },
      { value: 'oldest', label: 'الأقدم', icon: 'history' }
    ];
    return `
      ${pageHead('المهام', `${Utils.formatNumber(data.tasks.length)} مهمة إجمالًا · ${Utils.formatNumber(counts.progress)} قيد العمل`, `<button class="btn primary" data-action="add-task">${Icons.svg('plus', 17)} مهمة جديدة</button>`)}
      <div class="tasks-toolbar card">
        <label class="search-box">
          ${Icons.svg('search', 18)}
          <input id="task-search" type="search" placeholder="ابحث في المهام والمراحل..." value="${Utils.esc(filters.search)}" autocomplete="off">
        </label>
        <div class="toolbar-fields">
          ${filterMenu({ icon: 'layers', label: 'تصفية حسب المجموعة', items: groupItems, value: filters.groupId, filterKey: 'groupId' })}
          ${filterMenu({ icon: 'users', label: 'تصفية حسب العضو', items: userItems, value: filters.userId, filterKey: 'userId' })}
          ${filterMenu({ icon: 'sort', label: 'ترتيب المهام', items: sortItems, value: filters.sort, filterKey: 'sort' })}
          ${filtersActive ? `<button class="icon-btn sm" data-action="clear-task-filters" title="مسح الفلاتر" aria-label="مسح الفلاتر">${Icons.svg('close', 16)}</button>` : ''}
        </div>
        ${window.MMO?.isDesktop ? `<button class="icon-btn sm toolbar-repo-btn" data-action="sync-repo-folders" title="مزامنة مجلدات المهام" aria-label="مزامنة مجلدات المهام">${Icons.svg('refresh', 16)}</button>` : ''}
        <div class="view-switch" role="group" aria-label="طريقة عرض المهام">
          <button class="${view === 'cards' ? 'active' : ''}" data-action="set-task-view" data-view="cards" title="عرض البطاقات" aria-label="عرض البطاقات">${Icons.svg('grid', 16)}</button>
          <button class="${view === 'table' ? 'active' : ''}" data-action="set-task-view" data-view="table" title="عرض الجدول" aria-label="عرض الجدول">${Icons.svg('table', 16)}</button>
        </div>
      </div>
      <div class="filter-tabs" role="tablist" aria-label="تصفية حسب الحالة">
        ${tabs.map((tab) => `<button class="filter-tab ${filters.status === tab.key ? 'active' : ''}" data-action="filter-status" data-status="${tab.key}" role="tab" aria-selected="${filters.status === tab.key}">${tab.label}<span>${Utils.formatNumber(tab.count)}</span></button>`).join('')}
      </div>
      <div class="results-meta results-meta-row">
        <span>${filtersActive ? `النتائج: ${Utils.formatNumber(list.length)} مهمة` : `${Utils.formatNumber(list.length)} مهمة`}</span>
        <span class="view-hint">${view === 'table' ? 'جدول المراحل — انقر على الخلية للتعديل' : 'بطاقات مجمّعة حسب الحالة'}</span>
      </div>
      ${list.length
        ? (view === 'table'
          ? taskTable(list, filters)
          : (filters.status === 'all'
            ? taskStatusSections(list)
            : `<div class="tasks-grid">${list.map(taskCard).join('')}</div>`))
        : emptyState({
          icon: filtersActive ? 'search' : 'tasks',
          title: filtersActive ? 'لا توجد نتائج مطابقة' : 'لا توجد مهام بعد',
          text: filtersActive ? 'جرّب تغيير الفلاتر أو مسحها لعرض المهام.' : 'أنشئ أول مهمة واختر مجموعتها ليُطبق قالب المراحل تلقائيًا.',
          action: filtersActive
            ? `<button class="btn secondary" data-action="clear-task-filters">مسح الفلاتر</button>`
            : `<button class="btn primary" data-action="add-task">${Icons.svg('plus', 16)} إنشاء مهمة</button>`
        })}
    `;
  }

  function groups(data) {
    const summaries = Data.allGroupSummaries();
    return `
      ${pageHead('المجموعات', `${Utils.formatNumber(data.groups.length)} مجموعات مرتبطة بقوالب موحدة`, `<button class="btn primary" data-action="add-group">${Icons.svg('plus', 17)} مجموعة جديدة</button>`)}
      <div class="groups-grid">
        ${summaries.map((item) => {
          const template = Data.findTemplate(item.group.templateId);
          const assigneeIds = [...new Set(Object.values(item.group.stageAssignees || {}))];
          const assignedStages = Object.keys(item.group.stageAssignees || {}).length;
          return `
            <article class="group-card card" style="--group-color:${item.group.color}">
              <div class="group-card-head">
                <span class="group-icon">${Icons.svg('layers', 21)}</span>
                <div class="group-card-tools">
                  ${item.group.folder || window.MMO?.repo
                    ? folderButton({ groupId: item.group.id, name: 'فتح مجلد المجموعة', folder: item.group.folder || '', size: 'sm', iconSize: 16 })
                    : ''}
                  <div class="menu-wrap">
                    <button class="icon-btn sm" data-action="toggle-menu" title="خيارات المجموعة" aria-label="خيارات المجموعة">${Icons.svg('more', 17)}</button>
                    <div class="menu-pop card">
                      <button data-action="edit-group" data-group-id="${item.group.id}">${Icons.svg('edit', 16)} تعديل</button>
                      <button class="danger" data-action="delete-group" data-group-id="${item.group.id}">${Icons.svg('trash', 16)} حذف</button>
                    </div>
                  </div>
                </div>
              </div>
              <h3>${Utils.esc(item.group.name)}</h3>
              ${item.group.folder ? `<span class="group-folder-path" title="${Utils.esc(item.group.folder)}">${Icons.svg('folder', 12)} ${Utils.esc(item.group.folder)}</span>` : ''}
              <p class="group-template">${Icons.svg('template', 14)} ${Utils.esc(template?.name || 'بدون قالب')}</p>
              ${item.group.description ? `<p class="group-desc">${Utils.esc(item.group.description)}</p>` : '<p class="group-desc muted">لا يوجد وصف للمجموعة.</p>'}
              ${assignedStages ? `
                <div class="group-assignees">
                  <span class="group-assignee-avatars">${assigneeIds.slice(0, 4).map((userId) => avatar(Data.findUser(userId), 'xs')).join('')}</span>
                  <span>${Utils.formatNumber(assignedStages)} من ${Utils.formatNumber(template?.stages.length || 0)} مرحلة مسندة</span>
                </div>` : '<div class="group-assignees muted">كل المراحل عامة</div>'}
              <div class="group-progress-head">
                <span>${item.done} من ${item.total} مهمة مكتملة</span>
                <strong>${item.pct}%</strong>
              </div>
              ${progressBar(item.pct, item.group.color)}
              <div class="group-stats">
                <span><strong>${Utils.formatNumber(item.total)}</strong><small>مهام</small></span>
                <span><strong>${Utils.formatNumber(item.progress + item.fresh)}</strong><small>مفتوحة</small></span>
                <span class="${item.overdue ? 'danger-text' : ''}"><strong>${Utils.formatNumber(item.overdue)}</strong><small>متأخرة</small></span>
              </div>
              <div class="group-card-actions icon-actions">
                <button class="icon-btn sm" data-action="view-group-tasks" data-group-id="${item.group.id}" title="فتح مهام المجموعة" aria-label="فتح مهام المجموعة">${Icons.svg('tasks', 16)}</button>
                <button class="icon-btn sm" data-action="add-task" data-group-id="${item.group.id}" title="إضافة مهمة إلى المجموعة" aria-label="إضافة مهمة إلى المجموعة">${Icons.svg('plus', 16)}</button>
              </div>
            </article>`;
        }).join('')}
        <button class="group-card add-card" data-action="add-group">
          <span class="add-card-icon">${Icons.svg('plus', 22)}</span>
          <strong>إضافة مجموعة</strong>
          <span>اربطها بقالب لتحديد مراحل العمل.</span>
        </button>
      </div>
    `;
  }

  function templates(data) {
    return `
      ${pageHead('القوالب', 'عدّل المراحل مرة واحدة وطبّقها على أي عدد من المجموعات', `<button class="btn primary" data-action="add-template">${Icons.svg('plus', 17)} قالب جديد</button>`)}
      <div class="info-banner">
        <span>${Icons.svg('info', 18)}</span>
        <p>تعديل القالب يؤثر على المهام الجديدة فقط. المهام الحالية تحتفظ بمراحلها الأصلية للحفاظ على سجل الإنجاز.</p>
      </div>
      <div class="templates-grid">
        ${data.templates.map((template) => {
          const used = data.groups.filter((group) => group.templateId === template.id);
          return `
            <article class="template-card card">
              <div class="template-head">
                <span class="template-icon">${Icons.svg('template', 19)}</span>
                <div class="menu-wrap">
                  <button class="icon-btn sm" data-action="toggle-menu" title="خيارات القالب" aria-label="خيارات القالب">${Icons.svg('more', 17)}</button>
                  <div class="menu-pop card">
                    <button data-action="edit-template" data-template-id="${template.id}">${Icons.svg('edit', 16)} تعديل</button>
                    <button class="danger" data-action="delete-template" data-template-id="${template.id}">${Icons.svg('trash', 16)} حذف</button>
                  </div>
                </div>
              </div>
              <h3>${Utils.esc(template.name)}</h3>
              <p class="template-desc">${Utils.esc(template.description || 'لا يوجد وصف للقالب.')}</p>
              <div class="template-meta">
                <span>${Utils.formatNumber(template.stages.length)} مراحل</span>
                <span>${used.length ? `مستخدمة في ${Utils.formatNumber(used.length)} مجموعات` : 'غير مستخدمة'}</span>
              </div>
              <div class="stage-list">
                ${template.stages.map((stage, index) => `
                  <div class="stage-list-item">
                    <span class="stage-num">${index + 1}</span>
                    <span>${Utils.esc(stage.name)}</span>
                  </div>`).join('')}
              </div>
              <div class="template-actions">
                ${used.slice(0, 2).map((group) => `<span class="chip group-chip" style="--chip-color:${group.color}"><i></i>${Utils.esc(group.name)}</span>`).join('')}
                ${used.length > 2 ? `<span class="chip muted">+${used.length - 2}</span>` : ''}
                <button class="icon-btn sm" data-action="edit-template" data-template-id="${template.id}" title="تعديل القالب" aria-label="تعديل القالب">${Icons.svg('edit', 16)}</button>
              </div>
            </article>`;
        }).join('')}
        <button class="template-card add-card" data-action="add-template">
          <span class="add-card-icon">${Icons.svg('plus', 22)}</span>
          <strong>إضافة قالب</strong>
          <span>صمّم تسلسل مراحل يناسب نوعًا جديدًا من المهام.</span>
        </button>
      </div>
    `;
  }

  function team(data) {
    const summaries = Data.allUserSummaries();
    return `
      ${pageHead('فريق المكتب', `${Utils.formatNumber(data.users.length)} أعضاء · ملفات وشارات وإحصاءات`, `<button class="btn primary" data-action="add-user">${Icons.svg('user-plus', 17)} إضافة عضو</button>`)}
      <div class="info-banner">
        <span>${Icons.svg('user-check', 18)}</span>
        <p>افتح ملف أي عضو لعرض مراحله المنجزة بالترتيب وإحصاءات كل نوع. يمكن إضافة شارات مثل مونتاج وتصوير ونشر، وتعديلها يحتاج فتح قفل الإعدادات.</p>
      </div>
      <div class="team-grid">
        ${summaries.map((item) => `
          <article class="member-card card clickable" data-action="open-member" data-user-id="${item.user.id}" tabindex="0" role="button" aria-label="فتح ملف ${Utils.esc(item.user.name)}">
            <div class="member-card-top">
              ${avatar(item.user, 'lg')}
              <div class="member-card-info">
                <h3>${Utils.esc(item.user.name)}</h3>
                <span class="member-since">عضو منذ ${Utils.fmtDate(item.user.createdAt, { year: true })}</span>
                ${badgeList(item.user.badges, 3)}
                ${item.user.id === data.activeUserId ? `<span class="active-pill">${Icons.svg('check', 12)} العضو النشط</span>` : ''}
              </div>
              <div class="menu-wrap">
                <button class="icon-btn sm" data-action="toggle-menu" title="خيارات العضو" aria-label="خيارات العضو">${Icons.svg('more', 17)}</button>
                <div class="menu-pop card">
                  ${item.user.id !== data.activeUserId ? `<button data-action="select-user" data-user-id="${item.user.id}">${Icons.svg('user-check', 16)} تعيين كنشط</button>` : ''}
                  <button data-action="edit-user" data-user-id="${item.user.id}">${Icons.svg('edit', 16)} تعديل</button>
                  <button class="danger" data-action="delete-user" data-user-id="${item.user.id}">${Icons.svg('trash', 16)} حذف</button>
                </div>
              </div>
            </div>
            <div class="member-stats">
              <span><strong>${Utils.formatNumber(item.stages)}</strong><small>مرحلة منجزة</small></span>
              <span><strong>${Utils.formatNumber(item.completedTasks)}</strong><small>مهمة مكتملة</small></span>
              <span><strong>${Utils.formatNumber(item.assignedOpen)}</strong><small>مهمة مفتوحة</small></span>
            </div>
            <div class="member-card-foot">
              <span>${Icons.svg('clock', 13)} ${item.lastActivity ? `آخر نشاط ${Utils.relativeTime(item.lastActivity)}` : 'لا يوجد نشاط بعد'}</span>
              <span class="member-foot-actions">
                <button class="icon-btn xs" data-action="open-member" data-user-id="${item.user.id}" title="ملف العضو" aria-label="ملف العضو">${Icons.svg('user', 15)}</button>
                ${item.user.id !== data.activeUserId ? `<button class="icon-btn xs" data-action="select-user" data-user-id="${item.user.id}" title="تعيين كنشط" aria-label="تعيين كنشط">${Icons.svg('user-check', 15)}</button>` : ''}
              </span>
            </div>
          </article>`).join('')}
        <button class="member-card add-card" data-action="add-user">
          <span class="add-card-icon">${Icons.svg('user-plus', 22)}</span>
          <strong>إضافة عضو</strong>
          <span>أضف اسمًا جديدًا للفريق دون كلمة مرور.</span>
        </button>
      </div>
    `;
  }

  function reportBars(rows, colorKey = 'group') {
    const max = Math.max(1, ...rows.map((row) => row.stages || row.completed || 0));
    return rows.map((row) => {
      const value = row.stages ?? row.completed ?? 0;
      const name = row.group?.name ?? row.name ?? row.user?.name ?? '';
      const color = row.group?.color || row.user?.color || 'var(--accent)';
      return `
        <div class="bar-row">
          <span class="bar-label">${Utils.esc(name)}</span>
          <span class="bar-track">${progressBar(Utils.percent(value, max), color, 'sm')}</span>
          <strong>${Utils.formatNumber(value)}</strong>
        </div>`;
    }).join('');
  }

  function automationReportSection(report) {
    const from = report.range?.fromISO ? `${report.range.fromISO}T00:00:00` : null;
    const to = report.range?.toISO ? `${report.range.toISO}T23:59:59` : null;
    const stats = Data.automationStats({ days: 30, from, to });
    const rangeLabel = from || to ? Utils.fmtRange(report.range.fromISO, report.range.toISO) : 'آخر 30 يومًا';
    const series = Data.automationDailySeries(30, 'cost').map((point) => ({
      label: Utils.fmtDayMonth(`${point.label}T12:00:00`),
      value: point.value
    }));
    const modelRows = stats.byModel.slice(0, 10);
    const groupRows = stats.byGroup.slice(0, 10);
    const recent = stats.recent;
    return `
      <section class="rep-auto-section" id="report-automation">
        <div class="report-block-head rep-auto-head">
          <div>
            <h3>${Icons.svg('robot', 16)} إحصائيات الأتمتة</h3>
            <span>تشغيلات الذكاء الاصطناعي وتكلفتها · ${Utils.esc(rangeLabel)}</span>
          </div>
          <span class="rep-auto-pill">${Utils.formatNumber(stats.running)} جارٍ الآن</span>
        </div>
        <div class="report-summary rep-auto-summary">
          <div class="report-stat"><span>تشغيلات</span><strong>${Utils.formatNumber(stats.total)}</strong><small>${Utils.formatNumber(stats.finished)} منتهية</small></div>
          <div class="report-stat"><span>نجاح</span><strong>${stats.successPct}%</strong><small>${Utils.formatNumber(stats.done)} ناجحة</small></div>
          <div class="report-stat ${stats.failed ? 'danger' : ''}"><span>فشل</span><strong>${Utils.formatNumber(stats.failed)}</strong><small>${Utils.formatNumber(stats.cancelled)} ملغاة</small></div>
          <div class="report-stat"><span>تكلفة USD</span><strong>${formatCost(stats.costUSD)}</strong><small>متوسط ${formatCost(stats.avgCostUSD)} للتشغيل</small></div>
          <div class="report-stat"><span>متوسط مدة</span><strong>${formatDuration(stats.avgDurationSec)}</strong><small>للتشغيلات المنتهية</small></div>
          <div class="report-stat"><span>توكنات</span><strong>${Utils.formatNumber(stats.tokens.input)} / ${Utils.formatNumber(stats.tokens.output)}</strong><small>إدخال / إخراج</small></div>
        </div>
        <div class="report-chart-grid rep-auto-chart">
          <section class="report-block">
            <div class="report-block-head"><h3>تكلفة الأتمتة اليومية</h3><span>آخر 30 يومًا · دولار</span></div>
            ${Charts.line({
              points: stats.costUSD > 0 ? series : [],
              height: 190,
              color: '#6c63ff',
              ariaLabel: 'تكلفة الأتمتة اليومية خلال آخر 30 يومًا',
              emptyText: 'لا توجد تكلفة مسجلة في هذه الفترة',
              valueFormat: (value) => costAxis(value),
              minStep: 0.0001
            })}
          </section>
        </div>
        <div class="report-tables-grid">
          <section class="report-block">
            <div class="report-block-head"><h3>التكلفة حسب الموديل</h3><span>${Utils.formatNumber(modelRows.length)} موديل</span></div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>الموديل</th><th>تشغيلات</th><th>نجاح</th><th>التكلفة</th><th>توكنات</th></tr></thead>
                <tbody>
                  ${modelRows.map((row) => `
                    <tr>
                      <td class="rep-auto-model" dir="ltr">${Utils.esc(row.key || 'غير محدد')}</td>
                      <td>${Utils.formatNumber(row.runs)}</td>
                      <td>${row.runs ? Math.round((row.done / row.runs) * 100) : 0}%</td>
                      <td>${formatCost(row.costUSD)}</td>
                      <td>${Utils.formatNumber(row.tokens)}</td>
                    </tr>`).join('') || '<tr><td colspan="5" class="table-empty">لا توجد تشغيلات في هذه الفترة</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>
          <section class="report-block">
            <div class="report-block-head"><h3>التكلفة حسب المجموعة</h3><span>${Utils.formatNumber(groupRows.length)} مجموعة</span></div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>المجموعة</th><th>تشغيلات</th><th>التكلفة</th></tr></thead>
                <tbody>
                  ${groupRows.map((row) => `
                    <tr>
                      <td>${Utils.esc(row.key || 'غير محدد')}</td>
                      <td>${Utils.formatNumber(row.runs)}</td>
                      <td>${formatCost(row.costUSD)}</td>
                    </tr>`).join('') || '<tr><td colspan="3" class="table-empty">لا توجد تشغيلات في هذه الفترة</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <div class="report-tables-grid single">
          <section class="report-block">
            <div class="report-block-head"><h3>أحدث التشغيلات</h3><span>آخر ${Utils.formatNumber(recent.length)} تشغيل</span></div>
            <div class="table-wrap">
              <table class="data-table rep-auto-recent">
                <thead><tr><th>المهمة</th><th>الحالة</th><th>الموديل</th><th>التكلفة</th><th>الوقت</th></tr></thead>
                <tbody>
                  ${recent.map((job) => `
                    <tr>
                      <td class="rep-auto-task">${Utils.esc(job.taskTitle || 'مهمة محذوفة')}</td>
                      <td>${automationStatusChip(job.status)}</td>
                      <td class="rep-auto-model" dir="ltr">${Utils.esc(job.model || '—')}</td>
                      <td>${formatCost(job.usage?.costUSD)}</td>
                      <td class="muted-cell">${Utils.relativeTime(job.startedAt)}</td>
                    </tr>`).join('') || '<tr><td colspan="5" class="table-empty">لا توجد تشغيلات مسجلة</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>`;
  }

  function reports(data, state) {
    const report = Data.report(state.report);
    const periods = [
      { key: 'week', label: 'هذا الأسبوع' },
      { key: 'month', label: 'هذا الشهر' },
      { key: '30', label: 'آخر 30 يومًا' },
      { key: 'all', label: 'كل الفترة' },
      { key: 'custom', label: 'مخصص' }
    ];
    const groupOptions = data.groups.map((group) => `<option value="${group.id}" ${state.report.groupId === group.id ? 'selected' : ''}>${Utils.esc(group.name)}</option>`).join('');
    const userOptions = data.users.map((user) => `<option value="${user.id}" ${state.report.userId === user.id ? 'selected' : ''}>${Utils.esc(user.name)}</option>`).join('');
    const rangeText = report.range.from || report.range.to ? Utils.fmtRange(report.range.from, report.range.to) : 'كل الفترة';
    const groupName = report.group?.name || 'كل المجموعات';
    const userName = report.user?.name || 'كل الأعضاء';
    const maxStage = Math.max(1, ...report.stageRows.map((row) => row.completed));
    const topStages = report.stageRows.slice(0, 8);
    const emptyPeriod = report.totals.stages === 0 && report.totals.created === 0 && report.totals.completed === 0;
    const memberFilterNote = report.user ? `تصفية العضو مطبقة على سجل الإنجاز: ${Utils.esc(report.user.name)}.` : 'يشمل التقرير جميع الأعضاء الذين لديهم نشاط في الفترة.';

    return `
      ${pageHead('التقارير والإحصاءات', 'قِس الإنجاز حسب الفترة والمجموعة والعضو، وصدّر النتائج بسهولة', `
        <button class="icon-btn" data-action="print-report" title="طباعة التقرير أو حفظه PDF" aria-label="طباعة التقرير أو حفظه PDF">${Icons.svg('printer', 18)}</button>
        <button class="icon-btn" data-action="export-report-excel" title="تصدير التقرير إلى Excel" aria-label="تصدير التقرير إلى Excel">${Icons.svg('file-spreadsheet', 18)}</button>
      `)}
      <div class="report-filters card no-print">
        <div class="filter-block">
          <span class="filter-label">الفترة</span>
          <div class="segmented">
            ${periods.map((period) => `<button class="${state.report.period === period.key ? 'active' : ''}" data-action="set-report-period" data-period="${period.key}">${period.label}</button>`).join('')}
          </div>
          ${state.report.period === 'custom' ? `
            <div class="custom-dates">
              <label>من <input type="date" id="report-from" value="${Utils.esc(state.report.from)}"></label>
              <label>إلى <input type="date" id="report-to" value="${Utils.esc(state.report.to)}"></label>
            </div>` : ''}
        </div>
        <div class="filter-block compact">
          <span class="filter-label">التصفية</span>
          <div class="toolbar-fields">
            <select id="report-group" class="select" aria-label="تصفية حسب المجموعة">
              <option value="all">كل المجموعات</option>
              ${groupOptions}
            </select>
            <select id="report-user" class="select" aria-label="تصفية حسب العضو">
              <option value="all">كل الأعضاء</option>
              ${userOptions}
            </select>
          </div>
        </div>
      </div>
      <article class="report-sheet card" id="report-sheet">
        <header class="report-head">
          <div class="report-brand">
            ${logo(data)}
            <div>
              <strong>${Utils.esc(data.settings.mosqueName)}</strong>
              <span>${Utils.esc(data.settings.tagline || 'المكتب الإعلامي')}</span>
            </div>
          </div>
          <div class="report-head-meta">
            <span class="report-kicker">تقرير الإنجاز</span>
            <h2>ملخص أداء المكتب الإعلامي</h2>
            <div class="report-meta-row">
              <span>${Icons.svg('calendar', 14)} ${Utils.esc(rangeText)}</span>
              <span>${Icons.svg('layers', 14)} ${Utils.esc(groupName)}</span>
              <span>${Icons.svg('user', 14)} ${Utils.esc(userName)}</span>
            </div>
          </div>
          <div class="report-generated">
            <span>${report.rangeLabel}</span>
            <small>${Utils.fmtDateTime(report.generatedAt)}</small>
          </div>
        </header>
        ${emptyPeriod ? `<div class="report-empty">${Icons.svg('info', 18)} لا يوجد نشاط مسجّل في هذه الفترة ضمن التصفية الحالية.</div>` : ''}
        <div class="report-summary">
          <div class="report-stat"><span>المهام المنشأة</span><strong>${Utils.formatNumber(report.totals.created)}</strong><small>خلال الفترة</small></div>
          <div class="report-stat"><span>المهام المكتملة</span><strong>${Utils.formatNumber(report.totals.completed)}</strong><small>خلال الفترة</small></div>
          <div class="report-stat"><span>المراحل المنجزة</span><strong>${Utils.formatNumber(report.totals.stages)}</strong><small>خلال الفترة</small></div>
          <div class="report-stat ${report.totals.overdue ? 'danger' : ''}"><span>المهام المتأخرة</span><strong>${Utils.formatNumber(report.totals.overdue)}</strong><small>حاليًا</small></div>
        </div>
        <div class="report-chart-grid">
          <section class="report-block">
            <div class="report-block-head"><h3>منحنى النشاط</h3><span>مراحل منجزة</span></div>
            ${Charts.line({ points: report.series, ariaLabel: 'منحنى إنجاز المراحل', emptyText: 'لا توجد مراحل منجزة في هذه الفترة' })}
          </section>
          <section class="report-block">
            <div class="report-block-head"><h3>توزيع المراحل</h3><span>أعلى المراحل إنجازًا</span></div>
            <div class="bar-list">
              ${topStages.length ? topStages.map((row) => `
                <div class="bar-row">
                  <span class="bar-label">${Utils.esc(row.name)}</span>
                  <span class="bar-track">${progressBar(Utils.percent(row.completed, maxStage), 'var(--accent)', 'sm')}</span>
                  <strong>${Utils.formatNumber(row.completed)}</strong>
                </div>`).join('') : emptyState({ icon: 'chart', title: 'لا توجد بيانات', text: 'ستظهر المراحل بعد إنجازها.', compact: true })}
            </div>
          </section>
        </div>
        <div class="report-tables-grid">
          <section class="report-block">
            <div class="report-block-head"><h3>حسب المجموعة</h3><span>${Utils.formatNumber(report.groupRows.length)} مجموعات</span></div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>المجموعة</th><th>منشأة</th><th>مكتملة</th><th>مراحل</th><th>مفتوحة</th><th>متأخرة</th></tr></thead>
                <tbody>
                  ${report.groupRows.map((row) => `
                    <tr>
                      <td><span class="table-group"><i style="background:${row.group.color}"></i>${Utils.esc(row.group.name)}</span></td>
                      <td>${Utils.formatNumber(row.created)}</td>
                      <td>${Utils.formatNumber(row.completed)}</td>
                      <td>${Utils.formatNumber(row.stages)}</td>
                      <td>${Utils.formatNumber(row.active)}</td>
                      <td class="${row.overdue ? 'danger-text' : ''}">${Utils.formatNumber(row.overdue)}</td>
                    </tr>`).join('') || '<tr><td colspan="6" class="table-empty">لا توجد مجموعات</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>
          <section class="report-block">
            <div class="report-block-head"><h3>حسب العضو</h3><span>${Utils.esc(memberFilterNote)}</span></div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>العضو</th><th>مراحل</th><th>مهام مكتملة</th><th>آخر نشاط</th></tr></thead>
                <tbody>
                  ${report.memberRows.map((row) => `
                    <tr>
                      <td><span class="table-member">${avatar(row.user, 'xs')} ${Utils.esc(row.user.name)}</span></td>
                      <td>${Utils.formatNumber(row.stages)}</td>
                      <td>${Utils.formatNumber(row.completedTasks)}</td>
                      <td class="muted-cell">${row.lastActivity ? Utils.relativeTime(row.lastActivity) : '—'}</td>
                    </tr>`).join('') || '<tr><td colspan="4" class="table-empty">لا يوجد أعضاء</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <div class="report-tables-grid single">
          <section class="report-block">
            <div class="report-block-head"><h3>تفصيل المراحل</h3><span>المنجز خلال الفترة والمتبقي الآن</span></div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>المرحلة</th><th>منجزة خلال الفترة</th><th>متبقية الآن</th></tr></thead>
                <tbody>
                  ${report.stageRows.slice(0, 14).map((row) => `
                    <tr><td>${Utils.esc(row.name)}</td><td>${Utils.formatNumber(row.completed)}</td><td>${Utils.formatNumber(row.pending)}</td></tr>
                  `).join('') || '<tr><td colspan="3" class="table-empty">لا توجد مراحل</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        ${automationReportSection(report)}
        <footer class="report-foot">
          <span>${Utils.esc(data.settings.mosqueName)} · ${Utils.esc(data.settings.tagline || 'المكتب الإعلامي')}</span>
          <span>أُنشئ التقرير في ${Utils.fmtDateTime(report.generatedAt)}</span>
        </footer>
      </article>
    `;
  }

  function settings(data) {
    const links = data.settings.links || [];
    const demoCount = data.tasks.filter((task) => task.isDemo).length;
    const theme = data.settings.theme || 'auto';
    const storage = Utils.humanSize(Data.storageBytes());
    const security = data.settings.security;
    const locked = Boolean(security && !Data.isUnlocked());
    const fingerprint = Data.securityFingerprint();
    const lastBackup = data.settings.lastBackupAt
      ? `${Utils.fmtDateTime(data.settings.lastBackupAt)}`
      : 'لم تُنشأ بعد';
    return `
      ${pageHead('الإعدادات', 'هوية المسجد، الشعار، القفل، المستودع، الأتمتة، الاختصارات، المظهر، والنسخ الاحتياطي', '', 'النظام')}
      <div class="settings-grid">
        <section class="settings-card card">
          <div class="card-head">
            <div><h2>هوية المسجد</h2><p>يظهر الاسم في الواجهة والتقارير.</p></div>
            ${locked ? `<span class="settings-lock-pill">${Icons.svg('lock', 13)} مقفل</span>` : `<span class="settings-icon">${Icons.svg('book', 19)}</span>`}
          </div>
          <div class="settings-form">
            <label class="field">
              <span>اسم المسجد</span>
              <input type="text" id="settings-mosque-name" value="${Utils.esc(data.settings.mosqueName)}" placeholder="مثال: مسجد الحي" autocomplete="off" ${locked ? 'readonly' : ''}>
            </label>
            <label class="field">
              <span>اسم المكتب</span>
              <input type="text" id="settings-tagline" value="${Utils.esc(data.settings.tagline || 'المكتب الإعلامي')}" placeholder="المكتب الإعلامي" autocomplete="off" ${locked ? 'readonly' : ''}>
            </label>
            ${locked
              ? `<button class="icon-btn sm is-active" data-action="unlock-settings" title="فتح القفل للتعديل" aria-label="فتح القفل للتعديل">${Icons.svg('lock-open', 16)}</button>`
              : `<p class="field-hint">${Icons.svg('check', 13)} يُحفظ تلقائيًا</p>`}
          </div>
        </section>
        <section class="settings-card card">
          <div class="card-head">
            <div><h2>المظهر</h2><p>اختر مظهر الواجهة المريح لعينيك.</p></div>
            <span class="settings-icon">${Icons.svg(theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor', 19)}</span>
          </div>
          <div class="theme-options">
            <button class="theme-option ${theme === 'auto' ? 'active' : ''}" data-action="set-theme" data-theme-value="auto">
              ${Icons.svg('monitor', 20)}<span>تلقائي</span>
            </button>
            <button class="theme-option ${theme === 'light' ? 'active' : ''}" data-action="set-theme" data-theme-value="light">
              ${Icons.svg('sun', 20)}<span>فاتح</span>
            </button>
            <button class="theme-option ${theme === 'dark' ? 'active' : ''}" data-action="set-theme" data-theme-value="dark">
              ${Icons.svg('moon', 20)}<span>داكن</span>
            </button>
          </div>
          <div class="storage-summary">
            <span>${Icons.svg('database', 15)} حجم البيانات المحلية: <strong>${storage}</strong></span>
            <span class="muted">آخر نسخة احتياطية: ${Utils.esc(lastBackup)}</span>
          </div>
        </section>
        <section class="settings-card card security-card">
          <div class="card-head">
            <div><h2>قفل الإعدادات العامة</h2><p>حماية تغيير الأعضاء وهوية المسجد والحذف والاستيراد بكلمة مرور.</p></div>
            <span class="settings-icon">${Icons.svg(security ? 'shield' : 'lock', 19)}</span>
          </div>
          ${security ? `
            <div class="security-status">
              <span class="security-status-icon ${locked ? 'locked' : 'open'}">${Icons.svg(locked ? 'lock' : 'lock-open', 21)}</span>
              <div class="security-status-text">
                <strong>${locked ? 'الإعدادات مقفلة' : 'الإعدادات مفتوحة مؤقتًا'}</strong>
                <p>${locked ? 'تعديل الأعضاء وهوية المسجد والحذف والاستيراد يتطلب كلمة المرور.' : 'يمكنك الآن تعديل الإعدادات الحساسة. سيُعاد القفل تلقائيًا عند إعادة تحميل الصفحة.'}</p>
                <span class="security-fingerprint">${Icons.svg('key', 12)} بصمة كلمة المرور <code dir="ltr">${Utils.esc(fingerprint)}</code></span>
              </div>
            </div>
            <div class="security-actions">
              ${locked
                ? `<button class="icon-btn sm is-active" data-action="unlock-settings" title="فتح القفل" aria-label="فتح القفل">${Icons.svg('lock-open', 16)}</button>`
                : `<button class="icon-btn sm" data-action="lock-settings" title="قفل الآن" aria-label="قفل الآن">${Icons.svg('lock', 16)}</button>`}
              <button class="icon-btn sm" data-action="set-password" title="تغيير كلمة المرور" aria-label="تغيير كلمة المرور">${Icons.svg('key', 16)}</button>
              <button class="icon-btn sm danger-text" data-action="remove-password" title="إزالة كلمة المرور" aria-label="إزالة كلمة المرور">${Icons.svg('trash', 16)}</button>
            </div>
            <p class="field-hint">${Icons.svg('info', 13)} لا تُحفظ كلمة المرور نصًا، بل تُحفظ بصمة مشفّرة فقط. عند تصدير البيانات تظهر البصمة بدلًا من الكلمة.</p>
          ` : `
            <div class="security-status">
              <span class="security-status-icon open">${Icons.svg('lock-open', 21)}</span>
              <div class="security-status-text">
                <strong>لم تُعيَّن كلمة مرور بعد</strong>
                <p>عيّن كلمة مرور لقفل تغيير الأعضاء وهوية المسجد والحذف والاستيراد. يمكنك تغييرها أو إزالتها لاحقًا.</p>
              </div>
            </div>
            <div class="security-actions">
              <button class="icon-btn sm is-active" data-action="set-password" title="تعيين كلمة مرور" aria-label="تعيين كلمة مرور">${Icons.svg('key', 16)}</button>
            </div>
            <p class="field-hint">${Icons.svg('info', 13)} تُحفظ بصمة مشفّرة فقط، ولا تظهر كلمة المرور عند تصدير التخزين.</p>
          `}
        </section>
        ${window.SettingsSections?.repoMarkup ? window.SettingsSections.repoMarkup(data) : ''}
        ${window.SettingsSections?.aiMarkup ? window.SettingsSections.aiMarkup(data) : ''}
        <section class="settings-card card logo-card">
          <div class="card-head">
            <div><h2>شعار المسجد</h2><p>اختر صورة ليظهر الشعار في الواجهة وكأيقونة للتطبيق في المتصفح.</p></div>
            <span class="settings-icon">${Icons.svg('image', 19)}</span>
          </div>
          <div class="logo-settings">
            <div class="logo-preview">${data.settings.logo
              ? `<img src="${Utils.esc(data.settings.logo)}" alt="شعار المسجد">`
              : `<span>${Icons.svg('image', 26)}</span>`}</div>
            <div class="logo-info">
              <strong>${data.settings.logo ? 'شعار مخصص' : 'الشعار الافتراضي'}</strong>
              <p>${data.settings.logo ? 'يُستخدم حاليًا كأيقونة للتطبيق في المتصفح.' : 'ارفع صورة مربعة الشكل (PNG أو JPG أو SVG) لتصبح أيقونة التطبيق.'}</p>
            </div>
            <div class="logo-actions">
              <button class="icon-btn sm" data-action="change-logo" title="${data.settings.logo ? 'تغيير الشعار' : 'رفع شعار'}" aria-label="${data.settings.logo ? 'تغيير الشعار' : 'رفع شعار'}">${Icons.svg('upload', 16)}</button>
              ${data.settings.logo ? `<button class="icon-btn sm danger-text" data-action="remove-logo" title="إزالة الشعار" aria-label="إزالة الشعار">${Icons.svg('trash', 16)}</button>` : ''}
            </div>
          </div>
        </section>
        <section class="settings-card card">
          <div class="card-head">
            <div><h2>اختصارات المكتب</h2><p>أضف روابط لصفحات المسجد، ملفاتك المحلية، أو أدوات المونتاج والتصميم.</p></div>
            <button class="icon-btn sm" data-action="add-link" title="اختصار جديد" aria-label="اختصار جديد">${Icons.svg('plus', 16)}</button>
          </div>
          <div class="links-list">
            ${links.length ? links.map((link) => `
              <div class="link-row">
                ${shortcutIcon(link)}
                <div class="link-info">
                  <strong>${Utils.esc(link.name)}</strong>
                  <span>${Utils.esc(shortcutDisplay(link.url))}</span>
                </div>
                <div class="link-actions">
                  <a class="icon-btn xs" href="${Utils.esc(link.url)}" target="_blank" rel="noopener noreferrer" title="فتح الاختصار" aria-label="فتح الاختصار">${Icons.svg('external-link', 15)}</a>
                  <button class="icon-btn xs" data-action="edit-link" data-link-id="${link.id}" title="تعديل الاختصار" aria-label="تعديل الاختصار">${Icons.svg('edit', 15)}</button>
                  <button class="icon-btn xs danger-text" data-action="delete-link" data-link-id="${link.id}" title="حذف الاختصار" aria-label="حذف الاختصار">${Icons.svg('trash', 15)}</button>
                </div>
              </div>`).join('') : emptyState({
                icon: 'link',
                title: 'لا توجد اختصارات بعد',
                text: 'أضف رابط صفحة المسجد، أو مجلد الملفات، أو تطبيق المونتاج.',
                action: `<button class="btn secondary sm" data-action="add-link">${Icons.svg('plus', 15)} إضافة اختصار</button>`,
                compact: true
              })}
          </div>
          <p class="field-hint">${Icons.svg('info', 13)} لفتح ملف محلي، استخدم رابطًا يبدأ بـ <span dir="ltr">file:///</span>. قد يطلب المتصفح إذنًا للوصول إلى الملفات.</p>
        </section>
        <section class="settings-card card">
          <div class="card-head">
            <div><h2>البيانات والنسخ الاحتياطي</h2><p>صدّر نسخة كاملة أو استوردها على جهاز آخر.</p></div>
            <span class="settings-icon">${Icons.svg('archive', 19)}</span>
          </div>
          <div class="data-actions">
            <button class="data-action" data-action="export-json">
              <span class="data-action-icon">${Icons.svg('file', 19)}</span>
              <span><strong>تصدير JSON</strong><small>نسخة كاملة قابلة للاستيراد</small></span>
            </button>
            <button class="data-action" data-action="export-excel">
              <span class="data-action-icon">${Icons.svg('file-spreadsheet', 19)}</span>
              <span><strong>تصدير Excel</strong><small>جداول للمهام والمراحل والأعضاء</small></span>
            </button>
            <button class="data-action" data-action="import-json">
              <span class="data-action-icon">${Icons.svg('upload', 19)}</span>
              <span><strong>استيراد JSON</strong><small>استبدال البيانات الحالية</small></span>
            </button>
            <button class="data-action" data-action="import-excel">
              <span class="data-action-icon">${Icons.svg('upload', 19)}</span>
              <span><strong>استيراد Excel</strong><small>من ملف Excel مصدَّر من التطبيق</small></span>
            </button>
          </div>
          <p class="field-hint">${Icons.svg('database', 13)} تُحفظ البيانات في هذا المتصفح فقط. صدّر نسخة احتياطية بانتظام أو لنقل البيانات إلى جهاز آخر.</p>
        </section>
        <section class="settings-card card danger-zone">
          <div class="card-head">
            <div><h2>منطقة الإجراءات الحساسة</h2><p>هذه الإجراءات لا يمكن التراجع عنها.</p></div>
            <span class="settings-icon">${Icons.svg('alert', 19)}</span>
          </div>
          <div class="danger-actions">
            ${demoCount ? `<button class="icon-btn sm danger-text" data-action="clear-demo" title="مسح المهام التجريبية (${Utils.formatNumber(demoCount)})" aria-label="مسح المهام التجريبية (${Utils.formatNumber(demoCount)})">${Icons.svg('sparkles', 16)}</button>` : ''}
            <button class="icon-btn sm danger-text" data-action="reset-data" title="إعادة تعيين النظام بالكامل" aria-label="إعادة تعيين النظام بالكامل">${Icons.svg('trash', 16)}</button>
          </div>
        </section>
      </div>
    `;
  }

  function automation(data, state) {
    const ui = window.AutomationUI || (typeof AutomationUI !== 'undefined' ? AutomationUI : null);
    if (!ui || typeof ui.page !== 'function') {
      return `
        ${pageHead('الأتمتة', meta.automation.subtitle)}
        <section class="card">
          ${emptyState({
            icon: 'robot',
            title: 'وحدة الأتمتة غير محمّلة',
            text: 'تأكد من تحميل js/automation-ui.js في الصفحة ثم أعد التحميل.',
            compact: true
          })}
        </section>`;
    }
    return ui.page(data, state) || '';
  }

  function render(route, data, state) {
    const routes = { dashboard, tasks, groups, templates, team, reports, automation, settings };
    const page = routes[route] ? routes[route](data, state) : dashboard(data, state);
    return layout(route, `<div class="${state.animatePage ? 'page-enter' : ''}">${page}</div>`, data, state);
  }

  return {
    meta,
    pageMeta,
    render,
    avatar,
    groupChip,
    statusChip,
    progressBar,
    emptyState,
    pageHead,
    statCard,
    logo,
    badgeChip,
    badgeList,
    shortcutIcon,
    shortcutDisplay,
    automationStatusChip,
    formatCost,
    costAxis,
    formatDuration,
    jobPercent,
    runningChip,
    statusColors
  };
})();

