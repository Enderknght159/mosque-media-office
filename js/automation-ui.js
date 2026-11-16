const AutomationUI = (() => {
  // حالات تشغيل opencode وألوانها — تعتمد على متغيرات الثيم فقط
  const JOB_STATUS = {
    running: { label: 'يعمل الآن', color: 'var(--accent)' },
    queued: { label: 'في الانتظار', color: 'var(--text-3)' },
    blocked: { label: 'بانتظار ردك', color: 'var(--orange)' },
    done: { label: 'اكتمل', color: 'var(--green)' },
    failed: { label: 'فشل', color: 'var(--red)' },
    cancelled: { label: 'أُلغي', color: 'var(--orange)' },
    interrupted: { label: 'توقف', color: 'var(--orange)' }
  };

  const FINISHED_STATES = ['done', 'failed', 'cancelled', 'interrupted'];

  // الرسالة الافتراضية التي تُرسل للوكيل عندما يسأله المستخدم عن موقعه
  const PING_MESSAGE = 'أين وصلت الآن؟ اكتب في opencode/status.json المرحلة الحالية والنسبة والوقت المتبقي المتوقع، ثم أكمل العمل.';

  const LIVE_POLL_MS = 2000;
  const TICK_MS = 1000;

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

  // آخر معرّف جلسة معروف لكل تشغيل — يُستخدم للنسخ دون عرضه كنص كامل
  const sessionIds = new Map();

  // الجلسة المفتوحة حاليًا لنافذة تفاصيل التشغيل
  let detailSession = null;

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

  /** الوقت المتبقي بالكلمات، من عدد الثواني فقط. */
  function etaText(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (total <= 0) return 'أقل من دقيقة';
    if (total < 60) return 'أقل من دقيقة';
    if (total < 3600) {
      return Utils.plural(Math.round(total / 60), 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
    }
    const hours = Math.floor(total / 3600);
    const rest = Math.round((total % 3600) / 60);
    const hoursText = Utils.plural(hours, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    return rest ? `${hoursText} و${Utils.plural(rest, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة')}` : hoursText;
  }

  /** مدة رقمية مختصرة mm:ss أو h:mm:ss — تُعرض بأرقام جدولية. */
  function elapsedText(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    const pad = (value) => String(value).padStart(2, '0');
    return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
  }

  function percentOf(value) {
    return Utils.clamp(Math.round(Number(value) || 0), 0, 100);
  }

  /** حالة العرض الفعلية: status.json قد تكشف blocked قبل أن يحدّثها التشغيل. */
  function liveState(job, live) {
    const state = live?.state;
    if (state === 'blocked') return 'blocked';
    if (state === 'working' && isActiveJob(job)) return 'running';
    if (state === 'done') return 'done';
    if (state === 'failed') return 'failed';
    return job?.status || 'queued';
  }

  function stateChip(state) {
    const status = JOB_STATUS[state] || JOB_STATUS.queued;
    const pulsing = state === 'running' || state === 'queued' || state === 'blocked';
    return `<span class="automation-status ${pulsing ? 'is-running' : ''}" style="--automation-color:${status.color}"><i></i>${Utils.esc(status.label)}</span>`;
  }

  function statusChip(job) {
    return stateChip(liveState(job, null));
  }

  /** نص المرحلة: من status.json أولًا، ثم من سجل التشغيل. */
  function phaseText(job, live) {
    const fromLive = String(live?.phase || '').trim();
    if (fromLive) return fromLive;
    const fromJob = String(job?.phase || '').trim();
    if (fromJob) return fromJob;
    if (!job) return '—';
    if (job.status === 'queued') return 'في الانتظار';
    if (job.status === 'done') return 'اكتمل';
    if (job.status === 'failed') return 'فشل';
    if (job.status === 'cancelled') return 'أُلغي';
    if (job.status === 'interrupted') return 'توقف';
    return 'جارٍ التنفيذ';
  }

  /** معرّف الجلسة المقنّع: بادئة ثابتة + آخر ستة أحرف فقط. */
  function shortSession(id) {
    const value = String(id || '').trim();
    if (!value) return '';
    return `ses_…${value.slice(-6)}`;
  }

  async function copyText(text) {
    const value = String(text || '');
    if (!value) return false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (error) {}
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand('copy');
      area.remove();
      return Boolean(done);
    } catch (error) {
      return false;
    }
  }

  function numberOrNull(value) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function firstText(...values) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  function mergedUsage(...sources) {
    const keys = ['input', 'output', 'reasoning', 'cacheRead', 'cacheWrite', 'costUSD'];
    const result = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0 };
    keys.forEach((key) => {
      result[key] = sources.reduce((max, source) => {
        const value = Number(source?.[key]) || 0;
        return value > max ? value : max;
      }, 0);
    });
    return result;
  }

  /**
   * status.json خاص بمجلد المهمة، وقد يبقى من تشغيل أقدم.
   * نتجاهل بياناته عندما يكون وقت تحديثه خارج نطاق عمر التشغيل الحالي.
   */
  function statusIsFresh(job, updatedAt) {
    const updated = stamp(updatedAt);
    const started = stamp(job?.startedAt);
    if (!updated || !started) return true;
    const ended = stamp(job?.endedAt);
    const lower = started.getTime() - 5000;
    const upper = ended ? ended.getTime() + 120000 : Date.now() + 120000;
    return updated.getTime() >= lower && updated.getTime() <= upper;
  }

  /** يوحد شكل بيانات job مع استجابة status.json في كائن واحد للعرض. */
  function normalizeLive(job, payload) {
    const data = payload && typeof payload === 'object'
      ? (payload.data && typeof payload.data === 'object' ? payload.data : payload)
      : {};
    const agent = data.agentStatus && typeof data.agentStatus === 'object'
      ? data.agentStatus
      : (data.status && typeof data.status === 'object' && data.status.state ? data.status : null);
    const run = data.run && typeof data.run === 'object' ? data.run : null;
    const updatedAt = firstText(agent?.updatedAt, data.updatedAt);
    const fresh = statusIsFresh(job, updatedAt);
    // بيانات العملية الحية في main تصل مباشرة في data (progress/steps/usage/sessionID)
    const liveProgress = numberOrNull(data.progress);
    const hasLive = liveProgress != null
      || numberOrNull(data.steps) != null
      || Boolean(data.sessionID)
      || Boolean(data.status);
    const trustAgent = fresh || !agent;

    const statusPercent = fresh ? numberOrNull(agent?.percent) : null;
    const jobPercent = percentOf(job?.progress);
    let percent = liveProgress != null ? percentOf(liveProgress) : jobPercent;
    if (liveProgress == null && statusPercent != null) percent = percentOf(statusPercent);
    if (isActiveJob(job)) percent = Math.max(jobPercent, percent);
    else percent = job?.status === 'done' ? 100 : jobPercent;

    const statusEta = fresh
      ? (numberOrNull(agent?.etaSeconds) ?? numberOrNull(data.etaSeconds))
      : (hasLive ? numberOrNull(data.etaSeconds) : null);
    const etaSeconds = Math.max(0, Math.round(statusEta == null ? (numberOrNull(job?.etaSeconds) || 0) : statusEta));
    const outputs = fresh && Array.isArray(agent?.outputs) ? agent.outputs : [];
    const sessionID = firstText(job?.sessionID, run?.sessionID, data.sessionID);
    if (job?.id && sessionID) sessionIds.set(job.id, sessionID);

    return {
      reached: Boolean(payload),
      state: trustAgent ? firstText(agent?.state, data.state) : '',
      phase: trustAgent ? firstText(agent?.phase, data.phase) : '',
      percent,
      etaSeconds,
      message: trustAgent ? firstText(agent?.message, data.message) : '',
      outputs: outputs.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 80),
      updatedAt,
      usage: mergedUsage(job?.usage, run?.usage, data.usage),
      steps: Math.max(0, Math.round(Math.max(
        numberOrNull(job?.steps) || 0,
        numberOrNull(run?.steps) || 0,
        numberOrNull(data.steps) || 0
      ))),
      sessionID
    };
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
    const details = logEl.closest('details');
    let stopped = false;
    let timer = null;
    const load = async () => {
      if (stopped) return;
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
    layer.querySelector('[data-log-refresh]')?.addEventListener('click', () => {
      load();
    });
    if (details) {
      details.addEventListener('toggle', () => {
        if (details.open) load();
      });
    }
    if (isActiveJob(job)) {
      timer = setInterval(() => {
        if (stopped || !layer.isConnected) {
          if (timer) clearInterval(timer);
          timer = null;
          return;
        }
        // لا نقرأ السجل إلا عندما يكون مفتوحًا لتقليل ضغط IPC
        if (details && !details.open) return;
        load();
      }, 2500);
    }
    const cleanup = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    };
    cleanup.reload = load;
    return cleanup;
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
    const hasChartData = seriesTotal > 0;
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
          label: 'جارٍ الآن',
          value: Utils.formatNumber(running.length),
          note: `${Utils.formatNumber(runningNow)} ينفّذ · ${Utils.formatNumber(queuedNow)} منتظر`
        })}
        ${Views.statCard({
          icon: 'history',
          color: '#6c63ff',
          label: 'آخر 30 يومًا',
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
            : 'لا تشغيلات منتهية بعد'
        })}
        ${Views.statCard({
          icon: 'dollar',
          color: '#ff9f0a',
          label: 'تكلفة 30 يومًا',
          value: formatCost(stats.costUSD),
          note: `${Utils.formatNumber(tokensTotal)} توكن · ${formatCost(stats.avgCostUSD)} متوسط`
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
            <colgroup>
              <col class="automation-col-task">
              <col class="automation-col-prompt">
              <col class="automation-col-model">
              <col class="automation-col-status">
              <col class="automation-col-duration">
              <col class="automation-col-cost">
              <col class="automation-col-date">
              <col class="automation-col-actions">
            </colgroup>
            <thead>
              <tr>
                <th>المهمة</th>
                <th>البرومت</th>
                <th>الموديل</th>
                <th>الحالة</th>
                <th>المدة</th>
                <th>التكلفة</th>
                <th>التاريخ</th>
                <th class="automation-th-actions"><span class="sr-only">إجراءات</span></th>
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
            emptyText: 'لا توجد تكلفة مسجّلة',
            valueFormat: (value) => formatCost(value),
            minStep: 0.0001
          })}
        </section>` : (stats.total ? `
        <section class="card automation-chart-card">
          <div class="card-head">
            <div>
              <h2>تكلفة التشغيلات</h2>
              <p>لم تُسجّل تكلفة في آخر 30 يومًا.</p>
            </div>
            <div class="automation-chart-total"><strong>$0</strong><span>الإجمالي</span></div>
          </div>
          <p class="automation-chart-note">${Icons.svg('info', 14)} الموديل المستخدم لا يُرجع تكلفة (غالبًا موديل مجاني)، لذلك لا يوجد رسم بياني للمصروف. عدد التشغيلات محسوب في الإحصائيات أعلاه.</p>
        </section>` : '')}
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

  function iconAction(name, action, title, attrs = '', extra = '') {
    const label = Utils.esc(String(title));
    return `<button class="icon-btn ${extra}" type="button" data-action="${action}" ${attrs} title="${label}" aria-label="${label}">${Icons.svg(name, 16)}</button>`;
  }

  function runRow(job) {
    const status = JOB_STATUS[job.status] || JOB_STATUS.queued;
    const progress = percentOf(job.progress);
    const usage = mergedUsage(job, null);
    const tokens = (Number(usage.input) || 0) + (Number(usage.output) || 0);
    const queued = job.status === 'queued';
    const elapsed = jobDuration(job);
    const eta = Math.max(0, Math.round(Number(job.etaSeconds) || 0));
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
          <span class="automation-phase">${Utils.esc(phaseText(job, null))}</span>
          <span class="automation-run-timing">
            <span class="automation-timing-item" title="الوقت المنقضي">${Icons.svg('timer', 12)}${Utils.esc(elapsedText(elapsed))}</span>
            <span class="automation-timing-item" title="الوقت المتبقي المتوقع">${Icons.svg('clock', 12)}${queued ? 'في الانتظار' : Utils.esc(eta > 0 ? etaText(eta) : 'جارٍ…')}</span>
          </span>
        </div>
        <div class="automation-run-progress">
          ${Views.progressBar(progress, queued ? 'var(--text-3)' : 'var(--accent)')}
          <span class="automation-percent">${Utils.formatNumber(progress)}%</span>
        </div>
        <div class="automation-run-stats">
          <span title="عدد الخطوات">${Icons.svg('activity', 12)}${Utils.formatNumber(job.steps || 0)}</span>
          <span title="التوكنات">${Icons.svg('cpu', 12)}${Utils.formatNumber(tokens)}</span>
          <span title="التكلفة">${Icons.svg('wallet', 12)}${formatCost(usage.costUSD)}</span>
        </div>
        <div class="automation-run-actions icon-actions">
          ${iconAction('activity', 'open-job', 'تفاصيل التشغيل', `data-job-id="${Utils.esc(job.id)}"`)}
          ${iconAction('terminal', 'open-job-log', 'سجل التشغيل', `data-job-id="${Utils.esc(job.id)}"`)}
          ${iconAction('stop', 'cancel-automation', 'إلغاء التشغيل', `data-job-id="${Utils.esc(job.id)}"`, 'is-danger')}
        </div>
      </article>`;
  }

  function historyRow(job) {
    const when = job.endedAt || job.startedAt;
    const model = job.model || '';
    return `
      <tr>
        <td class="automation-cell-task">
          <button class="automation-task-link" data-action="open-task" data-task-id="${Utils.esc(job.taskId)}" title="فتح المهمة">${Utils.esc(job.taskTitle || 'مهمة محذوفة')}</button>
        </td>
        <td class="automation-prompt-cell" title="${Utils.esc(job.promptName || 'برومت مخصص')}">${Utils.esc(job.promptName || 'برومت مخصص')}</td>
        <td class="automation-cell-model" dir="ltr" title="${Utils.esc(model)}">${Utils.esc(model || '—')}</td>
        <td class="automation-cell-status">${Views.automationStatusChip(job.status)}</td>
        <td class="automation-cell-num">${Utils.esc(Views.formatDuration(jobDuration(job)))}</td>
        <td class="automation-cell-num">${formatCost(job.usage?.costUSD)}</td>
        <td class="muted-cell automation-cell-date" title="${Utils.esc(Utils.fmtDateTime(when))}">${Utils.esc(when ? Utils.relativeTime(when) : '—')}</td>
        <td class="automation-cell-actions">
          <button class="icon-btn xs" type="button" data-action="open-job" data-job-id="${Utils.esc(job.id)}" title="تفاصيل التشغيل" aria-label="تفاصيل التشغيل">${Icons.svg('info', 15)}</button>
          <button class="icon-btn xs" type="button" data-action="open-job-log" data-job-id="${Utils.esc(job.id)}" title="سجل التشغيل" aria-label="سجل التشغيل">${Icons.svg('terminal', 15)}</button>
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
        <div class="automation-prompt-actions icon-actions">
          ${iconAction('edit', 'edit-prompt', 'تعديل البرومت', `data-prompt-id="${Utils.esc(prompt.id)}"`, 'sm')}
          ${iconAction('copy', 'duplicate-prompt', 'تكرار البرومت', `data-prompt-id="${Utils.esc(prompt.id)}"`, 'sm')}
          ${iconAction('trash', 'delete-prompt', 'حذف البرومت', `data-prompt-id="${Utils.esc(prompt.id)}"`, 'sm is-danger')}
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

  // ------------------------------------------------------- تفاصيل التشغيل
  function setHtml(layer, selector, html) {
    const node = layer ? layer.querySelector(selector) : null;
    if (node) node.innerHTML = html;
  }

  function setText(layer, selector, text) {
    const node = layer ? layer.querySelector(selector) : null;
    if (node) node.textContent = text;
  }

  async function taskAbsolute(job) {
    const module = repo();
    if (!module || !job) return '';
    try {
      if (typeof module.absolute === 'function') {
        const value = await module.absolute(job.taskId);
        if (value) return String(value);
      }
      if (typeof module.abs === 'function') {
        const value = await module.abs(job.taskId);
        if (value) return String(value);
      }
    } catch (error) {}
    return '';
  }

  /** بديل احتياطي لقراءة status.json عندما لا يكون Opencode.refresh متاحًا بعد. */
  async function fallbackLive(job) {
    const api = window.MMO?.opencode;
    if (!api || typeof api.status !== 'function') return null;
    const absolute = await taskAbsolute(job);
    const payload = {
      jobId: job.id,
      taskFolder: absolute || job.taskFolder || '',
      repoPath: window.Repo?.status?.()?.path || Data.get()?.settings?.repo?.path || ''
    };
    if (!payload.taskFolder && !payload.repoPath) return null;
    try {
      const result = await api.status(payload);
      if (!result || result.ok === false) return null;
      const data = result.data || {};
      return { ok: true, data: { ...data, agentStatus: data.agentStatus || data.status || null } };
    } catch (error) {
      return null;
    }
  }

  async function requestLive(job) {
    if (!job) return null;
    const module = opencode();
    if (module && typeof module.refresh === 'function') {
      try {
        const result = await module.refresh(job.id);
        if (result && result.ok !== false) return normalizeLive(job, result);
      } catch (error) {}
    }
    const fallback = await fallbackLive(job);
    return fallback ? normalizeLive(job, fallback) : null;
  }

  function statTile({ key = '', icon, value, label, title, tone = '' }) {
    return `
      <div class="automation-live-stat ${tone}" ${key ? `data-live-stat="${key}"` : ''} title="${Utils.esc(title)}">
        <span class="automation-live-stat-icon">${Icons.svg(icon, 15)}</span>
        <strong>${Utils.esc(value)}</strong>
        <span class="automation-live-stat-label">${Utils.esc(label)}</span>
      </div>`;
  }

  function liveStatsMarkup(job, live) {
    const usage = live?.usage || mergedUsage(job, null);
    const cached = (Number(usage.cacheRead) || 0) + (Number(usage.cacheWrite) || 0);
    const steps = Number(live?.steps ?? job?.steps) || 0;
    return [
      statTile({
        icon: 'arrow-down',
        value: Utils.formatNumber(usage.input || 0),
        label: 'إدخال',
        title: 'توكنات الإدخال المرسلة إلى الموديل.'
      }),
      statTile({
        icon: 'arrow-up',
        value: Utils.formatNumber(usage.output || 0),
        label: 'إخراج',
        title: 'توكنات الإخراج التي أنتجها الموديل.'
      }),
      statTile({
        icon: 'database',
        value: Utils.formatNumber(cached),
        label: 'كاش',
        title: 'التوكنات المقروءة من الكاش والمكتوبة إليه.'
      }),
      statTile({
        icon: 'dollar',
        value: formatCost(usage.costUSD),
        label: 'التكلفة',
        title: 'التكلفة التقديرية بالدولار لكل استدعاءات الموديل.',
        tone: 'is-cost'
      }),
      statTile({
        icon: 'activity',
        value: Utils.formatNumber(steps),
        label: 'خطوة',
        title: 'عدد الخطوات التي نفّذها الوكيل حتى الآن.'
      }),
      statTile({
        key: 'duration',
        icon: 'timer',
        value: Views.formatDuration(jobDuration(job)),
        label: 'المدة',
        title: 'الوقت المنقضي منذ بدء التشغيل.'
      })
    ].join('');
  }

  function renderLiveStats(layer, job, live) {
    const host = layer ? layer.querySelector('[data-live-stats]') : null;
    if (!host) return;
    const markup = liveStatsMarkup(job, live);
    if (host.__liveKey === markup) return;
    host.__liveKey = markup;
    host.innerHTML = markup;
  }

  function sessionMarkup(job, live) {
    const id = firstText(live?.sessionID, sessionIds.get(job?.id), job?.sessionID);
    if (!id) return '';
    return `
      <span class="automation-session-label">${Icons.svg('hash', 14)}<span>معرف الجلسة</span></span>
      <code class="automation-session-value" dir="ltr">${Utils.esc(shortSession(id))}</code>
      <button class="icon-btn xs" type="button" data-action="job-copy-session" data-job-id="${Utils.esc(job.id)}" title="نسخ معرف الجلسة" aria-label="نسخ معرف الجلسة">${Icons.svg('copy', 14)}</button>`;
  }

  function renderSession(layer, job, live) {
    const host = layer ? layer.querySelector('[data-live-session]') : null;
    if (!host) return;
    const markup = sessionMarkup(job, live);
    if (host.__liveKey === markup) return;
    host.__liveKey = markup;
    host.hidden = !markup;
    host.innerHTML = markup;
  }

  function outputsMarkup(job, live) {
    const outputs = Array.isArray(live?.outputs) ? live.outputs : [];
    if (!outputs.length) return '';
    const chips = outputs.map((path) => `
      <button class="automation-output-chip" type="button" data-action="open-job-output" data-task-id="${Utils.esc(job.taskId)}" title="${Utils.esc(path)}">
        ${Icons.svg('file', 13)}<span dir="ltr">${Utils.esc(path)}</span>
      </button>`).join('');
    return `<span class="automation-outputs-title">${Icons.svg('folder-open', 13)}<span>المخرجات</span></span><div class="automation-outputs-list">${chips}</div>`;
  }

  function renderOutputs(layer, job, live) {
    const host = layer ? layer.querySelector('[data-live-outputs]') : null;
    if (!host) return;
    const markup = outputsMarkup(job, live);
    if (host.__liveKey === markup) return;
    host.__liveKey = markup;
    host.hidden = !markup;
    host.innerHTML = markup;
  }

  function renderBlocked(layer, live) {
    const host = layer ? layer.querySelector('[data-live-blocked]') : null;
    if (!host) return;
    if (live?.state !== 'blocked') {
      if (host.hidden) return;
      host.hidden = true;
      host.__liveKey = '';
      host.innerHTML = '';
      return;
    }
    const question = String(live.message || '').trim() || 'أوقف الوكيل العمل وينتظر ردًا منك على سؤال لم يُكتب بعد.';
    const markup = `
      ${Icons.svg('alert', 18)}
      <div>
        <strong>الوكيل ينتظر قرارك</strong>
        <p>${Utils.esc(question)}</p>
        <span class="automation-blocked-hint">التشغيل متوقف حتى تردّ على السؤال.</span>
      </div>`;
    if (host.__liveKey === markup) return;
    host.__liveKey = markup;
    host.hidden = false;
    host.innerHTML = markup;
  }

  function errorMarkup(job, live) {
    const message = live?.state === 'blocked' ? '' : String(job?.error || '').trim();
    return message ? `${Icons.svg('alert', 16)}<p>${Utils.esc(message)}</p>` : '';
  }

  function renderError(layer, job, live) {
    const host = layer ? layer.querySelector('[data-live-error]') : null;
    if (!host) return;
    const markup = errorMarkup(job, live);
    if (host.__liveKey === markup) return;
    host.__liveKey = markup;
    host.hidden = !markup;
    host.innerHTML = markup;
  }

  function footerMarkup(job, active) {
    const jobId = Utils.esc(job.id);
    const taskId = Utils.esc(job.taskId);
    const hasSession = Boolean(sessionIds.get(job.id) || job.sessionID);
    return `
      <button class="icon-btn" type="button" data-action="job-refresh" data-job-id="${jobId}" title="تحديث الآن" aria-label="تحديث الآن">${Icons.svg('refresh', 17)}</button>
      ${active ? `<button class="icon-btn" type="button" data-action="job-ping" data-job-id="${jobId}" title="اسأل الوكيل عن موقعه" aria-label="اسأل الوكيل عن موقعه">${Icons.svg('send', 17)}</button>` : ''}
      ${active
        ? `<button class="icon-btn is-danger" type="button" data-action="cancel-automation" data-job-id="${jobId}" title="إيقاف التشغيل" aria-label="إيقاف التشغيل">${Icons.svg('stop', 17)}</button>`
        : `<button class="icon-btn" type="button" data-action="job-restart" data-job-id="${jobId}" title="إعادة التشغيل" aria-label="إعادة التشغيل">${Icons.svg('power', 17)}</button>`}
      <button class="icon-btn" type="button" data-action="open-job-opencode" data-task-id="${taskId}" title="مجلد opencode" aria-label="مجلد opencode">${Icons.svg('terminal', 17)}</button>
      ${hasSession ? `<button class="icon-btn" type="button" data-action="job-copy-session" data-job-id="${jobId}" title="نسخ معرف الجلسة" aria-label="نسخ معرف الجلسة">${Icons.svg('copy', 17)}</button>` : ''}
      <span class="automation-footer-spacer"></span>
      <button class="btn primary" type="button" data-close-modal>إغلاق</button>`;
  }

  function renderFooterActions(layer, job) {
    const host = layer ? layer.querySelector('[data-live-footer]') : null;
    if (!host) return;
    host.innerHTML = footerMarkup(job, isActiveJob(job));
  }

  function metaRow(icon, label, valueHtml) {
    return `
      <div class="automation-meta-row">
        <dt>${Icons.svg(icon, 14)}<span>${Utils.esc(label)}</span></dt>
        <dd>${valueHtml}</dd>
      </div>`;
  }

  function jobDetailBody(job, live) {
    const active = isActiveJob(job);
    const percent = percentOf(live.percent);
    const model = job.model || '';
    const started = job.startedAt ? Utils.fmtDateTime(job.startedAt) : '';
    const ended = job.endedAt ? Utils.fmtDateTime(job.endedAt) : '';
    const session = sessionMarkup(job, live);
    const error = errorMarkup(job, live);
    const outputs = outputsMarkup(job, live);
    const eta = Math.max(0, Math.round(Number(live.etaSeconds) || 0));
    return `
      <div class="automation-job" data-job-detail>
        <section class="automation-job-hero ${active ? 'is-live' : ''}">
          <div class="automation-hero-top">
            <span data-live-chip>${stateChip(liveState(job, live))}</span>
            <span class="automation-hero-updated" data-live-updated>${live.updatedAt ? `${Icons.svg('refresh', 11)}<span>${Utils.esc(Utils.relativeTime(live.updatedAt))}</span>` : ''}</span>
          </div>
          <h3 class="automation-hero-phase" data-live-phase>${Utils.esc(phaseText(job, live))}</h3>
          <div class="automation-hero-progress">
            <span class="automation-hero-bar" data-live-bar>${Views.progressBar(percent, active ? 'var(--accent)' : (job.status === 'failed' ? 'var(--red)' : 'var(--green)'))}</span>
            <span class="automation-hero-percent" data-live-percent>${Utils.formatNumber(percent)}%</span>
          </div>
          <div class="automation-hero-meta">
            <span data-live-elapsed>${Icons.svg('timer', 12)}<span title="الوقت المنقضي">${Utils.esc(elapsedText(jobDuration(job)))}</span></span>
            <span data-live-eta ${active ? '' : 'hidden'}>${Icons.svg('clock', 12)}<span title="الوقت المتبقي المتوقع">${eta > 0 ? `متبقٍ ${Utils.esc(etaText(eta))}` : 'جارٍ…'}</span></span>
            <span data-live-steps>${Icons.svg('activity', 12)}<span title="عدد الخطوات">${Utils.formatNumber(live.steps || 0)}</span></span>
            <span data-live-ended ${!active && job.endedAt ? '' : 'hidden'}>${Icons.svg('flag', 12)}<span>${job.endedAt ? `انتهى ${Utils.esc(Utils.relativeTime(job.endedAt))}` : ''}</span></span>
          </div>
        </section>
        <div class="automation-live-stats" data-live-stats>${liveStatsMarkup(job, live)}</div>
        <dl class="automation-meta-list">
          ${metaRow('tasks', 'المهمة', `<strong>${Utils.esc(job.taskTitle || 'مهمة محذوفة')}</strong>`)}
          ${metaRow('layers', 'المجموعة', Utils.esc(job.groupName || 'بدون مجموعة'))}
          ${metaRow('cpu', 'الموديل', `<span class="automation-meta-model" dir="ltr" title="${Utils.esc(model)}">${Utils.esc(model || '—')}</span>`)}
          ${metaRow('terminal', 'البرومت', Utils.esc(job.promptName || 'برومت مخصص'))}
          ${metaRow('calendar', 'البدء', Utils.esc(started || '—'))}
          ${metaRow('clock', 'الانتهاء', Utils.esc(active && !ended ? 'لم ينتهِ بعد' : (ended || '—')))}
        </dl>
        <div class="automation-session-row" data-live-session ${session ? '' : 'hidden'}>${session}</div>
        <div class="automation-outputs" data-live-outputs ${outputs ? '' : 'hidden'}>${outputs}</div>
        <div class="automation-blocked-banner" data-live-blocked hidden></div>
        <div class="automation-job-error" data-live-error ${error ? '' : 'hidden'}>${error}</div>
        <details class="automation-log-details">
          <summary class="automation-log-summary">
            <span>${Icons.svg('terminal', 13)}<span>السجل${active ? ' المباشر' : ''}</span></span>
            <span class="automation-log-hint">اضغط للعرض</span>
          </summary>
          <div class="automation-log-wrap">
            <div class="automation-log-head">
              <span>${Icons.svg('terminal', 13)} مخرجات opencode</span>
              <button type="button" class="icon-btn xs" data-log-refresh title="تحديث السجل" aria-label="تحديث السجل">${Icons.svg('refresh', 13)}</button>
            </div>
            <pre class="automation-log" data-job-log>جارٍ تحميل السجل…</pre>
          </div>
        </details>
      </div>`;
  }

  function jobDetailFooter(job) {
    return `
      <div class="automation-ping-row" data-ping-row hidden>
        <label class="automation-ping-label" for="automation-ping-text">${Icons.svg('message', 15)}<span>رسالة إلى الوكيل</span></label>
        <textarea id="automation-ping-text" class="automation-ping-input" rows="2" maxlength="800" placeholder="اكتب ما تريد أن يخبرك به الوكيل أو ما يجب أن يفعله الآن.">${Utils.esc(PING_MESSAGE)}</textarea>
        <div class="automation-ping-actions">
          <button class="btn ghost sm" type="button" data-action="job-ping-cancel">إلغاء</button>
          <button class="btn primary sm" type="button" data-action="job-ping-send" data-job-id="${Utils.esc(job.id)}">${Icons.svg('send', 15)} إرسال</button>
        </div>
      </div>
      <div class="automation-footer-actions" data-live-footer>${footerMarkup(job, isActiveJob(job))}</div>`;
  }

  function updateElapsed(layer, job) {
    if (!layer) return;
    const seconds = jobDuration(job);
    setHtml(layer, '[data-live-elapsed]', `${Icons.svg('timer', 12)}<span title="الوقت المنقضي">${Utils.esc(elapsedText(seconds))}</span>`);
    const tile = layer.querySelector('[data-live-stat="duration"] strong');
    if (tile) tile.textContent = Views.formatDuration(seconds);
  }

  /** يحدّث كل مناطق العرض الحي داخل النافذة دون إعادة رسم الجدول أو النافذة. */
  function applyLive(session) {
    const layer = session?.layer;
    const job = session?.job;
    const live = session?.live || normalizeLive(job, null);
    if (!layer || !layer.isConnected || !job) return;
    const active = isActiveJob(job);
    const percent = percentOf(live.percent);

    setHtml(layer, '[data-live-chip]', stateChip(liveState(job, live)));
    setText(layer, '[data-live-phase]', phaseText(job, live));
    setText(layer, '[data-live-percent]', `${Utils.formatNumber(percent)}%`);
    setHtml(layer, '[data-live-updated]', live.updatedAt
      ? `${Icons.svg('refresh', 11)}<span>${Utils.esc(Utils.relativeTime(live.updatedAt))}</span>`
      : '');

    const bar = layer.querySelector('[data-live-bar] .progress');
    if (bar) {
      bar.setAttribute('aria-valuenow', String(percent));
      const fill = bar.firstElementChild;
      if (fill) {
        fill.style.width = `${percent}%`;
        fill.style.background = active ? 'var(--accent)' : (job.status === 'failed' ? 'var(--red)' : 'var(--green)');
      }
    }

    updateElapsed(layer, job);
    const eta = Math.max(0, Math.round(Number(live.etaSeconds) || 0));
    setHtml(layer, '[data-live-eta]', active
      ? `${Icons.svg('clock', 12)}<span title="الوقت المتبقي المتوقع">${eta > 0 ? `متبقٍ ${Utils.esc(etaText(eta))}` : 'جارٍ…'}</span>`
      : '');
    const etaNode = layer.querySelector('[data-live-eta]');
    if (etaNode) etaNode.hidden = !active;
    setHtml(layer, '[data-live-steps]', `${Icons.svg('activity', 12)}<span title="عدد الخطوات">${Utils.formatNumber(live.steps || 0)}</span>`);
    const endedNode = layer.querySelector('[data-live-ended]');
    if (endedNode) {
      endedNode.hidden = active || !job.endedAt;
      setHtml(layer, '[data-live-ended]', job.endedAt
        ? `${Icons.svg('flag', 12)}<span>انتهى ${Utils.esc(Utils.relativeTime(job.endedAt))}</span>`
        : '');
    }

    const hero = layer.querySelector('.automation-job-hero');
    if (hero) hero.classList.toggle('is-live', active);

    renderBlocked(layer, live);
    renderLiveStats(layer, job, live);
    renderSession(layer, job, live);
    renderOutputs(layer, job, live);
    renderError(layer, job, live);

    if (session.footerActive !== active || session.footerSession !== Boolean(live.sessionID)) {
      session.footerActive = active;
      session.footerSession = Boolean(live.sessionID);
      renderFooterActions(layer, job);
    }
  }

  function createDetailController(job, layer) {
    const initialLive = normalizeLive(job, null);
    const session = {
      job,
      layer,
      live: initialLive,
      footerActive: isActiveJob(job),
      footerSession: Boolean(initialLive.sessionID),
      closed: false,
      busy: false,
      timer: null,
      ticker: null,
      logCleanup: null
    };

    const syncJob = () => {
      const fresh = Data.automation(job.id);
      if (fresh) session.job = fresh;
      return session.job;
    };

    function stop() {
      if (session.timer) {
        clearInterval(session.timer);
        session.timer = null;
      }
      if (session.ticker) {
        clearInterval(session.ticker);
        session.ticker = null;
      }
    }

    async function poll(manual = false) {
      if (session.closed || !layer.isConnected) return null;
      if (session.busy) return null;
      session.busy = true;
      syncJob();
      const live = await requestLive(session.job);
      session.busy = false;
      if (session.closed || !layer.isConnected) return null;
      if (live) {
        session.live = live;
        syncJob();
        applyLive(session);
        if (!isActiveJob(session.job)) {
          stop();
          session.live = session.live || live;
        }
      } else if (manual) {
        applyLive(session);
      }
      return live;
    }

    session.refresh = poll;
    session.stop = stop;

    if (isActiveJob(job)) {
      session.ticker = setInterval(() => {
        if (session.closed || !layer.isConnected) {
          stop();
          return;
        }
        updateElapsed(layer, session.job);
      }, TICK_MS);
      session.timer = setInterval(() => {
        if (session.closed || !layer.isConnected) {
          stop();
          return;
        }
        syncJob();
        if (!isActiveJob(session.job)) {
          poll(true).then(() => stop());
          return;
        }
        poll(false);
      }, LIVE_POLL_MS);
    }

    // قراءة أولى فورية (تجلب المخرجات للمنتهية وحالة status.json للجارية)
    poll(false);
    return session;
  }

  function openOwnJobDetail(job) {
    const live = normalizeLive(job, null);
    let controller = null;
    detailSession = null;
    App.openModal({
      title: 'تفاصيل التشغيل',
      subtitle: job.taskTitle || 'مهمة محذوفة',
      eyebrow: 'الأتمتة',
      body: jobDetailBody(job, live),
      footer: jobDetailFooter(job),
      size: 'lg',
      onMount: (layer) => {
        const logCleanup = bindLog(layer, job);
        controller = createDetailController(job, layer);
        controller.logCleanup = logCleanup;
        detailSession = controller;
        applyLive(controller);
      },
      onDismiss: () => {
        if (controller) {
          controller.stop();
          if (typeof controller.logCleanup === 'function') controller.logCleanup();
        }
        if (detailSession === controller) detailSession = null;
        controller = null;
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
    if (detailSession && detailSession.job.id === jobId) {
      detailSession.refresh(true);
    }
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

  // ------------------------------------------------------- live job actions
  function refreshJobLive(jobId) {
    const job = Data.automation(jobId);
    if (!job) return Promise.resolve(null);
    return requestLive(job).then((live) => {
      if (live && detailSession && detailSession.job.id === jobId) {
        detailSession.live = live;
        applyLive(detailSession);
      }
      return live;
    });
  }

  function copySessionId(jobId) {
    const job = Data.automation(jobId);
    const id = firstText(sessionIds.get(jobId), job?.sessionID);
    if (!id) {
      App.toast('لا يوجد معرّف جلسة لهذا التشغيل.', { type: 'info' });
      return;
    }
    copyText(id).then((ok) => {
      App.toast(ok ? 'تم نسخ معرف الجلسة.' : 'تعذر النسخ من هذا المتصفح.', {
        type: ok ? 'success' : 'warning',
        icon: ok ? 'copy' : 'alert'
      });
    });
  }

  async function sendPing(jobId, message) {
    const job = Data.automation(jobId);
    if (!job) {
      App.toast('لم يتم العثور على هذا التشغيل.', { type: 'error' });
      return;
    }
    const module = opencode();
    if (!module || typeof module.ping !== 'function') {
      App.toast('إرسال رسالة للوكيل يحتاج تطبيق سطح المكتب المحدّث.', { type: 'warning', duration: 4600 });
      return;
    }
    const text = String(message || '').trim() || PING_MESSAGE;
    let result = null;
    try {
      result = await module.ping(jobId, text);
    } catch (error) {
      App.toast('تعذر إرسال الرسالة إلى الوكيل.', { type: 'error' });
      return;
    }
    // Opencode.ping يعرض تنبيه النجاح/الفشل بنفسه، فلا نكرره هنا.
    if (result && result.ok === false) return;
    const row = document.querySelector('[data-ping-row]');
    if (row) row.hidden = true;
    setTimeout(() => {
      refreshJobLive(jobId);
    }, 1500);
  }

  async function restartJob(jobId) {
    const job = Data.automation(jobId);
    if (!job) {
      App.toast('لم يتم العثور على هذا التشغيل.', { type: 'error' });
      return;
    }
    if (isActiveJob(job)) {
      App.toast('التشغيل ما زال جاريًا. أوقفه أولًا ثم أعد تشغيله.', { type: 'warning' });
      return;
    }
    const module = opencode();
    if (!module || typeof module.restart !== 'function') {
      App.toast('إعادة التشغيل تحتاج تطبيق سطح المكتب المحدّث.', { type: 'warning', duration: 4600 });
      return;
    }
    const ok = await App.confirm({
      title: 'إعادة تشغيل الأتمتة',
      message: `سيبدأ تشغيل جديد لمهمة «${job.taskTitle || 'المهمة'}» بنفس البرومت والموديل، وقد تزيد التكلفة.`,
      confirmText: 'إعادة التشغيل'
    }).catch(() => false);
    if (!ok) return;

    let result = null;
    try {
      result = await module.restart(jobId);
    } catch (error) {
      App.toast('تعذر إعادة تشغيل الأتمتة.', { type: 'error' });
      return;
    }
    if (result && result.ok === false) {
      App.toast(result.message || 'تعذر إعادة تشغيل الأتمتة.', { type: 'error' });
      return;
    }
    const newJobId = result?.job?.id || result?.data?.job?.id || jobId;
    // Opencode.restart يعرض تنبيه البدء بنفسه
    const session = detailSession;
    if (session) session.stop();
    if (session && session.layer && session.layer.isConnected) {
      App.closeModal();
    }
    setTimeout(() => {
      App.refresh();
      openJobDetail(newJobId);
    }, 320);
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
      case 'job-refresh': {
        const jobId = element.dataset?.jobId;
        const session = detailSession && detailSession.job.id === jobId ? detailSession : null;
        const run = session ? session.refresh(true) : refreshJobLive(jobId);
        Promise.resolve(run).then((live) => {
          if (live) {
            App.toast('تم تحديث حالة التشغيل.', { type: 'success', icon: 'refresh', duration: 1700 });
          } else {
            App.toast('تعذر قراءة حالة التشغيل الآن.', { type: 'warning', duration: 2600 });
          }
        });
        return true;
      }
      case 'job-copy-session':
        copySessionId(element.dataset?.jobId);
        return true;
      case 'job-ping': {
        const row = element.closest('.modal-footer, .modal-sheet')?.querySelector('[data-ping-row]')
          || document.querySelector('[data-ping-row]');
        if (!row) return true;
        const willOpen = row.hidden;
        row.hidden = !willOpen;
        if (willOpen) {
          const input = row.querySelector('textarea');
          if (input) {
            input.focus({ preventScroll: true });
            input.setSelectionRange(input.value.length, input.value.length);
          }
        }
        return true;
      }
      case 'job-ping-cancel': {
        const row = element.closest('[data-ping-row]');
        if (row) row.hidden = true;
        return true;
      }
      case 'job-ping-send': {
        const row = element.closest('[data-ping-row]');
        const text = row?.querySelector('textarea')?.value?.trim() || PING_MESSAGE;
        sendPing(element.dataset?.jobId, text);
        return true;
      }
      case 'job-restart':
        restartJob(element.dataset?.jobId);
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
