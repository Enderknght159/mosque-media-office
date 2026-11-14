const Data = (() => {
  const STORAGE_KEY = 'mosque_media_office_v1';
  const VERSION = 2;

  const PALETTE = [
    { name: 'أزرق', value: '#0a84ff' },
    { name: 'بنفسجي', value: '#6c63ff' },
    { name: 'وردي', value: '#ff375f' },
    { name: 'برتقالي', value: '#ff9f0a' },
    { name: 'أخضر', value: '#30b85a' },
    { name: 'فيروزي', value: '#30b0c7' },
    { name: 'بني', value: '#ac8e68' },
    { name: 'رمادي', value: '#8e8e93' }
  ];

  const PRIORITIES = {
    normal: { value: 'normal', label: 'عادية', color: '#8e8e93', rank: 1, icon: 'circle' },
    high: { value: 'high', label: 'مهمة', color: '#ff9f0a', rank: 2, icon: 'flag' },
    urgent: { value: 'urgent', label: 'عاجلة', color: '#ff453a', rank: 3, icon: 'alert' }
  };

  const STATUS = {
    new: { key: 'new', label: 'لم تبدأ', color: '#8e8e93' },
    progress: { key: 'progress', label: 'قيد العمل', color: '#0a84ff' },
    done: { key: 'done', label: 'مكتملة', color: '#30b85a' }
  };

  const BADGE_SUGGESTIONS = ['مونتاج', 'تصوير', 'نشر', 'كتابة', 'تصميم', 'تفريغ', 'صوتيات', 'إخراج', 'ترجمة', 'تدقيق'];

  const STAGE_TYPES = [
    { key: 'idea', label: 'اختيار الفكرة', icon: 'sparkles', patterns: ['فكرة', 'اختيار'] },
    { key: 'writing', label: 'كتابة', icon: 'edit', patterns: ['كتاب', 'سكريبت', 'نص'] },
    { key: 'filming', label: 'تصوير', icon: 'camera', patterns: ['تصوير', 'تسجيل'] },
    { key: 'transcript', label: 'تفريغ', icon: 'file', patterns: ['تفريغ'] },
    { key: 'editing', label: 'مونتاج', icon: 'film', patterns: ['مونتاج', 'تحرير', 'قص'] },
    { key: 'design', label: 'تصميم', icon: 'palette', patterns: ['تصميم', 'غلاف'] },
    { key: 'review', label: 'مراجعة', icon: 'check-circle', patterns: ['مراج'] },
    { key: 'publishing', label: 'نشر', icon: 'upload', patterns: ['نشر', 'بث'] },
    { key: 'other', label: 'أخرى', icon: 'layers', patterns: [] }
  ];

  let current = null;
  let unlocked = false;

  function nowISO() {
    return new Date().toISOString();
  }

  function stageType(name) {
    const text = String(name || '');
    return STAGE_TYPES.find((type) => type.patterns.some((pattern) => text.includes(pattern)))
      || STAGE_TYPES[STAGE_TYPES.length - 1];
  }

  function safeId(value, prefix) {
    const text = String(value || '');
    return /^[A-Za-z0-9_-]{1,90}$/.test(text) ? text : Utils.uid(prefix);
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('ملف البيانات غير صالح');
    const now = nowISO();
    const rawSettings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    const rawLogo = String(rawSettings.logo || '');
    const rawSecurity = rawSettings.security && typeof rawSettings.security === 'object' ? rawSettings.security : null;
    const security = rawSecurity
      && /^[a-f0-9]{8,128}$/i.test(String(rawSecurity.salt || ''))
      && /^[a-f0-9]{16,128}$/i.test(String(rawSecurity.hash || ''))
      ? {
        salt: String(rawSecurity.salt),
        hash: String(rawSecurity.hash),
        iterations: Utils.clamp(Number(rawSecurity.iterations) || 1200, 100, 20000),
        updatedAt: rawSecurity.updatedAt || now
      }
      : null;
    const rawRepo = rawSettings.repo && typeof rawSettings.repo === 'object' ? rawSettings.repo : null;
    const repoPath = String(rawRepo?.path || '').trim();
    const repo = repoPath ? {
      path: repoPath,
      repoId: String(rawRepo.repoId || '').trim(),
      autoRename: rawRepo.autoRename !== false,
      linkedAt: rawRepo.linkedAt || now,
      lastSyncAt: rawRepo.lastSyncAt || null
    } : null;
    const rawAi = rawSettings.ai && typeof rawSettings.ai === 'object' ? rawSettings.ai : {};
    const rawFilter = rawAi.filter && typeof rawAi.filter === 'object' ? rawAi.filter : {};
    const cleanModelList = (value) => (Array.isArray(value)
      ? [...new Set(value.map((item) => String(item || '').trim()).filter((item) => item && item.length <= 120))].slice(0, 600)
      : []);
    const ai = {
      lastModel: String(rawAi.lastModel || '').trim().slice(0, 120),
      opencodePath: String(rawAi.opencodePath || '').trim().slice(0, 400),
      filter: {
        mode: rawFilter.mode === 'allow' ? 'allow' : 'all',
        allowed: cleanModelList(rawFilter.allowed),
        blocked: cleanModelList(rawFilter.blocked)
      },
      modelsCache: {
        at: rawAi.modelsCache?.at || null,
        list: cleanModelList(rawAi.modelsCache?.list)
      }
    };
    const settings = {
      mosqueName: String(rawSettings.mosqueName || 'مسجد الحي').trim() || 'مسجد الحي',
      tagline: String(rawSettings.tagline || 'المكتب الإعلامي').trim() || 'المكتب الإعلامي',
      logo: /^data:image\/[a-z0-9.+-]+;base64,/i.test(rawLogo) && rawLogo.length <= 1200000 ? rawLogo : '',
      security,
      links: Array.isArray(rawSettings.links) ? rawSettings.links.map((link, index) => ({
        id: safeId(link.id, `lnk_${index}`),
        name: String(link.name || '').trim(),
        url: Utils.normalizeUrl(link.url || ''),
        icon: String(link.icon || 'globe')
      })).filter((link) => link.name && link.url) : [],
      theme: ['auto', 'light', 'dark'].includes(rawSettings.theme) ? rawSettings.theme : 'auto',
      demo: Boolean(rawSettings.demo),
      onboarded: rawSettings.onboarded !== false,
      createdAt: rawSettings.createdAt || now,
      updatedAt: rawSettings.updatedAt || now,
      lastBackupAt: rawSettings.lastBackupAt || null,
      lastBackupType: rawSettings.lastBackupType || null,
      repo,
      ai
    };

    const users = Array.isArray(raw.users) ? raw.users.map((user, index) => ({
      id: safeId(user.id, 'usr'),
      name: String(user.name || '').trim(),
      color: /^#[0-9a-f]{6}$/i.test(String(user.color || '')) ? user.color : PALETTE[index % PALETTE.length].value,
      badges: Array.isArray(user.badges)
        ? [...new Set(user.badges.map((badge) => String(badge || '').trim().slice(0, 30)).filter(Boolean))].slice(0, 20)
        : [],
      createdAt: user.createdAt || now
    })).filter((user) => user.name) : [];

    const userIds = new Set(users.map((user) => user.id));

    const templates = Array.isArray(raw.templates) ? raw.templates.map((template, index) => ({
      id: safeId(template.id, 'tpl'),
      name: String(template.name || `قالب ${index + 1}`).trim(),
      description: String(template.description || '').trim(),
      stages: Array.isArray(template.stages) ? template.stages.map((stage, stageIndex) => ({
        id: safeId(stage.id, 'tst'),
        name: String(stage.name || '').trim() || `مرحلة ${stageIndex + 1}`
      })) : [],
      createdAt: template.createdAt || now
    })).filter((template) => template.name) : [];

    const templateIds = new Set(templates.map((template) => template.id));
    const templateById = new Map(templates.map((template) => [template.id, template]));

    const groups = Array.isArray(raw.groups) ? raw.groups.map((group, index) => {
      const template = templateIds.has(group.templateId) ? templateById.get(group.templateId) : null;
      const stageAssignees = {};
      if (template && group.stageAssignees && typeof group.stageAssignees === 'object') {
        template.stages.forEach((stage) => {
          const userId = group.stageAssignees[stage.id];
          if (userIds.has(userId)) stageAssignees[stage.id] = userId;
        });
      }
      return {
        id: safeId(group.id, 'grp'),
        name: String(group.name || `مجموعة ${index + 1}`).trim(),
        templateId: template ? template.id : null,
        color: /^#[0-9a-f]{6}$/i.test(String(group.color || '')) ? group.color : PALETTE[index % PALETTE.length].value,
        description: String(group.description || '').trim(),
        stageAssignees,
        folder: String(group.folder || '').trim(),
        createdAt: group.createdAt || now
      };
    }).filter((group) => group.name) : [];

    const groupIds = new Set(groups.map((group) => group.id));

    const tasks = Array.isArray(raw.tasks) ? raw.tasks.map((task) => {
      const stages = Array.isArray(task.stages) ? task.stages.map((stage, stageIndex) => {
        const done = Boolean(stage.done);
        return {
          id: safeId(stage.id, 'stg'),
          templateStageId: stage.templateStageId || null,
          name: String(stage.name || `مرحلة ${stageIndex + 1}`).trim(),
          done,
          completedBy: done && stage.completedBy && userIds.has(stage.completedBy) ? stage.completedBy : null,
          completedByName: done ? String(stage.completedByName || '').trim() : '',
          completedAt: done ? (Utils.toDate(stage.completedAt) ? new Date(stage.completedAt).toISOString() : now) : null,
          defaultAssigneeId: userIds.has(stage.defaultAssigneeId) ? stage.defaultAssigneeId : null,
          note: String(stage.note || '').trim()
        };
      }) : [];
      const templateId = templateIds.has(task.templateId) ? task.templateId : null;
      return {
        id: safeId(task.id, 'task'),
        title: String(task.title || '').trim(),
        groupId: groupIds.has(task.groupId) ? task.groupId : null,
        templateId,
        stages,
        assigneeId: userIds.has(task.assigneeId) ? task.assigneeId : null,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(task.dueDate || '')) ? task.dueDate : '',
        priority: PRIORITIES[task.priority] ? task.priority : 'normal',
        description: String(task.description || '').trim(),
        folder: String(task.folder || '').trim(),
        createdAt: task.createdAt || now,
        updatedAt: task.updatedAt || task.createdAt || now,
        isDemo: Boolean(task.isDemo)
      };
    }).filter((task) => task.title) : [];

    const activeUserId = userIds.has(raw.activeUserId) ? raw.activeUserId : (users[0]?.id || null);

    const prompts = Array.isArray(raw.prompts) ? raw.prompts.map((prompt, index) => ({
      id: safeId(prompt.id, `prm_${index}`),
      name: String(prompt.name || '').trim() || `برومت ${index + 1}`,
      description: String(prompt.description || '').trim(),
      content: String(prompt.content || '').slice(0, 40000),
      createdAt: prompt.createdAt || now,
      updatedAt: prompt.updatedAt || prompt.createdAt || now
    })).filter((prompt) => prompt.name).slice(0, 200) : [];

    const AUTOMATION_STATES = ['queued', 'running', 'done', 'failed', 'cancelled', 'interrupted'];
    const automations = Array.isArray(raw.automations) ? raw.automations.map((job, index) => {
      const usage = job.usage && typeof job.usage === 'object' ? job.usage : {};
      const tokens = (value) => Math.max(0, Math.round(Number(value) || 0));
      return {
        id: safeId(job.id, `job_${index}`),
        taskId: safeId(job.taskId, `task_${index}`),
        taskTitle: String(job.taskTitle || '').trim(),
        groupId: job.groupId ? safeId(job.groupId, `grp_${index}`) : null,
        groupName: String(job.groupName || '').trim(),
        promptId: job.promptId ? safeId(job.promptId, `prm_${index}`) : null,
        promptName: String(job.promptName || '').trim(),
        model: String(job.model || '').trim().slice(0, 120),
        notes: String(job.notes || '').slice(0, 8000),
        promptText: String(job.promptText || '').slice(0, 60000),
        status: AUTOMATION_STATES.includes(job.status) ? job.status : 'queued',
        progress: Utils.clamp(Number(job.progress) || 0, 0, 100),
        phase: String(job.phase || '').slice(0, 200),
        etaSeconds: Math.max(0, Math.round(Number(job.etaSeconds) || 0)),
        steps: Math.max(0, Math.round(Number(job.steps) || 0)),
        sessionID: String(job.sessionID || '').slice(0, 80),
        taskFolder: String(job.taskFolder || '').slice(0, 500),
        startedAt: job.startedAt || now,
        endedAt: job.endedAt || null,
        exitCode: job.exitCode === 0 || job.exitCode ? Number(job.exitCode) : null,
        error: String(job.error || '').slice(0, 4000),
        usage: {
          input: tokens(usage.input),
          output: tokens(usage.output),
          reasoning: tokens(usage.reasoning),
          cacheRead: tokens(usage.cacheRead),
          cacheWrite: tokens(usage.cacheWrite),
          costUSD: Math.max(0, Math.round((Number(usage.costUSD) || 0) * 1e6) / 1e6)
        }
      };
    }).slice(-1500) : [];

    const data = {
      version: VERSION,
      settings,
      users,
      templates,
      groups,
      tasks,
      prompts,
      automations,
      activeUserId
    };

    if (!data.settings.demo && tasks.some((task) => task.isDemo)) data.settings.demo = true;
    return data;
  }

  function load() {
    unlocked = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      current = normalize(JSON.parse(raw));
      return current;
    } catch (error) {
      return null;
    }
  }

  let mirrorTimer = null;

  function scheduleMirror() {
    if (!current || typeof window === 'undefined' || !window.MMO?.store) return;
    if (mirrorTimer) clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(() => {
      mirrorTimer = null;
      try {
        window.MMO.store.writeMirror(JSON.stringify(current));
      } catch (error) {}
    }, 2500);
  }

  async function restoreFromMirror() {
    if (!window.MMO?.store) return null;
    try {
      const result = await window.MMO.store.readMirror();
      if (!result?.ok || !result.data?.snapshot) return null;
      current = normalize(JSON.parse(result.data.snapshot));
      unlocked = false;
      save();
      return current;
    } catch (error) {
      return null;
    }
  }

  function save() {
    if (!current) return;
    current.settings.updatedAt = nowISO();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    scheduleMirror();
  }

  function get() {
    return current;
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(current));
  }

  function replace(raw) {
    current = normalize(raw);
    unlocked = false;
    save();
    return current;
  }

  function reset() {
    current = null;
    unlocked = false;
    localStorage.removeItem(STORAGE_KEY);
  }

  function newStage(name, templateStageId = null, defaultAssigneeId = null) {
    return {
      id: Utils.uid('stg'),
      templateStageId,
      name: String(name || '').trim(),
      done: false,
      completedBy: null,
      completedByName: '',
      completedAt: null,
      defaultAssigneeId,
      note: ''
    };
  }

  function createWorkspace({ mosqueName, members = [], withDemo = false }) {
    const now = nowISO();
    const templateDefs = [
      {
        key: 'lesson',
        name: 'درس كامل',
        description: 'مسار إنتاج الدرس من التصوير حتى النشر.',
        stages: ['تصوير الدرس', 'تفريغ الفيديو', 'مونتاج الدرس', 'نشر الدرس']
      },
      {
        key: 'khutbah',
        name: 'خطبة كاملة',
        description: 'مسار إنتاج خطبة الجمعة وتوثيقها.',
        stages: ['تصوير الخطبة', 'تفريغ الخطبة', 'مونتاج الخطبة', 'نشر الخطبة']
      },
      {
        key: 'reel',
        name: 'ريلز من فكرة',
        description: 'إنتاج ريل قصير من اختيار الفكرة حتى النشر.',
        stages: ['اختيار الفكرة', 'كتابة السكريبت', 'تصوير الريل', 'تفريغ الريل', 'مونتاج الريل', 'النشر']
      },
      {
        key: 'reelFromLesson',
        name: 'ريلز من درس',
        description: 'استخراج مقطع مؤثر من درس مصوّر ثم مونتاجه ونشره.',
        stages: ['اختيار الفكرة والمقطع', 'مونتاج المقطع', 'النشر']
      }
    ];

    const templates = templateDefs.map((definition) => ({
      id: Utils.uid('tpl'),
      name: definition.name,
      description: definition.description,
      stages: definition.stages.map((name) => ({ id: Utils.uid('tst'), name })),
      createdAt: now
    }));

    const templateByKey = {
      lesson: templates[0],
      khutbah: templates[1],
      reel: templates[2],
      reelFromLesson: templates[3]
    };

    const groupDefs = [
      { name: 'الخطب', templateKey: 'khutbah', color: '#ff9f0a', description: 'إنتاج وتوثيق خطب الجمعة.' },
      { name: 'دروس الفجر', templateKey: 'lesson', color: '#0a84ff', description: 'تسجيل ونشر دروس الفجر.' },
      { name: 'الريلز', templateKey: 'reel', color: '#6c63ff', description: 'إنتاج مقاطع ريلز قصيرة من الأفكار الجديدة.' },
      { name: 'ريلز من الدروس', templateKey: 'reelFromLesson', color: '#30b85a', description: 'مقاطع مستخرجة من الدروس المصورة.' }
    ];

    const groups = groupDefs.map((definition) => ({
      id: Utils.uid('grp'),
      name: definition.name,
      templateId: templateByKey[definition.templateKey].id,
      color: definition.color,
      description: definition.description,
      createdAt: now
    }));

    const users = members.map((member, index) => ({
      id: Utils.uid('usr'),
      name: typeof member === 'string' ? member.trim() : String(member.name || '').trim(),
      color: typeof member === 'object' && member.color ? member.color : PALETTE[index % PALETTE.length].value,
      createdAt: now
    })).filter((user) => user.name);

    const demo = withDemo && users.length > 0;
    const tasks = demo ? buildDemoTasks(groups, templates, users) : [];

    current = normalize({
      version: VERSION,
      settings: {
        mosqueName: String(mosqueName || '').trim() || 'مسجد الحي',
        tagline: 'المكتب الإعلامي',
        links: [],
        theme: document.documentElement.dataset.themeMode || 'auto',
        demo,
        onboarded: true,
        createdAt: now,
        updatedAt: now,
        lastBackupAt: null,
        lastBackupType: null
      },
      users,
      templates,
      groups,
      tasks,
      activeUserId: users[0]?.id || null
    });
    save();
    return current;
  }

  function buildDemoTasks(groups, templates, users) {
    const now = new Date();
    const findGroup = (name) => groups.find((group) => group.name === name);
    const findTemplate = (groupId) => templates.find((template) => template.id === findGroupById(groupId)?.templateId);
    function findGroupById(groupId) {
      return groups.find((group) => group.id === groupId);
    }

    function makeTask(config) {
      const group = findGroup(config.group);
      const template = findTemplate(group.id);
      const createdAt = new Date(now.getTime() - config.createdDaysAgo * Utils.dayMs);
      const dueDate = config.dueInDays == null ? '' : Utils.toISODate(Utils.addDays(now, config.dueInDays));
      const completions = config.completions || [];
      let previousTime = createdAt.getTime();
      const stages = template.stages.map((stage, index) => {
        const completion = completions[index];
        if (!completion) return newStage(stage.name, stage.id);
        const user = users[completion.by % users.length];
        let completedAt = new Date(now.getTime() - completion.daysAgo * Utils.dayMs);
        if (completedAt.getTime() > now.getTime()) completedAt = new Date(now.getTime() - 60000);
        if (completedAt.getTime() <= createdAt.getTime()) completedAt = new Date(createdAt.getTime() + 3600000 * (index + 1));
        if (completedAt.getTime() <= previousTime && index > 0) completedAt = new Date(previousTime + 1800000);
        previousTime = completedAt.getTime();
        return {
          id: Utils.uid('stg'),
          templateStageId: stage.id,
          name: stage.name,
          done: true,
          completedBy: user.id,
          completedByName: user.name,
          completedAt: completedAt.toISOString(),
          note: completion.note || ''
        };
      });
      const lastDone = stages.filter((stage) => stage.done).pop();
      const lastTime = stages.reduce((latest, stage) => {
        if (!stage.completedAt) return latest;
        return new Date(stage.completedAt).getTime() > latest ? new Date(stage.completedAt).getTime() : latest;
      }, createdAt.getTime());
      return {
        id: Utils.uid('task'),
        title: config.title,
        groupId: group.id,
        templateId: template.id,
        stages,
        assigneeId: users[config.assignee % users.length].id,
        dueDate,
        priority: config.priority || 'normal',
        description: config.description || '',
        createdAt: createdAt.toISOString(),
        updatedAt: lastDone ? lastDone.completedAt : createdAt.toISOString(),
        isDemo: true
      };
    }

    return [
      makeTask({
        title: 'خطبة الجمعة: بر الوالدين',
        group: 'الخطب',
        createdDaysAgo: 10.2,
        dueInDays: -4,
        assignee: 0,
        priority: 'high',
        description: 'إنتاج خطبة الجمعة مع المقدمة والغلاف ثم نشرها على منصات المسجد.',
        completions: [
          { by: 0, daysAgo: 9.4 },
          { by: 1, daysAgo: 8.1, note: 'تم رفع المادة على جهاز المونتاج.' },
          { by: 2, daysAgo: 6.3 },
          { by: 0, daysAgo: 5.2, note: 'تمت الجدولة والنشر.' }
        ]
      }),
      makeTask({
        title: 'درس الفجر: تفسير سورة الفاتحة',
        group: 'دروس الفجر',
        createdDaysAgo: 8.4,
        dueInDays: -2,
        assignee: 1,
        description: 'درس الفجر الأسبوعي، مع إعداد مقطع تشويقي قصير.',
        completions: [
          { by: 1, daysAgo: 7.6 },
          { by: 0, daysAgo: 6.8 },
          { by: 1, daysAgo: 4.6 },
          { by: 2, daysAgo: 3.4 }
        ]
      }),
      makeTask({
        title: 'ريلز: آداب المسجد',
        group: 'الريلز',
        createdDaysAgo: 7.5,
        dueInDays: 1,
        assignee: 2,
        priority: 'high',
        description: 'ريل قصير يعرض آداب دخول المسجد بأسلوب بصري هادئ.',
        completions: [
          { by: 0, daysAgo: 6.7 },
          { by: 1, daysAgo: 6.2 },
          { by: 2, daysAgo: 4.9 },
          { by: 0, daysAgo: 4.3 },
          { by: 1, daysAgo: 0.25, note: 'انسخ المونتاج جاهز للمراجعة النهائية.' }
        ]
      }),
      makeTask({
        title: 'ريلز من درس: لحظة مؤثرة من تفسير الفاتحة',
        group: 'ريلز من الدروس',
        createdDaysAgo: 5.3,
        dueInDays: 0,
        assignee: 0,
        priority: 'high',
        description: 'اختيار مقطع مؤثر من درس تفسير الفاتحة وإخراجه كريل مستقل.',
        completions: [
          { by: 2, daysAgo: 4.4, note: 'المقطع من الدقيقة 18:40.' },
          { by: 0, daysAgo: 2.6 }
        ]
      }),
      makeTask({
        title: 'درس الفجر: أخلاق النبي ﷺ',
        group: 'دروس الفجر',
        createdDaysAgo: 6.4,
        dueInDays: -1,
        assignee: 1,
        priority: 'urgent',
        description: 'إنتاج درس الفجر ومراجعة الصوت قبل المونتاج.',
        completions: [
          { by: 1, daysAgo: 5.6 },
          { by: 2, daysAgo: 1.4 }
        ]
      }),
      makeTask({
        title: 'خطبة الجمعة: الصبر عند البلاء',
        group: 'الخطب',
        createdDaysAgo: 4.2,
        dueInDays: 3,
        assignee: 0,
        description: 'خطبة الجمعة القادمة، تحتاج مقدمة قصيرة وخاتمة موحدة.',
        completions: [
          { by: 0, daysAgo: 3.1 }
        ]
      }),
      makeTask({
        title: 'ريلز: ذكر الله في السوق',
        group: 'الريلز',
        createdDaysAgo: 2.6,
        dueInDays: 4,
        assignee: 2,
        description: 'فكرة ريل قصير عن الذكر في أماكن الانشغال.',
        completions: [
          { by: 2, daysAgo: 1.7 },
          { by: 1, daysAgo: 0.6 }
        ]
      }),
      makeTask({
        title: 'درس الفجر: أحكام الطهارة',
        group: 'دروس الفجر',
        createdDaysAgo: 1.4,
        dueInDays: 2,
        assignee: 0,
        description: 'تسجيل درس الفجر وتجهيزه للنشر خلال يومين.',
        completions: []
      }),
      makeTask({
        title: 'خطبة الجمعة: فضل العلم',
        group: 'الخطب',
        createdDaysAgo: 13.4,
        dueInDays: -8,
        assignee: 1,
        description: 'خطبة مكتملة ونُشرت على قناة المسجد.',
        completions: [
          { by: 1, daysAgo: 12.6 },
          { by: 0, daysAgo: 11.7 },
          { by: 2, daysAgo: 10.1 },
          { by: 1, daysAgo: 8.9 }
        ]
      }),
      makeTask({
        title: 'ريلز: بر الوالدين',
        group: 'الريلز',
        createdDaysAgo: 11.3,
        dueInDays: -5,
        assignee: 0,
        description: 'ريل قصير بمناسبة حملة بر الوالدين.',
        completions: [
          { by: 0, daysAgo: 10.4 },
          { by: 1, daysAgo: 9.8 },
          { by: 2, daysAgo: 8.5 },
          { by: 0, daysAgo: 7.9 },
          { by: 1, daysAgo: 6.4 },
          { by: 2, daysAgo: 5.3 }
        ]
      }),
      makeTask({
        title: 'ريلز من درس: مقطع من خطبة الصبر',
        group: 'ريلز من الدروس',
        createdDaysAgo: 3.2,
        dueInDays: 1,
        assignee: 1,
        description: 'مقطع قصير من خطبة الصبر مع ترجمة نصية.',
        completions: [
          { by: 1, daysAgo: 2.3 }
        ]
      }),
      makeTask({
        title: 'خطبة الجمعة: حسن الخلق',
        group: 'الخطب',
        createdDaysAgo: 0.3,
        dueInDays: 6,
        assignee: 2,
        description: 'تجهيز خطبة الجمعة القادمة مع تصميم الغلاف.',
        completions: []
      })
    ];
  }

  function settings() {
    return current.settings;
  }

  function users() {
    return current.users;
  }

  function templates() {
    return current.templates;
  }

  function groups() {
    return current.groups;
  }

  function tasks() {
    return current.tasks;
  }

  function findUser(id) {
    return current.users.find((user) => user.id === id) || null;
  }

  function findTemplate(id) {
    return current.templates.find((template) => template.id === id) || null;
  }

  function findGroup(id) {
    return current.groups.find((group) => group.id === id) || null;
  }

  function findTask(id) {
    return current.tasks.find((task) => task.id === id) || null;
  }

  function findLink(id) {
    return current.settings.links.find((link) => link.id === id) || null;
  }

  function setActiveUser(userId) {
    current.activeUserId = findUser(userId) ? userId : null;
    save();
  }

  function setSetting(key, value) {
    current.settings[key] = value;
    save();
  }

  function updateSettings(patch) {
    Object.assign(current.settings, patch);
    save();
  }

  function addLink({ name, url, icon }) {
    const link = {
      id: Utils.uid('lnk'),
      name: String(name || '').trim(),
      url: Utils.normalizeUrl(url),
      icon: icon || 'globe'
    };
    if (!link.name || !link.url) return null;
    current.settings.links.push(link);
    save();
    return link;
  }

  function updateLink(id, { name, url, icon }) {
    const link = findLink(id);
    if (!link) return null;
    link.name = String(name || '').trim();
    link.url = Utils.normalizeUrl(url);
    link.icon = icon || link.icon;
    save();
    return link;
  }

  function deleteLink(id) {
    const index = current.settings.links.findIndex((link) => link.id === id);
    if (index === -1) return false;
    current.settings.links.splice(index, 1);
    save();
    return true;
  }

  function setTheme(theme) {
    if (!['auto', 'light', 'dark'].includes(theme)) return;
    current.settings.theme = theme;
    save();
  }

  function setBackup(type) {
    current.settings.lastBackupAt = nowISO();
    current.settings.lastBackupType = type;
    save();
  }

  function createTask(fields) {
    const group = findGroup(fields.groupId);
    const template = group ? findTemplate(group.templateId) : null;
    const stageNames = Array.isArray(fields.stageNames) && fields.stageNames.length
      ? fields.stageNames
      : (template?.stages || []).map((stage) => ({ name: stage.name, id: stage.id }));
    const now = nowISO();
    const task = {
      id: Utils.uid('task'),
      title: String(fields.title || '').trim(),
      groupId: group ? group.id : null,
      templateId: template ? template.id : null,
      stages: stageNames.map((stage) => {
        if (typeof stage === 'string') {
          const templateStage = (template?.stages || []).find((item) => item.name === stage) || null;
          const templateStageId = templateStage?.id || null;
          return newStage(stage, templateStageId, group?.stageAssignees?.[templateStageId] || null);
        }
        const name = String(stage.name || '').trim();
        const templateStageId = stage.templateStageId || stage.id || (template?.stages || []).find((item) => item.name === name)?.id || null;
        return newStage(name, templateStageId, group?.stageAssignees?.[templateStageId] || null);
      }),
      assigneeId: findUser(fields.assigneeId) ? fields.assigneeId : null,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(fields.dueDate || '')) ? fields.dueDate : '',
      priority: PRIORITIES[fields.priority] ? fields.priority : 'normal',
      description: String(fields.description || '').trim(),
      createdAt: now,
      updatedAt: now,
      isDemo: false
    };
    if (!task.title) return null;
    current.tasks.unshift(task);
    save();
    return task;
  }

  function updateTask(id, fields) {
    const task = findTask(id);
    if (!task) return null;
    const group = fields.groupId ? findGroup(fields.groupId) : null;
    const template = group ? findTemplate(group.templateId) : null;
    task.title = String(fields.title || task.title).trim();
    task.groupId = group ? group.id : task.groupId;
    task.templateId = template ? template.id : (fields.templateId !== undefined ? fields.templateId : task.templateId);
    if (fields.assigneeId !== undefined) task.assigneeId = findUser(fields.assigneeId) ? fields.assigneeId : null;
    if (fields.dueDate !== undefined) task.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(fields.dueDate || '')) ? fields.dueDate : '';
    if (fields.priority !== undefined) task.priority = PRIORITIES[fields.priority] ? fields.priority : 'normal';
    if (fields.description !== undefined) task.description = String(fields.description || '').trim();
    if (Array.isArray(fields.stages)) {
      task.stages = fields.stages.map((stage, index) => {
        const existing = stage.id ? task.stages.find((item) => item.id === stage.id) : null;
        if (existing) {
          existing.name = String(stage.name || existing.name).trim();
          if (stage.note !== undefined) existing.note = String(stage.note || '').trim();
          return existing;
        }
        const name = String(stage.name || `مرحلة ${index + 1}`).trim();
        const templateStageId = stage.templateStageId || (template?.stages || []).find((item) => item.name === name)?.id || null;
        return newStage(name, templateStageId, group?.stageAssignees?.[templateStageId] || null);
      });
    }
    if (group) {
      const assignees = group.stageAssignees || {};
      task.stages.forEach((stage) => {
        if (!stage.done) stage.defaultAssigneeId = stage.templateStageId ? (assignees[stage.templateStageId] || null) : null;
      });
    }
    task.updatedAt = nowISO();
    save();
    return task;
  }

  function duplicateTask(id) {
    const task = findTask(id);
    if (!task) return null;
    const now = nowISO();
    const copy = {
      ...task,
      id: Utils.uid('task'),
      title: `نسخة من ${task.title}`,
      stages: task.stages.map((stage) => newStage(stage.name, stage.templateStageId, stage.defaultAssigneeId)),
      createdAt: now,
      updatedAt: now,
      isDemo: false
    };
    current.tasks.unshift(copy);
    save();
    return copy;
  }

  function deleteTask(id) {
    const index = current.tasks.findIndex((task) => task.id === id);
    if (index === -1) return false;
    current.tasks.splice(index, 1);
    save();
    return true;
  }

  function completeStage(taskId, stageId, userId, note = '') {
    const task = findTask(taskId);
    const user = findUser(userId);
    if (!task || !user) return { ok: false, reason: 'missing' };
    const next = task.stages.find((stage) => !stage.done);
    const stage = task.stages.find((item) => item.id === stageId);
    if (!stage || stage.done) return { ok: false, reason: 'done' };
    if (!next || next.id !== stageId) return { ok: false, reason: 'order' };
    stage.done = true;
    stage.completedBy = user.id;
    stage.completedByName = user.name;
    stage.completedAt = nowISO();
    stage.note = String(note || '').trim();
    task.updatedAt = stage.completedAt;
    if (!current.activeUserId) current.activeUserId = user.id;
    save();
    return { ok: true, taskCompleted: task.stages.every((item) => item.done), stage, task };
  }

  function setStageCompleter(taskId, stageId, userId) {
    const task = findTask(taskId);
    const stage = task?.stages.find((item) => item.id === stageId);
    const user = findUser(userId);
    if (!task || !stage || !user || !stage.done) return { ok: false };
    stage.completedBy = user.id;
    stage.completedByName = user.name;
    task.updatedAt = nowISO();
    save();
    return { ok: true, task, stage, user };
  }

  function reopenStage(taskId, stageId) {
    const task = findTask(taskId);
    if (!task) return { ok: false, count: 0 };
    const index = task.stages.findIndex((stage) => stage.id === stageId);
    if (index === -1) return { ok: false, count: 0 };
    let count = 0;
    for (let i = index; i < task.stages.length; i += 1) {
      const stage = task.stages[i];
      if (stage.done) count += 1;
      stage.done = false;
      stage.completedBy = null;
      stage.completedByName = '';
      stage.completedAt = null;
      stage.note = '';
    }
    task.updatedAt = nowISO();
    save();
    return { ok: count > 0, count };
  }

  function cleanStageAssignees(template, rawAssignees) {
    const clean = {};
    if (!template || !rawAssignees || typeof rawAssignees !== 'object') return clean;
    template.stages.forEach((stage) => {
      const userId = rawAssignees[stage.id];
      if (userId && findUser(userId)) clean[stage.id] = userId;
    });
    return clean;
  }

  function syncGroupStageAssignees(group) {
    if (!group) return;
    current.tasks.filter((task) => task.groupId === group.id).forEach((task) => {
      task.stages.forEach((stage) => {
        if (stage.done || !stage.templateStageId) return;
        stage.defaultAssigneeId = group.stageAssignees?.[stage.templateStageId] || null;
      });
    });
  }

  function createGroup({ name, templateId, color, description, stageAssignees }) {
    const template = findTemplate(templateId);
    if (!template) return null;
    const group = {
      id: Utils.uid('grp'),
      name: String(name || '').trim(),
      templateId: template.id,
      color: color || PALETTE[0].value,
      description: String(description || '').trim(),
      stageAssignees: cleanStageAssignees(template, stageAssignees),
      createdAt: nowISO()
    };
    if (!group.name) return null;
    current.groups.push(group);
    save();
    return group;
  }

  function updateGroup(id, { name, templateId, color, description, stageAssignees }) {
    const group = findGroup(id);
    if (!group) return null;
    const template = findTemplate(templateId) || findTemplate(group.templateId);
    if (template) group.templateId = template.id;
    group.name = String(name || group.name).trim();
    group.color = color || group.color;
    group.description = String(description !== undefined ? description : group.description).trim();
    const nextAssignees = stageAssignees !== undefined
      ? stageAssignees
      : group.stageAssignees;
    group.stageAssignees = cleanStageAssignees(template, nextAssignees);
    syncGroupStageAssignees(group);
    save();
    return group;
  }

  function deleteGroup(id) {
    const group = findGroup(id);
    if (!group) return { ok: false, tasksDeleted: 0 };
    const before = current.tasks.length;
    current.tasks = current.tasks.filter((task) => task.groupId !== id);
    current.groups = current.groups.filter((item) => item.id !== id);
    save();
    return { ok: true, tasksDeleted: before - current.tasks.length };
  }

  function createTemplate({ name, description, stageNames }) {
    const stages = (stageNames || []).map((stage) => ({
      id: Utils.uid('tst'),
      name: String(stage || '').trim()
    })).filter((stage) => stage.name);
    if (!String(name || '').trim() || !stages.length) return null;
    const template = {
      id: Utils.uid('tpl'),
      name: String(name).trim(),
      description: String(description || '').trim(),
      stages,
      createdAt: nowISO()
    };
    current.templates.push(template);
    save();
    return template;
  }

  function updateTemplate(id, { name, description, stageNames }) {
    const template = findTemplate(id);
    if (!template) return null;
    const stages = (stageNames || []).map((stageName) => {
      const clean = String(stageName || '').trim();
      if (!clean) return null;
      const existing = template.stages.find((stage) => stage.name === clean);
      return { id: existing?.id || Utils.uid('tst'), name: clean };
    }).filter(Boolean);
    if (!stages.length) return null;
    template.name = String(name || template.name).trim();
    template.description = String(description !== undefined ? description : template.description).trim();
    template.stages = stages;
    save();
    return template;
  }

  function deleteTemplate(id) {
    const used = current.groups.some((group) => group.templateId === id);
    if (used) return { ok: false, reason: 'used' };
    const index = current.templates.findIndex((template) => template.id === id);
    if (index === -1) return { ok: false, reason: 'missing' };
    current.templates.splice(index, 1);
    save();
    return { ok: true };
  }

  function cleanBadges(badges) {
    return [...new Set((Array.isArray(badges) ? badges : [])
      .map((badge) => String(badge || '').trim().slice(0, 30))
      .filter(Boolean))].slice(0, 20);
  }

  function createUser({ name, color, badges }) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const user = {
      id: Utils.uid('usr'),
      name: clean,
      color: color || PALETTE[current.users.length % PALETTE.length].value,
      badges: cleanBadges(badges),
      createdAt: nowISO()
    };
    current.users.push(user);
    if (!current.activeUserId) current.activeUserId = user.id;
    save();
    return user;
  }

  function updateUser(id, { name, color, badges }) {
    const user = findUser(id);
    if (!user) return null;
    user.name = String(name || user.name).trim();
    user.color = color || user.color;
    if (badges !== undefined) user.badges = cleanBadges(badges);
    current.tasks.forEach((task) => {
      task.stages.forEach((stage) => {
        if (stage.completedBy === id) stage.completedByName = user.name;
      });
    });
    save();
    return user;
  }

  function deleteUser(id) {
    const user = findUser(id);
    if (!user) return { ok: false, reason: 'missing' };
    const hasHistory = current.tasks.some((task) => task.stages.some((stage) => stage.completedBy === id));
    if (hasHistory) return { ok: false, reason: 'history' };
    current.users = current.users.filter((item) => item.id !== id);
    current.tasks.forEach((task) => {
      if (task.assigneeId === id) task.assigneeId = null;
      task.stages.forEach((stage) => {
        if (stage.defaultAssigneeId === id) stage.defaultAssigneeId = null;
      });
    });
    current.groups.forEach((group) => {
      Object.keys(group.stageAssignees || {}).forEach((stageId) => {
        if (group.stageAssignees[stageId] === id) delete group.stageAssignees[stageId];
      });
    });
    if (current.activeUserId === id) current.activeUserId = current.users[0]?.id || null;
    save();
    return { ok: true };
  }

  function taskStatus(task) {
    if (!task.stages.length) return 'new';
    const done = task.stages.filter((stage) => stage.done).length;
    if (done === task.stages.length) return 'done';
    if (done > 0) return 'progress';
    return 'new';
  }

  function taskProgress(task) {
    const total = task.stages.length;
    const done = task.stages.filter((stage) => stage.done).length;
    return { done, total, pct: Utils.percent(done, total) };
  }

  function isOverdue(task) {
    if (!task.dueDate || taskStatus(task) === 'done') return false;
    return task.dueDate < Utils.todayISO();
  }

  function taskCompletedAt(task) {
    if (taskStatus(task) !== 'done') return null;
    return task.stages.reduce((latest, stage) => {
      if (!stage.completedAt) return latest;
      return !latest || new Date(stage.completedAt) > new Date(latest) ? stage.completedAt : latest;
    }, null);
  }

  function lastStage(task) {
    return task.stages[task.stages.length - 1] || null;
  }

  function nextStage(task) {
    return task.stages.find((stage) => !stage.done) || null;
  }

  function stageAssignee(task, stage = nextStage(task)) {
    if (!task || !stage || stage.done) return null;
    if (stage.defaultAssigneeId && findUser(stage.defaultAssigneeId)) return stage.defaultAssigneeId;
    const group = findGroup(task.groupId);
    const userId = stage.templateStageId ? group?.stageAssignees?.[stage.templateStageId] : null;
    return findUser(userId) ? userId : null;
  }

  function tasksWaitingOn(userId) {
    if (!userId || !findUser(userId)) return [];
    return sortTasks(current.tasks.filter((task) => (
      taskStatus(task) !== 'done' && stageAssignee(task) === userId
    )), 'due');
  }

  function sortTasks(list, sort) {
    const copy = [...list];
    if (sort === 'due') {
      copy.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return new Date(b.updatedAt) - new Date(a.updatedAt);
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    } else if (sort === 'priority') {
      copy.sort((a, b) => {
        const diff = PRIORITIES[b.priority].rank - PRIORITIES[a.priority].rank;
        return diff !== 0 ? diff : new Date(b.updatedAt) - new Date(a.updatedAt);
      });
    } else if (sort === 'oldest') {
      copy.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else {
      copy.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }
    return copy;
  }

  function filterTasks(filters = {}) {
    const search = String(filters.search || '').trim().toLowerCase();
    let list = current.tasks.filter((task) => {
      if (filters.groupId && filters.groupId !== 'all' && task.groupId !== filters.groupId) return false;
      if (filters.userId && filters.userId !== 'all' && task.assigneeId !== filters.userId) return false;
      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'overdue') {
          if (!isOverdue(task)) return false;
        } else if (taskStatus(task) !== filters.status) return false;
      }
      if (search) {
        const group = findGroup(task.groupId);
        const assignee = findUser(task.assigneeId);
        const haystack = [
          task.title,
          task.description,
          group?.name,
          assignee?.name,
          ...task.stages.map((stage) => stage.name)
        ].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    list = sortTasks(list, filters.sort || 'updated');
    return list;
  }

  function overview() {
    const list = current.tasks;
    const total = list.length;
    const done = list.filter((task) => taskStatus(task) === 'done').length;
    const progress = list.filter((task) => taskStatus(task) === 'progress').length;
    const fresh = list.filter((task) => taskStatus(task) === 'new').length;
    const overdue = list.filter(isOverdue).length;
    const stageTotal = list.reduce((sum, task) => sum + task.stages.length, 0);
    const stageDone = list.reduce((sum, task) => sum + task.stages.filter((stage) => stage.done).length, 0);
    const weekAgo = Date.now() - 7 * Utils.dayMs;
    const weeklyCompletions = list.reduce((sum, task) => sum + task.stages.filter((stage) => stage.done && stage.completedAt && new Date(stage.completedAt).getTime() >= weekAgo).length, 0);
    const today = Utils.todayISO();
    const todayCompletions = list.reduce((sum, task) => sum + task.stages.filter((stage) => stage.done && stage.completedAt && Utils.dateKey(stage.completedAt) === today).length, 0);
    const active = list.filter((task) => taskStatus(task) !== 'done');
    const dueSoon = active.filter((task) => task.dueDate && task.dueDate <= Utils.toISODate(Utils.addDays(new Date(), 3)))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const recent = [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);
    return {
      total,
      done,
      progress,
      fresh,
      overdue,
      activeCount: active.length,
      stageTotal,
      stageDone,
      stagePct: Utils.percent(stageDone, stageTotal),
      taskPct: Utils.percent(done, total),
      weeklyCompletions,
      todayCompletions,
      dueSoon,
      recent
    };
  }

  function groupSummary(groupId) {
    const group = findGroup(groupId);
    const list = current.tasks.filter((task) => task.groupId === groupId);
    const done = list.filter((task) => taskStatus(task) === 'done').length;
    const progress = list.filter((task) => taskStatus(task) === 'progress').length;
    const fresh = list.filter((task) => taskStatus(task) === 'new').length;
    const overdue = list.filter(isOverdue).length;
    const stageTotal = list.reduce((sum, task) => sum + task.stages.length, 0);
    const stageDone = list.reduce((sum, task) => sum + task.stages.filter((stage) => stage.done).length, 0);
    return {
      group,
      total: list.length,
      done,
      progress,
      fresh,
      overdue,
      stageTotal,
      stageDone,
      pct: Utils.percent(done, list.length)
    };
  }

  function allGroupSummaries() {
    return current.groups.map((group) => groupSummary(group.id));
  }

  function userSummary(userId) {
    const user = findUser(userId);
    let stages = 0;
    let lastActivity = null;
    let tasksTouched = 0;
    current.tasks.forEach((task) => {
      let touched = false;
      task.stages.forEach((stage) => {
        if (stage.done && stage.completedBy === userId) {
          stages += 1;
          touched = true;
          if (!lastActivity || new Date(stage.completedAt) > new Date(lastActivity)) lastActivity = stage.completedAt;
        }
      });
      if (touched) tasksTouched += 1;
    });
    const completedTasks = current.tasks.filter((task) => {
      const final = lastStage(task);
      return taskStatus(task) === 'done' && final?.completedBy === userId;
    }).length;
    const assignedOpen = current.tasks.filter((task) => task.assigneeId === userId && taskStatus(task) !== 'done').length;
    const last30 = Date.now() - 30 * Utils.dayMs;
    const stages30 = current.tasks.reduce((sum, task) => sum + task.stages.filter((stage) => stage.done && stage.completedBy === userId && new Date(stage.completedAt).getTime() >= last30).length, 0);
    return {
      user,
      stages,
      stages30,
      completedTasks,
      assignedOpen,
      tasksTouched,
      lastActivity
    };
  }

  function allUserSummaries() {
    return current.users.map((user) => userSummary(user.id));
  }

  function memberProfile(userId) {
    const user = findUser(userId);
    if (!user) return null;
    const last30 = Date.now() - 30 * Utils.dayMs;
    const typeMap = new Map();
    const recent = [];
    let stages = 0;
    let stages30 = 0;
    let tasksTouched = 0;
    current.tasks.forEach((task) => {
      let touched = false;
      task.stages.forEach((stage, index) => {
        if (!stage.done || stage.completedBy !== userId) return;
        const at = stage.completedAt ? new Date(stage.completedAt).getTime() : 0;
        const type = stageType(stage.name);
        if (!typeMap.has(type.key)) typeMap.set(type.key, { ...type, count: 0, count30: 0 });
        const entry = typeMap.get(type.key);
        entry.count += 1;
        stages += 1;
        touched = true;
        if (at >= last30) {
          entry.count30 += 1;
          stages30 += 1;
        }
        recent.push({
          taskId: task.id,
          taskTitle: task.title,
          stageId: stage.id,
          stageName: stage.name,
          stageIndex: index,
          stageNumber: index + 1,
          completedAt: stage.completedAt,
          group: findGroup(task.groupId),
          typeKey: type.key,
          typeLabel: type.label,
          typeIcon: type.icon
        });
      });
      if (touched) tasksTouched += 1;
    });
    recent.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
    const completedTasks = current.tasks.filter((task) => (
      taskStatus(task) === 'done' && lastStage(task)?.completedBy === userId
    )).length;
    const assignedOpen = current.tasks.filter((task) => (
      task.assigneeId === userId && taskStatus(task) !== 'done'
    )).length;
    const waiting = tasksWaitingOn(userId);
    const typeStats = [...typeMap.values()].sort((a, b) => b.count - a.count || b.count30 - a.count30);
    return {
      user,
      badges: user.badges || [],
      typeStats,
      recent,
      waiting,
      totals: {
        stages,
        stages30,
        completedTasks,
        assignedOpen,
        tasksTouched,
        waiting: waiting.length,
        lastActivity: recent[0]?.completedAt || null
      }
    };
  }

  function dailySeries(fromDate, toDate, filters = {}) {
    const start = Utils.startOfDay(fromDate);
    const end = Utils.startOfDay(toDate);
    const groups = new Map();
    for (let cursor = new Date(start); cursor <= end; cursor = Utils.addDays(cursor, 1)) {
      groups.set(Utils.toISODate(cursor), { date: Utils.toISODate(cursor), label: Utils.fmtDayMonth(cursor), value: 0 });
    }
    current.tasks.forEach((task) => {
      if (filters.groupId && filters.groupId !== 'all' && task.groupId !== filters.groupId) return;
      task.stages.forEach((stage) => {
        if (!stage.done || !stage.completedAt) return;
        if (filters.userId && filters.userId !== 'all' && stage.completedBy !== filters.userId) return;
        const key = Utils.dateKey(stage.completedAt);
        if (groups.has(key)) groups.get(key).value += 1;
      });
    });
    return [...groups.values()];
  }

  function activityLastDays(days = 14) {
    const end = new Date();
    const start = Utils.addDays(end, -(days - 1));
    return dailySeries(start, end);
  }

  function completionSeries(fromDate, toDate, filters = {}) {
    const startDate = fromDate || Utils.addDays(new Date(), -29);
    const endDate = toDate || new Date();
    const days = Math.max(1, Math.round((Utils.startOfDay(endDate).getTime() - Utils.startOfDay(startDate).getTime()) / Utils.dayMs) + 1);
    if (days <= 45) return dailySeries(startDate, endDate, filters);
    const buckets = [];
    if (days <= 190) {
      let cursor = Utils.startOfWeek(startDate);
      while (cursor <= endDate) {
        const bucketEnd = Utils.addDays(cursor, 6);
        buckets.push({
          date: Utils.toISODate(cursor),
          label: Utils.fmtDayMonth(cursor),
          from: cursor,
          to: bucketEnd,
          value: 0
        });
        cursor = Utils.addDays(cursor, 7);
      }
    } else {
      let cursor = Utils.startOfMonth(startDate);
      while (cursor <= endDate) {
        const monthEnd = Utils.endOfMonth(cursor);
        buckets.push({
          date: Utils.toISODate(cursor),
          label: new Intl.DateTimeFormat(Utils.AR, { month: 'short', year: 'numeric' }).format(cursor),
          from: cursor,
          to: monthEnd,
          value: 0
        });
        cursor = Utils.addDays(monthEnd, 1);
      }
    }
    current.tasks.forEach((task) => {
      if (filters.groupId && filters.groupId !== 'all' && task.groupId !== filters.groupId) return;
      task.stages.forEach((stage) => {
        if (!stage.done || !stage.completedAt) return;
        if (filters.userId && filters.userId !== 'all' && stage.completedBy !== filters.userId) return;
        const time = new Date(stage.completedAt).getTime();
        const bucket = buckets.find((item) => time >= item.from.getTime() && time <= Utils.endOfDay(item.to).getTime());
        if (bucket) bucket.value += 1;
      });
    });
    return buckets;
  }

  function resolvePeriod(filters) {
    const now = new Date();
    if (filters.period === 'week') return { from: Utils.startOfWeek(now), to: Utils.endOfDay(now), label: 'هذا الأسبوع' };
    if (filters.period === 'month') return { from: Utils.startOfMonth(now), to: Utils.endOfDay(now), label: 'هذا الشهر' };
    if (filters.period === '30') return { from: Utils.startOfDay(Utils.addDays(now, -29)), to: Utils.endOfDay(now), label: 'آخر 30 يومًا' };
    if (filters.period === 'custom') {
      const from = Utils.startOfDay(filters.from || Utils.addDays(now, -29));
      const to = Utils.endOfDay(filters.to || now);
      if (from > to) return { from: Utils.startOfDay(to), to: Utils.endOfDay(from), label: 'فترة مخصصة' };
      return { from, to, label: 'فترة مخصصة' };
    }
    return { from: null, to: null, label: 'كل الفترة' };
  }

  function report(filters = {}) {
    const range = resolvePeriod(filters);
    const groupId = filters.groupId || 'all';
    const userId = filters.userId || 'all';
    const inRange = (value) => {
      if (!value) return false;
      const date = Utils.toDate(value);
      if (!date) return false;
      if (range.from && date < range.from) return false;
      if (range.to && date > range.to) return false;
      return true;
    };
    const group = groupId !== 'all' ? findGroup(groupId) : null;
    const user = userId !== 'all' ? findUser(userId) : null;
    const scoped = current.tasks.filter((task) => groupId === 'all' || task.groupId === groupId);
    const stageEvents = [];
    scoped.forEach((task) => {
      const taskGroup = findGroup(task.groupId);
      task.stages.forEach((stage) => {
        if (!stage.done || !inRange(stage.completedAt)) return;
        if (userId !== 'all' && stage.completedBy !== userId) return;
        stageEvents.push({ task, stage, group: taskGroup });
      });
    });
    const createdTasks = scoped.filter((task) => inRange(task.createdAt) && (userId === 'all' || task.assigneeId === userId));
    const completedTasks = scoped.filter((task) => {
      if (taskStatus(task) !== 'done') return false;
      const final = lastStage(task);
      if (!final || !inRange(final.completedAt)) return false;
      if (userId !== 'all' && final.completedBy !== userId) return false;
      return true;
    });
    const overdueTasks = scoped.filter((task) => isOverdue(task) && (userId === 'all' || task.assigneeId === userId));
    const activeTasks = scoped.filter((task) => taskStatus(task) !== 'done' && (userId === 'all' || task.assigneeId === userId));

    const groupRows = current.groups
      .filter((item) => groupId === 'all' || item.id === groupId)
      .map((item) => {
        const itemStageEvents = stageEvents.filter((event) => event.group?.id === item.id);
        const itemCreated = createdTasks.filter((task) => task.groupId === item.id);
        const itemCompleted = completedTasks.filter((task) => task.groupId === item.id);
        const itemOverdue = overdueTasks.filter((task) => task.groupId === item.id);
        const itemActive = activeTasks.filter((task) => task.groupId === item.id);
        return {
          group: item,
          created: itemCreated.length,
          completed: itemCompleted.length,
          stages: itemStageEvents.length,
          active: itemActive.length,
          overdue: itemOverdue.length
        };
      })
      .sort((a, b) => b.stages - a.stages);

    const relevantUsers = userId === 'all' ? current.users : current.users.filter((item) => item.id === userId);
    const memberRows = relevantUsers.map((item) => {
      const events = stageEvents.filter((event) => event.stage.completedBy === item.id);
      const finals = completedTasks.filter((task) => lastStage(task)?.completedBy === item.id);
      const groupsTouched = new Set(events.map((event) => event.task.groupId));
      const lastEvent = events.reduce((latest, event) => {
        if (!latest) return event.stage.completedAt;
        return new Date(event.stage.completedAt) > new Date(latest) ? event.stage.completedAt : latest;
      }, null);
      return {
        user: item,
        stages: events.length,
        completedTasks: finals.length,
        groupsTouched: groupsTouched.size,
        lastActivity: lastEvent,
        assignedOpen: current.tasks.filter((task) => task.assigneeId === item.id && taskStatus(task) !== 'done').length
      };
    }).sort((a, b) => b.stages - a.stages || b.completedTasks - a.completedTasks);

    const stageMap = new Map();
    scoped.forEach((task) => {
      task.stages.forEach((stage) => {
        const key = stage.name.trim();
        if (!stageMap.has(key)) stageMap.set(key, { name: key, completed: 0, pending: 0 });
        if (!stage.done) stageMap.get(key).pending += 1;
      });
    });
    stageEvents.forEach((event) => {
      const key = event.stage.name.trim();
      if (!stageMap.has(key)) stageMap.set(key, { name: key, completed: 0, pending: 0 });
      stageMap.get(key).completed += 1;
    });
    const stageRows = [...stageMap.values()].sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name, 'ar'));

    let seriesFrom = range.from;
    let seriesTo = range.to;
    if (!seriesFrom) {
      let earliest = null;
      current.tasks.forEach((task) => {
        if (groupId !== 'all' && task.groupId !== groupId) return;
        task.stages.forEach((stage) => {
          if (!stage.done || !stage.completedAt) return;
          if (userId !== 'all' && stage.completedBy !== userId) return;
          if (!earliest || new Date(stage.completedAt) < new Date(earliest)) earliest = stage.completedAt;
        });
      });
      seriesFrom = earliest ? Utils.startOfDay(earliest) : Utils.addDays(new Date(), -29);
    }
    if (!seriesTo) seriesTo = Utils.endOfDay(new Date());
    if (Utils.startOfDay(seriesFrom) > seriesTo) seriesFrom = Utils.startOfDay(seriesTo);
    const series = completionSeries(seriesFrom, seriesTo, { groupId, userId });

    return {
      filters: {
        period: filters.period || 'month',
        from: filters.from || '',
        to: filters.to || '',
        groupId,
        userId
      },
      range: {
        from: range.from,
        to: range.to,
        fromISO: range.from ? Utils.toISODate(range.from) : '',
        toISO: range.to ? Utils.toISODate(range.to) : ''
      },
      rangeLabel: range.label,
      group,
      user,
      generatedAt: nowISO(),
      totals: {
        tasks: scoped.length,
        created: createdTasks.length,
        completed: completedTasks.length,
        stages: stageEvents.length,
        active: activeTasks.length,
        overdue: overdueTasks.length,
        stageTotal: scoped.reduce((sum, task) => sum + task.stages.length, 0),
        stageDone: scoped.reduce((sum, task) => sum + task.stages.filter((stage) => stage.done).length, 0),
        completionPct: Utils.percent(scoped.filter((task) => taskStatus(task) === 'done').length, scoped.length)
      },
      groupRows,
      memberRows,
      stageRows,
      series,
      seriesFrom,
      seriesTo
    };
  }

  // ---------------------------------------------------------------- prompts
  function prompts() {
    return current?.prompts || [];
  }

  function findPrompt(id) {
    return prompts().find((prompt) => prompt.id === id) || null;
  }

  function newPromptId() {
    let id = Utils.uid('prm');
    let counter = 1;
    while (findPrompt(id)) {
      id = `${Utils.uid('prm')}_${counter}`;
      counter += 1;
    }
    return id;
  }

  function createPrompt({ name, description = '', content = '' } = {}) {
    if (!current) return null;
    const prompt = {
      id: newPromptId(),
      name: String(name || '').trim() || 'برومت جديد',
      description: String(description || '').trim(),
      content: String(content || ''),
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    current.prompts.unshift(prompt);
    save();
    return prompt;
  }

  function updatePrompt(id, { name, description, content } = {}) {
    const prompt = findPrompt(id);
    if (!prompt) return null;
    if (name !== undefined) prompt.name = String(name || '').trim() || prompt.name;
    if (description !== undefined) prompt.description = String(description || '').trim();
    if (content !== undefined) prompt.content = String(content || '');
    prompt.updatedAt = nowISO();
    save();
    return prompt;
  }

  function deletePrompt(id) {
    if (!current) return false;
    const before = current.prompts.length;
    current.prompts = current.prompts.filter((prompt) => prompt.id !== id);
    save();
    return current.prompts.length !== before;
  }

  function duplicatePrompt(id) {
    const prompt = findPrompt(id);
    if (!prompt) return null;
    const copy = {
      ...prompt,
      id: newPromptId(),
      name: `${prompt.name} (نسخة)`,
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    current.prompts.unshift(copy);
    save();
    return copy;
  }

  // ------------------------------------------------------------- repo link
  function setRepoSettings(patch = {}) {
    if (!current) return null;
    const base = current.settings.repo || { path: '', repoId: '', autoRename: true, linkedAt: nowISO(), lastSyncAt: null };
    const next = { ...base, ...patch };
    current.settings.repo = next.path ? next : null;
    save();
    return current.settings.repo;
  }

  function linkRepo({ path, repoId = '', autoRename = true } = {}) {
    const clean = String(path || '').trim();
    if (!clean) return null;
    return setRepoSettings({ path: clean, repoId: String(repoId || ''), autoRename, linkedAt: nowISO(), lastSyncAt: null });
  }

  function unlinkRepo() {
    if (!current) return false;
    current.settings.repo = null;
    current.groups.forEach((group) => { group.folder = ''; });
    current.tasks.forEach((task) => { task.folder = ''; });
    save();
    return true;
  }

  function applyFolderIndex({ groups = {}, tasks = {}, syncedAt = null } = {}) {
    if (!current) return;
    current.groups.forEach((group) => {
      if (typeof groups[group.id] === 'string') group.folder = groups[group.id];
    });
    current.tasks.forEach((task) => {
      if (typeof tasks[task.id] === 'string') task.folder = tasks[task.id];
    });
    if (current.settings.repo) current.settings.repo.lastSyncAt = syncedAt || nowISO();
    save();
  }

  function folderFor(target = {}) {
    if (target.taskId) return findTask(target.taskId)?.folder || '';
    if (target.groupId) return findGroup(target.groupId)?.folder || '';
    return '';
  }

  // ------------------------------------------------------------ automations
  function automation(id) {
    return (current?.automations || []).find((job) => job.id === id) || null;
  }

  function startAutomation({ taskId, promptId = null, promptName = '', model = '', notes = '', promptText = '', taskFolder = '', sessionID = '' } = {}) {
    if (!current) return null;
    const task = findTask(taskId);
    if (!task) return null;
    const group = findGroup(task.groupId);
    let jobId = Utils.uid('job');
    let suffix = 1;
    while (automation(jobId)) {
      jobId = `${Utils.uid('job')}_${suffix}`;
      suffix += 1;
    }
    const job = {
      id: jobId,
      taskId: task.id,
      taskTitle: task.title,
      groupId: group?.id || null,
      groupName: group?.name || '',
      promptId,
      promptName,
      model,
      notes,
      promptText,
      status: 'queued',
      progress: 0,
      phase: 'في الانتظار',
      etaSeconds: 0,
      steps: 0,
      sessionID,
      taskFolder,
      startedAt: nowISO(),
      endedAt: null,
      exitCode: null,
      error: '',
      usage: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0 }
    };
    current.automations.push(job);
    if (current.automations.length > 1500) current.automations = current.automations.slice(-1500);
    save();
    return job;
  }

  function updateAutomation(id, patch = {}) {
    const job = automation(id);
    if (!job) return null;
    const next = { ...patch };
    if (patch.usage) next.usage = { ...job.usage, ...patch.usage };
    Object.assign(job, next);
    save();
    return job;
  }

  function finishAutomation(id, { status = 'done', exitCode = null, error = '', usage = null, endedAt = null } = {}) {
    const job = automation(id);
    if (!job) return null;
    if (status === 'done' || status === 'failed' || status === 'cancelled' || status === 'interrupted') {
      job.status = status;
      job.endedAt = endedAt || nowISO();
      job.exitCode = exitCode;
      job.error = error || '';
      if (usage) job.usage = { ...job.usage, ...usage };
      if (status === 'done') job.progress = 100;
      save();
    }
    return job;
  }

  function activeAutomation(taskId) {
    return (current?.automations || []).find((job) => job.taskId === taskId && (job.status === 'running' || job.status === 'queued')) || null;
  }

  function automationsForTask(taskId) {
    return (current?.automations || []).filter((job) => job.taskId === taskId).slice().reverse();
  }

  function automationStats({ days = 30, from = null, to = null } = {}) {
    const all = current?.automations || [];
    const end = to ? new Date(to) : new Date();
    const start = from
      ? new Date(from)
      : new Date(end.getTime() - Math.max(1, Number(days) || 30) * 86400000);
    const inRange = all.filter((job) => {
      const stamp = new Date(job.startedAt);
      return !Number.isNaN(stamp.getTime()) && stamp >= start && stamp <= end;
    });
    const finished = inRange.filter((job) => ['done', 'failed', 'cancelled'].includes(job.status));
    const succeeded = inRange.filter((job) => job.status === 'done');
    const failed = inRange.filter((job) => job.status === 'failed');
    const cancelled = inRange.filter((job) => job.status === 'cancelled');
    const running = inRange.filter((job) => job.status === 'running' || job.status === 'queued');
    const sum = (list, pick) => list.reduce((total, item) => total + (Number(pick(item)) || 0), 0);
    const duration = (job) => {
      const startStamp = new Date(job.startedAt).getTime();
      const endStamp = job.endedAt ? new Date(job.endedAt).getTime() : null;
      return startStamp && endStamp && endStamp > startStamp ? (endStamp - startStamp) / 1000 : 0;
    };
    const groupBy = (list, keyOf) => {
      const map = new Map();
      list.forEach((job) => {
        const key = keyOf(job) || 'غير محدد';
        const entry = map.get(key) || { key, runs: 0, costUSD: 0, tokens: 0, done: 0, failed: 0 };
        entry.runs += 1;
        entry.costUSD += Number(job.usage?.costUSD) || 0;
        entry.tokens += (Number(job.usage?.input) || 0) + (Number(job.usage?.output) || 0);
        if (job.status === 'done') entry.done += 1;
        if (job.status === 'failed') entry.failed += 1;
        map.set(key, entry);
      });
      return [...map.values()].sort((a, b) => b.costUSD - a.costUSD || b.runs - a.runs);
    };
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      total: inRange.length,
      running: running.length,
      done: succeeded.length,
      failed: failed.length,
      cancelled: cancelled.length,
      finished: finished.length,
      successPct: finished.length ? Math.round((succeeded.length / finished.length) * 100) : 0,
      costUSD: Math.round(sum(inRange, (job) => job.usage?.costUSD) * 1e6) / 1e6,
      tokens: {
        input: sum(inRange, (job) => job.usage?.input),
        output: sum(inRange, (job) => job.usage?.output),
        reasoning: sum(inRange, (job) => job.usage?.reasoning),
        cacheRead: sum(inRange, (job) => job.usage?.cacheRead),
        cacheWrite: sum(inRange, (job) => job.usage?.cacheWrite)
      },
      avgDurationSec: finished.length
        ? Math.round(sum(finished, duration) / finished.length)
        : 0,
      avgCostUSD: inRange.length ? Math.round((sum(inRange, (job) => job.usage?.costUSD) / inRange.length) * 1e6) / 1e6 : 0,
      byModel: groupBy(inRange, (job) => job.model),
      byGroup: groupBy(inRange, (job) => job.groupName || findGroup(job.groupId)?.name),
      byPrompt: groupBy(inRange, (job) => job.promptName),
      recent: inRange.slice(-8).reverse(),
      active: running.slice().reverse()
    };
  }

  function automationDailySeries(days = 30, metric = 'cost') {
    const count = Utils.clamp(Number(days) || 30, 1, 120);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const points = [];
    for (let index = count - 1; index >= 0; index -= 1) {
      const day = new Date(now.getTime() - index * 86400000);
      points.push({ date: day, value: 0, runs: 0 });
    }
    const index0 = points[0].date.getTime();
    (current?.automations || []).forEach((job) => {
      const stamp = new Date(job.startedAt);
      if (Number.isNaN(stamp.getTime())) return;
      const day = new Date(stamp);
      day.setHours(0, 0, 0, 0);
      const offset = Math.round((day.getTime() - index0) / 86400000);
      const point = points[offset];
      if (!point) return;
      point.runs += 1;
      point.value += metric === 'cost' ? (Number(job.usage?.costUSD) || 0) : 1;
    });
    return points.map((point) => ({
      label: point.date.toISOString().slice(0, 10),
      value: metric === 'cost' ? Math.round(point.value * 1e6) / 1e6 : point.value,
      runs: point.runs
    }));
  }

  function setAiSettings(patch = {}) {
    if (!current) return null;
    const base = current.settings.ai;
    const next = { ...base, ...patch };
    if (patch.filter) next.filter = { ...base.filter, ...patch.filter };
    if (patch.modelsCache) next.modelsCache = { ...base.modelsCache, ...patch.modelsCache };
    current.settings.ai = next;
    save();
    return next;
  }

  function securityEnabled() {
    return Boolean(current?.settings?.security?.hash);
  }

  function isUnlocked() {
    return !securityEnabled() || unlocked;
  }

  function lock() {
    unlocked = false;
  }

  function unlock() {
    unlocked = true;
  }

  function randomSalt() {
    const bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function hashPassword(password, salt, iterations) {
    const rounds = Utils.clamp(Number(iterations) || 1200, 100, 20000);
    const text = `${salt}\u0000${password}`;
    if (window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined') {
      try {
        const seed = new TextEncoder().encode(text);
        let value = seed;
        for (let round = 0; round < rounds; round += 1) {
          const buffer = new Uint8Array(value.length + seed.length);
          buffer.set(value, 0);
          buffer.set(seed, value.length);
          value = new Uint8Array(await window.crypto.subtle.digest('SHA-256', buffer));
        }
        return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      } catch (error) {}
    }
    let state = 0x811c9dc5;
    let output = '';
    for (let round = 0; round < rounds; round += 1) {
      for (let i = 0; i < text.length; i += 1) {
        state ^= text.charCodeAt(i) + round;
        state = Math.imul(state, 16777619) >>> 0;
      }
      output += state.toString(16).padStart(8, '0');
      if (output.length >= 64) break;
    }
    return output.slice(0, 64).padEnd(64, '0');
  }

  async function setPassword(password) {
    const clean = String(password || '');
    if (clean.length < 4) return false;
    const salt = randomSalt();
    const iterations = 1200;
    const hash = await hashPassword(clean, salt, iterations);
    current.settings.security = { salt, hash, iterations, updatedAt: nowISO() };
    unlocked = true;
    save();
    return true;
  }

  async function verifyPassword(password) {
    if (!securityEnabled()) return false;
    const security = current.settings.security;
    const hash = await hashPassword(String(password || ''), security.salt, security.iterations);
    return hash === security.hash;
  }

  function clearPassword() {
    current.settings.security = null;
    unlocked = true;
    save();
  }

  function securityFingerprint() {
    const hash = current?.settings?.security?.hash;
    if (!hash) return '';
    return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
  }

  function clearDemo() {
    const before = current.tasks.length;
    current.tasks = current.tasks.filter((task) => !task.isDemo);
    current.settings.demo = false;
    save();
    return before - current.tasks.length;
  }

  function storageBytes() {
    if (!current) return 0;
    return new Blob([JSON.stringify(current)]).size;
  }

  return {
    STORAGE_KEY,
    VERSION,
    PALETTE,
    PRIORITIES,
    STATUS,
    BADGE_SUGGESTIONS,
    STAGE_TYPES,
    stageType,
    load,
    save,
    get,
    snapshot,
    replace,
    reset,
    normalize,
    createWorkspace,
    settings,
    users,
    templates,
    groups,
    tasks,
    findUser,
    findTemplate,
    findGroup,
    findTask,
    findLink,
    setActiveUser,
    setSetting,
    updateSettings,
    addLink,
    updateLink,
    deleteLink,
    setTheme,
    setBackup,
    createTask,
    updateTask,
    duplicateTask,
    deleteTask,
    completeStage,
    setStageCompleter,
    reopenStage,
    createGroup,
    updateGroup,
    deleteGroup,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    createUser,
    updateUser,
    deleteUser,
    taskStatus,
    taskProgress,
    isOverdue,
    taskCompletedAt,
    lastStage,
    nextStage,
    stageAssignee,
    tasksWaitingOn,
    sortTasks,
    filterTasks,
    overview,
    groupSummary,
    allGroupSummaries,
    userSummary,
    allUserSummaries,
    memberProfile,
    dailySeries,
    activityLastDays,
    completionSeries,
    report,
    securityEnabled,
    isUnlocked,
    lock,
    unlock,
    setPassword,
    verifyPassword,
    clearPassword,
    securityFingerprint,
    clearDemo,
    storageBytes,
    prompts,
    findPrompt,
    createPrompt,
    updatePrompt,
    deletePrompt,
    duplicatePrompt,
    setRepoSettings,
    linkRepo,
    unlinkRepo,
    applyFolderIndex,
    folderFor,
    automation,
    startAutomation,
    updateAutomation,
    finishAutomation,
    activeAutomation,
    automationsForTask,
    automationStats,
    automationDailySeries,
    setAiSettings,
    restoreFromMirror
  };
})();
