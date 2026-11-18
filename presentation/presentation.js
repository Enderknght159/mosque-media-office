/* ==========================================================================
   عرض نظام المكتب الإعلامي — الحركة والتفاعل
   كل الحركة على transform/opacity، ولكل عرض تفاعلي حالة ثابتة بلا جافاسكربت.
   ========================================================================== */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const checkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------------------------------------------------------------- reveal */
  document.body.classList.add('motion-ready');

  const revealItems = $$('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-in'));
  }

  /* --------------------------------------------------------------- counters */
  const counted = new WeakSet();
  function animateCount(el) {
    if (counted.has(el)) return;
    counted.add(el);
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;
    if (reduceMotion.matches) {
      el.textContent = String(target);
      return;
    }
    const start = performance.now();
    const duration = 900;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function runCounters(slide) {
    $$('[data-count]', slide).forEach(animateCount);
  }

  /* ----------------------------------------------------------- slides/track */
  const slides = $$('.slide');
  const trackButtons = $$('.track-dots button');
  const trackCurrent = $('#track-current');
  const slideIndex = $('#slide-index');
  const progressBar = $('#scroll-progress-bar');
  let activeId = 'hero';

  const labelFor = (id) => {
    const slide = document.getElementById(id);
    return slide?.dataset.label || '';
  };

  function setActive(id) {
    if (!id || id === activeId) return;
    activeId = id;
    trackButtons.forEach((button) => {
      const active = button.dataset.goto === id;
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    const index = slides.findIndex((slide) => slide.id === id);
    if (slideIndex && index >= 0) slideIndex.textContent = String(index + 1).padStart(2, '0');
    if (trackCurrent) trackCurrent.textContent = labelFor(id);
    const slide = document.getElementById(id);
    if (slide) runCounters(slide);
  }

  if ('IntersectionObserver' in window && slides.length) {
    const slideObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { rootMargin: '-46% 0px -46% 0px', threshold: 0 });
    slides.forEach((slide) => slideObserver.observe(slide));
  }

  trackButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.goto);
      if (!target) return;
      target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* -------------------------------------------------------------- keyboard */
  function currentIndex() {
    return Math.max(0, slides.findIndex((slide) => slide.id === activeId));
  }
  function goTo(index) {
    const next = Math.min(slides.length - 1, Math.max(0, index));
    slides[next]?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  }
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const forward = ['ArrowDown', 'ArrowLeft', 'PageDown'].includes(event.key);
    const backward = ['ArrowUp', 'ArrowRight', 'PageUp'].includes(event.key);
    if (forward) {
      event.preventDefault();
      goTo(currentIndex() + 1);
    } else if (backward) {
      event.preventDefault();
      goTo(currentIndex() - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      goTo(slides.length - 1);
    }
  });

  /* ------------------------------------------------------------- progress */
  let ticking = false;
  function updateProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (progressBar) progressBar.style.width = `${(ratio * 100).toFixed(2)}%`;
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateProgress);
  }, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();
  setActive('hero');

  /* ------------------------------------------------------------ fullscreen */
  const fullscreenButton = $('#fullscreen-toggle');
  if (fullscreenButton) {
    const label = $('span', fullscreenButton);
    fullscreenButton.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          if (label) label.textContent = 'إنهاء ملء الشاشة';
          fullscreenButton.setAttribute('aria-label', 'إنهاء ملء الشاشة');
        } else {
          await document.exitFullscreen();
          if (label) label.textContent = 'ملء الشاشة';
          fullscreenButton.setAttribute('aria-label', 'عرض ملء الشاشة');
        }
      } catch (error) {
        /* المتصفح قد يمنع ملء الشاشة؛ يبقى العرض قابلًا للاستخدام. */
      }
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && label) {
        label.textContent = 'ملء الشاشة';
        fullscreenButton.setAttribute('aria-label', 'عرض ملء الشاشة');
      }
    });
  }

  /* -------------------------------------------------------------- task demo */
  const taskDemo = $('#task-demo');
  if (taskDemo) {
    const baseStages = [
      { name: 'اختيار الفكرة', who: 'أحمد', when: 'منذ 6 أيام', done: true },
      { name: 'كتابة السكريبت', who: 'عبدالله', when: 'منذ 6 أيام', done: true },
      { name: 'تصوير الريل', who: 'سارة', when: 'منذ 4 أيام', done: true },
      { name: 'تفريغ الريل', who: '', when: '', done: false },
      { name: 'مونتاج الريل', who: '', when: '', done: false },
      { name: 'النشر', who: '', when: '', done: false }
    ];
    const list = $('#stage-list', taskDemo);
    const bar = $('[data-task-bar]', taskDemo);
    const pct = $('[data-task-pct]', taskDemo);
    const count = $('[data-task-count]', taskDemo);
    const hint = $('[data-task-hint]', taskDemo);
    let stages = baseStages.map((stage) => ({ ...stage }));

    function nextIndex() {
      return stages.findIndex((stage) => !stage.done);
    }

    function renderTask() {
      if (!list) return;
      const next = nextIndex();
      list.innerHTML = stages.map((stage, index) => {
        const state = stage.done ? 'is-done' : index === next ? 'is-current' : 'is-locked';
        const meta = stage.done
          ? `${stage.who} · ${stage.when}`
          : index === next ? 'دورك الآن' : 'بانتظار المرحلة السابقة';
        return `
          <li>
            <button type="button" class="stage ${state}" data-stage="${index}" ${stage.done ? 'aria-label="مرحلة منجزة: ' + stage.name + '"' : 'aria-label="إكمال مرحلة ' + stage.name + '"'}>
              <span class="stage-check">${stage.done ? checkIcon : index === next ? checkIcon : ''}</span>
              <span class="stage-name">${stage.name}</span>
              <span class="stage-meta">${meta}</span>
            </button>
          </li>`;
      }).join('');
      const done = stages.filter((stage) => stage.done).length;
      const percent = Math.round((done / stages.length) * 100);
      if (bar) bar.style.width = `${percent}%`;
      if (pct) pct.textContent = `${percent}٪`;
      if (count) count.textContent = `${done} من ${stages.length} مراحل`;
      if (hint) {
        hint.classList.remove('is-good', 'is-warn');
        if (done === stages.length) {
          hint.textContent = 'اكتملت المهمة — تظهر الآن في التقارير كمكتملة، وفي سجل الفريق باسمك.';
          hint.classList.add('is-good');
        } else if (done > 3) {
          hint.textContent = 'المسار واضح: المرحلة التالية ظاهرة للجميع، والمنجز موثّق بالاسم.';
        } else {
          hint.textContent = 'اضغط المرحلة الحالية لتسجيلها باسمك.';
        }
      }
    }

    list?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-stage]');
      if (!button) return;
      const index = Number(button.dataset.stage);
      const stage = stages[index];
      if (!stage) return;
      if (stage.done) {
        if (hint) {
          hint.classList.remove('is-good');
          hint.classList.add('is-warn');
          hint.textContent = 'هذه المرحلة مسجّلة بالفعل. «أعد التجربة» يمسح السجل التعليمي.';
        }
        return;
      }
      const next = nextIndex();
      if (index !== next) {
        if (hint) {
          hint.classList.remove('is-good');
          hint.classList.add('is-warn');
          hint.textContent = `أكمل «${stages[next].name}» أولًا — الترتيب جزء من القالب.`;
        }
        return;
      }
      stage.done = true;
      stage.who = 'أنت';
      stage.when = 'الآن';
      renderTask();
    });

    $('[data-task-reset]', taskDemo)?.addEventListener('click', () => {
      stages = baseStages.map((stage) => ({ ...stage }));
      renderTask();
    });

    renderTask();
  }

  /* -------------------------------------------------------------- groups */
  const groupData = [
    {
      name: 'الخطب',
      desc: 'إنتاج وتوثيق خطب الجمعة من التصوير حتى النشر.',
      stages: ['تصوير الخطبة', 'تفريغ الخطبة', 'مونتاج الخطبة', 'نشر الخطبة']
    },
    {
      name: 'دروس الفجر',
      desc: 'تسجيل دروس الفجر ونشرها في اليوم نفسه.',
      stages: ['تصوير الدرس', 'تفريغ الفيديو', 'مونتاج الدرس', 'نشر الدرس']
    },
    {
      name: 'الريلز',
      desc: 'مقاطع قصيرة تُبنى من فكرة جديدة حتى النشر.',
      stages: ['اختيار الفكرة', 'كتابة السكريبت', 'تصوير الريل', 'تفريغ الريل', 'مونتاج الريل', 'النشر']
    },
    {
      name: 'ريلز من الدروس',
      desc: 'مقاطع مؤثرة تُستخرج من الدروس المصوّرة.',
      stages: ['اختيار الفكرة والمقطع', 'مونتاج المقطع', 'النشر']
    }
  ];
  const groupTabs = $$('.group-tabs [data-group]');
  if (groupTabs.length) {
    const panel = $('#group-panel');
    const nameEl = $('[data-group-name]', panel);
    const descEl = $('[data-group-desc]', panel);
    const stagesEl = $('[data-group-stages]', panel);

    function selectGroup(index) {
      const group = groupData[index];
      if (!group) return;
      groupTabs.forEach((tab, tabIndex) => {
        const selected = tabIndex === index;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      if (nameEl) nameEl.textContent = group.name;
      if (descEl) descEl.textContent = group.desc;
      if (stagesEl) stagesEl.innerHTML = group.stages.map((stage) => `<li>${stage}</li>`).join('');
      if (panel) panel.setAttribute('aria-labelledby', `group-tab-${index}`);
    }

    groupTabs.forEach((tab) => {
      tab.addEventListener('click', () => selectGroup(Number(tab.dataset.group)));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const current = Number(tab.dataset.group);
        const step = event.key === 'ArrowLeft' ? 1 : -1;
        const next = (current + step + groupTabs.length) % groupTabs.length;
        selectGroup(next);
        groupTabs[next].focus();
      });
    });
    selectGroup(0);
  }

  /* ----------------------------------------------------------- run demo */
  const runPanel = $('#run-panel');
  if (runPanel) {
    const phases = [
      { name: 'قراءة المهمة والملفات', short: 'قراءة' },
      { name: 'تجهيز بيئة العمل', short: 'تجهيز' },
      { name: 'تفريغ الصوت', short: 'تفريغ' },
      { name: 'قص المقاطع واختيار الأفضل', short: 'قص' },
      { name: 'المونتاج والكابشنز', short: 'مونتاج' },
      { name: 'المراجعة وتسليم الملفات', short: 'تسليم' }
    ];
    const status = $('[data-run-status]', runPanel);
    const phaseEl = $('[data-run-phase]', runPanel);
    const bar = $('[data-run-bar]', runPanel);
    const pct = $('[data-run-pct]', runPanel);
    const timeEl = $('[data-run-time]', runPanel);
    const tokensEl = $('[data-run-tokens]', runPanel);
    const costEl = $('[data-run-cost]', runPanel);
    const stepsEl = $('[data-run-steps]', runPanel);
    const output = $('[data-run-output]', runPanel);
    const startButton = $('[data-run-start]', runPanel);
    const resetButton = $('[data-run-reset]', runPanel);
    let timer = null;
    let phaseIndex = -1;
    let ticks = 0;

    function renderRun() {
      if (!stepsEl) return;
      stepsEl.innerHTML = phases.map((phase, index) => {
        let cls = '';
        if (index < phaseIndex) cls = 'is-done';
        else if (index === phaseIndex) cls = 'is-active';
        const state = index < phaseIndex ? 'تم' : index === phaseIndex ? 'جارٍ' : '—';
        return `<li class="${cls}"><b>${phase.name}</b><span>${state}</span></li>`;
      }).join('');
    }

    function setRunState(state) {
      if (!status) return;
      status.classList.remove('is-running', 'is-done');
      if (state === 'running') {
        status.classList.add('is-running');
        status.textContent = 'يعمل الآن';
      } else if (state === 'done') {
        status.classList.add('is-done');
        status.textContent = 'مكتمل';
      } else {
        status.textContent = 'جاهز';
      }
    }

    function resetRun() {
      if (timer) clearInterval(timer);
      timer = null;
      phaseIndex = -1;
      ticks = 0;
      setRunState('idle');
      if (phaseEl) phaseEl.textContent = 'بانتظار بدء التشغيل';
      if (bar) bar.style.width = '0%';
      if (pct) pct.textContent = '0٪';
      if (timeEl) timeEl.textContent = '00:00';
      if (tokensEl) tokensEl.textContent = '0';
      if (costEl) costEl.textContent = '$0.0000';
      if (output) output.hidden = true;
      if (startButton) {
        startButton.disabled = false;
        startButton.textContent = 'شغّل عرضًا تجريبيًا';
      }
      renderRun();
    }

    function tick() {
      ticks += 1;
      phaseIndex = Math.min(phases.length, phaseIndex + 1);
      if (phaseIndex >= phases.length) {
        if (timer) clearInterval(timer);
        timer = null;
        setRunState('done');
        if (phaseEl) phaseEl.textContent = 'اكتمل التشغيل — الملفات جاهزة في output';
        if (bar) bar.style.width = '100%';
        if (pct) pct.textContent = '100٪';
        if (timeEl) timeEl.textContent = '00:42';
        if (tokensEl) tokensEl.textContent = '71,200';
        if (costEl) costEl.textContent = '$0.0619';
        if (output) output.hidden = false;
        if (startButton) {
          startButton.disabled = false;
          startButton.textContent = 'شغّل مجددًا';
        }
        if (stepsEl) stepsEl.innerHTML = phases.map((phase) => `<li class="is-done"><b>${phase.name}</b><span>تم</span></li>`).join('');
        return;
      }
      renderRun();
      const seconds = ticks * 7;
      const progress = Math.round((phaseIndex / phases.length) * 100);
      if (phaseEl) phaseEl.textContent = phases[phaseIndex].name;
      if (bar) bar.style.width = `${progress}%`;
      if (pct) pct.textContent = `${progress}٪`;
      if (timeEl) timeEl.textContent = `00:${String(seconds).padStart(2, '0')}`;
      if (tokensEl) tokensEl.textContent = Math.round((71200 / phases.length) * phaseIndex).toLocaleString('en-US');
      if (costEl) costEl.textContent = `$${((0.0619 / phases.length) * phaseIndex).toFixed(4)}`;
    }

    startButton?.addEventListener('click', () => {
      if (timer) return;
      resetRun();
      setRunState('running');
      startButton.disabled = true;
      startButton.textContent = 'جارٍ التشغيل…';
      phaseIndex = 0;
      renderRun();
      if (phaseEl) phaseEl.textContent = phases[0].name;
      if (bar) bar.style.width = '8%';
      if (pct) pct.textContent = '8٪';
      ticks = 0;
      timer = setInterval(tick, 780);
    });
    resetButton?.addEventListener('click', resetRun);
    resetRun();
  }

  /* ------------------------------------------------------------ archive demo */
  const verifyPanel = $('#verify-panel');
  if (verifyPanel) {
    const steps = [
      { title: 'نسخ الملفات إلى .incoming', note: 'بثّ مع حساب البصمة' },
      { title: 'حساب SHA-256 لكل ملف', note: 'أثناء النسخ' },
      { title: 'مطابقة البصمة في الوجهة', note: 'إعادة قراءة كاملة' },
      { title: 'كتابة إيصال .mmo-archive', note: 'الملفات والأحجام والبصمات' },
      { title: 'حذف المصدر', note: 'بعد التحقق فقط' }
    ];
    const stepsEl = $('[data-verify-steps]', verifyPanel);
    const result = $('[data-verify-result]', verifyPanel);
    const note = $('[data-verify-note]', verifyPanel);
    const startButton = $('[data-verify-start]', verifyPanel);
    const failButton = $('[data-verify-fail]', verifyPanel);
    let timer = null;
    let index = -1;
    let mode = 'success';

    function renderVerify() {
      if (!stepsEl) return;
      stepsEl.innerHTML = steps.map((step, stepIndex) => {
        let cls = '';
        let state = '';
        if (stepIndex < index) {
          cls = 'is-done';
          state = 'تم';
        } else if (stepIndex === index) {
          cls = mode === 'fail' && index === 2 ? 'is-failed' : 'is-active';
          state = mode === 'fail' && index === 2 ? 'توقف' : 'جارٍ';
        }
        return `<li class="${cls}"><b>${step.title}</b><span>${state || step.note}</span></li>`;
      }).join('');
    }

    function resetVerify() {
      if (timer) clearInterval(timer);
      timer = null;
      index = -1;
      mode = 'success';
      if (result) {
        result.className = 'verify-result';
        result.textContent = 'جاهز';
      }
      if (note) {
        note.className = 'verify-note';
        note.textContent = 'لا يُحذف المصدر قبل مطابقة بصمة كل ملف وكتابة الإيصال.';
      }
      if (startButton) startButton.disabled = false;
      if (failButton) failButton.disabled = false;
      renderVerify();
    }

    function advance() {
      index += 1;
      if (mode === 'fail' && index === 2) {
        if (timer) clearInterval(timer);
        timer = null;
        renderVerify();
        if (result) {
          result.className = 'verify-result is-failed';
          result.textContent = 'فشل';
        }
        if (note) {
          note.className = 'verify-note is-bad';
          note.textContent = 'انقطع النقل عند المطابقة. المصدر لم يُمس، والحذف لم يحدث، ونُظّفت الملفات الجزئية فقط.';
        }
        if (startButton) startButton.disabled = false;
        if (failButton) failButton.disabled = false;
        return;
      }
      if (index >= steps.length) {
        if (timer) clearInterval(timer);
        timer = null;
        if (result) {
          result.className = 'verify-result is-done';
          result.textContent = 'تم';
        }
        if (note) {
          note.className = 'verify-note is-good';
          note.textContent = 'تمت الأرشفة: كل ملف طابق بصمته، ووُجد الإيصال، ثم حُذف المصدر.';
        }
        if (startButton) startButton.disabled = false;
        if (failButton) failButton.disabled = false;
        renderVerify();
        return;
      }
      renderVerify();
    }

    function begin(failMode) {
      if (timer) clearInterval(timer);
      resetVerify();
      mode = failMode ? 'fail' : 'success';
      index = 0;
      if (result) {
        result.className = 'verify-result is-running';
        result.textContent = 'جارٍ';
      }
      if (note) {
        note.className = 'verify-note';
        note.textContent = 'ننسخ أولًا، ثم نتحقق، ثم نكتب الإيصال. لا حذف قبل ذلك.';
      }
      if (startButton) startButton.disabled = true;
      if (failButton) failButton.disabled = true;
      renderVerify();
      timer = setInterval(advance, 820);
    }

    startButton?.addEventListener('click', () => begin(false));
    failButton?.addEventListener('click', () => begin(true));
    resetVerify();
  }

  /* ---------------------------------------------------------------- anchors */
  $$('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  });
})();
