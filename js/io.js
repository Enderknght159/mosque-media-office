const IO = (() => {
  function filename(extension, prefix = 'mosque-media-office') {
    return `${prefix}-${Utils.slugDate(new Date())}.${extension}`;
  }

  function exportJSON(data) {
    const payload = {
      ...JSON.parse(JSON.stringify(data)),
      meta: {
        app: 'mosque-media-office',
        version: Data.VERSION,
        exportedAt: new Date().toISOString()
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    Utils.downloadBlob(blob, filename('json'));
  }

  function summarize(raw) {
    const normalized = Data.normalize(raw);
    return {
      normalized,
      summary: {
        mosqueName: normalized.settings.mosqueName,
        tasks: normalized.tasks.length,
        groups: normalized.groups.length,
        templates: normalized.templates.length,
        users: normalized.users.length,
        stages: normalized.tasks.reduce((sum, task) => sum + task.stages.length, 0)
      }
    };
  }

  async function importJSON(file) {
    const text = await Utils.readFileAsText(file);
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new Error('تعذر قراءة ملف JSON. تأكد أن الملف صالح.');
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks) || !Array.isArray(raw.groups)) {
      throw new Error('الملف لا يحتوي على بيانات مكتب إعلامي صالحة.');
    }
    return summarize(raw);
  }

  function makeSheet(rows, widths) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map((width) => ({ wch: width }));
    ws['!views'] = [{ RTL: true }];
    if (rows.length > 1 && rows[0].length) {
      ws['!autofilter'] = {
        ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } })
      };
    }
    return ws;
  }

  function addSheet(workbook, name, rows, widths) {
    XLSX.utils.book_append_sheet(workbook, makeSheet(rows, widths), name);
  }

  function priorityLabel(value) {
    return Data.PRIORITIES[value]?.label || 'عادية';
  }

  function exportExcel(data) {
    const workbook = XLSX.utils.book_new();

    const taskRows = [[
      'المعرّف', 'العنوان', 'المجموعة', 'معرّف المجموعة', 'القالب', 'معرّف القالب',
      'المسؤول', 'معرّف المسؤول', 'الأولوية', 'تاريخ الاستحقاق', 'الوصف',
      'تاريخ الإنشاء', 'آخر تحديث', 'المراحل المنجزة', 'إجمالي المراحل', 'الحالة', 'بيانات تجريبية'
    ]];
    data.tasks.forEach((task) => {
      const group = data.groups.find((item) => item.id === task.groupId);
      const template = data.templates.find((item) => item.id === task.templateId);
      const assignee = data.users.find((item) => item.id === task.assigneeId);
      const progress = task.stages.filter((stage) => stage.done).length;
      taskRows.push([
        task.id,
        task.title,
        group?.name || '',
        group?.id || '',
        template?.name || '',
        template?.id || '',
        assignee?.name || '',
        assignee?.id || '',
        priorityLabel(task.priority),
        task.dueDate || '',
        task.description || '',
        task.createdAt || '',
        task.updatedAt || '',
        progress,
        task.stages.length,
        Data.STATUS[Data.taskStatus(task)].label,
        task.isDemo ? 'نعم' : 'لا'
      ]);
    });

    const stageRows = [['معرّف المهمة', 'المهمة', 'الترتيب', 'معرّف المرحلة', 'المرحلة', 'الحالة', 'أنجزها', 'معرّف المنجز', 'تاريخ الإنجاز', 'ملاحظة']];
    data.tasks.forEach((task) => {
      task.stages.forEach((stage, index) => {
        stageRows.push([
          task.id,
          task.title,
          index + 1,
          stage.id,
          stage.name,
          stage.done ? 'منجزة' : 'متبقية',
          stage.done ? (stage.completedByName || '') : '',
          stage.done ? (stage.completedBy || '') : '',
          stage.done ? (stage.completedAt || '') : '',
          stage.note || ''
        ]);
      });
    });

    const groupRows = [['المعرّف', 'الاسم', 'معرّف القالب', 'القالب', 'اللون', 'الوصف', 'المراحل المسندة', 'تاريخ الإنشاء']];
    data.groups.forEach((group) => {
      const template = data.templates.find((item) => item.id === group.templateId);
      const assignments = Object.entries(group.stageAssignees || {})
        .map(([stageId, userId]) => {
          const stage = template?.stages.find((item) => item.id === stageId);
          const user = data.users.find((item) => item.id === userId);
          return stage && user ? `${stage.name}=${user.name}` : '';
        })
        .filter(Boolean)
        .join(' | ');
      groupRows.push([group.id, group.name, group.templateId || '', template?.name || '', group.color, group.description || '', assignments, group.createdAt || '']);
    });

    const templateRows = [['المعرّف', 'الاسم', 'الوصف', 'المراحل', 'عدد المراحل']];
    data.templates.forEach((template) => {
      templateRows.push([template.id, template.name, template.description || '', template.stages.map((stage) => stage.name).join(' | '), template.stages.length]);
    });

    const userRows = [['المعرّف', 'الاسم', 'اللون', 'الشارات', 'تاريخ الإضافة']];
    data.users.forEach((user) => {
      userRows.push([user.id, user.name, user.color, (user.badges || []).join(' | '), user.createdAt || '']);
    });

    addSheet(workbook, 'المهام', taskRows, [34, 34, 18, 34, 18, 34, 18, 34, 10, 14, 40, 22, 22, 12, 12, 12, 14]);
    addSheet(workbook, 'المراحل', stageRows, [34, 34, 8, 34, 22, 10, 18, 34, 22, 36]);
    addSheet(workbook, 'المجموعات', groupRows, [34, 18, 34, 18, 10, 38, 44, 22]);
    addSheet(workbook, 'القوالب', templateRows, [34, 20, 36, 60, 12]);
    addSheet(workbook, 'الأعضاء', userRows, [34, 22, 10, 40, 22]);

    const active = data.users.find((user) => user.id === data.activeUserId);
    const settingsRows = [['الإعداد', 'القيمة', 'ملاحظة']];
    settingsRows.push(
      ['اسم المسجد', data.settings.mosqueName, ''],
      ['وصف المكتب', data.settings.tagline || 'المكتب الإعلامي', ''],
      ['العضو النشط', active?.name || '', ''],
      ['معرّف العضو النشط', active?.id || '', ''],
      ['المظهر', data.settings.theme || 'auto', 'auto أو light أو dark'],
      ['بيانات تجريبية', data.settings.demo ? 'نعم' : 'لا', ''],
      ['تاريخ الإنشاء', data.settings.createdAt || '', '']
    );
    addSheet(workbook, 'الإعدادات', settingsRows, [26, 34, 26]);

    const linkRows = [['المعرّف', 'الاسم', 'الرابط', 'الأيقونة']];
    (data.settings.links || []).forEach((link) => {
      linkRows.push([link.id, link.name, link.url, link.icon || 'globe']);
    });
    addSheet(workbook, 'الروابط', linkRows, [34, 24, 54, 14]);

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    Utils.downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename('xlsx'));
  }

  function cellString(value) {
    return String(value ?? '').trim();
  }

  function cellDate(value) {
    if (value == null || value === '') return '';
    if (value instanceof Date) return value.toISOString();
    const parsed = Utils.toDate(String(value));
    return parsed ? parsed.toISOString() : '';
  }

  function cellDay(value) {
    if (value == null || value === '') return '';
    if (value instanceof Date) return Utils.toISODate(value);
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = Utils.toDate(text);
    return parsed ? Utils.toISODate(parsed) : '';
  }

  function yes(value) {
    return ['نعم', 'true', '1', 'yes', 'نعم،'].includes(cellString(value).toLowerCase());
  }

  function sheetRows(workbook, name) {
    const sheet = workbook.Sheets[name];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  }

  async function importExcel(file) {
    const buffer = await Utils.readFileAsArrayBuffer(file);
    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    } catch (error) {
      throw new Error('تعذر قراءة ملف Excel. تأكد أن الملف بصيغة xlsx.');
    }
    const required = ['المهام', 'المجموعات', 'القوالب'];
    const available = required.filter((name) => workbook.Sheets[name]);
    if (available.length !== required.length) {
      throw new Error('الملف لا يطابق صيغة النسخة الاحتياطية. استخدم ملف Excel المصدَّر من التطبيق.');
    }

    const now = new Date().toISOString();
    const users = [];
    const userById = new Map();
    const userByName = new Map();

    function splitList(value) {
      return cellString(value).split(/\s*[|،,]\s*/).map((item) => item.trim()).filter(Boolean);
    }

    function addUser({ id, name, color, createdAt, badges }) {
      const clean = cellString(name);
      if (!clean) return null;
      const userId = cellString(id) || Utils.uid('usr');
      const user = {
        id: userId,
        name: clean,
        color: /^#[0-9a-f]{6}$/i.test(cellString(color)) ? cellString(color) : Data.PALETTE[users.length % Data.PALETTE.length].value,
        badges: [...new Set((Array.isArray(badges) ? badges : splitList(badges)).map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 20),
        createdAt: cellDate(createdAt) || now
      };
      users.push(user);
      userById.set(user.id, user);
      userByName.set(user.name, user);
      return user;
    }

    sheetRows(workbook, 'الأعضاء').forEach((row) => {
      addUser({ id: row['المعرّف'], name: row['الاسم'], color: row['اللون'], badges: row['الشارات'], createdAt: row['تاريخ الإضافة'] });
    });

    function resolveUser(id, name, create = true) {
      const byId = userById.get(cellString(id));
      if (byId) return byId;
      const byName = userByName.get(cellString(name));
      if (byName) return byName;
      if (create && cellString(name)) return addUser({ id, name, color: '', createdAt: now });
      return null;
    }

    const templates = [];
    const templateById = new Map();
    const templateByName = new Map();
    sheetRows(workbook, 'القوالب').forEach((row) => {
      const template = {
        id: cellString(row['المعرّف']) || Utils.uid('tpl'),
        name: cellString(row['الاسم']),
        description: cellString(row['الوصف']),
        stages: cellString(row['المراحل'])
          .split('|')
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => ({ id: Utils.uid('tst'), name })),
        createdAt: now
      };
      if (!template.name) return;
      templates.push(template);
      templateById.set(template.id, template);
      templateByName.set(template.name, template);
    });

    const groups = [];
    const groupById = new Map();
    const groupByName = new Map();
    sheetRows(workbook, 'المجموعات').forEach((row) => {
      const template = templateById.get(cellString(row['معرّف القالب'])) || templateByName.get(cellString(row['القالب'])) || null;
      const stageAssignees = {};
      splitList(row['المراحل المسندة']).forEach((entry) => {
        const divider = entry.indexOf('=');
        if (divider === -1) return;
        const stageName = entry.slice(0, divider).trim();
        const userName = entry.slice(divider + 1).trim();
        const stage = template?.stages.find((item) => item.name === stageName);
        const user = userByName.get(userName);
        if (stage && user) stageAssignees[stage.id] = user.id;
      });
      const group = {
        id: cellString(row['المعرّف']) || Utils.uid('grp'),
        name: cellString(row['الاسم']),
        templateId: template?.id || null,
        color: /^#[0-9a-f]{6}$/i.test(cellString(row['اللون'])) ? cellString(row['اللون']) : Data.PALETTE[groups.length % Data.PALETTE.length].value,
        description: cellString(row['الوصف']),
        stageAssignees,
        createdAt: cellDate(row['تاريخ الإنشاء']) || now
      };
      if (!group.name) return;
      groups.push(group);
      groupById.set(group.id, group);
      groupByName.set(group.name, group);
    });

    const stageRowsByTask = new Map();
    sheetRows(workbook, 'المراحل').forEach((row) => {
      const taskId = cellString(row['معرّف المهمة']);
      const taskTitle = cellString(row['المهمة']);
      const key = taskId || `title:${taskTitle}`;
      if (!stageRowsByTask.has(key)) stageRowsByTask.set(key, []);
      stageRowsByTask.get(key).push(row);
    });

    const tasks = [];
    sheetRows(workbook, 'المهام').forEach((row) => {
      const title = cellString(row['العنوان']);
      if (!title) return;
      const taskId = cellString(row['المعرّف']) || Utils.uid('task');
      const group = groupById.get(cellString(row['معرّف المجموعة'])) || groupByName.get(cellString(row['المجموعة'])) || null;
      if (!group && cellString(row['المجموعة'])) {
        throw new Error(`المهمة «${title}» مرتبطة بمجموعة غير موجودة في الملف.`);
      }
      const template = group?.templateId ? templateById.get(group.templateId) : (templateById.get(cellString(row['معرّف القالب'])) || templateByName.get(cellString(row['القالب'])) || null);
      const assignee = resolveUser(row['معرّف المسؤول'], row['المسؤول'], false);
      const stageSource = [...(stageRowsByTask.get(taskId) || stageRowsByTask.get(`title:${title}`) || [])]
        .sort((a, b) => Number(a['الترتيب'] || 0) - Number(b['الترتيب'] || 0));
      let stages = stageSource
        .map((stageRow) => {
          const stageName = cellString(stageRow['المرحلة']);
          if (!stageName) return null;
          const done = ['منجزة', 'مكتملة', 'منجز', 'true', 'نعم'].includes(cellString(stageRow['الحالة'])) || Boolean(cellDate(stageRow['تاريخ الإنجاز']));
          const completedBy = done ? resolveUser(stageRow['معرّف المنجز'], stageRow['أنجزها'], true) : null;
          return {
            id: cellString(stageRow['معرّف المرحلة']) || Utils.uid('stg'),
            templateStageId: null,
            name: stageName,
            done,
            completedBy: completedBy?.id || null,
            completedByName: done ? (completedBy?.name || cellString(stageRow['أنجزها'])) : '',
            completedAt: done ? (cellDate(stageRow['تاريخ الإنجاز']) || now) : null,
            note: cellString(stageRow['ملاحظة'])
          };
        })
        .filter(Boolean);
      if (!stages.length && template) {
        stages = template.stages.map((stage) => ({
          id: Utils.uid('stg'),
          templateStageId: stage.id,
          name: stage.name,
          done: false,
          completedBy: null,
          completedByName: '',
          completedAt: null,
          note: ''
        }));
      }
      const lastDone = [...stages].reverse().find((stage) => stage.done);
      tasks.push({
        id: taskId,
        title,
        groupId: group?.id || null,
        templateId: template?.id || null,
        stages,
        assigneeId: assignee?.id || null,
        dueDate: cellDay(row['تاريخ الاستحقاق']),
        priority: Object.values(Data.PRIORITIES).find((item) => item.label === cellString(row['الأولوية']))?.value || 'normal',
        description: cellString(row['الوصف']),
        createdAt: cellDate(row['تاريخ الإنشاء']) || now,
        updatedAt: cellDate(row['آخر تحديث']) || lastDone?.completedAt || now,
        isDemo: yes(row['بيانات تجريبية'])
      });
    });

    const settingsRows = sheetRows(workbook, 'الإعدادات');
    const settingsMap = new Map(settingsRows.map((row) => [cellString(row['الإعداد']), row['القيمة']]));
    const activeId = cellString(settingsMap.get('معرّف العضو النشط'));
    const activeName = cellString(settingsMap.get('العضو النشط'));
    const active = userById.get(activeId) || userByName.get(activeName) || null;

    const links = sheetRows(workbook, 'الروابط').map((row) => ({
      id: cellString(row['المعرّف']) || Utils.uid('lnk'),
      name: cellString(row['الاسم']),
      url: cellString(row['الرابط']),
      icon: cellString(row['الأيقونة']) || 'globe'
    })).filter((link) => link.name && link.url);

    const raw = {
      version: Data.VERSION,
      settings: {
        mosqueName: cellString(settingsMap.get('اسم المسجد')) || 'مسجد الحي',
        tagline: cellString(settingsMap.get('وصف المكتب')) || 'المكتب الإعلامي',
        links,
        theme: ['auto', 'light', 'dark'].includes(cellString(settingsMap.get('المظهر'))) ? cellString(settingsMap.get('المظهر')) : 'auto',
        demo: yes(settingsMap.get('بيانات تجريبية')),
        onboarded: true,
        createdAt: cellDate(settingsMap.get('تاريخ الإنشاء')) || now,
        updatedAt: now,
        lastBackupAt: null,
        lastBackupType: null
      },
      users,
      templates,
      groups,
      tasks,
      activeUserId: active?.id || users[0]?.id || null
    };

    return summarize(raw);
  }

  function exportReportExcel(report, data) {
    const workbook = XLSX.utils.book_new();
    const groupName = report.group?.name || 'كل المجموعات';
    const userName = report.user?.name || 'كل الأعضاء';
    const periodText = report.rangeLabel;
    const summaryRows = [
      ['تقرير إنجاز المكتب الإعلامي'],
      ['المسجد', data.settings.mosqueName],
      ['الفترة', periodText],
      ['المجموعة', groupName],
      ['العضو', userName],
      ['تاريخ إصدار التقرير', Utils.fmtDateTime(report.generatedAt)],
      [],
      ['المؤشر', 'القيمة'],
      ['المهام المنشأة خلال الفترة', report.totals.created],
      ['المهام المكتملة خلال الفترة', report.totals.completed],
      ['المراحل المنجزة خلال الفترة', report.totals.stages],
      ['المهام الجارية حاليًا', report.totals.active],
      ['المهام المتأخرة حاليًا', report.totals.overdue],
      ['نسبة إنجاز المهام', `${report.totals.completionPct}%`]
    ];
    addSheet(workbook, 'الملخص', summaryRows, [30, 40]);

    const groupRows = [['المجموعة', 'المهام المنشأة', 'المهام المكتملة', 'المراحل المنجزة', 'قيد العمل', 'المتأخرة']];
    report.groupRows.forEach((row) => {
      groupRows.push([row.group.name, row.created, row.completed, row.stages, row.active, row.overdue]);
    });
    addSheet(workbook, 'المجموعات', groupRows, [22, 16, 16, 16, 12, 12]);

    const memberRows = [['العضو', 'المراحل المنجزة', 'المهام المكتملة', 'المجموعات', 'آخر نشاط', 'المهام المفتوحة المسندة']];
    report.memberRows.forEach((row) => {
      memberRows.push([
        row.user.name,
        row.stages,
        row.completedTasks,
        row.groupsTouched,
        row.lastActivity ? Utils.fmtDateTime(row.lastActivity) : '',
        row.assignedOpen
      ]);
    });
    addSheet(workbook, 'الأعضاء', memberRows, [22, 16, 16, 12, 24, 20]);

    const stageRows = [['المرحلة', 'منجزة خلال الفترة', 'متبقية الآن']];
    report.stageRows.forEach((row) => {
      stageRows.push([row.name, row.completed, row.pending]);
    });
    addSheet(workbook, 'المراحل', stageRows, [28, 18, 14]);

    const activityRows = [['الفترة', 'المراحل المنجزة']];
    report.series.forEach((row) => {
      activityRows.push([row.label, row.value]);
    });
    addSheet(workbook, 'النشاط', activityRows, [22, 16]);

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    Utils.downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename('xlsx', 'mosque-media-report'));
  }

  function exportReportCSV(report, data) {
    const lines = [];
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    lines.push([escape('المسجد'), escape(data.settings.mosqueName)].join(','));
    lines.push([escape('الفترة'), escape(report.rangeLabel)].join(','));
    lines.push([escape('المجموعة'), escape(report.group?.name || 'كل المجموعات')].join(','));
    lines.push('');
    lines.push([escape('المجموعة'), escape('منشأة'), escape('مكتملة'), escape('مراحل منجزة'), escape('قيد العمل'), escape('متأخرة')].join(','));
    report.groupRows.forEach((row) => {
      lines.push([
        escape(row.group.name),
        escape(row.created),
        escape(row.completed),
        escape(row.stages),
        escape(row.active),
        escape(row.overdue)
      ].join(','));
    });
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    Utils.downloadBlob(blob, filename('csv', 'mosque-media-report'));
  }

  return {
    exportJSON,
    importJSON,
    exportExcel,
    importExcel,
    exportReportExcel,
    exportReportCSV
  };
})();
