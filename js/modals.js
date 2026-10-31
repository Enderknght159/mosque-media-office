const Modals = (() => {
  function colorPicker(selected) {
    return `
      <div class="color-picker" role="radiogroup" aria-label="لون العضو">
        ${Data.PALETTE.map((color) => `
          <label class="color-swatch" style="--swatch:${color.value}" title="${color.name}">
            <input type="radio" name="color" value="${color.value}" ${color.value === selected ? 'checked' : ''}>
            <span></span>
          </label>`).join('')}
      </div>`;
  }

  function iconPicker(selected) {
    return `
      <div class="icon-picker" role="radiogroup" aria-label="أيقونة الاختصار">
        ${Icons.linkChoices.map((choice) => `
          <label class="icon-choice" title="${choice.label}">
            <input type="radio" name="icon" value="${choice.value}" ${choice.value === selected ? 'checked' : ''}>
            <span>${Icons.svg(choice.value, 19)}</span>
          </label>`).join('')}
      </div>`;
  }

  function stageAssignRows(template, assignees, users) {
    if (!template) {
      return '<div class="stage-assign-empty">اختر قالبًا أولًا لعرض المراحل.</div>';
    }
    const safeAssignees = assignees || {};
    return template.stages.map((stage, index) => `
      <div class="stage-assign-row" data-template-stage-id="${stage.id}">
        <span class="stage-assign-name"><span class="stage-assign-index">${index + 1}</span>${Utils.esc(stage.name)}</span>
        <select class="stage-assign-select" aria-label="العضو الأساسي لمرحلة ${Utils.esc(stage.name)}">
          <option value="">عام — بدون تعيين</option>
          ${users.map((user) => `<option value="${user.id}" ${safeAssignees[stage.id] === user.id ? 'selected' : ''}>${Utils.esc(user.name)}</option>`).join('')}
        </select>
      </div>`).join('');
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

  function stageRow(stage, index, locked) {
    const done = Boolean(stage.done);
    return `
      <div class="stage-edit-row" data-stage-id="${Utils.esc(stage.id || '')}" data-template-stage-id="${Utils.esc(stage.templateStageId || '')}" data-done="${done ? '1' : '0'}">
        <span class="stage-edit-index">${index + 1}</span>
        <input class="stage-edit-input" type="text" value="${Utils.esc(stage.name)}" placeholder="اسم المرحلة" maxlength="70" aria-label="اسم المرحلة ${index + 1}">
        <div class="stage-edit-actions">
          ${locked ? `<span class="stage-locked" title="تُحفظ المراحل بعد بدء الإنجاز">${Icons.svg('lock', 14)}</span>` : `
            <button type="button" class="icon-btn xs" data-stage-move="-1" title="تحريك لأعلى" aria-label="تحريك لأعلى">${Icons.svg('arrow-up', 14)}</button>
            <button type="button" class="icon-btn xs" data-stage-move="1" title="تحريك لأسفل" aria-label="تحريك لأسفل">${Icons.svg('arrow-down', 14)}</button>
            <button type="button" class="icon-btn xs danger-hover" data-stage-remove title="حذف المرحلة" aria-label="حذف المرحلة">${Icons.svg('trash', 14)}</button>`}
        </div>
      </div>`;
  }

  function renderStageRows(container, stages, locked) {
    container.innerHTML = stages.map((stage, index) => stageRow(stage, index, locked)).join('');
    renumber(container);
  }

  function renumber(container) {
    [...container.querySelectorAll('.stage-edit-row')].forEach((row, index) => {
      const badge = row.querySelector('.stage-edit-index');
      if (badge) badge.textContent = index + 1;
      const input = row.querySelector('.stage-edit-input');
      if (input) input.setAttribute('aria-label', `اسم المرحلة ${index + 1}`);
    });
  }

  function bindStageEditor(form, { locked, groupSelect, groupInputs, onGroupChange }) {
    const editor = form.querySelector('#stage-editor');
    const addButton = form.querySelector('[data-stage-add]');
    const warning = form.querySelector('.stage-group-warning');
    const templateName = form.querySelector('.stage-template-name');
    const triggers = groupInputs && groupInputs.length ? [...groupInputs] : (groupSelect ? [groupSelect] : []);

    function currentGroupId() {
      if (groupSelect) return groupSelect.value;
      return form.querySelector('input[name="groupId"]:checked')?.value || '';
    }

    function updateTemplateLabel() {
      if (!templateName || !triggers.length) return;
      const group = Data.findGroup(currentGroupId());
      const template = group ? Data.findTemplate(group.templateId) : null;
      templateName.textContent = template ? template.name : 'بدون قالب';
    }

    updateTemplateLabel();

    function handleGroupChange() {
      updateTemplateLabel();
      if (locked) {
        if (warning) warning.classList.add('visible');
      } else {
        if (warning) warning.classList.remove('visible');
        const group = Data.findGroup(currentGroupId());
        const template = group ? Data.findTemplate(group.templateId) : null;
        const stages = template
          ? template.stages.map((stage) => ({ name: stage.name, templateStageId: stage.id }))
          : [{ name: '' }];
        renderStageRows(editor, stages, locked);
      }
      if (typeof onGroupChange === 'function') onGroupChange();
    }

    triggers.forEach((trigger) => trigger.addEventListener('change', handleGroupChange));

    if (addButton) {
      addButton.addEventListener('click', () => {
        if (locked) return;
        const rows = [...editor.querySelectorAll('.stage-edit-row')].length;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = stageRow({ name: '' }, rows, locked);
        const row = wrapper.firstElementChild;
        editor.appendChild(row);
        renumber(editor);
        row.querySelector('input')?.focus();
      });
    }

    editor.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-stage-remove]');
      if (remove) {
        if (locked) return;
        const rows = editor.querySelectorAll('.stage-edit-row');
        if (rows.length <= 1) {
          App.toast('يجب أن تحتوي المهمة على مرحلة واحدة على الأقل.', { type: 'warning' });
          return;
        }
        remove.closest('.stage-edit-row')?.remove();
        renumber(editor);
        return;
      }
      const move = event.target.closest('[data-stage-move]');
      if (move && !locked) {
        const row = move.closest('.stage-edit-row');
        const direction = Number(move.dataset.stageMove);
        if (!row) return;
        if (direction < 0 && row.previousElementSibling) {
          row.parentElement.insertBefore(row, row.previousElementSibling);
        } else if (direction > 0 && row.nextElementSibling) {
          row.parentElement.insertBefore(row.nextElementSibling, row);
        }
        renumber(editor);
        row.querySelector('input')?.focus();
      }
    });

  }

  function collectStageRows(form) {
    const rows = [...form.querySelectorAll('.stage-edit-row')];
    const stages = rows.map((row) => ({
      id: row.dataset.stageId || null,
      templateStageId: row.dataset.templateStageId || null,
      name: row.querySelector('.stage-edit-input')?.value.trim() || ''
    }));
    if (!stages.length) return { error: 'أضف مرحلة واحدة على الأقل.' };
    if (stages.some((stage) => !stage.name)) return { error: 'اكتب اسمًا لكل مرحلة.' };
    const names = stages.map((stage) => stage.name);
    if (new Set(names).size !== names.length) return { error: 'لا يمكن تكرار اسم المرحلة في نفس المهمة.' };
    return { stages };
  }

  function openTaskForm({ taskId = null, groupId = null, returnToDetail = false } = {}) {
    const task = taskId ? Data.findTask(taskId) : null;
    const data = Data.get();
    if (!data.groups.length) {
      App.openModal({
        title: 'لا توجد مجموعات',
        subtitle: 'أنشئ مجموعة أولًا لتتمكن من إضافة مهمة.',
        body: Views.emptyState({ icon: 'layers', title: 'ابدأ بمجموعة', text: 'المجموعة تربط المهمة بقالب المراحل المناسب.' }),
        footer: `<button class="btn ghost" data-close-modal>إلغاء</button><button class="btn primary" data-open-groups>فتح المجموعات</button>`,
        size: 'sm',
        onMount: (layer) => {
          layer.querySelector('[data-open-groups]')?.addEventListener('click', () => {
            App.closeAllModals();
            App.navigate('groups');
          });
        }
      });
      return;
    }

    const selectedGroupId = task?.groupId || groupId || data.groups[0].id;
    const group = Data.findGroup(selectedGroupId) || data.groups[0];
    const template = group ? Data.findTemplate(group.templateId) : null;
    const locked = Boolean(task && task.stages.some((stage) => stage.done));
    const stages = task ? task.stages : (template?.stages || []).map((stage) => ({ name: stage.name, templateStageId: stage.id }));
    const nextNumber = (groupIdValue) => data.tasks.filter((item) => item.groupId === groupIdValue).length + 1;
    const defaultTitle = (groupValue) => `${groupValue.name} — مهمة ${nextNumber(groupValue.id)}`;
    const initialTitle = task?.title || defaultTitle(group);
    const groupChoices = data.groups.map((item) => {
      const itemTemplate = Data.findTemplate(item.templateId);
      return `
        <label class="group-choice" style="--group-color:${Utils.esc(item.color)}">
          <input type="radio" name="groupId" value="${item.id}" ${item.id === group.id ? 'checked' : ''}>
          <span class="group-choice-dot"></span>
          <span class="group-choice-text">
            <strong>${Utils.esc(item.name)}</strong>
            <small>${itemTemplate ? `${Utils.esc(itemTemplate.name)} · ` : ''}${Utils.formatNumber(itemTemplate?.stages.length || 0)} مراحل</small>
          </span>
          <span class="group-choice-check">${Icons.svg('check', 14)}</span>
        </label>`;
    }).join('');
    const userOptions = `<option value="">بدون تعيين</option>${data.users.map((user) => `<option value="${user.id}" ${task?.assigneeId === user.id ? 'selected' : ''}>${Utils.esc(user.name)}</option>`).join('')}`;
    const selectedPriority = Data.PRIORITIES[task?.priority || 'normal'];
    const priorityChoices = Object.values(Data.PRIORITIES).map((priority) => `
      <label class="priority-choice" style="--priority-color:${priority.color}" title="${priority.label}">
        <input type="radio" name="priority" value="${priority.value}" ${(task?.priority || 'normal') === priority.value ? 'checked' : ''}>
        <span>${Icons.svg(priority.icon, 17)}</span>
      </label>`).join('');
    const body = `
      <form id="task-form" class="form" novalidate>
        <div class="form-error" role="alert"></div>
        <div class="task-hero">
          <div class="task-hero-head">
            <span>${Icons.svg('layers', 15)} المجموعة</span>
            <small>اختر المجموعة أولًا — ستُجهّز المراحل تلقائيًا</small>
          </div>
          <div class="group-picker">${groupChoices}</div>
        </div>
        <div class="form-grid">
          <label class="field span-two">
            <span>عنوان المهمة</span>
            <input type="text" name="title" required maxlength="120" placeholder="مثال: درس الفجر: تفسير سورة الفاتحة" value="${Utils.esc(initialTitle)}" autocomplete="off">
          </label>
          <label class="field">
            <span>المسؤول عن المهمة</span>
            <select name="assigneeId">${userOptions}</select>
          </label>
          <label class="field">
            <span>تاريخ الاستحقاق</span>
            <input type="date" name="dueDate" value="${Utils.esc(task?.dueDate || '')}">
          </label>
          <div class="field span-two">
            <span>الأولوية</span>
            <div class="priority-row">
              <div class="priority-picker" role="radiogroup" aria-label="أولوية المهمة">${priorityChoices}</div>
              <span class="priority-label" id="priority-label" style="color:${selectedPriority.color}">${selectedPriority.label}</span>
            </div>
          </div>
          <label class="field span-two">
            <span>الوصف <small>اختياري</small></span>
            <textarea name="description" rows="3" maxlength="600" placeholder="تفاصيل مختصرة، ملاحظات، أو رابط مرجعي...">${Utils.esc(task?.description || '')}</textarea>
          </label>
        </div>
        <div class="stage-collapse" id="stage-collapse">
          <button type="button" class="stage-collapse-toggle" data-stage-toggle aria-expanded="false">
            <span class="stage-collapse-icon">${Icons.svg('tasks', 17)}</span>
            <span class="stage-collapse-text">
              <strong>تعديل المراحل</strong>
              <small id="stage-summary">${Utils.formatNumber(stages.length)} مراحل${template ? ` · ${Utils.esc(template.name)}` : ''}</small>
            </span>
            <span class="template-pill">${Icons.svg('template', 13)} <span class="stage-template-name">${Utils.esc(template?.name || 'بدون قالب')}</span></span>
            ${Icons.svg('chevron-down', 16, 'stage-collapse-chevron')}
          </button>
          <div class="stage-collapse-body" id="stage-collapse-body" hidden>
            <div class="form-section-head">
              <div>
                <h3>${Icons.svg('tasks', 18)} مراحل المهمة</h3>
                <p>يُطبّق القالب تلقائيًا، ويمكنك تخصيص المراحل ${locked ? '— المقفلة لأن المهمة بدأت' : ''}.</p>
              </div>
              <div class="form-section-tools">
                ${!locked ? `<button type="button" class="btn ghost sm" data-stage-add>${Icons.svg('plus', 14)} مرحلة</button>` : ''}
              </div>
            </div>
            <div class="stage-group-warning">${Icons.svg('info', 15)} المهمة بدأت بالفعل، لذا ستبقى المراحل الحالية كما هي عند تغيير المجموعة.</div>
            <div class="stage-editor" id="stage-editor">${stages.map((stage, index) => stageRow(stage, index, locked)).join('')}</div>
            ${locked ? `<p class="field-hint">${Icons.svg('lock', 13)} بعد بدء المراحل يمكن تعديل الأسماء فقط للحفاظ على ترتيب سجل الإنجاز.</p>` : ''}
          </div>
        </div>
      </form>`;
    const footer = `
      <div class="modal-footer-actions">
        <button class="btn ghost" data-close-modal>إلغاء</button>
        <button class="btn primary" type="submit" form="task-form">${task ? 'حفظ التعديلات' : 'إنشاء المهمة'}</button>
      </div>`;

    App.openModal({
      title: task ? 'تعديل المهمة' : 'مهمة جديدة',
      subtitle: task ? 'حدّث التفاصيل والمراحل مع الحفاظ على سجل الإنجاز.' : 'أضف التفاصيل واختر المجموعة، وستُجهّز المراحل تلقائيًا.',
      eyebrow: task ? 'المهام' : 'إضافة سريعة',
      body,
      footer,
      size: 'lg',
      onMount: (layer) => {
        const form = layer.querySelector('#task-form');
        const groupInputs = [...form.querySelectorAll('input[name="groupId"]')];
        const titleInput = form.querySelector('[name="title"]');
        const titleSummary = form.querySelector('#stage-summary');
        const priorityLabel = form.querySelector('#priority-label');
        const stageToggle = form.querySelector('[data-stage-toggle]');
        const stageBody = form.querySelector('#stage-collapse-body');
        const stageCollapse = form.querySelector('#stage-collapse');
        let titleTouched = Boolean(task);

        const currentGroup = () => Data.findGroup(form.querySelector('input[name="groupId"]:checked')?.value);
        const updateSummary = () => {
          const currentTemplate = Data.findTemplate(currentGroup()?.templateId);
          if (titleSummary) {
            titleSummary.textContent = `${Utils.formatNumber(stageBody.querySelectorAll('.stage-edit-row').length)} مراحل${currentTemplate ? ` · ${currentTemplate.name}` : ''}`;
          }
        };
        const syncDefaultTitle = () => {
          if (task || titleTouched) return;
          const current = currentGroup();
          if (current) titleInput.value = defaultTitle(current);
        };

        groupInputs.forEach((input) => input.addEventListener('change', syncDefaultTitle));
        titleInput.addEventListener('input', () => {
          if (!task) titleTouched = true;
        });
        [...form.querySelectorAll('input[name="priority"]')].forEach((input) => {
          input.addEventListener('change', () => {
            if (!priorityLabel) return;
            const priority = Data.PRIORITIES[input.value];
            priorityLabel.textContent = priority.label;
            priorityLabel.style.color = priority.color;
          });
        });
        stageToggle.addEventListener('click', () => {
          const open = stageCollapse.classList.toggle('open');
          stageBody.hidden = !open;
          stageToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        bindStageEditor(form, { locked, groupInputs, onGroupChange: updateSummary });

        form.addEventListener('submit', (event) => {
          event.preventDefault();
          clearError(form);
          const title = titleInput.value.trim();
          if (!title) {
            formError(form, 'اكتب عنوانًا للمهمة.');
            titleInput.focus();
            return;
          }
          const collected = collectStageRows(form);
          if (collected.error) {
            if (!stageCollapse.classList.contains('open')) stageToggle.click();
            formError(form, collected.error);
            return;
          }
          const payload = {
            title,
            groupId: form.querySelector('input[name="groupId"]:checked')?.value || null,
            assigneeId: form.querySelector('[name="assigneeId"]').value || null,
            dueDate: form.querySelector('[name="dueDate"]').value,
            priority: form.querySelector('input[name="priority"]:checked')?.value || 'normal',
            description: form.querySelector('[name="description"]').value
          };
          let saved = null;
          if (task) {
            saved = Data.updateTask(task.id, { ...payload, stages: collected.stages });
          } else {
            saved = Data.createTask({ ...payload, stageNames: collected.stages });
          }
          App.closeAllModals();
          App.refresh();
          if (!saved) {
            App.toast('تعذر حفظ المهمة. تحقق من البيانات.', { type: 'error' });
            return;
          }
          App.toast(task ? 'تم حفظ تعديلات المهمة.' : 'تم إنشاء المهمة بنجاح.', { type: 'success' });
          if (returnToDetail) openTaskDetail(saved.id);
        });
      }
    });
  }

  function openTaskDetail(taskId) {
    const task = Data.findTask(taskId);
    if (!task) {
      App.toast('لم يتم العثور على المهمة.', { type: 'error' });
      return;
    }
    const group = Data.findGroup(task.groupId);
    const template = Data.findTemplate(task.templateId);
    const assignee = Data.findUser(task.assigneeId);
    const progress = Data.taskProgress(task);
    const status = Data.taskStatus(task);
    const next = Data.nextStage(task);
    const due = Utils.dueMeta(task);
    const createdAt = Utils.fmtDateTime(task.createdAt);
    const completedAt = Data.taskCompletedAt(task);
    const timeline = task.stages.map((stage, index) => {
      const isNext = next?.id === stage.id;
      const done = stage.done;
      const by = Data.findUser(stage.completedBy);
      return `
        <div class="timeline-item ${done ? 'done' : ''} ${isNext ? 'next' : ''}">
          <span class="timeline-marker">${done ? Icons.svg('check', 14) : index + 1}</span>
          <div class="timeline-content">
            <div class="timeline-head">
              <strong>${Utils.esc(stage.name)}</strong>
              ${isNext ? '<span class="next-pill">المرحلة الحالية</span>' : ''}
            </div>
            ${done ? `
              <div class="timeline-meta">
                ${Views.avatar(by || { name: stage.completedByName || 'عضو سابق', color: '#8e8e93' }, 'xs')}
                <span>${Utils.esc(stage.completedByName || by?.name || 'عضو سابق')}</span>
                <i>·</i>
                <span>${Utils.relativeTime(stage.completedAt)}</span>
              </div>
              ${stage.note ? `<p class="stage-note">${Utils.esc(stage.note)}</p>` : ''}
            ` : `<div class="timeline-meta muted">${isNext ? 'جاهزة للإكمال الآن' : 'بانتظار إكمال المراحل السابقة'}${(() => {
              const assignee = Data.findUser(Data.stageAssignee(task, stage));
              return assignee ? ` · مسندة إلى ${Utils.esc(assignee.name)}` : '';
            })()}</div>`}
          </div>
          <div class="timeline-actions">
            ${done
              ? `<button class="btn ghost sm" data-action="reopen-stage" data-task-id="${task.id}" data-stage-id="${stage.id}" data-source="detail">إعادة فتح</button>`
              : isNext
                ? `<button class="btn primary sm" data-action="complete-stage" data-task-id="${task.id}" data-stage-id="${stage.id}" data-source="detail">${Icons.svg('check', 14)} إكمال</button>`
                : `<span class="timeline-locked" title="أكمل المراحل السابقة أولًا">${Icons.svg('lock', 14)}</span>`}
          </div>
        </div>`;
    }).join('');
    const body = `
      <div class="task-detail">
        <div class="task-detail-topline">
          ${Views.groupChip(group)}
          ${Views.statusChip(status)}
          ${due.overdue ? `<span class="due-chip tone-danger">${Icons.svg('alert', 13)} ${Utils.esc(due.text)}</span>` : ''}
        </div>
        ${status === 'done' ? `
          <div class="task-complete-banner">
            <span>${Icons.svg('check-circle', 22)}</span>
            <div><strong>اكتملت المهمة بالكامل</strong><span>${completedAt ? `آخر إنجاز ${Utils.relativeTime(completedAt)}` : 'تم إنجاز كل المراحل.'}</span></div>
          </div>` : ''}
        ${due.overdue ? `<div class="overdue-banner">${Icons.svg('alert', 16)} المهمة متأخرة عن موعدها. ${Utils.esc(due.text)}.</div>` : ''}
        <div class="task-meta-grid">
          <div class="meta-item"><span>المسؤول</span><strong class="meta-user">${Views.avatar(assignee, 'xs')} ${assignee ? Utils.esc(assignee.name) : 'غير مسند'}</strong></div>
          <div class="meta-item"><span>تاريخ الاستحقاق</span><strong>${task.dueDate ? Utils.fmtDate(task.dueDate) : 'بلا موعد'}</strong></div>
          <div class="meta-item"><span>الأولوية</span><strong style="color:${Data.PRIORITIES[task.priority].color}">${Data.PRIORITIES[task.priority].label}</strong></div>
          <div class="meta-item"><span>المجموعة</span><strong>${Utils.esc(group?.name || 'بدون مجموعة')}</strong></div>
          <div class="meta-item"><span>القالب</span><strong>${Utils.esc(template?.name || 'بدون قالب')}</strong></div>
          <div class="meta-item"><span>تاريخ الإنشاء</span><strong>${Utils.esc(createdAt)}</strong></div>
        </div>
        <div class="detail-progress">
          <div class="detail-progress-head"><span>تقدم المهمة</span><strong>${progress.done} من ${progress.total} مراحل · ${progress.pct}%</strong></div>
          ${Views.progressBar(progress.pct, group?.color || 'var(--accent)')}
        </div>
        ${task.description ? `<div class="task-description"><span>الوصف</span><p>${Utils.esc(task.description)}</p></div>` : ''}
        <div class="detail-section-head">
          <h3>${Icons.svg('tasks', 18)} سجل المراحل</h3>
          <span>${Utils.formatNumber(task.stages.length)} مراحل</span>
        </div>
        <div class="timeline">${timeline}</div>
      </div>`;
    const footer = `
      <div class="modal-footer-row">
        <div class="footer-left">
          <button class="btn ghost sm danger-text" data-action="delete-task" data-task-id="${task.id}" data-source="detail">${Icons.svg('trash', 15)} حذف</button>
          <button class="btn ghost sm" data-action="duplicate-task" data-task-id="${task.id}" data-source="detail">${Icons.svg('copy', 15)} تكرار</button>
        </div>
        <div class="footer-right">
          <button class="btn secondary" data-action="edit-task" data-task-id="${task.id}" data-source="detail">${Icons.svg('edit', 15)} تعديل</button>
          ${next ? `<button class="btn primary" data-action="complete-stage" data-task-id="${task.id}" data-stage-id="${next.id}" data-source="detail">${Icons.svg('check', 15)} إكمال «${Utils.esc(next.name)}»</button>` : `<button class="btn primary" data-close-modal>إغلاق</button>`}
        </div>
      </div>`;
    App.openModal({
      title: task.title,
      subtitle: `${group?.name || 'بدون مجموعة'}${template ? ` · ${template.name}` : ''}`,
      eyebrow: 'تفاصيل المهمة',
      body,
      footer,
      size: 'lg',
      className: 'task-detail-modal'
    });
  }

  function openCompleteStage(taskId, stageId, { returnToDetail = false } = {}) {
    const task = Data.findTask(taskId);
    const stage = task?.stages.find((item) => item.id === stageId);
    if (!task || !stage) {
      App.toast('لم يتم العثور على المرحلة.', { type: 'error' });
      return;
    }
    const data = Data.get();
    if (!data.users.length) {
      App.toast('أضف عضوًا واحدًا على الأقل لتوثيق من أنجز المرحلة.', { type: 'warning' });
      App.navigate('team');
      return;
    }
    const group = Data.findGroup(task.groupId);
    const stageIndex = task.stages.findIndex((item) => item.id === stageId);
    const activeUser = Data.stageAssignee(task, stage) || data.activeUserId;
    const userOptions = data.users.map((user) => `
      <label class="user-pick ${user.id === activeUser ? 'selected' : ''}">
        <input type="radio" name="userId" value="${user.id}" ${user.id === activeUser ? 'checked' : ''}>
        ${Views.avatar(user, 'sm')}
        <span>${Utils.esc(user.name)}</span>
        <i>${Icons.svg('check', 14)}</i>
      </label>`).join('');
    const body = `
      <form id="complete-form" class="form" novalidate>
        <div class="form-error" role="alert"></div>
        <div class="complete-summary">
          <div class="complete-icon">${Icons.svg('check-circle', 23)}</div>
          <div>
            ${Views.groupChip(group)}
            <h3>${Utils.esc(stage.name)}</h3>
            <p>${Utils.esc(task.title)} · المرحلة ${stageIndex + 1} من ${task.stages.length}</p>
          </div>
        </div>
        <div class="field">
          <span>من أنجز هذه المرحلة؟ <small>إلزامي</small></span>
          <div class="user-pick-grid">${userOptions}</div>
        </div>
        <label class="field">
          <span>ملاحظة <small>اختياري</small></span>
          <textarea name="note" rows="2" maxlength="300" placeholder="مثال: تمت المراجعة، أو رابط النسخة النهائية..."></textarea>
        </label>
      </form>`;
    const footer = `
      <div class="modal-footer-actions">
        <button class="btn ghost" data-close-modal>إلغاء</button>
        <button class="btn primary" type="submit" form="complete-form">${Icons.svg('check', 16)} تأكيد الإنجاز</button>
      </div>`;
    App.openModal({
      title: 'إكمال المرحلة',
      subtitle: 'سيُسجَّل اسم العضو ووقت الإنجاز في سجل المهمة.',
      eyebrow: 'توثيق الإنجاز',
      body,
      footer,
      size: 'md',
      onMount: (layer) => {
        const form = layer.querySelector('#complete-form');
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          clearError(form);
          const selected = form.querySelector('input[name="userId"]:checked');
          if (!selected) {
            formError(form, 'اختر العضو الذي أنجز المرحلة.');
            return;
          }
          const note = form.querySelector('[name="note"]').value;
          const result = Data.completeStage(taskId, stageId, selected.value, note);
          if (!result.ok) {
            const messages = {
              missing: 'تعذر العثور على العضو أو المهمة.',
              done: 'هذه المرحلة منجزة بالفعل.',
              order: 'أكمل المراحل السابقة أولًا.'
            };
            formError(form, messages[result.reason] || 'تعذر إكمال المرحلة.');
            return;
          }
          App.closeAllModals();
          App.refresh();
          if (result.taskCompleted) {
            App.toast(`اكتملت المهمة بالكامل: ${task.title}`, { type: 'success', icon: 'check-circle', duration: 5200 });
          } else {
            App.toast(`تم توثيق إنجاز «${result.stage.name}» بواسطة ${Data.findUser(selected.value)?.name || 'العضو'}.`, { type: 'success' });
          }
          if (returnToDetail) openTaskDetail(taskId);
        });
      }
    });
  }

  function openGroupForm(groupId = null) {
    const group = groupId ? Data.findGroup(groupId) : null;
    const data = Data.get();
    if (!data.templates.length) {
      App.openModal({
        title: 'لا توجد قوالب',
        subtitle: 'أنشئ قالب مراحل أولًا ثم أنشئ المجموعة.',
        body: Views.emptyState({ icon: 'template', title: 'القالب يحدد المراحل', text: 'كل مجموعة تحتاج قالبًا لتوريث مراحله للمهام الجديدة.' }),
        footer: `<button class="btn ghost" data-close-modal>إلغاء</button><button class="btn primary" data-open-templates>فتح القوالب</button>`,
        size: 'sm',
        onMount: (layer) => {
          layer.querySelector('[data-open-templates]')?.addEventListener('click', () => {
            App.closeAllModals();
            App.navigate('templates');
          });
        }
      });
      return;
    }
    const selectedTemplate = group?.templateId || data.templates[0].id;
    const selectedTemplateData = Data.findTemplate(selectedTemplate);
    const stageAssignees = group?.stageAssignees || {};
    const templateOptions = data.templates.map((template) => `<option value="${template.id}" ${template.id === selectedTemplate ? 'selected' : ''}>${Utils.esc(template.name)} · ${template.stages.length} مراحل</option>`).join('');
    const body = `
      <form id="group-form" class="form" novalidate>
        <div class="form-error" role="alert"></div>
        <div class="form-grid">
          <label class="field span-two">
            <span>اسم المجموعة</span>
            <input type="text" name="name" required maxlength="60" value="${Utils.esc(group?.name || '')}" placeholder="مثال: دروس الفجر">
          </label>
          <label class="field span-two">
            <span>قالب المراحل</span>
            <select name="templateId" required>${templateOptions}</select>
          </label>
          <div class="field span-two">
            <span>العضو الأساسي لكل مرحلة <small>اختياري</small></span>
            <div class="stage-assign-list" id="stage-assign-list">${stageAssignRows(selectedTemplateData, stageAssignees, data.users)}</div>
            <p class="field-hint">${Icons.svg('user-check', 13)} عندما تكون المرحلة التالية من نصيب عضو تظهر المهمة في لوحته الرئيسية ضمن «مهام تنتظرك». اتركها عامة لتظهر كالمعتاد للجميع.</p>
          </div>
          <div class="field span-two">
            <span>لون المجموعة</span>
            ${colorPicker(group?.color || Data.PALETTE[data.groups.length % Data.PALETTE.length].value)}
          </div>
          <label class="field span-two">
            <span>الوصف <small>اختياري</small></span>
            <textarea name="description" rows="2" maxlength="300" placeholder="ما نوع المهام التي تندرج تحت هذه المجموعة؟">${Utils.esc(group?.description || '')}</textarea>
          </label>
        </div>
        ${group ? `<p class="field-hint">${Icons.svg('info', 13)} تغيير القالب يؤثر على المهام الجديدة فقط، ولا يغيّر مراحل المهام الحالية.</p>` : ''}
      </form>`;
    const footer = `<div class="modal-footer-actions"><button class="btn ghost" data-close-modal>إلغاء</button><button class="btn primary" type="submit" form="group-form">${group ? 'حفظ التعديلات' : 'إنشاء المجموعة'}</button></div>`;
    App.openModal({
      title: group ? 'تعديل المجموعة' : 'مجموعة جديدة',
      subtitle: 'اربط المجموعة بقالب لتوحيد المراحل.',
      eyebrow: 'المجموعات',
      body,
      footer,
      size: 'md',
      onMount: (layer) => {
        const form = layer.querySelector('#group-form');
        const templateSelect = form.querySelector('[name="templateId"]');
        const assignList = form.querySelector('#stage-assign-list');
        templateSelect.addEventListener('change', () => {
          const template = Data.findTemplate(templateSelect.value);
          assignList.innerHTML = stageAssignRows(template, {}, data.users);
        });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          clearError(form);
          const name = form.querySelector('[name="name"]').value.trim();
          if (!name) {
            formError(form, 'اكتب اسم المجموعة.');
            return;
          }
          if (Data.get().groups.some((item) => item.name === name && item.id !== groupId)) {
            formError(form, 'يوجد مجموعة أخرى بهذا الاسم.');
            return;
          }
          const color = form.querySelector('input[name="color"]:checked')?.value;
          const nextAssignees = {};
          assignList.querySelectorAll('.stage-assign-row').forEach((row) => {
            const userId = row.querySelector('select')?.value;
            if (userId) nextAssignees[row.dataset.templateStageId] = userId;
          });
          const payload = {
            name,
            templateId: form.querySelector('[name="templateId"]').value,
            description: form.querySelector('[name="description"]').value,
            color,
            stageAssignees: nextAssignees
          };
          const saved = group ? Data.updateGroup(group.id, payload) : Data.createGroup(payload);
          if (!saved) {
            formError(form, 'تعذر حفظ المجموعة.');
            return;
          }
          App.closeAllModals();
          App.refresh();
          App.toast(group ? 'تم حفظ تعديلات المجموعة.' : 'تم إنشاء المجموعة.', { type: 'success' });
        });
      }
    });
  }

  function openTemplateForm(templateId = null) {
    const template = templateId ? Data.findTemplate(templateId) : null;
    const stages = template ? template.stages : [{ name: '' }];
    const body = `
      <form id="template-form" class="form" novalidate>
        <div class="form-error" role="alert"></div>
        <div class="form-grid">
          <label class="field span-two">
            <span>اسم القالب</span>
            <input type="text" name="name" required maxlength="60" value="${Utils.esc(template?.name || '')}" placeholder="مثال: ريلز من فكرة">
          </label>
          <label class="field span-two">
            <span>الوصف <small>اختياري</small></span>
            <textarea name="description" rows="2" maxlength="300" placeholder="ماذا يغطي هذا القالب؟">${Utils.esc(template?.description || '')}</textarea>
          </label>
        </div>
        <div class="form-section-head">
          <div>
            <h3>${Icons.svg('template', 18)} مراحل القالب</h3>
            <p>رتّب المراحل حسب تسلسل التنفيذ الفعلي.</p>
          </div>
          <button type="button" class="btn ghost sm" data-stage-add>${Icons.svg('plus', 14)} مرحلة</button>
        </div>
        <div class="stage-editor" id="stage-editor">${stages.map((stage, index) => stageRow(stage, index, false)).join('')}</div>
        <p class="field-hint">${Icons.svg('info', 13)} المهام المنشأة سابقًا لا تتأثر بتعديل هذا القالب.</p>
      </form>`;
    const footer = `<div class="modal-footer-actions"><button class="btn ghost" data-close-modal>إلغاء</button><button class="btn primary" type="submit" form="template-form">${template ? 'حفظ التعديلات' : 'إنشاء القالب'}</button></div>`;
    App.openModal({
      title: template ? 'تعديل القالب' : 'قالب جديد',
      subtitle: 'حدّد المراحل التي ستُنسخ تلقائيًا لكل مهمة جديدة.',
      eyebrow: 'القوالب',
      body,
      footer,
      size: 'md',
      onMount: (layer) => {
        const form = layer.querySelector('#template-form');
        bindStageEditor(form, { locked: false });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          clearError(form);
          const name = form.querySelector('[name="name"]').value.trim();
          if (!name) {
            formError(form, 'اكتب اسم القالب.');
            return;
          }
          if (Data.get().templates.some((item) => item.name === name && item.id !== templateId)) {
            formError(form, 'يوجد قالب آخر بهذا الاسم.');
            return;
          }
          const collected = collectStageRows(form);
          if (collected.error) {
            formError(form, collected.error);
            return;
          }
          const saved = template
            ? Data.updateTemplate(template.id, {
              name,
              description: form.querySelector('[name="description"]').value,
              stageNames: collected.stages.map((stage) => stage.name)
            })
            : Data.createTemplate({
              name,
              description: form.querySelector('[name="description"]').value,
              stageNames: collected.stages.map((stage) => stage.name)
            });
          if (!saved) {
            formError(form, 'تعذر حفظ القالب.');
            return;
          }
          App.closeAllModals();
          App.refresh();
          App.toast(template ? 'تم حفظ القالب.' : 'تم إنشاء القالب.', { type: 'success' });
        });
      }
    });
  }

  function openUserForm(userId = null) {
    const user = userId ? Data.findUser(userId) : null;
    const data = Data.get();
    const selectedColor = user?.color || Data.PALETTE[data.users.length % Data.PALETTE.length].value;
    const selectedBadges = new Set(user?.badges || []);
    const badgeValues = [...new Set([...Data.BADGE_SUGGESTIONS, ...(user?.badges || [])])];
    const badgeChoices = badgeValues.map((badge) => `
      <button type="button" class="badge-option ${selectedBadges.has(badge) ? 'active' : ''}" data-badge="${Utils.esc(badge)}" aria-pressed="${selectedBadges.has(badge)}">
        ${Icons.svg('award', 12)}${Utils.esc(badge)}
      </button>`).join('');
    const body = `
      <form id="user-form" class="form" novalidate>
        <div class="form-error" role="alert"></div>
        <label class="field">
          <span>اسم العضو</span>
          <input type="text" name="name" required maxlength="50" value="${Utils.esc(user?.name || '')}" placeholder="مثال: أحمد" autocomplete="off">
        </label>
        <div class="field">
          <span>لون الصورة الرمزية</span>
          ${colorPicker(selectedColor)}
        </div>
        <div class="field">
          <span>شارات العضو <small>اختياري</small></span>
          <div class="badge-picker" id="badge-picker">${badgeChoices}</div>
          <div class="badge-add-row">
            <input type="text" id="badge-custom" maxlength="30" placeholder="شارة أخرى مثل: تعليق صوتي" autocomplete="off">
            <button type="button" class="btn secondary sm" data-badge-add>${Icons.svg('plus', 14)} إضافة</button>
          </div>
          <p class="field-hint">${Icons.svg('award', 13)} استخدم الشارات لتصنيف مهارات الأعضاء مثل مونتاج وتصوير ونشر وكتابة.</p>
        </div>
        ${user ? `<p class="field-hint">${Icons.svg('info', 13)} تغيير الاسم يحدّثه في سجل الإنجازات السابقة أيضًا.</p>` : ''}
      </form>`;
    const footer = `<div class="modal-footer-actions"><button class="btn ghost" data-close-modal>إلغاء</button><button class="btn primary" type="submit" form="user-form">${user ? 'حفظ' : 'إضافة العضو'}</button></div>`;
    App.openModal({
      title: user ? 'تعديل العضو' : 'إضافة عضو',
      subtitle: 'هوية بسيطة تُستخدم لتوثيق من أنجز كل مرحلة.',
      eyebrow: 'الفريق',
      body,
      footer,
      size: 'md',
      onMount: (layer) => {
        const form = layer.querySelector('#user-form');
        const badgePicker = form.querySelector('#badge-picker');
        const badgeInput = form.querySelector('#badge-custom');
        const toggleBadge = (button) => {
          const active = button.classList.toggle('active');
          button.setAttribute('aria-pressed', active ? 'true' : 'false');
        };
        badgePicker.addEventListener('click', (event) => {
          const button = event.target.closest('.badge-option');
          if (button) toggleBadge(button);
        });
        form.querySelector('[data-badge-add]')?.addEventListener('click', () => {
          const value = badgeInput.value.trim();
          if (!value) {
            badgeInput.focus();
            return;
          }
          let existing = [...badgePicker.querySelectorAll('.badge-option')].find((button) => button.dataset.badge === value);
          if (!existing) {
            existing = document.createElement('button');
            existing.type = 'button';
            existing.className = 'badge-option';
            existing.dataset.badge = value;
            existing.setAttribute('aria-pressed', 'false');
            existing.innerHTML = `${Icons.svg('award', 12)}${Utils.esc(value)}`;
            badgePicker.appendChild(existing);
          }
          if (!existing.classList.contains('active')) toggleBadge(existing);
          badgeInput.value = '';
          badgeInput.focus();
        });
        badgeInput?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            form.querySelector('[data-badge-add]')?.click();
          }
        });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          clearError(form);
          const name = form.querySelector('[name="name"]').value.trim();
          if (!name) {
            formError(form, 'اكتب اسم العضو.');
            return;
          }
          if (Data.get().users.some((item) => item.name === name && item.id !== userId)) {
            formError(form, 'يوجد عضو آخر بهذا الاسم.');
            return;
          }
          const color = form.querySelector('input[name="color"]:checked')?.value;
          const badges = [...badgePicker.querySelectorAll('.badge-option.active')].map((button) => button.dataset.badge);
          const saved = user ? Data.updateUser(user.id, { name, color, badges }) : Data.createUser({ name, color, badges });
          if (!saved) {
            formError(form, 'تعذر حفظ العضو.');
            return;
          }
          App.closeAllModals();
          App.refresh();
          App.toast(user ? 'تم تحديث العضو.' : 'تمت إضافة العضو.', { type: 'success' });
        });
      }
    });
  }

  function openLinkForm(linkId = null) {
    const link = linkId ? Data.findLink(linkId) : null;
    const currentIcon = link?.icon || 'globe';
    const body = `
      <form id="link-form" class="form" novalidate>
        <div class="form-error" role="alert"></div>
        <label class="field">
          <span>اسم الاختصار</span>
          <input type="text" name="name" required maxlength="60" value="${Utils.esc(link?.name || '')}" placeholder="مثال: صفحة المسجد على إنستغرام">
        </label>
        <label class="field">
          <span>الرابط</span>
          <input type="text" name="url" required value="${Utils.esc(link?.url || '')}" placeholder="https://... أو file:///C:/..." dir="ltr" autocomplete="off">
        </label>
        <div class="field">
          <span>الأيقونة</span>
          <div class="link-icon-preview" id="link-icon-preview">${Views.shortcutIcon({ icon: currentIcon })}</div>
          ${iconPicker(currentIcon)}
        </div>
        <p class="field-hint">${Icons.svg('info', 13)} يدعم الروابط الإلكترونية وملفات الجهاز بصيغة <span dir="ltr">file:///</span>.</p>
      </form>`;
    const footer = `<div class="modal-footer-actions"><button class="btn ghost" data-close-modal>إلغاء</button><button class="btn primary" type="submit" form="link-form">${link ? 'حفظ' : 'إضافة الاختصار'}</button></div>`;
    App.openModal({
      title: link ? 'تعديل الاختصار' : 'اختصار جديد',
      subtitle: 'صفحة مسجد، مجلد ملفات، أو أداة تصميم ومونتاج.',
      eyebrow: 'الاختصارات',
      body,
      footer,
      size: 'md',
      onMount: (layer) => {
        const form = layer.querySelector('#link-form');
        const preview = layer.querySelector('#link-icon-preview');
        form.addEventListener('change', (event) => {
          if (event.target.name === 'icon') {
            preview.innerHTML = Views.shortcutIcon({ icon: event.target.value });
          }
        });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          clearError(form);
          const name = form.querySelector('[name="name"]').value.trim();
          const urlInput = form.querySelector('[name="url"]').value.trim();
          const url = Utils.normalizeUrl(urlInput);
          if (!name) {
            formError(form, 'اكتب اسم الاختصار.');
            return;
          }
          if (!url || !/^(https?:\/\/|file:\/\/)/i.test(url)) {
            formError(form, 'أدخل رابطًا صحيحًا يبدأ بـ https:// أو file:///.');
            return;
          }
          const icon = form.querySelector('input[name="icon"]:checked')?.value || 'globe';
          const saved = link ? Data.updateLink(link.id, { name, url, icon }) : Data.addLink({ name, url, icon });
          if (!saved) {
            formError(form, 'تعذر حفظ الاختصار.');
            return;
          }
          App.closeAllModals();
          App.refresh();
          App.toast(link ? 'تم حفظ الاختصار.' : 'تمت إضافة الاختصار.', { type: 'success' });
        });
      }
    });
  }

  function openStageCell(taskId, stageId) {
    const task = Data.findTask(taskId);
    const stage = task?.stages.find((item) => item.id === stageId);
    if (!task || !stage) {
      App.toast('لم يتم العثور على المرحلة.', { type: 'error' });
      return;
    }
    if (!stage.done) {
      openCompleteStage(taskId, stageId, { returnToDetail: false });
      return;
    }
    const data = Data.get();
    const group = Data.findGroup(task.groupId);
    const currentUser = Data.findUser(stage.completedBy) || { name: stage.completedByName || 'عضو سابق', color: '#8e8e93' };
    const body = `
      <form id="stage-cell-form" class="form" novalidate>
        <div class="form-error" role="alert"></div>
        <div class="complete-summary">
          <div class="complete-icon">${Icons.svg('check-circle', 23)}</div>
          <div>
            ${Views.groupChip(group)}
            <h3>${Utils.esc(stage.name)}</h3>
            <p>${Utils.esc(task.title)} · منجز ${Utils.relativeTime(stage.completedAt)}</p>
          </div>
        </div>
        <div class="field">
          <span>العضو الذي أنجز المرحلة</span>
          <div class="user-pick-grid">
            ${data.users.map((user) => `
              <label class="user-pick ${user.id === stage.completedBy ? 'selected' : ''}">
                <input type="radio" name="userId" value="${user.id}" ${user.id === stage.completedBy ? 'checked' : ''}>
                ${Views.avatar(user, 'sm')}
                <span>${Utils.esc(user.name)}</span>
                <i>${Icons.svg('check', 14)}</i>
              </label>`).join('')}
          </div>
        </div>
        <p class="field-hint">${Icons.svg('info', 13)} يمكنك تغيير اسم المنجز دون تغيير تاريخ الإنجاز، أو إعادة فتح المرحلة من الأسفل.</p>
        <div class="stage-cell-current">${Views.avatar(currentUser, 'sm')}<span>المنجز الحالي: <strong>${Utils.esc(currentUser.name)}</strong></span></div>
      </form>`;
    const footer = `
      <div class="modal-footer-row">
        <div class="footer-left">
          <button class="btn ghost sm danger-text" data-action="reopen-stage" data-task-id="${task.id}" data-stage-id="${stage.id}">${Icons.svg('undo', 15)} إعادة فتح المرحلة</button>
        </div>
        <div class="footer-right">
          <button class="btn ghost" data-close-modal>إلغاء</button>
          <button class="btn primary" type="submit" form="stage-cell-form">حفظ العضو</button>
        </div>
      </div>`;
    App.openModal({
      title: 'تعديل منجز المرحلة',
      subtitle: 'اختر العضو الصحيح لهذه المرحلة.',
      eyebrow: 'جدول المراحل',
      body,
      footer,
      size: 'md',
      onMount: (layer) => {
        const form = layer.querySelector('#stage-cell-form');
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          clearError(form);
          const selected = form.querySelector('input[name="userId"]:checked');
          if (!selected) {
            formError(form, 'اختر العضو الذي أنجز المرحلة.');
            return;
          }
          const result = Data.setStageCompleter(taskId, stageId, selected.value);
          if (!result.ok) {
            formError(form, 'تعذر حفظ العضو.');
            return;
          }
          App.closeModal();
          App.refresh();
          App.toast('تم تحديث العضو المنجز.', { type: 'success' });
        });
      }
    });
  }

  function openMemberProfile(userId) {
    const profile = Data.memberProfile(userId);
    if (!profile) {
      App.toast('لم يتم العثور على العضو.', { type: 'error' });
      return;
    }
    const active = Data.get().activeUserId === userId;
    const typeStats = profile.typeStats.length
      ? profile.typeStats.map((type) => `
        <div class="type-stat">
          <span class="type-stat-icon">${Icons.svg(type.icon, 16)}</span>
          <span class="type-stat-text"><strong>${Utils.esc(type.label)}</strong><small>${Utils.formatNumber(type.count)} إجمالًا · ${Utils.formatNumber(type.count30)} آخر 30 يوم</small></span>
          <b>${Utils.formatNumber(type.count)}</b>
        </div>`).join('')
      : Views.emptyState({ icon: 'chart', title: 'لا توجد مراحل منجزة', text: 'ستظهر إحصاءات كل نوع بعد إنجاز المراحل.', compact: true });
    const events = profile.recent.length
      ? profile.recent.slice(0, 60).map((event) => `
        <div class="profile-event">
          <span class="profile-event-icon">${Icons.svg(event.typeIcon, 14)}</span>
          <div class="profile-event-body">
            <div>
              <strong>${Utils.esc(event.stageName)}</strong>
              <button class="profile-event-task" data-action="open-task" data-task-id="${event.taskId}">${Utils.esc(event.taskTitle)}</button>
            </div>
            <small>${event.group ? `${Utils.esc(event.group.name)} · ` : ''}المرحلة ${Utils.formatNumber(event.stageNumber)} · ${Utils.relativeTime(event.completedAt)}</small>
          </div>
        </div>`).join('')
      : Views.emptyState({ icon: 'sparkles', title: 'لا يوجد سجل بعد', text: 'عند إنجاز أول مرحلة سيظهر سجلها هنا.', compact: true });
    const body = `
      <div class="member-profile">
        <div class="profile-head">
          ${Views.avatar(profile.user, 'xl')}
          <div class="profile-identity">
            <h3>${Utils.esc(profile.user.name)}</h3>
            <span class="member-since">عضو منذ ${Utils.fmtDate(profile.user.createdAt, { year: true })}</span>
            ${Views.badgeList(profile.badges, 8) || '<span class="profile-no-badges">لا توجد شارات بعد</span>'}
            <div class="profile-head-pills">
              ${active ? `<span class="active-pill">${Icons.svg('check', 12)} العضو النشط</span>` : ''}
              <span class="profile-last">${Icons.svg('clock', 12)} ${profile.totals.lastActivity ? `آخر نشاط ${Utils.relativeTime(profile.totals.lastActivity)}` : 'لا يوجد نشاط بعد'}</span>
            </div>
          </div>
        </div>
        <div class="profile-stats">
          <div class="profile-stat"><span>المراحل المنجزة</span><strong>${Utils.formatNumber(profile.totals.stages)}</strong><small>${Utils.formatNumber(profile.totals.stages30)} في آخر 30 يوم</small></div>
          <div class="profile-stat"><span>المهام المكتملة</span><strong>${Utils.formatNumber(profile.totals.completedTasks)}</strong><small>أنهى مرحلتها الأخيرة</small></div>
          <div class="profile-stat"><span>مهام مفتوحة</span><strong>${Utils.formatNumber(profile.totals.assignedOpen)}</strong><small>مسندة إليه</small></div>
          <div class="profile-stat highlight"><span>مهام تنتظرك</span><strong>${Utils.formatNumber(profile.totals.waiting)}</strong><small>مرحلتها التالية من نصيبه</small></div>
        </div>
        <div class="profile-grid">
          <section class="profile-panel">
            <div class="profile-panel-head"><h4>${Icons.svg('chart', 16)} إحصاء المراحل حسب النوع</h4><span>الإجمالي وآخر 30 يوم</span></div>
            <div class="type-stats">${typeStats}</div>
          </section>
          <section class="profile-panel">
            <div class="profile-panel-head"><h4>${Icons.svg('history', 16)} المراحل المنجزة بالترتيب</h4><span>الأحدث أولًا</span></div>
            <div class="profile-events">${events}</div>
          </section>
        </div>
      </div>`;
    const footer = `
      <div class="modal-footer-row">
        <div class="footer-left">
          <button class="btn ghost sm" data-action="edit-user" data-user-id="${profile.user.id}" ${Data.securityEnabled() && !Data.isUnlocked() ? 'data-locked' : ''}>${Icons.svg('edit', 15)} تعديل العضو والشارات</button>
        </div>
        <div class="footer-right">
          ${active ? '' : `<button class="icon-btn" data-action="select-user" data-user-id="${profile.user.id}" title="تعيين كنشط" aria-label="تعيين كنشط">${Icons.svg('user-check', 18)}</button>`}
          <button class="btn primary" data-close-modal>إغلاق</button>
        </div>
      </div>`;
    App.openModal({
      title: 'ملف العضو',
      subtitle: `${Utils.formatNumber(profile.totals.stages)} مرحلة منجزة · ${Utils.formatNumber(profile.badges.length)} شارات`,
      eyebrow: 'الفريق',
      body,
      footer,
      size: 'xl'
    });
  }

  function requestUnlock() {
    if (!Data.securityEnabled() || Data.isUnlocked()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      let layer = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
        if (layer) App.closeModal();
      };
      layer = App.openModal({
        title: 'فتح قفل الإعدادات',
        subtitle: 'أدخل كلمة المرور لتعديل الأعضاء أو هوية المسجد أو حذف البيانات.',
        eyebrow: 'حماية',
        size: 'sm',
        body: `
          <form id="unlock-form" class="form" novalidate>
            <div class="form-error" role="alert"></div>
            <label class="field">
              <span>كلمة المرور</span>
              <input type="password" name="password" required autofocus autocomplete="current-password" placeholder="••••••••">
            </label>
          </form>`,
        footer: `<div class="modal-footer-actions"><button class="btn ghost" data-close-modal>إلغاء</button><button class="btn primary" type="submit" form="unlock-form">${Icons.svg('lock-open', 16)} فتح القفل</button></div>`,
        onDismiss: () => {
          if (!settled) {
            settled = true;
            resolve(false);
          }
        },
        onMount: (mountLayer) => {
          const form = mountLayer.querySelector('#unlock-form');
          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearError(form);
            const password = form.querySelector('[name="password"]').value;
            if (!password) {
              formError(form, 'أدخل كلمة المرور.');
              return;
            }
            const ok = await Data.verifyPassword(password);
            if (!ok) {
              formError(form, 'كلمة المرور غير صحيحة.');
              form.querySelector('[name="password"]').select();
              return;
            }
            Data.unlock();
            finish(true);
          });
        }
      });
    });
  }

  function openSetPassword() {
    const hasPassword = Data.securityEnabled();
    const body = `
      <form id="password-form" class="form" novalidate>
        <div class="form-error" role="alert"></div>
        ${hasPassword ? `
          <label class="field">
            <span>كلمة المرور الحالية</span>
            <input type="password" name="current" required autocomplete="current-password" placeholder="••••••••">
          </label>` : ''}
        <label class="field">
          <span>كلمة المرور الجديدة</span>
          <input type="password" name="next" required minlength="4" autocomplete="new-password" placeholder="4 أحرف على الأقل">
        </label>
        <label class="field">
          <span>تأكيد كلمة المرور</span>
          <input type="password" name="confirm" required autocomplete="new-password" placeholder="أعد كتابة كلمة المرور">
        </label>
        <p class="field-hint">${Icons.svg('shield', 13)} تُحفظ بصمة مشفّرة فقط، ولا تُصدَّر كلمة المرور مع النسخ الاحتياطية.</p>
      </form>`;
    const footer = `
      <div class="modal-footer-actions">
        <button class="btn ghost" data-close-modal>إلغاء</button>
        <button class="btn primary" type="submit" form="password-form">${Icons.svg('key', 16)} ${hasPassword ? 'تغيير كلمة المرور' : 'تعيين كلمة المرور'}</button>
      </div>`;
    App.openModal({
      title: hasPassword ? 'تغيير كلمة المرور' : 'تعيين كلمة مرور',
      subtitle: 'كلمة المرور تمنع تعديل الأعضاء وهوية المسجد والحذف والاستيراد.',
      eyebrow: 'حماية',
      body,
      footer,
      size: 'sm',
      onMount: (layer) => {
        const form = layer.querySelector('#password-form');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          clearError(form);
          if (hasPassword) {
            const current = form.querySelector('[name="current"]').value;
            const valid = await Data.verifyPassword(current);
            if (!valid) {
              formError(form, 'كلمة المرور الحالية غير صحيحة.');
              return;
            }
          }
          const next = form.querySelector('[name="next"]').value;
          const confirm = form.querySelector('[name="confirm"]').value;
          if (next.length < 4) {
            formError(form, 'اجعل كلمة المرور 4 أحرف على الأقل.');
            return;
          }
          if (next !== confirm) {
            formError(form, 'كلمتا المرور غير متطابقتين.');
            form.querySelector('[name="confirm"]').focus();
            return;
          }
          await Data.setPassword(next);
          App.closeModal();
          App.refresh();
          App.toast(hasPassword ? 'تم تغيير كلمة المرور.' : 'تم تعيين كلمة المرور وقفل الإعدادات.', { type: 'success' });
        });
      }
    });
  }

  function openImportConfirm({ summary, fileName, type, onConfirm }) {
    const body = `
      <div class="import-summary">
        <div class="import-file">
          <span class="import-file-icon">${Icons.svg(type === 'excel' ? 'file-spreadsheet' : 'file', 22)}</span>
          <div><strong>${Utils.esc(fileName)}</strong><span>${type === 'excel' ? 'ملف Excel' : 'ملف JSON'}</span></div>
        </div>
        <div class="import-counts">
          <span><strong>${Utils.formatNumber(summary.tasks)}</strong><small>مهام</small></span>
          <span><strong>${Utils.formatNumber(summary.groups)}</strong><small>مجموعات</small></span>
          <span><strong>${Utils.formatNumber(summary.templates)}</strong><small>قوالب</small></span>
          <span><strong>${Utils.formatNumber(summary.users)}</strong><small>أعضاء</small></span>
        </div>
        <div class="import-name">${Icons.svg('book', 15)} ${Utils.esc(summary.mosqueName)}</div>
        <div class="danger-note">${Icons.svg('alert', 16)} سيتم استبدال جميع البيانات الحالية بهذه البيانات. أنشئ نسخة احتياطية أولًا إن كنت بحاجة إليها.</div>
      </div>`;
    const footer = `<div class="modal-footer-actions"><button class="btn ghost" data-close-modal>إلغاء</button><button class="btn danger" data-import-confirm>استبدال البيانات</button></div>`;
    App.openModal({
      title: 'تأكيد استيراد البيانات',
      subtitle: 'راجع محتويات الملف قبل المتابعة.',
      eyebrow: 'استيراد',
      body,
      footer,
      size: 'md',
      onMount: (layer) => {
        layer.querySelector('[data-import-confirm]')?.addEventListener('click', () => {
          App.closeAllModals();
          onConfirm();
        });
      }
    });
  }

  return {
    openTaskForm,
    openTaskDetail,
    openCompleteStage,
    openGroupForm,
    openTemplateForm,
    openUserForm,
    openLinkForm,
    openStageCell,
    openMemberProfile,
    requestUnlock,
    openSetPassword,
    openImportConfirm
  };
})();
