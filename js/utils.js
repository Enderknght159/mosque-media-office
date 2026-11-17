const Utils = (() => {
  const AR = 'ar-EG-u-nu-latn';
  const AR_SHORT = 'ar-EG-u-nu-latn';
  const HIJRI = 'ar-SA-u-ca-islamic-umalqura-nu-latn';
  const dayMs = 86400000;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  const esc = escapeHtml;

  function uid(prefix = 'id') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toISODate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function parseDateInput(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getTime());
    const text = String(value).trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function startOfDay(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : parseDateInput(value) || new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function endOfDay(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : parseDateInput(value) || new Date();
    date.setHours(23, 59, 59, 999);
    return date;
  }

  function addDays(value, amount) {
    const date = value instanceof Date ? new Date(value.getTime()) : parseDateInput(value) || new Date();
    date.setDate(date.getDate() + amount);
    return date;
  }

  function addHours(value, amount) {
    const date = value instanceof Date ? new Date(value.getTime()) : parseDateInput(value) || new Date();
    date.setHours(date.getHours() + amount);
    return date;
  }

  function startOfWeek(value = new Date()) {
    const date = startOfDay(value);
    date.setDate(date.getDate() - date.getDay());
    return date;
  }

  function startOfMonth(value = new Date()) {
    const date = startOfDay(value);
    date.setDate(1);
    return date;
  }

  function endOfMonth(value = new Date()) {
    const date = startOfMonth(value);
    date.setMonth(date.getMonth() + 1);
    date.setDate(0);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return parseDateInput(value);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateKey(value) {
    const date = toDate(value);
    return date ? toISODate(date) : '';
  }

  function isSameDay(a, b) {
    return dateKey(a) === dateKey(b);
  }

  function fmtDate(value, options = {}) {
    const date = toDate(value);
    if (!date) return '';
    const config = {
      day: 'numeric',
      month: options.short ? 'short' : 'long'
    };
    if (options.year !== false) config.year = 'numeric';
    if (options.weekday) config.weekday = 'long';
    return new Intl.DateTimeFormat(AR, { ...config, calendar: 'gregory', numberingSystem: 'latn' }).format(date);
  }

  function fmtShortDate(value) {
    return fmtDate(value, { short: true });
  }

  function fmtTime(value) {
    const date = toDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat(AR_SHORT, { hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' }).format(date);
  }

  function fmtDateTime(value) {
    const date = toDate(value);
    if (!date) return '';
    return `${fmtDate(date)} · ${fmtTime(date)}`;
  }

  function fmtHijri(value = new Date()) {
    const date = toDate(value);
    if (!date) return '';
    try {
      return new Intl.DateTimeFormat(HIJRI, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    } catch (error) {
      return '';
    }
  }

  function fmtWeekday(value, options = {}) {
    const date = toDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat(AR, {
      weekday: options.long ? 'long' : 'short',
      day: options.withDay ? 'numeric' : undefined,
      month: options.withMonth ? 'short' : undefined
    }).format(date);
  }

  function fmtDayMonth(value) {
    const date = toDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat(AR_SHORT, { day: 'numeric', month: 'short' }).format(date);
  }

  function fmtRange(from, to) {
    if (!from && !to) return 'كل الفترة';
    if (!from) return `حتى ${fmtDate(to)}`;
    if (!to) return `من ${fmtDate(from)}`;
    return `${fmtDate(from)} – ${fmtDate(to)}`;
  }

  function unitArabic(count, unit) {
    const n = Math.abs(count);
    const labels = {
      minute: ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'],
      hour: ['ساعة', 'ساعتين', 'ساعات', 'ساعة'],
      day: ['يوم', 'يومين', 'أيام', 'يومًا'],
      week: ['أسبوع', 'أسبوعين', 'أسابيع', 'أسبوعًا'],
      month: ['شهر', 'شهرين', 'أشهر', 'شهرًا']
    };
    const row = labels[unit] || labels.day;
    if (n === 1) return row[0];
    if (n === 2) return row[1];
    if (n >= 3 && n <= 10) return `${n} ${row[2]}`;
    return `${n} ${row[3]}`;
  }

  function relativeTime(value) {
    const date = toDate(value);
    if (!date) return '';
    const diff = Date.now() - date.getTime();
    if (diff < 0) {
      const ahead = Math.abs(diff);
      if (ahead < 60000) return 'الآن';
      if (ahead < 3600000) return `خلال ${unitArabic(Math.floor(ahead / 60000), 'minute')}`;
      if (ahead < dayMs) return `خلال ${unitArabic(Math.floor(ahead / 3600000), 'hour')}`;
      return fmtDate(date);
    }
    if (diff < 60000) return 'الآن';
    if (diff < 3600000) return `منذ ${unitArabic(Math.floor(diff / 60000), 'minute')}`;
    if (diff < dayMs) return `منذ ${unitArabic(Math.floor(diff / 3600000), 'hour')}`;
    const days = Math.floor(diff / dayMs);
    if (days === 1) return 'أمس';
    if (days < 7) return `منذ ${unitArabic(days, 'day')}`;
    if (days < 30) return `منذ ${unitArabic(Math.floor(days / 7), 'week')}`;
    if (days < 365) return `منذ ${unitArabic(Math.floor(days / 30), 'month')}`;
    return fmtDate(date);
  }

  function dueMeta(task) {
    if (!task || !task.dueDate) return { text: 'بلا موعد', tone: 'muted', overdue: false };
    const stages = task.stages || [];
    const done = stages.length > 0 && stages.every((stage) => stage.done);
    const today = startOfDay(new Date());
    const due = startOfDay(task.dueDate);
    const diff = Math.round((due.getTime() - today.getTime()) / dayMs);
    if (done) return { text: fmtShortDate(task.dueDate), tone: 'muted', overdue: false };
    if (diff < 0) {
      const amount = Math.abs(diff);
      const label = amount === 1 ? 'متأخرة بيوم' : amount === 2 ? 'متأخرة بيومين' : `متأخرة بـ${unitArabic(amount, 'day')}`;
      return { text: label, tone: 'danger', overdue: true };
    }
    if (diff === 0) return { text: 'تستحق اليوم', tone: 'warning', overdue: false };
    if (diff === 1) return { text: 'تستحق غدًا', tone: 'warning', overdue: false };
    return { text: fmtShortDate(task.dueDate), tone: 'muted', overdue: false };
  }

  function formatNumber(value) {
    const number = Number(value) || 0;
    return new Intl.NumberFormat('en-US').format(number);
  }

  function percent(part, total) {
    if (!total) return 0;
    return Math.round((Number(part) / Number(total)) * 100);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function initials(name) {
    const clean = String(name || '').trim();
    if (!clean) return '؟';
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length > 1) return `${words[0][0]}${words[1][0]}`;
    return clean.slice(0, 2);
  }

  function shortName(name, limit = 18) {
    const text = String(name || '').trim();
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
  }

  function normalizeUrl(input) {
    const value = String(input || '').trim();
    if (!value) return '';
    if (/^[a-zA-Z]:\\/.test(value)) return `file:///${value.replace(/\\/g, '/')}`;
    if (/^file:\/\//i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (/^mailto:|^tel:/i.test(value)) return value;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return '';
    if (/^\/\//.test(value)) return `https:${value}`;
    if (/^www\./i.test(value)) return `https://${value}`;
    return `https://${value}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'utf-8');
    });
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function debounce(fn, wait = 300) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function slugDate(value = new Date()) {
    return toISODate(toDate(value) || new Date());
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function humanSize(bytes) {
    const size = Math.max(0, Number(bytes) || 0);
    if (size < 1024) return `${Math.round(size)} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = size;
    let index = -1;
    do {
      value /= 1024;
      index += 1;
    } while (value >= 1024 && index < units.length - 1);
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[index]}`;
  }

  function plural(count, one, two, few, many) {
    const n = Math.abs(Number(count) || 0);
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return `${n} ${few}`;
    return `${n} ${many}`;
  }

  return {
    AR,
    dayMs,
    esc,
    escapeHtml,
    uid,
    pad,
    toISODate,
    todayISO,
    parseDateInput,
    startOfDay,
    endOfDay,
    addDays,
    addHours,
    startOfWeek,
    startOfMonth,
    endOfMonth,
    toDate,
    dateKey,
    isSameDay,
    fmtDate,
    fmtShortDate,
    fmtTime,
    fmtDateTime,
    fmtHijri,
    fmtWeekday,
    fmtDayMonth,
    fmtRange,
    relativeTime,
    dueMeta,
    formatNumber,
    percent,
    clamp,
    initials,
    shortName,
    normalizeUrl,
    downloadBlob,
    readFileAsArrayBuffer,
    readFileAsText,
    readFileAsDataURL,
    debounce,
    slugDate,
    escapeRegExp,
    humanSize,
    plural
  };
})();
