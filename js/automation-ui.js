const AutomationUI = (() => {
  // حالات تشغيل opencode وألوانها — تعتمد على متغيرات الثيم فقط
  const JOB_STATUS = {
    running: { label: 'يعمل الآن', color: 'var(--accent)' },
    queued: { label: 'في الانتظار', color: 'var(--text-3)' },
    done: { label: 'اكتمل', color: 'var(--green)' },
    failed: { label: 'فشل', color: 'var(--red)' },
    cancelled: { label: 'أُلغي', color: 'var(--orange)' },
    interrupted: { label: 'توقف', color: 'var(--orange)' }
  };

  const FINISHED_STATES = ['done', 'failed', 'cancelled', 'interrupted'];

  const STARTER_PROMPTS = [
    {
      name: 'مونتاج ريل من درس',
      description: 'استخراج أقوى مقطع من درس مصوّر ومونتاجه كريل عمودي 9:16 جاهز للنشر.',
      content: `أنت تعمل داخل مجلد مهمة واحدة في المكتب الإعلامي، وكل المواد الخام في هذا المجلد.

المهمة: إنتاج ريل عمودي 9:16 من مادة درس مصوّر.

الخطوات:
1. راجع ملفات الفيديو والصوت في جذر المجلد وحدّد أقوى مقطع مؤثر يصلح كريل مستقلًا (من 30 إلى 45 ثانية).
2. اكتب في opencode/ملاحظات-المقطع.md سبب اختيار المقطع، وموضع البداية والنهاية بالثواني.
3. أنشئ نص الكابشنز العربية كلمة بكلمة واحفظه في opencode/captions.srt.
4. ركّب المقطع بمقاس 1080×1920 مع تكبير هادئ على الوجه، وكابشنز واضحة في أسفل المنتصف.
5. صدّر النسخة النهائية إلى output/ باسم عربي واضح، مثال: output/ريل - عنوان المقطع.mp4، بترميز H.264 و30 إطارًا في الثانية.
6. كل المسودات والأوامر التقنية تبقى داخل opencode/، ولا تلمس ملفات المصدر ولا تحذفها.

بعد كل خطوة رئيسية حدّث opencode/status.json بالحالة phase وpercent وetaSeconds. عند الانتهاء اجعل state تساوي "done" وpercent تساوي 100، واكتب في message ملخص ما أنجزته ومسار الملف النهائي داخل output/.`
    },
    {
      name: 'تفريغ وتلخيص درس',
      description: 'تفريغ درس صوتي أو مرئي إلى نص عربي وتلخيصه مع عناوين مقترحة للنشر.',
      content: `أنت تعمل داخل مجلد مهمة واحدة في المكتب الإعلامي، وملف الدرس موجود في جذر المجلد.

المهمة: تفريغ الدرس وتلخيصه وتجهيز مواد النشر النصية.

الخطوات:
1. ابحث عن ملف الدرس (mp4 أو mov أو mp3 أو wav أو m4a) وتأكد من صلاحيته.
2. فرّغ الصوت إلى نص عربي كامل في opencode/transcript.md مع طابع زمني كل دقيقة.
3. اكتب ملخصًا منظمًا في opencode/summary.md يتضمن: الفكرة الرئيسة، من خمس إلى سبع نقاط، وجملة مؤثرة مقتبسة بنصها.
4. جهّز قائمة عناوين مقترحة للنشر في opencode/titles.md.
5. انسخ الملخص النهائي إلى output/ باسم عربي واضح، مثال: output/ملخص - عنوان الدرس.md، وإن أمكن أضف نسخة PDF.
6. كل العمل التقني والمسودات داخل opencode/، ولا تنشئ أو تعدّل أي ملف خارج output/ وopencode/.

حدّث opencode/status.json بعد كل خطوة. عند الانتهاء اجعل state تساوي "done" وpercent تساوي 100، واذكر الملفات الناتجة في outputs.`
    },
    {
      name: 'تحضير منشورات من مقطع',
      description: 'تحويل مقطع قصير إلى حزمة منشورات جاهزة للنشر مع عناوين وهاشتاقات ومقترح صورة.',
      content: `أنت تعمل داخل مجلد مهمة واحدة في المكتب الإعلامي، والمقطع المطلوب موجود في جذر المجلد.

المهمة: تجهيز حزمة منشورات نصية جاهزة للنشر من مقطع قصير.

الخطوات:
1. راجع المقطع واكتب نصه الكامل في opencode/caption-source.md.
2. أنتج ثلاثة منشورات قصيرة، كل منشور بين 60 و90 كلمة، بأسلوب هادئ يناسب صفحات المسجد: منشور توعوي، ومنشور دعوي، ومنشور خبري عن النشاط.
3. أضف لكل منشور عنوانًا قصيرًا، ومن خمس إلى ثماني هاشتاقات عربية مناسبة، ومقترح لقطة أو صورة من المقطع.
4. احفظ الحزمة النهائية في output/ باسم عربي واضح، مثال: output/منشورات - عنوان المقطع.md، وضع نسخة عمل في opencode/posts-draft.md.
5. لا تنشر شيئًا بنفسك؛ المخرجات نصوص جاهزة فقط، وكل الملفات التقنية داخل opencode/.

حدّث opencode/status.json بعد كل خطوة. عند الانتهاء اجعل state تساوي "done" وpercent تساوي 100 مع ذكر الملفات في outputs.`
    }
  ];

  // فلتر سجل التشغيلات محلي لهذه الوحدة — لا يلمس App.state
  let historyFilter = 'all';

  // ---------------------------------------------------------------- helpers
  function opencode() {
    return window.Opencode || null;
  }

  function repo() {
    return window.Repo || null;
  }

  function isDesktop() {
    return Boolean(window.MMO);
  }

  function repoLinked() {
    const module = repo();
    if (!module || typeof module.status !== 'function') return false;
    try {
      return Boolean(module.status()?.linked);
    } catch (error) {
      return false;
    }
  }

  function formatCost(usd) {
    const value = Number(usd) || 0;
    const module = opencode();
    if (module && typeof module.formatCost === 'function') {
      try {
        return module.formatCost(value);
      } catch (error) {}
    }
    if (value > 0 && value < 0.0001) return `$${value.toFixed(6)}`;
    return `$${value.toFixed(4)}`;
  }

  function stamp(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isActiveJob(job) {
    return Boolean(job) && (job.status === 'running' || job.status === 'queued');
  }

  function jobDuration(job) {
    const start = stamp(job?.startedAt);
    if (!start) return 0;
    const end = isActiveJob(job) ? new Date() : stamp(job?.endedAt);
    if (!end) return 0;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  }

  function durationText(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (total <= 0) return 'أقل من ثانية';
    if (total < 60) return Utils.plural(total, 'ثانية', 'ثانيتين', 'ثوانٍ', 'ثانية');
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return Utils.plural(minutes, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const hoursText = Utils.plural(hours, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    return rest
      ? `${hoursText} و${Utils.plural(rest, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة')}`
      : hoursText;
  }

  function etaText(job) {
    if (!job || job.status === 'queued') return 'في الانتظار';
    const seconds = Math.max(0, Math.round(Number(job.etaSeconds) || 0));
    if (seconds <= 0) return 'جارٍ…';
    if (seconds < 60) return 'متبقٍ أقل من دقيقة';
    return `متبقٍ ~${Utils.plural(Math.round(seconds / 60), 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة')}`;
  }

  function statusChip(job) {
    const status = JOB_STATUS[job?.status] || JOB_STATUS.queued;
    return `<span class="automation-status ${isActiveJob(job) ? 'is-running' : ''}" style="--automation-color:${status.color}"><i></i>${Utils.esc(status.label)}</span>`;
  }

  function usageItem(label, value, isCost = false) {
    const content = isCost ? formatCost(value) : Utils.formatNumber(value);
    return `
      <div class="automation-usage-item ${isCost ? 'is-cost' : ''}">
        <span>${Utils.esc(label)}</span>
        <strong>${Utils.esc(content)}</strong>
      </div>`;
  }

  function formError(form, message) {
    let element = form.querySelector('.form-error');
    if (!element) {
      element = document.createElement('div');
      element.className = 'form-error';
      form.prepend(element);
    }
    element.innerHTML = `${Icons.svg('alert-circle', 16)} <span>${Utils.esc(message)}</span>`;
    element.classList.add('visible');
  }

  function clearError(form) {
    const element = form.querySelector('.form-error');
    if (element) element.classList.remove('visible');
  }

  function finishedJobs(jobs) {
    return jobs
      .filter((job) => FINISHED_STATES.includes(job.status))
      .slice()
      .sort((a, b) => new Date(b.endedAt || b.startedAt || 0) - new Date(a.endedAt || a.startedAt || 0))
      .slice(0, 60);
  }

  function activeJobs(jobs) {
    return jobs
      .filter(isActiveJob)
      .slice()
      .sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
  }

  function promptExcerpt(content) {
    const text = String(content || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'لا يوجد نص بعد.';
    return text.length > 175 ? `${text.slice(0, 175)}…` : text;
  }

  async function fetchLogText(jobId, tail = 400) {
    const module = opencode();
    if (module && typeof module.openLog === 'function') {
      try {
        const result = await module.openLog(jobId, { modal: false });
        if (result && result.ok === false) return result.message || 'تعذر قراءة السجل.';
        if (result && typeof result.text === 'string') return result.text;
      } catch (error) {}
    }
    const logger = window.MMO?.opencode?.log;
    if (typeof logger !== 'function') return null;
    const job = Data.automation(jobId);
    try {
      const result = await logger({
        jobId,
        tail,
        taskFolder: job?.taskFolder || Data.findTask(job?.taskId)?.folder || '',
        repoPath: window.Repo?.status?.()?.path || ''
      });
      if (result && result.ok === false) return result.message || 'تعذر قراءة السجل.';
      return String(result?.data?.text ?? '');
    } catch (error) {
      return 'تعذر قراءة السجل.';
    }
  }

  function bindLog(layer, job) {
    const logEl = layer.querySelector('.automation-log');
    if (!logEl) return () => {};
    let stopped = false;
    let timer = null;
    const load = async () => {
      const text = await fetchLogText(job.id, 400);
      if (stopped) return;
      if (text === null) {
        logEl.textContent = 'السجل متاح داخل تطبيق سطح المكتب فقط.';
        logEl.classList.add('automation-log-empty');
        return;
      }
      const clean = text.trim();
      logEl.textContent = clean || 'لا يوجد سجل بعد…';
      logEl.classList.toggle('automation-log-empty', !clean);
      logEl.scrollTop = logEl.scrollHeight;
    };
    load();
    layer.querySelector('[data-log-refresh]')?.addEventListener('click', load);
    if (isActiveJob(job)) {
      timer = setInterval(() => {
        if (stopped || !layer.isConnected) {
          if (timer) clearInterval(timer);
          timer = null;
          return;
        }
        load();
      }, 2500);
    }
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    };
  }

  // ------------------------------------------------------------------- page
  function page(data, state) {
    const source = data || Data.get() || {};
    const jobs = Array.isArray(source.automations) ? source.automations : [];
    const stats = Data.automationStats({ days: 30 });
    const running = activeJobs(jobs);
    const runningNow = running.filter((job) => job.status === 'running').length;
    const queuedNow = running.length - runningNow;
    const history = finishedJobs(jobs);
    const filteredHistory = historyFilter === 'all'
      ? history
      : history.filter((job) => job.status === historyFilter);
    const prompts = Data.prompts();
    const desktop = isDesktop();
    const series = Data.automationDailySeries(30, 'cost');
    const seriesTotal = series.reduce((sum, point) => sum + (Number(point.value) || 0), 0);
    const hasChartData = series.some((point) => (Number(point.value) || 0) > 0 || (Number(point.runs) || 0) > 0);
    const chartPoints = series.map((point) => ({
      label: Utils.fmtDayMonth(point.label),
      value: Number(point.value) || 0
    }));
    const tokensTotal = (Number(stats.tokens.input) || 0) + (Number(stats.tokens.output) || 0);

    const tabs = [
      { value: 'all', label: 'الكل', count: history.length },
      { value: 'done', label: 'ناجحة', count: history.filter((job) => job.status === 'done').length },
      { value: 'failed', label: 'فاشلة', count: history.filter((job) => job.status === 'failed').length }
    ];

    return `
      ${Views.pageHead(
        'الأتمتة',
        'شغّل opencode على مهام المكتب، وتابع التقدّم والتكلفة والسجل من مكان واحد.',
        `<span class="automation-mode-chip">${Icons.svg(desktop ? 'cpu' : 'info', 14)} ${desktop ? 'وضع سطح المكتب' : 'وضع المتصفح'}</span>
         <button class="btn primary" data-action="add-prompt">${Icons.svg('plus', 17)} برومت جديد</button>`,
        'التشغيل الآلي'
      )}
      ${!desktop ? `
        <div class="info-banner automation-desktop-banner">
          <span>${Icons.svg('info', 18)}</span>
          <p><strong>الأتمتة تحتاج تطبيق سطح المكتب.</strong> يمكنك هنا إدارة البرومتات ومراجعة سجل التشغيلات، أما تشغيل opencode وفتح مجلدات المخرجات فيعمل داخل تطبيق سطح المكتب فقط.</p>
        </div>` : ''}
      <div class="stats-grid">
        ${Views.statCard({
          icon: 'activity',
          color: '#0a84ff',
          label: 'تشغيلات جارية الآن',
          value: Utils.formatNumber(running.length),
          note: `${Utils.formatNumber(runningNow)} قيد التنفيذ · ${Utils.formatNumber(queuedNow)} في الانتظار`
        })}
        ${Views.statCard({
          icon: 'history',
          color: '#6c63ff',
          label: 'تشغيلات آخر 30 يومًا',
          value: Utils.formatNumber(stats.total),
          note: `${Utils.formatNumber(stats.done)} ناجح · ${Utils.formatNumber(stats.failed)} فاشل`
        })}
        ${Views.statCard({
          icon: 'check-circle',
          color: '#30b85a',
          label: 'نسبة النجاح',
          value: `${Utils.formatNumber(stats.successPct)}%`,
          note: stats.finished
            ? `من ${Utils.formatNumber(stats.finished)} تشغيل منتهٍ`
            : 'لا توجد تشغيلات منتهية بعد'
        })}
        ${Views.statCard({
          icon: 'wallet',
          color: '#ff9f0a',
          label: 'تكلفة آخر 30 يومًا',
          value: formatCost(stats.costUSD),
          note: `${Utils.formatNumber(tokensTotal)} توكن · متوسط ${formatCost(stats.avgCostUSD)} للتشغيل`
        })}
      </div>
      <section class="card automation-active">
        <div class="card-head">
          <div>
            <h2>${Icons.svg('robot', 16)} المهام الجارية الآن</h2>
            <p>كل تشغيل يبدأ من داخل المهمة نفسها. تابع هنا المرحلة والتقدّم والوقت المتبقي.</p>
          </div>
          <span class="automation-count">${Utils.formatNumber(running.length)}</span>
        </div>
        ${running.length
          ? `<div class="automation-runs">${running.map(runRow).join('')}</div>`
          : Views.emptyState({
            icon: 'robot',
            title: 'لا توجد تشغيلات جارية',
            text: 'افتح أي مهمة ثم اختر «بدء الأتمتة»، وسيظهر التشغيل هنا مباشرة مع تقدّمه.',
            compact: true
          })}
      </section>
      <section class="card automation-history">
        <div class="card-head">
          <div>
            <h2>${Icons.svg('history', 16)} سجل التشغيلات</h2>
            <p>آخر التشغيلات المنتهية، الأحدث أولًا — بحد أقصى 60 تشغيلًا.</p>
          </div>
          <div class="filter-tabs automation-history-tabs" role="tablist" aria-label="تصفية سجل التشغيلات">
            ${tabs.map((tab) => `
              <button class="filter-tab ${historyFilter === tab.value ? 'active' : ''}" data-action="automation-filter" data-value="${tab.value}" role="tab" aria-selected="${historyFilter === tab.value}">
                ${tab.label}<span>${Utils.formatNumber(tab.count)}</span>
              </button>`).join('')}
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table automation-history-table">
            <thead>
              <tr>
                <th>المهمة</th>
                <th>البرومت</th>
                <th>الموديل</th>
                <th>الحالة</th>
                <th>المدة</th>
                <th>التكلفة</th>
                <th>التاريخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filteredHistory.length
                ? filteredHistory.map(historyRow).join('')
                : `<tr><td colspan="8" class="table-empty">${historyFilter === 'all' ? 'لا توجد تشغيلات منتهية بعد.' : 'لا توجد تشغيلات مطابقة للتصفية.'}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
      ${hasChartData ? `
        <section class="card automation-chart-card">
          <div class="card-head">
            <div>
              <h2>تكلفة التشغيلات</h2>
              <p>مصروف التوليد اليومي خلال آخر 30 يومًا بالدولار.</p>
            </div>
            <div class="automation-chart-total"><strong>${formatCost(seriesTotal)}</strong><span>الإجمالي</span></div>
          </div>
          ${Charts.line({
            points: chartPoints,
            height: 170,
            color: '#ff9f0a',
            ariaLabel: 'تكلفة التشغيلات خلال آخر 30 يومًا',
            emptyText: 'لا توجد تكلفة مسجّلة'
          })}
        </section>` : ''}
      <section class="automation-prompts">
        <div class="section-head">
          <div>
            <h2>البرومتات</h2>
            <p>نصوص تعليمات جاهزة تُستخدم عند تشغيل مهمة. بدء الأتمتة يتم من صفحة المهمة، وليس من هنا.</p>
          </div>
          ${prompts.length ? `<button class="btn secondary sm" data-action="add-prompt">${Icons.svg('plus', 15)} برومت جديد</button>` : ''}
        </div>
        ${prompts.length
          ? `<div class="automation-prompts-grid">
              ${prompts.map(promptCard).join('')}
              <button class="add-card automation-add-prompt" data-action="add-prompt">
                <span class="add-card-icon">${Icons.svg('plus', 22)}</span>
                <strong>برومت جديد</strong>
                <span>نص تعليمات جاهز لاستخدامه في أي مهمة.</span>
              </button>
            </div>`
          : Views.emptyState({
            icon: 'terminal',
            title: 'لا توجد برومتات بعد',
            text: 'البرومت هو نص التعليمات الذي يقرأه opencode عند تشغيل المهمة. أنشئ أول برومت أو ابدأ من الأمثلة الجاهزة.',
            action: `<button class="btn primary" data-action="add-prompt">${Icons.svg('plus', 16)} إنشاء أول برومت</button>
              <button class="btn secondary" data-action="seed-prompts">${Icons.svg('sparkles', 16)} إضافة أمثلة جاهزة</button>`
          })}
      </section>`;
  }

  function runRow(job) {
    const status = JOB_STATUS[job.status] || JOB_STATUS.queued;
    const progress = Utils.clamp(Number(job.progress) || 0, 0, 100);
    const tokens = (Number(job.usage?.input) || 0) + (Number(job.usage?.output) || 0);
    const queued = job.status === 'queued';
    return `
      <article class="automation-run ${queued ? 'is-queued' : 'is-running'}" style="--automation-color:${status.color}">
        <div class="automation-run-head">
          <span class="automation-run-icon">${Icons.svg('robot', 19)}</span>
          <div class="automation-run-title">
            <button class="automation-task-link" data-action="open-task" data-task-id="${Utils.esc(job.taskId)}" title="فتح المهمة">${Utils.esc(job.taskTitle || 'مهمة محذوفة')}</button>
            <span class="automation-run-meta">
              <span>${Utils.esc(job.groupName || 'بدون مجموعة')}</span>
              <i>·</i>
              <code dir="ltr">${Utils.esc(job.model || 'موديل غير محدد')}</code>
            </span>
          </div>
          ${statusChip(job)}
        </div>
        <div class="automation-run-phase">
          <span class="automation-phase">${Utils.esc(job.phase || (queued ? 'في الانتظار' : 'جارٍ التنفيذ'))}</span>
          <span class="automation-eta">${queued ? Icons.svg('clock', 12) : Icons.svg('activity', 12)} ${Utils.esc(etaText(job))}</span>
        </div>
        <div class="automation-run-progress">
          ${Views.progressBar(progress, queued ? 'var(--text-3)' : 'var(--accent)')}
          <span class="automation-percent">${Utils.formatNumber(progress)}%</span>
        </div>
        <div class="automation-run-stats">
          <span>${Icons.svg('clock', 12)} ${Utils.esc(durationText(jobDuration(job)))}</span>
          <span>${Icons.svg('cpu', 12)} ${Utils.formatNumber(tokens)} توكن</span>
          <span>${Icons.svg('wallet', 12)} ${formatCost(job.usage?.costUSD)}</span>
        </div>
        <div class="automation-run-actions">
          <button class="btn secondary sm" data-action="open-job" data-job-id="${Utils.esc(job.id)}">${Icons.svg('activity', 14)} تفاصيل</button>
          <button class="btn ghost sm" data-action="open-job-log" data-job-id="${Utils.esc(job.id)}">${Icons.svg('terminal', 14)} السجل</button>
          <button class="btn ghost sm" data-action="open-job-output" data-task-id="${Utils.esc(job.taskId)}">${Icons.svg('folder-open', 14)} فتح مجلد المخرجات</button>
          <button class="btn ghost sm danger-text" data-action="cancel-automation" data-job-id="${Utils.esc(job.id)}">${Icons.svg('stop', 14)} إلغاء</button>
        </div>
      </article>`;
  }

  function historyRow(job) {
    const when = job.endedAt || job.startedAt;
    return `
      <tr>
        <td>
          <button class="automation-task-link" data-action="open-task" data-task-id="${Utils.esc(job.taskId)}" title="فتح المهمة">${Utils.esc(job.taskTitle || 'مهمة محذوفة')}</button>
        </td>
        <td class="automation-prompt-cell" title="${Utils.esc(job.promptName || 'برومت مخصص')}">${Utils.esc(job.promptName || 'برومت مخصص')}</td>
        <td class="automation-model-cell" dir="ltr" title="${Utils.esc(job.model || '')}">${Utils.esc(job.model || '—')}</td>
        <td>${statusChip(job)}</td>
        <td>${Utils.esc(durationText(jobDuration(job)))}</td>
        <td>${formatCost(job.usage?.costUSD)}</td>
        <td class="muted-cell" title="${Utils.esc(Utils.fmtDateTime(when))}">${Utils.esc(when ? Utils.relativeTime(when) : '—')}</td>
        <td>
          <button class="icon-btn xs" data-action="open-job" data-job-id="${Utils.esc(job.id)}" title="تفاصيل التشغيل" aria-label="تفاصيل التشغيل">${Icons.svg('info', 15)}</button>
        </td>
      </tr>`;
  }

  function promptCard(prompt) {
    return `
      <article class="automation-prompt card">
        <div class="automation-prompt-head">
          <span class="automation-prompt-icon">${Icons.svg('terminal', 18)}</span>
          <div class="automation-prompt-title">
            <strong>${Utils.esc(prompt.name)}</strong>
            <span>آخر تحديث ${Utils.esc(Utils.relativeTime(prompt.updatedAt || prompt.createdAt))}</span>
          </div>
        </div>
        <p class="automation-prompt-desc ${prompt.description ? '' : 'is-empty'}">${Utils.esc(prompt.description || 'بدون وصف.')}</p>
        <pre class="automation-prompt-excerpt">${Utils.esc(promptExcerpt(prompt.content))}</pre>
        <div class="automation-prompt-actions">
          <button class="btn ghost sm" data-action="edit-prompt" data-prompt-id="${Utils.esc(prompt.id)}">${Icons.svg('edit', 14)} تعديل</button>
          <button class="btn ghost sm" data-action="duplicate-prompt" data-prompt-id="${Utils.esc(prompt.id)}">${Icons.svg('copy', 14)} تكرار</button>
          <button class="btn ghost sm danger-text" data-action="delete-prompt" data-prompt-id="${Utils.esc(prompt.id)}">${Icons.svg('trash', 14)} حذف</button>
        </div>
      </article>`;
  }

  // ------------------------------------------------------------- start modal
  function openStart(taskId) {
    const task = Data.findTask(taskId);
    if (!task) {
      App.toast('لم يتم العثور على المهمة.', { type: 'error' });
      return;
    }
    if (Data.activeAutomation(task.id)) {
      App.toast('هذه المهمة قيد الأتمتة بالفعل.', { type: 'warning' });
      return;
    }
    if (!repoLinked()) {
      App.toast('اربط مستودع الملفات أولًا من الإعدادات.', { type: 'warning' });
      return;
    }
    const module = opencode();
    if (!module || typeof module.available !== 'function' || !module.available()) {
      App.toast('بدء الأتمتة يحتاج تطبيق سطح المكتب مع تثبيت opencode.', { type: 'warning' });
      return;
    }

    const prompts = Data.prompts();
    const initialPrompt = prompts[0] || null;
    const group = Data.findGroup(task.groupId);
    const next = Data.nextStage(task);
    const promptOptions = prompts.length
      ? prompts.map((prompt) => `
          <option value="${Utils.esc(prompt.id)}" ${initialPrompt && prompt.id === initialPrompt.id ? 'selected' : ''}>${Utils.esc(prompt.name)}</option>`).join('')
      : '<option value="">لا توجد برومتات محفوظة</option>';

    const body = `
      <form id="automation-start-form" class="form" novalidate>
        <div class="form-error" role="alert"></div>
        <div class="automation-start-task">
          <span class="automation-start-icon">${Icons.svg('robot', 21)}</span>
          <div class="automation-start-body">
            ${Views.groupChip(group)}
            <strong>${Utils.esc(task.title)}</strong>
            <span>${next ? `المرحلة الحالية: ${Utils.esc(next.name)}` : 'كل المراحل مكتملة — سيعمل opencode على المهمة كما هي.'}</span>
          </div>
        </div>
        <label class="field">
          <span>البرومت</span>
          <select name="promptId">${promptOptions}</select>
          <p class="field-hint">${Icons.svg('terminal', 13)} اختيار برومت يملأ المحتوى أدناه، ويمكنك تعديله بحرية قبل البدء.</p>
        </label>
        <label class="field">
          <span>محتوى البرومت <small>قابل للتحرير</small></span>
          <textarea name="promptText" class="automation-prompt-text" rows="8" placeholder="اكتب تعليمات واضحة لـ opencode: ما المطلوب، وأين تُحفظ المخرجات، وكيف يُحدَّث status.json.">${Utils.esc(initialPrompt?.content || '')}</textarea>
        </label>
        <label class="field">
          <span>ملاحظات إضافية <small>اختياري</small></span>
          <textarea name="notes" rows="3" maxlength="2000" placeholder="مثال: المقطع من الدقيقة 18:40، والتسليم قبل صلاة المغرب."></textarea>
        </label>
        <label class="field">
          <span>الموديل</span>
          <select name="model" id="automation-model-select" disabled>
            <option value="">جارٍ تحميل الموديلات…</option>
          </select>
          <p class="field-hint automation-model-state" id="automation-model-state">${Icons.svg('info', 13)} <span>تُجلب الموديلات المسموحة من إعدادات الأتمتة.</span></p>
        </label>
        <div class="automation-output-note">
          ${Icons.svg('folder-open', 15)}
          <span>المخرجات في مجلد <code dir="ltr">output</code> داخل مجلد المهمة، والعمل التقني والمسودات في <code dir="ltr">opencode</code> مع تحديث <code dir="ltr">status.json</code>.</span>
        </div>
      </form>`;

    const footer = `
      <div class="modal-footer-actions">
        <button class="btn ghost" type="button" data-close-modal>إلغاء</button>
        <button class="btn primary" type="submit" form="automation-start-form">${Icons.svg('robot', 16)} بدء الأتمتة</button>
      </div>`;

    App.openModal({
      title: 'بدء الأتمتة',
      subtitle: 'يراجع opencode المهمة داخل مجلدها ويكتب النتائج في output.',
      eyebrow: 'تشغيل جديد',
      body,
      footer,
      size: 'lg',
      onMount: (layer) => {
        const form = layer.querySelector('#automation-start-form');
        const promptSelect = form.querySelector('[name="promptId"]');
        const textArea = form.querySelector('[name="promptText"]');
        const modelSelect = form.querySelector('#automation-model-select');
        const modelState = form.querySelector('#automation-model-state');
        const submitButton = layer.querySelector('button[type="submit"][form="automation-start-form"]');
        let loadingModels = false;

        promptSelect.addEventListener('change', () => {
          const prompt = Data.findPrompt(promptSelect.value);
          textArea.value = prompt?.content || '';
          textArea.focus();
        });

        const setModelState = (html) => {
          if (modelState) modelState.innerHTML = html;
        };

        const loadModels = async () => {
          if (loadingModels) return;
          loadingModels = true;
          modelSelect.disabled = true;
          modelSelect.innerHTML = '<option value="">جارٍ تحميل الموديلات…</option>';
          setModelState(`${Icons.svg('info', 13)} <span>جارٍ جلب الموديلات من opencode…</span>`);
          let result = null;
          try {
            result = await module.models();
          } catch (error) {
            result = null;
          }
          loadingModels = false;
          const all = Array.isArray(result?.all) ? result.all : [];
          let allowed;
          if (Array.isArray(result?.allowed)) {
            allowed = result.allowed.slice();
          } else if (typeof module.allowedModels === 'function') {
            try {
              allowed = module.allowedModels(all) || [];
            } catch (error) {
              allowed = [];
            }
          } else {
            allowed = all.slice();
          }
          allowed = [...new Set(allowed.filter(Boolean))];
          if (!allowed.length) {
            modelSelect.innerHTML = '<option value="">لا توجد موديلات مسموحة</option>';
            modelSelect.disabled = true;
            setModelState(`<span class="automation-model-warning">${Icons.svg('alert', 13)} لا توجد موديلات مسموحة لهذا التشغيل. اضبط قائمة الموديلات من الإعدادات.</span> <button type="button" class="text-link" data-action="automation-settings">فتح الإعدادات</button> <button type="button" class="text-link" id="automation-models-retry">تحديث</button>`);
            layer.querySelector('#automation-models-retry')?.addEventListener('click', loadModels);
            return;
          }
          const lastModel = Data.get()?.settings?.ai?.lastModel || '';
          const preferred = allowed.includes(lastModel) ? lastModel : allowed[0];
          modelSelect.innerHTML = allowed
            .map((model) => `<option value="${Utils.esc(model)}" ${model === preferred ? 'selected' : ''}>${Utils.esc(model)}</option>`)
            .join('');
          modelSelect.disabled = false;
          setModelState(`${Icons.svg('cpu', 13)} <span>${Utils.formatNumber(allowed.length)} موديلًا مسموحًا · يُحفظ آخر اختيار تلقائيًا.</span>`);
        };
        loadModels();

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearError(form);
          const promptText = textArea.value.trim();
          const notes = form.querySelector('[name="notes"]').value.trim();
          const promptId = promptSelect.value || null;
          const prompt = promptId ? Data.findPrompt(promptId) : null;
          const model = modelSelect.value;
          if (!promptText) {
            formError(form, 'اكتب محتوى البرومت قبل البدء.');
            textArea.focus();
            return;
          }
          if (!model) {
            formError(form, 'اختر موديلًا للتشغيل، أو اضبط الموديلات المسموحة من الإعدادات.');
            return;
          }
          const originalLabel = submitButton ? submitButton.innerHTML : '';
          if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'جارٍ البدء…';
          }
          const restore = () => {
            if (submitButton) {
              submitButton.disabled = false;
              submitButton.innerHTML = originalLabel;
            }
          };
          let result = null;
          try {
            result = await module.start({
              taskId: task.id,
              promptId,
              promptName: prompt?.name || 'برومت مخصص',
              model,
              notes,
              promptText
            });
          } catch (error) {
            restore();
            formError(form, 'تعذر بدء الأتمتة. تحقق من المستودع واتصال opencode.');
            return;
          }
          if (result && result.ok === false) {
            restore();
            formError(form, result.message || 'تعذر بدء الأتمتة. تحقق من المستودع وإعدادات الموديل.');
            return;
          }
          App.closeModal();
          App.toast(`بدأت الأتمتة على: ${task.title}`, { type: 'success', icon: 'robot', duration: 5000 });
          App.refresh();
        });
      }
    });
  }

  // ------------------------------------------------------------ prompt forms
  function openPromptForm(promptId = null) {
    const prompt = promptId ? Data.findPrompt(promptId) : null;
    const body = `
      <form id="automation-prompt-form" class="form" novalidate>
        <div class="form-error" role="alert"></div>
        <div class="form-grid">
          <label class="field span-two">
            <span>اسم البرومت</span>
            <input type="text" name="name" required maxlength="80" value="${Utils.esc(prompt?.name || '')}" placeholder="مثال: مونتاج ريل من درس" autocomplete="off">
          </label>
          <label class="field span-two">
            <span>الوصف <small>اختياري</small></span>
            <input type="text" name="description" maxlength="200" value="${Utils.esc(prompt?.description || '')}" placeholder="متى يُستخدم هذا البرومت؟" autocomplete="off">
          </label>
        </div>
        <label class="field">
          <span>محتوى البرومت <small>إلزامي</small></span>
          <textarea name="content" class="automation-prompt-text" rows="10" placeholder="اكتب تعليمات opencode: الخطوات، أسماء الملفات، ومكان المخرجات.">${Utils.esc(prompt?.content || '')}</textarea>
        </label>
        <p class="field-hint">${Icons.svg('info', 13)} اذكر دائمًا أن الناتج النهائي في <code dir="ltr">output/</code> والعمل التقني في <code dir="ltr">opencode/</code> مع تحديث <code dir="ltr">opencode/status.json</code>.</p>
        ${!prompt && !Data.prompts().length ? `
          <div class="automation-starter-box">
            <div>
              <strong>${Icons.svg('sparkles', 14)} أمثلة جاهزة</strong>
              <p>أضف ثلاثة برومتات عملية (مونتاج ريل من درس، تفريغ وتلخيص درس، تحضير منشورات) وعدّلها كما تشاء.</p>
            </div>
            <button type="button" class="btn secondary sm" id="automation-seed-inline">${Icons.svg('plus', 15)} إضافة أمثلة جاهزة</button>
          </div>` : ''}
      </form>`;
    const footer = `
      <div class="modal-footer-actions">
        <button class="btn ghost" type="button" data-close-modal>إلغاء</button>
        <button class="btn primary" type="submit" form="automation-prompt-form">${prompt ? 'حفظ التعديلات' : 'إنشاء البرومت'}</button>
      </div>`;

    App.openModal({
      title: prompt ? 'تعديل البرومت' : 'برومت جديد',
      subtitle: 'نص تعليمات واضح يوجّه opencode داخل مجلد المهمة.',
      eyebrow: 'البرومتات',
      body,
      footer,
      size: 'lg',
      onMount: (layer) => {
        const form = layer.querySelector('#automation-prompt-form');
        layer.querySelector('#automation-seed-inline')?.addEventListener('click', () => {
          App.closeModal();
          seedPrompts();
        });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          clearError(form);
          const name = form.querySelector('[name="name"]').value.trim();
          const description = form.querySelector('[name="description"]').value.trim();
          const content = form.querySelector('[name="content"]').value.trim();
          if (!name) {
            formError(form, 'اكتب اسم البرومت.');
            form.querySelector('[name="name"]').focus();
            return;
          }
          if (Data.prompts().some((item) => item.name === name && item.id !== promptId)) {
            formError(form, 'يوجد برومت آخر بهذا الاسم.');
            return;
          }
          if (!content) {
            formError(form, 'اكتب محتوى البرومت.');
            form.querySelector('[name="content"]').focus();
            return;
          }
          const saved = prompt
            ? Data.updatePrompt(prompt.id, { name, description, content })
            : Data.createPrompt({ name, description, content });
          if (!saved) {
            formError(form, 'تعذر حفظ البرومت.');
            return;
          }
          App.closeAllModals();
          App.refresh();
          App.toast(prompt ? 'تم حفظ البرومت.' : 'تم إنشاء البرومت.', { type: 'success', icon: 'terminal' });
        });
      }
    });
  }

  async function deletePromptFlow(promptId) {
    const prompt = Data.findPrompt(promptId);
    if (!prompt) return;
    const ok = await App.confirm({
      title: 'حذف البرومت',
      message: `سيتم حذف «${prompt.name}» نهائيًا. سجل التشغيلات السابقة يحتفظ بنص البرومت كما كان.`,
      confirmText: 'حذف البرومت',
      danger: true
    }).catch(() => false);
    if (!ok) return;
    Data.deletePrompt(promptId);
    App.refresh();
    App.toast('تم حذف البرومت.', { type: 'success' });
  }

  function duplicatePromptFlow(promptId) {
    const copy = Data.duplicatePrompt(promptId);
    if (!copy) {
      App.toast('لم يتم العثور على البرومت.', { type: 'error' });
      return;
    }
    App.refresh();
    App.toast('تم إنشاء نسخة من البرومت.', { type: 'success', icon: 'copy' });
  }

  async function seedPrompts() {
    const existing = new Set(Data.prompts().map((prompt) => prompt.name));
    let created = 0;
    STARTER_PROMPTS.forEach((item) => {
      if (existing.has(item.name)) return;
      if (Data.createPrompt(item)) created += 1;
    });
    App.refresh();
    if (!created) {
      App.toast('الأمثلة الجاهزة موجودة بالفعل.', { type: 'info' });
      return;
    }
    App.toast(`تمت إضافة ${created} من الأمثلة الجاهزة.`, { type: 'success', icon: 'sparkles' });
  }

  // ---------------------------------------------------------------- job views
  function openJobDetail(jobId) {
    const job = Data.automation(jobId);
    if (!job) {
      App.toast('لم يتم العثور على هذا التشغيل.', { type: 'error' });
      return;
    }
    openOwnJobDetail(job);
  }

  function openJobLog(jobId) {
    const job = Data.automation(jobId);
    if (!job) {
      App.toast('لم يتم العثور على هذا التشغيل.', { type: 'error' });
      return;
    }
    const module = opencode();
    if (module && typeof module.openLogModal === 'function') {
      try {
        module.openLogModal(jobId);
        return;
      } catch (error) {}
    }
    openOwnJobLog(job);
  }

  function openOwnJobDetail(job) {
    const usage = job.usage || {};
    const isActive = isActiveJob(job);
    const body = `
      <div class="automation-job">
        <div class="automation-job-head">
          ${statusChip(job)}
          <span class="chip">${Icons.svg('cpu', 12)} ${Utils.esc(job.model || 'موديل غير محدد')}</span>
          <span class="chip">${Icons.svg('terminal', 12)} ${Utils.esc(job.promptName || 'برومت مخصص')}</span>
        </div>
        <div class="automation-job-meta">
          <div class="automation-job-meta-item"><span>المهمة</span><strong>${Utils.esc(job.taskTitle || 'مهمة محذوفة')}</strong></div>
          <div class="automation-job-meta-item"><span>المجموعة</span><strong>${Utils.esc(job.groupName || 'بدون مجموعة')}</strong></div>
          <div class="automation-job-meta-item"><span>المرحلة</span><strong>${Utils.esc(job.phase || (isActive ? 'جارٍ التنفيذ' : '—'))}</strong></div>
          <div class="automation-job-meta-item"><span>البدء</span><strong>${Utils.esc(Utils.fmtDateTime(job.startedAt))}</strong></div>
          <div class="automation-job-meta-item"><span>الانتهاء</span><strong>${job.endedAt ? Utils.esc(Utils.fmtDateTime(job.endedAt)) : (isActive ? 'لم ينتهِ بعد' : '—')}</strong></div>
          <div class="automation-job-meta-item"><span>المدة</span><strong>${Utils.esc(durationText(jobDuration(job)))}</strong></div>
        </div>
        <div class="automation-usage">
          ${usageItem('توكن الإدخال', usage.input)}
          ${usageItem('توكن الإخراج', usage.output)}
          ${usageItem('قراءة الكاش', usage.cacheRead)}
          ${usageItem('كتابة الكاش', usage.cacheWrite)}
          ${usageItem('التكلفة', usage.costUSD, true)}
        </div>
        ${job.error ? `<div class="automation-job-error">${Icons.svg('alert', 16)}<p>${Utils.esc(job.error)}</p></div>` : ''}
        <div class="automation-log-wrap">
          <div class="automation-log-head">
            <span>${Icons.svg('terminal', 13)} سجل التشغيل${isActive ? ' المباشر' : ''}</span>
            <button type="button" class="text-link" data-log-refresh>${Icons.svg('refresh', 13)} تحديث</button>
          </div>
          <pre class="automation-log" id="automation-job-log">جارٍ تحميل السجل…</pre>
        </div>
      </div>`;
    const footer = `
      <div class="modal-footer-row">
        <div class="footer-left">
          <button class="btn ghost sm" data-action="open-job-output" data-task-id="${Utils.esc(job.taskId)}">${Icons.svg('folder-open', 15)} مجلد المخرجات</button>
          <button class="btn ghost sm" data-action="open-job-opencode" data-task-id="${Utils.esc(job.taskId)}">${Icons.svg('terminal', 15)} مجلد opencode</button>
        </div>
        <div class="footer-right">
          ${isActive ? `<button class="btn ghost sm danger-text" data-action="cancel-automation" data-job-id="${Utils.esc(job.id)}">${Icons.svg('stop', 15)} إلغاء</button>` : ''}
          <button class="btn primary" data-close-modal type="button">إغلاق</button>
        </div>
      </div>`;
    let cleanup = null;
    App.openModal({
      title: 'تفاصيل التشغيل',
      subtitle: job.taskTitle || 'مهمة محذوفة',
      eyebrow: 'الأتمتة',
      body,
      footer,
      size: 'lg',
      onMount: (layer) => {
        cleanup = bindLog(layer, job);
      },
      onDismiss: () => {
        if (cleanup) cleanup();
      }
    });
  }

  function openOwnJobLog(job) {
    const isActive = isActiveJob(job);
    const body = `
      <div class="automation-job">
        <div class="automation-job-head">
          ${statusChip(job)}
          <span class="chip">${Icons.svg('terminal', 12)} ${Utils.esc(job.promptName || 'برومت مخصص')}</span>
          <span class="chip">${Icons.svg('cpu', 12)} ${Utils.esc(job.model || 'موديل غير محدد')}</span>
        </div>
        <div class="automation-log-wrap">
          <div class="automation-log-head">
            <span>${Icons.svg('terminal', 13)} سجل التشغيل${isActive ? ' المباشر' : ''}</span>
            <button type="button" class="text-link" data-log-refresh>${Icons.svg('refresh', 13)} تحديث</button>
          </div>
          <pre class="automation-log automation-log-lg" id="automation-job-log">جارٍ تحميل السجل…</pre>
        </div>
      </div>`;
    const footer = `
      <div class="modal-footer-row">
        <div class="footer-left">
          <button class="btn ghost sm" data-action="open-job" data-job-id="${Utils.esc(job.id)}">${Icons.svg('info', 15)} تفاصيل التشغيل</button>
          <button class="btn ghost sm" data-action="open-job-output" data-task-id="${Utils.esc(job.taskId)}">${Icons.svg('folder-open', 15)} مجلد المخرجات</button>
        </div>
        <div class="footer-right">
          ${isActive ? `<button class="btn ghost sm danger-text" data-action="cancel-automation" data-job-id="${Utils.esc(job.id)}">${Icons.svg('stop', 15)} إلغاء</button>` : ''}
          <button class="btn primary" data-close-modal type="button">إغلاق</button>
        </div>
      </div>`;
    let cleanup = null;
    App.openModal({
      title: 'سجل التشغيل',
      subtitle: job.taskTitle || 'مهمة محذوفة',
      eyebrow: 'الأتمتة',
      body,
      footer,
      size: 'lg',
      onMount: (layer) => {
        cleanup = bindLog(layer, job);
      },
      onDismiss: () => {
        if (cleanup) cleanup();
      }
    });
  }

  // ------------------------------------------------------------------ cancel
  async function cancelJob(jobId) {
    const job = Data.automation(jobId);
    if (!job) {
      App.toast('لم يتم العثور على هذا التشغيل.', { type: 'error' });
      return;
    }
    if (!isActiveJob(job)) {
      App.toast('هذا التشغيل انتهى بالفعل.', { type: 'info' });
      return;
    }
    const ok = await App.confirm({
      title: 'إلغاء الأتمتة',
      message: `سيتم إيقاف تشغيل «${job.taskTitle || 'المهمة'}» الآن. الملفات التي أُنجزت داخل المجلد تبقى كما هي.`,
      confirmText: 'إلغاء التشغيل',
      danger: true
    }).catch(() => false);
    if (!ok) return;
    const module = opencode();
    if (!module || typeof module.cancel !== 'function') {
      App.toast('إلغاء التشغيل يحتاج تطبيق سطح المكتب.', { type: 'info' });
      return;
    }
    let result = null;
    try {
      result = await module.cancel(jobId);
    } catch (error) {
      App.toast('تعذر إلغاء التشغيل.', { type: 'error' });
      return;
    }
    if (result && result.ok === false) {
      App.toast(result.message || 'تعذر إلغاء التشغيل.', { type: 'error' });
      return;
    }
    App.refresh();
    App.toast('تم إلغاء التشغيل.', { type: 'success', icon: 'stop' });
  }

  function openTaskFolder(kind, taskId) {
    const module = repo();
    const method = kind === 'output' ? module?.openTaskOutput : module?.openTaskOpencode;
    if (typeof method !== 'function') {
      App.toast('فتح المجلدات يحتاج تطبيق سطح المكتب.', { type: 'info' });
      return;
    }
    const label = kind === 'output' ? 'مجلد المخرجات' : 'مجلد opencode';
    let result = null;
    try {
      result = method.call(module, taskId);
    } catch (error) {
      App.toast(`تعذر فتح ${label}.`, { type: 'error' });
      return;
    }
    Promise.resolve(result).then((value) => {
      if (value === false) App.toast(`تعذر فتح ${label}.`, { type: 'warning' });
    }).catch(() => {
      App.toast(`تعذر فتح ${label}.`, { type: 'error' });
    });
  }

  // ------------------------------------------------------------- handleAction
  function handleAction(action, el) {
    const element = el || {};
    switch (action) {
      case 'start-automation':
        openStart(element.dataset?.taskId);
        return true;
      case 'cancel-automation':
        cancelJob(element.dataset?.jobId);
        return true;
      case 'open-job':
        openJobDetail(element.dataset?.jobId);
        return true;
      case 'open-job-log':
        openJobLog(element.dataset?.jobId);
        return true;
      case 'open-job-output':
        openTaskFolder('output', element.dataset?.taskId);
        return true;
      case 'open-job-opencode':
        openTaskFolder('opencode', element.dataset?.taskId);
        return true;
      case 'add-prompt':
        openPromptForm();
        return true;
      case 'edit-prompt':
        openPromptForm(element.dataset?.promptId || null);
        return true;
      case 'duplicate-prompt':
        duplicatePromptFlow(element.dataset?.promptId);
        return true;
      case 'delete-prompt':
        deletePromptFlow(element.dataset?.promptId);
        return true;
      case 'automation-filter':
        historyFilter = element.dataset?.value === 'done' || element.dataset?.value === 'failed'
          ? element.dataset.value
          : 'all';
        App.refresh();
        return true;
      case 'seed-prompts':
        seedPrompts();
        return true;
      case 'automation-settings':
        App.closeAllModals();
        App.navigate('settings');
        return true;
      default:
        return false;
    }
  }

  return {
    page,
    handleAction,
    openStart,
    openPromptForm,
    openJobDetail
  };
})();
