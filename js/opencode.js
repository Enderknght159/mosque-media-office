const Opencode = (() => {
  const LIVE_STATES = ['running', 'queued'];
  const FINISHED_STATES = ['done', 'failed', 'cancelled', 'interrupted'];
  const REFRESH_GAP = 800;
  const LOG_TAIL = 200;

  let lastHealthState = null;
  let attached = false;
  let refreshTimer = null;
  let lastRefreshAt = 0;
  const lastEvents = new Map();

  // ---------------------------------------------------------------- helpers

  function mmo() {
    try {
      return typeof window !== 'undefined' ? window.MMO || null : null;
    } catch (error) {
      return null;
    }
  }

  function api() {
    try {
      return mmo()?.opencode || null;
    } catch (error) {
      return null;
    }
  }

  function available() {
    return Boolean(api());
  }

  function aiSettings() {
    const fallback = {
      lastModel: '',
      opencodePath: '',
      filter: { mode: 'all', allowed: [], blocked: [] },
      modelsCache: { at: null, list: [] }
    };
    try {
      const current = typeof Data !== 'undefined' && Data.get ? Data.get() : null;
      const ai = current?.settings?.ai;
      if (!ai || typeof ai !== 'object') return fallback;
      const filter = ai.filter && typeof ai.filter === 'object' ? ai.filter : {};
      const cache = ai.modelsCache && typeof ai.modelsCache === 'object' ? ai.modelsCache : {};
      return {
        lastModel: String(ai.lastModel || ''),
        opencodePath: String(ai.opencodePath || ''),
        filter: {
          mode: filter.mode === 'allow' ? 'allow' : 'all',
          allowed: Array.isArray(filter.allowed) ? filter.allowed.map(String) : [],
          blocked: Array.isArray(filter.blocked) ? filter.blocked.map(String) : []
        },
        modelsCache: {
          at: cache.at || null,
          list: Array.isArray(cache.list) ? cache.list.map(String) : []
        }
      };
    } catch (error) {
      return fallback;
    }
  }

  function normalizedList(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const result = [];
    list.forEach((item) => {
      const value = String(item || '').trim();
      if (!value || value.length > 140 || seen.has(value)) return;
      seen.add(value);
      result.push(value);
    });
    return result;
  }

  function toast(message, options = {}) {
    try {
      if (typeof App !== 'undefined' && App.toast) App.toast(message, options);
    } catch (error) {}
  }

  function setAiSettings(patch) {
    try {
      if (typeof Data !== 'undefined' && Data.setAiSettings) return Data.setAiSettings(patch);
    } catch (error) {}
    return null;
  }

  function currentJob(jobId) {
    try {
      return typeof Data !== 'undefined' && Data.automation ? Data.automation(jobId) : null;
    } catch (error) {
      return null;
    }
  }

  function isTypingInModal() {
    try {
      if (typeof document === 'undefined') return false;
      const layer = document.querySelector('.modal-layer');
      if (!layer) return false;
      const active = document.activeElement;
      if (!active || !active.closest || !active.closest('.modal-layer')) return false;
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
    } catch (error) {
      return false;
    }
  }

  function flushRefresh() {
    refreshTimer = null;
    const wait = REFRESH_GAP - (Date.now() - lastRefreshAt);
    if (wait > 0) {
      refreshTimer = setTimeout(flushRefresh, wait);
      return;
    }
    lastRefreshAt = Date.now();
    if (isTypingInModal()) return;
    try {
      if (typeof App !== 'undefined' && App.refresh) App.refresh();
    } catch (error) {}
  }

  /** يحمي الواجهة من إعادة الرسم المتكرر أثناء تدفق الأحداث (٨٠٠ms حد أدنى). */
  function scheduleRefresh() {
    if (refreshTimer) return;
    const wait = Math.max(0, REFRESH_GAP - (Date.now() - lastRefreshAt));
    refreshTimer = setTimeout(() => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flushRefresh);
      else flushRefresh();
    }, wait);
  }

  function repoSettings() {
    try {
      const repo = typeof Data !== 'undefined' && Data.get ? Data.get()?.settings?.repo : null;
      return repo && typeof repo === 'object' ? repo : null;
    } catch (error) {
      return null;
    }
  }

  function repoStatus() {
    try {
      if (typeof Repo !== 'undefined' && Repo.status) {
        const status = Repo.status();
        if (status && typeof status === 'object') return status;
      }
    } catch (error) {}
    const repo = repoSettings();
    return { linked: Boolean(repo?.path), path: repo?.path || '', exists: Boolean(repo?.path) };
  }

  async function resolveAbsolute(taskId, relativeFolder, repoPath) {
    try {
      if (typeof Repo !== 'undefined' && typeof Repo.absolute === 'function') {
        const absolute = await Repo.absolute(taskId);
        if (absolute) return String(absolute);
      }
    } catch (error) {}
    try {
      if (typeof Repo !== 'undefined' && typeof Repo.abs === 'function') {
        const absolute = Repo.abs(taskId);
        if (absolute) return String(absolute);
      }
    } catch (error) {}
    try {
      const result = await mmo()?.repo?.pathFor?.({ repoPath, relPath: relativeFolder });
      if (result?.ok && result.data?.absolute) return String(result.data.absolute);
    } catch (error) {}
    return '';
  }

  // ---------------------------------------------------------------- health

  function healthResult(state, ok) {
    // يعيد الغلاف {ok,data} (كما في عقد IPC) مع الحقول مسطّحة للتوافق مع بقية الواجهة.
    return { ok: Boolean(ok), data: state, ...state };
  }

  async function health({ silent = false } = {}) {
    if (!available()) {
      lastHealthState = {
        available: false,
        command: '',
        version: '',
        checkedAt: new Date().toISOString(),
        message: 'الأتمتة تحتاج تطبيق سطح المكتب.'
      };
      if (!silent) toast(lastHealthState.message, { type: 'info' });
      return healthResult(lastHealthState, false);
    }

    try {
      const result = await api().health({ opencodePath: aiSettings().opencodePath || '' });
      const data = result?.ok && result.data
        ? result.data
        : {
          available: false,
          command: '',
          version: '',
          checkedAt: new Date().toISOString(),
          message: result?.message || 'تعذر فحص opencode على هذا الجهاز.'
        };
      lastHealthState = {
        available: Boolean(data.available),
        command: String(data.command || ''),
        version: String(data.version || ''),
        checkedAt: String(data.checkedAt || new Date().toISOString()),
        message: String(data.message || '')
      };
      if (!silent) {
        if (lastHealthState.available) {
          toast(
            lastHealthState.version
              ? `opencode جاهز (الإصدار ${lastHealthState.version}).`
              : 'opencode جاهز للاستخدام.',
            { type: 'success', icon: 'check-circle' }
          );
        } else {
          toast(lastHealthState.message || 'opencode غير متاح.', { type: 'warning', duration: 5200 });
        }
      }
      return healthResult(lastHealthState, lastHealthState.available);
    } catch (error) {
      lastHealthState = {
        available: false,
        command: '',
        version: '',
        checkedAt: new Date().toISOString(),
        message: 'تعذر فحص opencode. حاول مرة أخرى.'
      };
      if (!silent) toast(lastHealthState.message, { type: 'error' });
      return healthResult(lastHealthState, false);
    }
  }

  function lastHealth() {
    return lastHealthState;
  }

  // ---------------------------------------------------------------- models

  function allowedModels(all) {
    const list = normalizedList(all);
    const filter = aiSettings().filter;
    const blocked = new Set(filter.blocked);
    if (filter.mode === 'allow') {
      const allowed = new Set(filter.allowed);
      return list.filter((model) => allowed.has(model) && !blocked.has(model));
    }
    return list.filter((model) => !blocked.has(model));
  }

  function isModelAllowed(model) {
    const value = String(model || '').trim();
    if (!value) return false;
    const filter = aiSettings().filter;
    if (filter.blocked.includes(value)) return false;
    if (filter.mode === 'allow') return filter.allowed.includes(value);
    return true;
  }

  async function models({ refresh = false } = {}) {
    const cached = normalizedList(aiSettings().modelsCache.list);
    if (!available()) {
      return { all: cached, allowed: allowedModels(cached), source: 'cache', offline: true };
    }

    try {
      const result = await api().models({ opencodePath: aiSettings().opencodePath || '', refresh: Boolean(refresh) });
      const list = result?.ok && Array.isArray(result.data?.models) ? normalizedList(result.data.models) : [];
      if (list.length) {
        setAiSettings({
          modelsCache: {
            at: result.data?.at || new Date().toISOString(),
            list
          }
        });
        return {
          all: list,
          allowed: allowedModels(list),
          source: result.data?.source === 'cache' ? 'cache' : 'live'
        };
      }
      if (cached.length) {
        return {
          all: cached,
          allowed: allowedModels(cached),
          source: 'cache',
          message: result?.message || 'تعذر تحديث قائمة الموديلات، تُعرض القائمة المحفوظة.'
        };
      }
      return {
        all: [],
        allowed: [],
        source: 'live',
        message: result?.message || 'لم تُرجع opencode أي موديلات.'
      };
    } catch (error) {
      return {
        all: cached,
        allowed: allowedModels(cached),
        source: 'cache',
        message: cached.length ? 'تعذر تحديث الموديلات، تُعرض القائمة المحفوظة.' : 'تعذر جلب الموديلات من opencode.'
      };
    }
  }

  // ---------------------------------------------------------------- start / cancel

  async function start({ taskId, promptId = null, promptName = '', model = '', notes = '', promptText = '' } = {}) {
    if (!available()) return { ok: false, message: 'الأتمتة تحتاج تطبيق سطح المكتب.' };
    if (typeof Data === 'undefined' || !Data.get()) return { ok: false, message: 'لا توجد بيانات جاهزة بعد.' };

    const task = (() => {
      try {
        return Data.findTask(taskId);
      } catch (error) {
        return null;
      }
    })();
    if (!task) return { ok: false, message: 'المهمة غير موجودة.' };

    const archived = task.archived || {};
    if (archived.sources || archived.opencode) {
      return { ok: false, message: 'هذه المهمة مؤرشفة جزئيًا أو كليًا. استعد المصادر وopencode من المستودع قبل التشغيل.' };
    }

    const repo = repoStatus();
    if (!repo.linked || !repo.path) {
      return { ok: false, message: 'اربط مستودعًا من الإعدادات قبل تشغيل الأتمتة.' };
    }

    const chosenModel = String(model || '').trim() || aiSettings().lastModel;
    if (!chosenModel) return { ok: false, message: 'اختر موديلًا لتشغيل الأتمتة.' };
    if (!isModelAllowed(chosenModel)) {
      return { ok: false, message: 'الموديل المختار غير مسموح. اختر موديلًا متاحًا من القائمة.' };
    }

    let active = null;
    try {
      active = Data.activeAutomation(taskId);
    } catch (error) {}
    if (active) {
      return { ok: false, message: 'هناك أتمتة جارية لهذه المهمة بالفعل. انتظر انتهاءها أو ألغِها أولًا.' };
    }

    const text = String(promptText || '').trim();
    if (!text) return { ok: false, message: 'نص البرومت فارغ. اكتب تعليمات الأتمتة أولًا.' };

    let relativeFolder = '';
    try {
      if (typeof Repo !== 'undefined' && typeof Repo.ensureTask === 'function') {
        relativeFolder = String((await Repo.ensureTask(taskId)) || '').trim();
      }
    } catch (error) {}
    if (!relativeFolder) relativeFolder = String(task.folder || '').trim();
    if (!relativeFolder) return { ok: false, message: 'تعذر تجهيز مجلد المهمة. أعد مزامنة المستودع ثم حاول مرة أخرى.' };

    const repoPath = String(repo.path || '').trim();
    const absolute = await resolveAbsolute(taskId, relativeFolder, repoPath);

    let prompt = null;
    try {
      prompt = promptId && Data.findPrompt ? Data.findPrompt(promptId) : null;
    } catch (error) {
      prompt = null;
    }
    const resolvedPromptName = String(promptName || prompt?.name || '').trim();
    const groupName = (() => {
      try {
        return Data.findGroup(task.groupId)?.name || '';
      } catch (error) {
        return '';
      }
    })();

    let job = null;
    try {
      job = Data.startAutomation({
        taskId,
        promptId: promptId || null,
        promptName: resolvedPromptName,
        model: chosenModel,
        notes: String(notes || ''),
        promptText: text,
        taskFolder: relativeFolder
      });
    } catch (error) {
      job = null;
    }
    if (!job) return { ok: false, message: 'تعذر إنشاء سجل الأتمتة.' };

    try {
      const result = await api().start({
        jobId: job.id,
        taskId,
        taskTitle: task.title || '',
        groupName,
        repoPath,
        taskFolder: relativeFolder,
        model: chosenModel,
        prompt: text,
        notes: String(notes || ''),
        opencodePath: aiSettings().opencodePath || '',
        absolute
      });

      if (!result?.ok) {
        const message = result?.message || 'تعذر تشغيل opencode.';
        try {
          Data.finishAutomation(job.id, { status: 'failed', error: message });
        } catch (error) {}
        scheduleRefresh();
        return { ok: false, message };
      }

      Data.updateAutomation(job.id, { status: 'running', phase: 'بدء التشغيل', taskFolder: relativeFolder });
      setAiSettings({ lastModel: chosenModel });
      scheduleRefresh();
      return { ok: true, job: currentJob(job.id) || job };
    } catch (error) {
      const message = error?.message ? `تعذر تشغيل opencode: ${error.message}` : 'تعذر تشغيل opencode.';
      try {
        Data.finishAutomation(job.id, { status: 'failed', error: message });
      } catch (finishError) {}
      scheduleRefresh();
      return { ok: false, message };
    }
  }

  async function cancel(jobId) {
    if (!available()) return { ok: false, message: 'الأتمتة تحتاج تطبيق سطح المكتب.' };
    if (!jobId) return { ok: false, message: 'معرّف المهمة مطلوب.' };
    try {
      const result = await api().cancel({ jobId });
      if (!result?.ok) return { ok: false, message: result?.message || 'تعذر إلغاء الأتمتة.' };
      if (!result.data?.cancelled) {
        try {
          Data.finishAutomation(jobId, { status: 'interrupted', error: 'لا توجد عملية حية لهذه الأتمتة.' });
        } catch (error) {}
        scheduleRefresh();
        return { ok: false, message: 'لا توجد عملية حية لهذه الأتمتة.' };
      }
      return { ok: true, cancelled: true };
    } catch (error) {
      return { ok: false, message: 'تعذر إلغاء الأتمتة.' };
    }
  }

  // ---------------------------------------------------------------- refresh / ping / restart

  /**
   * يقرأ حالة الوكيل من القرص (status.json + run-*.json + آخر السجل) دون أي كتابة.
   * صامت افتراضيًا لأن الاستدعاء المتكرر (polling) لا يجب أن يزعج المستخدم.
   * يعيد { ok:true, data } أو null عند الفشل.
   */
  async function refresh(jobId, { silent = true } = {}) {
    if (!available()) {
      if (!silent) toast('الأتمتة تحتاج تطبيق سطح المكتب.', { type: 'info' });
      return null;
    }
    if (!jobId) return null;

    const job = currentJob(jobId);
    const taskId = String(job?.taskId || '').trim();
    let absolute = '';
    try {
      if (taskId && typeof Repo !== 'undefined' && typeof Repo.abs === 'function') {
        absolute = String(Repo.abs(taskId) || '');
      }
    } catch (error) {
      absolute = '';
    }

    const repoPath = String(repoStatus().path || '');
    const taskFolder = String(job?.taskFolder || '').trim() || absolute;

    try {
      const result = await api().refresh({ jobId, taskFolder, repoPath, absolute });
      if (!result?.ok) {
        if (!silent) toast(result?.message || 'تعذر تحديث حالة الوكيل.', { type: 'error' });
        return null;
      }
      return { ok: true, data: result.data || null };
    } catch (error) {
      if (!silent) toast('تعذر تحديث حالة الوكيل.', { type: 'error' });
      return null;
    }
  }

  /** يرسل طلب تحديث/رسالة إلى جلسة الوكيل الحية. */
  async function ping(jobId, message = '') {
    if (!available()) {
      const text = 'الأتمتة تحتاج تطبيق سطح المكتب.';
      toast(text, { type: 'info' });
      return { ok: false, message: text };
    }
    if (!jobId) {
      const text = 'معرّف المهمة مطلوب.';
      toast(text, { type: 'warning' });
      return { ok: false, message: text };
    }

    try {
      const result = await api().ping({ jobId, message: String(message || '').slice(0, 4000) });
      if (!result?.ok) {
        const text = result?.message || 'تعذر إرسال الطلب إلى الوكيل.';
        toast(text, { type: 'error', duration: 5200 });
        return { ok: false, message: text };
      }
      toast('أُرسل الطلب إلى الوكيل.', { type: 'success', icon: 'check-circle' });
      return { ok: true, data: result.data || null };
    } catch (error) {
      const text = 'تعذر إرسال الطلب إلى الوكيل.';
      toast(text, { type: 'error' });
      return { ok: false, message: text };
    }
  }

  /** يعيد بناء معطيات التشغيل من سجل الأتمتة ويبدأ تشغيلًا جديدًا. */
  async function restart(jobId) {
    if (!available()) return { ok: false, message: 'الأتمتة تحتاج تطبيق سطح المكتب.' };
    const job = currentJob(jobId);
    if (!job) return { ok: false, message: 'سجل الأتمتة غير موجود.' };
    if (LIVE_STATES.includes(job.status) || activeForTask(job.taskId)) {
      return { ok: false, message: 'أوقف التشغيل الحالي أولًا ثم أعد التشغيل.' };
    }

    let promptText = String(job.promptText || '').trim();
    if (!promptText && job.promptId) {
      try {
        promptText = String(Data.findPrompt(job.promptId)?.content || '').trim();
      } catch (error) {
        promptText = '';
      }
    }

    const result = await start({
      taskId: job.taskId,
      promptId: job.promptId || null,
      promptName: job.promptName || '',
      model: job.model || '',
      notes: job.notes || '',
      promptText
    });

    if (!result?.ok) {
      toast(result?.message || 'تعذر إعادة التشغيل.', { type: 'error', duration: 5200 });
      return result || { ok: false, message: 'تعذر إعادة التشغيل.' };
    }
    toast('بدأ تشغيل جديد.', { type: 'success', icon: 'check-circle' });
    return result;
  }

  /** اشتراك بأحداث طلب التحديث (نص/خطأ/انتهاء). يعيد دالة إلغاء الاشتراك. */
  function onPing(callback) {
    if (typeof callback !== 'function') return () => {};
    const service = api();
    if (!service || typeof service.onPing !== 'function') return () => {};
    try {
      const off = service.onPing((payload) => {
        try {
          callback(payload);
        } catch (error) {}
      });
      return typeof off === 'function' ? off : () => {};
    } catch (error) {
      return () => {};
    }
  }

  // ---------------------------------------------------------------- attach

  function attach() {
    if (attached) return;
    const service = api();
    if (!service) return;
    attached = true;

    try {
      if (typeof service.onEvent === 'function') {
        service.onEvent((payload) => {
          if (!payload?.jobId) return;
          lastEvents.set(payload.jobId, payload.event || null);
          if (lastEvents.size > 200) {
            const oldest = lastEvents.keys().next().value;
            lastEvents.delete(oldest);
          }
        });
      }
    } catch (error) {}

    try {
      if (typeof service.onUpdate === 'function') {
        service.onUpdate((payload) => {
          if (!payload?.jobId) return;
          try {
            const record = currentJob(payload.jobId);
            if (record && !LIVE_STATES.includes(record.status)) return;
            const patch = { status: 'running' };
            if (Number.isFinite(Number(payload.progress))) patch.progress = Number(payload.progress);
            if (typeof payload.phase === 'string' && payload.phase) patch.phase = payload.phase;
            if (Number.isFinite(Number(payload.etaSeconds))) patch.etaSeconds = Number(payload.etaSeconds);
            if (Number.isFinite(Number(payload.steps))) patch.steps = Number(payload.steps);
            if (typeof payload.sessionID === 'string' && payload.sessionID) patch.sessionID = payload.sessionID;
            if (payload.usage && typeof payload.usage === 'object') patch.usage = payload.usage;
            Data.updateAutomation(payload.jobId, patch);
          } catch (error) {}
          scheduleRefresh();
        });
      }
    } catch (error) {}

    try {
      if (typeof service.onDone === 'function') {
        service.onDone((payload) => {
          if (!payload?.jobId) return;
          const status = FINISHED_STATES.includes(payload.status) ? payload.status : 'failed';
          try {
            Data.finishAutomation(payload.jobId, {
              status,
              exitCode: payload.exitCode == null ? null : Number(payload.exitCode),
              error: String(payload.error || ''),
              usage: payload.usage && typeof payload.usage === 'object' ? payload.usage : null,
              endedAt: payload.endedAt || null
            });
          } catch (error) {}
          lastEvents.delete(payload.jobId);
          scheduleRefresh();
          if (status === 'done') {
            toast('اكتملت الأتمتة. تحقق من مجلد المخرجات.', { type: 'success', icon: 'check-circle' });
          } else if (status === 'cancelled') {
            toast('أُلغيت الأتمتة.', { type: 'info' });
          } else if (status === 'failed') {
            const message = String(payload.error || '').trim();
            toast(
              message ? `فشلت الأتمتة: ${message.slice(0, 180)}` : 'فشلت الأتمتة. راجع السجل للتفاصيل.',
              { type: 'error', duration: 6000 }
            );
          }
        });
      }
    } catch (error) {}
  }

  function lastEvent(jobId) {
    return lastEvents.get(jobId) || null;
  }

  // ---------------------------------------------------------------- stale jobs

  async function markStaleJobs() {
    if (!available()) return 0;
    let changed = 0;
    try {
      let result = null;
      try {
        result = await api().jobs();
      } catch (error) {
        return 0;
      }
      if (!result?.ok) return 0;
      const live = Array.isArray(result.data?.jobs) ? result.data.jobs : [];
      const liveIds = new Set(live.map((job) => String(job?.jobId || '')).filter(Boolean));
      const automations = (() => {
        try {
          return Data.get()?.automations || [];
        } catch (error) {
          return [];
        }
      })();
      automations
        .filter((job) => LIVE_STATES.includes(job.status) && !liveIds.has(job.id))
        .forEach((job) => {
          try {
            Data.finishAutomation(job.id, { status: 'interrupted', error: 'أُغلق البرنامج أثناء التشغيل' });
            changed += 1;
          } catch (error) {}
        });
      if (changed) scheduleRefresh();
    } catch (error) {}
    return changed;
  }

  // ---------------------------------------------------------------- misc

  function formatCost(usd) {
    const value = Number(usd);
    if (!Number.isFinite(value) || value === 0) return '$0';
    const sign = value < 0 ? '-' : '';
    const absolute = Math.abs(value);
    return `${sign}$${absolute < 0.1 ? absolute.toFixed(4) : absolute.toFixed(2)}`;
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function openLog(jobId, { modal = true } = {}) {
    const job = currentJob(jobId);
    if (!available()) {
      const message = 'سجل الأتمتة يحتاج تطبيق سطح المكتب.';
      if (!modal) return { ok: false, message };
      toast(message, { type: 'info' });
      return { ok: false, message };
    }

    let text = '';
    let message = '';
    try {
      const repoPath = String(repoStatus().path || '');
      const result = await api().log({
        jobId,
        tail: LOG_TAIL,
        taskFolder: job?.taskFolder || '',
        repoPath
      });
      if (result?.ok) text = String(result.data?.text || '');
      else message = result?.message || 'تعذر قراءة السجل.';
    } catch (error) {
      message = 'تعذر قراءة السجل.';
    }

    if (!modal) return { ok: !message, text, message };
    if (message) {
      toast(message, { type: 'error' });
      return { ok: false, message };
    }

    try {
      if (typeof App === 'undefined' || !App.openModal) return { ok: true, text };
      const subtitle = job
        ? `${job.taskTitle || ''}${job.model ? ` · ${job.model}` : ''}`
        : '';
      App.openModal({
        title: 'سجل التشغيل',
        subtitle,
        eyebrow: 'opencode',
        size: 'lg',
        body: `<pre class="automation-log" dir="ltr">${escapeHtml(text || 'لا يوجد سجل بعد.')}</pre>`,
        footer: '<div class="modal-footer-actions"><button class="btn" type="button" data-close-modal>إغلاق</button></div>'
      });
    } catch (error) {}
    return { ok: true, text };
  }

  function openLogModal(jobId) {
    return openLog(jobId, { modal: true });
  }

  async function jobs() {
    if (!available()) return [];
    try {
      const result = await api().jobs();
      return result?.ok && Array.isArray(result.data?.jobs) ? result.data.jobs : [];
    } catch (error) {
      return [];
    }
  }

  function listActive() {
    try {
      const automations = Data.get()?.automations || [];
      return automations.filter((job) => LIVE_STATES.includes(job.status));
    } catch (error) {
      return [];
    }
  }

  function activeForTask(taskId) {
    try {
      return Data.activeAutomation(taskId);
    } catch (error) {
      return null;
    }
  }

  const module = {
    available,
    health,
    lastHealth,
    models,
    allowedModels,
    isModelAllowed,
    start,
    cancel,
    refresh,
    ping,
    restart,
    onPing,
    attach,
    lastEvent,
    markStaleJobs,
    formatCost,
    openLog,
    openLogModal,
    jobs,
    listActive,
    activeForTask,
    LIVE_STATES,
    FINISHED_STATES,
    LOG_TAIL
  };

  try {
    if (typeof window !== 'undefined') window.Opencode = module;
  } catch (error) {}

  return module;
})();
