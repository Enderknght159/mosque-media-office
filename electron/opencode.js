'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

// ---------------------------------------------------------------- constants

const OPENCODE_DIR = 'opencode';
const OUTPUT_DIR = 'output';
const LOG_DIR = 'logs';
const AGENTS_FILE = 'AGENTS.md';
const STATUS_FILE = 'status.json';

const HEALTH_TIMEOUT = 8000;
const MODELS_TIMEOUT = 30000;
const MODELS_TTL = 10 * 60 * 1000;
const STATUS_POLL = 1000;
const UPDATE_INTERVAL = 250; // 4 updates per second max
const FINISHED_TTL = 30000;
const MAX_MESSAGE = 500;
const MAX_ERROR = 4000;
const MAX_STDERR = 2000;
const READ_TAIL_BYTES = 400 * 1024;

const JOB_ID_RE = /^[A-Za-z0-9_-]{1,90}$/;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._+\-]{0,120}\/[A-Za-z0-9._+\-#]{1,140}$/;

// Windows CreateProcess caps the command line at 32767 UTF-16 chars; keep a margin.
const MAX_ARG_PROMPT = 24000;

const CONTRACT_MD = `# عقد العمل — المكتب الإعلامي

أنت تعمل داخل مجلد مهمة واحدة. المصادر في هذا المجلد نفسه.

1. المخرجات النهائية فقط داخل \`output/\` (فيديو، صور، ملفات تصدير).
2. كل المسودات والملاحظات والأوامر التقنية داخل \`opencode/\`.
3. لا تنشئ أو تعدّل أي ملف خارج هذين المجلدين، ولا تلمس مجلدات أخرى.
4. لا تحذف ملفات المصدر.
5. حدّث \`opencode/status.json\` بعد كل خطوة رئيسية بالشكل:
   { "state": "working|done|failed|blocked", "phase": "…", "percent": 0-100, "etaSeconds": 0, "message": "…", "outputs": ["output/…"], "updatedAt": "ISO" }
6. عند الانتهاء: الناتج في \`output/\` و\`state\` في \`status.json\` تساوي \`done\` والـ\`percent\` 100.
7. أسماء الملفات الناتجة واضحة وبالعربية، وأخبر في \`message\` بما أنجزته.
8. إن احتجت قرارًا من المستخدم: \`state: "blocked"\` واكتب السؤال في \`message\` ثم توقف.
`;

// ---------------------------------------------------------------- state

const jobs = new Map(); // jobId -> job
let getWindowRef = () => null;
const modelsCache = { at: 0, list: [], command: '' };

// ---------------------------------------------------------------- helpers

function nowISO() {
  return new Date().toISOString();
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : 0;
}

function clamp(value, min, max) {
  const result = Number(value);
  if (!Number.isFinite(result)) return min;
  return Math.min(max, Math.max(min, result));
}

function safeText(value, limit) {
  const text = typeof value === 'string' ? value : String(value == null ? '' : value);
  return limit ? text.slice(0, limit) : text;
}

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function existsFile(filePath) {
  try {
    return Boolean(filePath) && fs.statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
}

function existsDir(dirPath) {
  try {
    return Boolean(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch (error) {
    return false;
  }
}

function isInside(parent, child) {
  const parentPath = path.resolve(parent);
  const childPath = path.resolve(child);
  const relative = path.relative(parentPath, childPath);
  if (!relative) return true;
  if (path.isAbsolute(relative)) return false;
  return !relative.split(/[\\/]+/).includes('..');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function writeJson(filePath, value) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
    return true;
  } catch (error) {
    return false;
  }
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {}
}

function appDataDir() {
  return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

function send(channel, payload) {
  try {
    const win = typeof getWindowRef === 'function' ? getWindowRef() : null;
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
    const contents = win.webContents;
    if (!contents || (typeof contents.isDestroyed === 'function' && contents.isDestroyed())) return;
    contents.send(channel, payload);
  } catch (error) {}
}

// ---------------------------------------------------------------- command resolution

function findOnPath() {
  const raw = String(process.env.PATH || '');
  if (!raw) return '';
  const separator = process.platform === 'win32' ? ';' : ':';
  const dirs = raw.split(separator).map((item) => item.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
  const names = process.platform === 'win32'
    ? ['opencode.exe', 'opencode.cmd', 'opencode.bat', 'opencode']
    : ['opencode'];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (existsFile(candidate)) return candidate;
    }
  }
  return '';
}

function classifyCommand(commandPath, source) {
  const ext = path.extname(commandPath).toLowerCase();
  const isShim = ext === '.cmd' || ext === '.bat';
  if (isShim) {
    // npm shims wrap a real executable; using it directly avoids cmd.exe quoting entirely
    const localExe = path.join(path.dirname(commandPath), 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
    if (existsFile(localExe)) {
      return { command: localExe, shell: false, source: `${source}:exe` };
    }
    return { command: commandPath, shell: true, source };
  }
  return { command: commandPath, shell: false, source };
}

/**
 * Resolution order: explicit settings path -> `opencode` on PATH -> %APPDATA%\npm\opencode.cmd
 * Returns { command, shell, source }. Never throws.
 */
function resolveCommand(explicitPath) {
  const explicit = safeText(explicitPath, 400).trim();
  const attempts = [];
  if (explicit) {
    if (existsFile(explicit)) return classifyCommand(explicit, 'settings');
    attempts.push({ path: explicit, error: 'المسار المحدد غير موجود' });
  }

  const pathHit = findOnPath();
  if (pathHit) return classifyCommand(pathHit, 'path');
  attempts.push({ path: 'opencode', error: 'غير موجود في PATH' });

  const npmShim = path.join(appDataDir(), 'npm', 'opencode.cmd');
  if (existsFile(npmShim)) return classifyCommand(npmShim, 'npm');
  const npmExe = path.join(appDataDir(), 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
  if (existsFile(npmExe)) return { command: npmExe, shell: false, source: 'npm-exe' };
  attempts.push({ path: npmShim, error: 'غير موجود' });

  return { command: '', shell: false, source: 'missing', attempts };
}

function quoteShellArg(value) {
  const text = String(value == null ? '' : value);
  return `"${text.replace(/"/g, '\\"')}"`;
}

function sanitizeShellText(value) {
  // cmd.exe has no escape for `"` inside a quoted argument (backslash is literal),
  // so it is replaced with a typographic quote to keep the command line parseable.
  return String(value == null ? '' : value)
    .replace(/\r/g, '')
    .replace(/"/g, '\u2019');
}

/**
 * Shell fallback (only used when the resolved command is a .cmd/.bat shim).
 * cmd.exe truncates at newlines and has no escape for `"`, so the message is
 * split into one quoted argument per line (opencode joins message args with
 * spaces) and quotes are normalized. Preferring the real .exe keeps the normal
 * path byte-exact.
 */
function buildShellStartCommand(command, args) {
  const head = args.slice(0, -1).map(sanitizeShellText);
  const message = args[args.length - 1];
  const lines = String(message).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parts = [quoteShellArg(command), ...head.map(quoteShellArg)];
  if (!lines.length) return parts.join(' ');
  return parts.concat(lines.map((line) => quoteShellArg(sanitizeShellText(line)))).join(' ');
}

function buildShellCommand(command, args) {
  return [quoteShellArg(command), ...args.map(quoteShellArg)].join(' ');
}

// ---------------------------------------------------------------- process runner

function runCapture(command, args, timeoutMs, useShell = false) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child = null;
    let timer = null;

    const finish = (extra = {}) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        code: extra.code == null ? null : extra.code,
        stdout: stripAnsi(stdout),
        stderr: stripAnsi(stderr),
        timedOut: Boolean(extra.timedOut),
        error: extra.error || ''
      });
    };

    try {
      child = spawn(command, args, {
        windowsHide: true,
        shell: Boolean(useShell),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
      });
    } catch (error) {
      finish({ error: error?.message || 'تعذر تشغيل opencode' });
      return;
    }

    timer = setTimeout(() => {
      try {
        if (child && child.pid) {
          if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
          else child.kill('SIGKILL');
        }
      } catch (error) {}
      finish({ timedOut: true, error: 'انتهت المهلة' });
    }, Math.max(1000, Number(timeoutMs) || 8000));
    if (timer.unref) timer.unref();

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 2 * 1024 * 1024) stdout = stdout.slice(-1024 * 1024);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 1024 * 1024) stderr = stderr.slice(-512 * 1024);
    });
    child.on('error', (error) => {
      finish({ error: error?.message || 'تعذر تشغيل opencode', code: -1 });
    });
    child.on('close', (code) => {
      finish({ code });
    });
  });
}

async function runCommand(commandInfo, args, timeoutMs) {
  if (!commandInfo || !commandInfo.command) {
    return { code: -1, stdout: '', stderr: '', timedOut: false, error: 'لم يُعثر على opencode' };
  }
  if (commandInfo.shell && process.platform === 'win32') {
    const line = buildShellCommand(commandInfo.command, args);
    return runCapture(line, [], timeoutMs, true);
  }
  return runCapture(commandInfo.command, args, timeoutMs);
}

// ---------------------------------------------------------------- opencode IPC: health / models

async function health(payload = {}) {
  const checkedAt = nowISO();
  const info = resolveCommand(payload.opencodePath);
  if (!info.command) {
    return {
      ok: true,
      data: {
        available: false,
        command: '',
        version: '',
        checkedAt,
        message: 'لم يُعثر على opencode. ثبّت الحزمة أو اكتب مسارها في الإعدادات.'
      }
    };
  }

  const result = await runCommand(info, ['--version'], HEALTH_TIMEOUT);
  const versionMatch = /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(`${result.stdout}\n${result.stderr}`);
  const available = result.code === 0 && Boolean(result.stdout.trim() || result.stderr.trim());
  const detail = safeText((result.stderr || result.stdout).trim(), 300);

  if (!available) {
    const reason = result.timedOut
      ? 'لم يستجب opencode خلال ٨ ثوان.'
      : (detail || result.error || 'تعذر تشغيل opencode.');
    return {
      ok: true,
      data: {
        available: false,
        command: info.command,
        version: '',
        checkedAt,
        message: `تعذر تشغيل opencode: ${reason}`
      }
    };
  }

  return {
    ok: true,
    data: {
      available: true,
      command: info.command,
      version: versionMatch ? versionMatch[1] : '',
      checkedAt,
      message: ''
    }
  };
}

async function models(payload = {}) {
  const refresh = Boolean(payload.refresh);
  const cacheAge = Date.now() - modelsCache.at;
  if (!refresh && modelsCache.list.length && cacheAge < MODELS_TTL) {
    return {
      ok: true,
      data: { models: [...modelsCache.list], at: new Date(modelsCache.at).toISOString(), source: 'cache' }
    };
  }

  const info = resolveCommand(payload.opencodePath);
  if (!info.command) {
    if (modelsCache.list.length) {
      return {
        ok: true,
        data: { models: [...modelsCache.list], at: new Date(modelsCache.at).toISOString(), source: 'cache' }
      };
    }
    return { ok: false, message: 'لم يُعثر على opencode. ثبّت الحزمة أو اكتب مسارها في الإعدادات.', code: 'opencode-missing' };
  }

  const result = await runCommand(info, ['models'], MODELS_TIMEOUT);
  if (result.code !== 0 && !result.stdout.trim()) {
    const reason = result.timedOut
      ? 'انتهت مهلة جلب الموديلات (٣٠ ثانية).'
      : safeText((result.stderr || result.error || '').trim(), 500);
    if (modelsCache.list.length) {
      return {
        ok: true,
        data: {
          models: [...modelsCache.list],
          at: new Date(modelsCache.at).toISOString(),
          source: 'cache',
          message: `تعذر جلب الموديلات: ${reason}`
        }
      };
    }
    return { ok: false, message: `تعذر جلب الموديلات: ${reason || 'خطأ غير معروف.'}`, code: 'models-failed' };
  }

  const list = [...new Set(String(result.stdout)
    .split(/\r?\n/)
    .map((line) => stripAnsi(line).trim())
    .filter((line) => line && !/\s/.test(line) && line.includes('/')))].slice(0, 800);

  modelsCache.at = Date.now();
  modelsCache.list = list;
  modelsCache.command = info.command;

  return {
    ok: true,
    data: { models: [...list], at: new Date(modelsCache.at).toISOString(), source: 'live' }
  };
}

// ---------------------------------------------------------------- job helpers

function emptyUsage() {
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0 };
}

function snapshot(job) {
  return {
    jobId: job.jobId,
    taskId: job.taskId,
    status: job.status,
    progress: Math.round(clamp(job.progress, 0, 100)),
    phase: job.phase || '',
    etaSeconds: Math.max(0, Math.round(Number(job.etaSeconds) || 0)),
    steps: Math.max(0, Math.round(Number(job.steps) || 0)),
    sessionID: job.sessionID || '',
    startedAt: job.startedAt,
    endedAt: job.endedAt || null,
    exitCode: job.exitCode == null ? null : job.exitCode,
    error: job.error || '',
    progressMessage: job.lastMessage || '',
    pid: job.proc?.pid || null,
    usage: { ...job.usage }
  };
}

function queueUpdate(job, immediate = false) {
  if (!job || job.closed) return;
  try {
    const now = Date.now();
    if (immediate) {
      if (job.updateTimer) {
        clearTimeout(job.updateTimer);
        job.updateTimer = null;
      }
      job.lastUpdateAt = now;
      send('mmo:automation:update', snapshot(job));
      return;
    }
    if (!job.updateTimer && now - job.lastUpdateAt >= UPDATE_INTERVAL) {
      job.lastUpdateAt = now;
      send('mmo:automation:update', snapshot(job));
      return;
    }
    if (!job.updateTimer) {
      const wait = Math.max(UPDATE_INTERVAL, UPDATE_INTERVAL - (now - job.lastUpdateAt));
      job.updateTimer = setTimeout(() => {
        job.updateTimer = null;
        queueUpdate(job, true);
      }, wait);
      if (job.updateTimer.unref) job.updateTimer.unref();
    }
  } catch (error) {}
}

function bumpProgress(job) {
  const next = Math.min(95, 5 + Math.max(1, job.steps) * 4);
  if (next > job.progress) job.progress = next;
}

function handleEvent(job, event) {
  try {
    if (!event || typeof event !== 'object') return;
    const eventSessionID = event.sessionID || event.session?.id || '';
    if (eventSessionID && !job.sessionID) job.sessionID = safeText(eventSessionID, 80);
    const type = String(event.type || '');
    const part = event.part && typeof event.part === 'object' ? event.part : {};

    if (type === 'step_start') {
      job.steps += 1;
      job.phase = `خطوة ${job.steps}`;
      bumpProgress(job);
    } else if (type === 'tool_use') {
      const toolId = String(part.id || part.toolUseID || part.callID || part.tool || '');
      const seen = toolId ? job.toolIds.has(toolId) : false;
      if (toolId) job.toolIds.add(toolId);
      if (!seen) {
        job.steps += 1;
        if (!job.phase || /^خطوة \d+$/.test(job.phase)) job.phase = `خطوة ${job.steps}`;
        bumpProgress(job);
      }
    } else if (type === 'text') {
      const text = safeText(part.text || event.text || '', MAX_MESSAGE).trim();
      if (text) job.lastMessage = text;
    } else if (type === 'step_finish') {
      const tokens = part.tokens && typeof part.tokens === 'object' ? part.tokens : {};
      const cache = tokens.cache && typeof tokens.cache === 'object' ? tokens.cache : {};
      job.usage.input += number(tokens.input);
      job.usage.output += number(tokens.output);
      job.usage.reasoning += number(tokens.reasoning);
      job.usage.cacheRead += number(cache.read);
      job.usage.cacheWrite += number(cache.write);
      job.usage.costUSD += number(part.cost ?? event.cost);
      if (part.reason === 'tool-calls' || part.reason === 'tool_calls') {
        job.phase = 'تنفيذ أدوات';
      }
    } else if (type === 'error') {
      const err = event.error && typeof event.error === 'object' ? event.error : {};
      const message = err.message || err.data?.message || event.message || err.type || 'خطأ من opencode';
      job.error = safeText(String(message), MAX_ERROR);
      if (!job.phase || /^خطوة \d+$/.test(job.phase)) job.phase = 'خطأ';
    }
  } catch (error) {}
}

function handleStdoutLine(job, rawLine) {
  const line = String(rawLine || '').replace(/\r$/, '');
  if (!line.trim()) return;
  try {
    job.logStream.write(`${line}\n`);
  } catch (error) {}

  let event = null;
  try {
    event = JSON.parse(line);
  } catch (error) {
    event = null;
  }

  if (!event || typeof event !== 'object') {
    send('mmo:automation:event', {
      jobId: job.jobId,
      taskId: job.taskId,
      event: { type: 'log', text: safeText(line, 2000), timestamp: Date.now() }
    });
    return;
  }

  handleEvent(job, event);
  send('mmo:automation:event', { jobId: job.jobId, taskId: job.taskId, event });
  queueUpdate(job);
}

function readAgentStatus(filePath) {
  const raw = readJson(filePath);
  if (!raw || typeof raw !== 'object') return null;
  const states = ['working', 'done', 'failed', 'blocked'];
  const state = states.includes(raw.state) ? raw.state : null;
  if (!state) return null;
  const outputs = Array.isArray(raw.outputs)
    ? raw.outputs.map((item) => safeText(item, 400)).filter(Boolean).slice(0, 200)
    : [];
  return {
    state,
    phase: safeText(raw.phase, 200),
    percent: Number.isFinite(Number(raw.percent)) ? clamp(Number(raw.percent), 0, 100) : null,
    etaSeconds: Number.isFinite(Number(raw.etaSeconds)) ? Math.max(0, Math.round(Number(raw.etaSeconds))) : null,
    message: safeText(raw.message, 2000),
    outputs,
    updatedAt: raw.updatedAt ? safeText(raw.updatedAt, 40) : null
  };
}

function watchStatusFile(job) {
  const statusPath = path.join(job.taskFolder, OPENCODE_DIR, STATUS_FILE);
  job.statusPath = statusPath;

  const listener = () => {
    if (job.closed) return;
    try {
      const status = readAgentStatus(statusPath);
      if (!status) return;
      job.agentStatus = status;
      if (status.percent != null) job.progress = Math.max(job.progress, status.percent);
      if (Number.isFinite(status.etaSeconds)) job.etaSeconds = status.etaSeconds;
      if (status.state === 'done') {
        job.progress = 100;
        job.phase = 'اكتمل';
      } else if (status.state === 'failed') {
        job.phase = 'فشل';
        if (status.message && !job.error) job.error = safeText(status.message, MAX_ERROR);
      } else if (status.state === 'blocked') {
        job.phase = 'بانتظار قرار';
      } else if (status.phase) {
        job.phase = status.phase;
      }
      queueUpdate(job);
    } catch (error) {}
  };

  try {
    fs.watchFile(statusPath, { interval: STATUS_POLL, persistent: false }, listener);
    job.statusListener = listener;
  } catch (error) {}
}

function unwatchStatusFile(job) {
  if (!job?.statusPath || !job.statusListener) return;
  try {
    fs.unwatchFile(job.statusPath, job.statusListener);
  } catch (error) {}
  job.statusListener = null;
}

function killTree(job, synchronous = false) {
  const pid = job?.proc?.pid;
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      const args = ['/pid', String(pid), '/T', '/F'];
      if (synchronous) {
        spawnSync('taskkill', args, { windowsHide: true, stdio: 'ignore' });
      } else {
        const child = spawn('taskkill', args, { windowsHide: true, stdio: 'ignore' });
        child.on('error', () => {});
      }
    } else if (synchronous) {
      job.proc.kill('SIGKILL');
    } else {
      job.proc.kill('SIGTERM');
      const timer = setTimeout(() => {
        try {
          job.proc.kill('SIGKILL');
        } catch (error) {}
      }, 3000);
      if (timer.unref) timer.unref();
    }
  } catch (error) {}
}

function finishJob(job, exitCode) {
  if (job.closed) return;
  job.closed = true;
  job.exitCode = exitCode == null ? null : Number(exitCode);
  job.endedAt = nowISO();

  unwatchStatusFile(job);
  if (job.updateTimer) {
    clearTimeout(job.updateTimer);
    job.updateTimer = null;
  }

  // pick up the last status.json written by the agent
  try {
    const status = readAgentStatus(job.statusPath);
    if (status) job.agentStatus = status;
  } catch (error) {}

  const blocked = job.agentStatus?.state === 'blocked';
  if (job.cancelled) {
    job.status = 'cancelled';
  } else if (blocked) {
    job.status = 'failed';
  } else {
    job.status = job.exitCode === 0 ? 'done' : 'failed';
  }

  if (job.status === 'done') {
    job.progress = 100;
    job.phase = 'اكتمل';
    job.error = '';
  } else if (job.status === 'cancelled') {
    job.phase = 'أُلغيت';
    job.error = '';
  } else {
    job.phase = job.phase === 'اكتمل' ? 'فشل' : (job.phase || 'فشل');
    if (blocked && job.agentStatus?.message) {
      job.error = safeText(job.agentStatus.message, MAX_ERROR);
    } else if (!job.error) {
      const stderrTail = safeText((job.stderrText || '').trim(), 800);
      job.error = stderrTail
        ? stderrTail
        : `انتهت العملية برمز ${job.exitCode == null ? 'غير معروف' : job.exitCode}.`;
    }
  }
  job.error = safeText(job.error, MAX_ERROR);

  try {
    job.logStream.end();
  } catch (error) {}

  const record = {
    jobId: job.jobId,
    taskId: job.taskId,
    model: job.model,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    exitCode: job.exitCode,
    status: job.status,
    usage: { ...job.usage },
    steps: job.steps,
    progress: Math.round(clamp(job.progress, 0, 100)),
    error: job.error,
    sessionID: job.sessionID || '',
    phase: job.phase
  };
  writeJson(path.join(job.taskFolder, OPENCODE_DIR, `run-${job.jobId}.json`), record);

  send('mmo:automation:update', snapshot(job));

  send('mmo:automation:done', {
    jobId: job.jobId,
    taskId: job.taskId,
    status: job.status,
    exitCode: job.exitCode,
    usage: { ...job.usage },
    error: job.error,
    endedAt: job.endedAt
  });

  try {
    job.cleanupTimer = setTimeout(() => {
      jobs.delete(job.jobId);
    }, FINISHED_TTL);
    if (job.cleanupTimer.unref) job.cleanupTimer.unref();
  } catch (error) {}
}

// ---------------------------------------------------------------- start

function resolveTaskFolder(repoPath, taskFolder) {
  const repo = path.resolve(String(repoPath || ''));
  const raw = String(taskFolder || '').trim();
  if (!raw) throw new Error('مسار مجلد المهمة مطلوب.');
  const absolute = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(repo, raw);
  if (!isInside(repo, absolute)) throw new Error('مجلد المهمة يجب أن يكون داخل المستودع.');
  return { repo, absolute };
}

function buildFullPrompt(prompt, notes) {
  const parts = [];
  const body = String(prompt || '').trim();
  if (body) parts.push(body);
  const noteText = String(notes || '').trim();
  if (noteText) parts.push(`## ملاحظات المستخدم\n\n${noteText}`);
  parts.push(CONTRACT_MD.trim());
  return parts.join('\n\n');
}

async function start(payload = {}) {
  const jobId = safeText(payload.jobId, 120).trim();
  if (!JOB_ID_RE.test(jobId)) return { ok: false, message: 'معرّف المهمة غير صالح.', code: 'bad-job-id' };
  if (jobs.has(jobId)) return { ok: false, message: 'هذه الأتمتة قيد التشغيل بالفعل.', code: 'duplicate-job' };

  const taskId = safeText(payload.taskId, 120).trim();
  if (!taskId) return { ok: false, message: 'معرّف المهمة مطلوب.', code: 'bad-task-id' };

  const repoPath = safeText(payload.repoPath, 1000).trim();
  if (!repoPath || !path.isAbsolute(repoPath)) {
    return { ok: false, message: 'مسار المستودع يجب أن يكون مطلقًا.', code: 'bad-repo' };
  }
  if (!existsDir(repoPath)) return { ok: false, message: 'مجلد المستودع غير موجود.', code: 'repo-missing' };

  let resolved;
  try {
    resolved = resolveTaskFolder(repoPath, payload.taskFolder);
  } catch (error) {
    return { ok: false, message: error.message || 'مسار مجلد المهمة غير صالح.', code: 'bad-task-folder' };
  }
  const taskFolder = resolved.absolute;
  if (!existsDir(taskFolder)) {
    return { ok: false, message: 'مجلد المهمة غير موجود. أعد مزامنة المستودع ثم حاول مرة أخرى.', code: 'task-folder-missing' };
  }

  const model = safeText(payload.model, 160).trim();
  if (!MODEL_RE.test(model)) {
    return { ok: false, message: 'اسم الموديل غير صالح. اختر موديلًا من القائمة.', code: 'bad-model' };
  }

  const prompt = safeText(payload.prompt, 200000);
  if (!prompt.trim()) return { ok: false, message: 'نص البرومت فارغ.', code: 'empty-prompt' };

  const notes = safeText(payload.notes, 20000);
  const taskTitle = safeText(payload.taskTitle, 160).trim() || taskId;
  const fullPrompt = buildFullPrompt(prompt, notes);

  try {
    fs.mkdirSync(path.join(taskFolder, OUTPUT_DIR), { recursive: true });
    fs.mkdirSync(path.join(taskFolder, OPENCODE_DIR, LOG_DIR), { recursive: true });
  } catch (error) {
    return { ok: false, message: 'تعذر تجهيز مجلدات المهمة.', code: 'mkdir-failed' };
  }

  try {
    fs.writeFileSync(path.join(taskFolder, OPENCODE_DIR, AGENTS_FILE), CONTRACT_MD, 'utf8');
  } catch (error) {}

  const statusPath = path.join(taskFolder, OPENCODE_DIR, STATUS_FILE);
  writeJson(statusPath, {
    state: 'working',
    phase: 'بدء التشغيل',
    percent: 0,
    etaSeconds: 0,
    message: '',
    outputs: [],
    updatedAt: nowISO()
  });

  const logPath = path.join(taskFolder, OPENCODE_DIR, LOG_DIR, `run-${jobId}.jsonl`);
  safeUnlink(logPath);

  let logStream;
  try {
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.on('error', () => {});
  } catch (error) {
    return { ok: false, message: 'تعذر إنشاء ملف السجل.', code: 'log-failed' };
  }

  const commandInfo = resolveCommand(payload.opencodePath);
  if (!commandInfo.command) {
    try {
      logStream.end();
    } catch (error) {}
    safeUnlink(logPath);
    return {
      ok: false,
      message: 'لم يُعثر على opencode. ثبّت الحزمة أو حدّد مسارها في الإعدادات.',
      code: 'opencode-missing'
    };
  }

  // Windows caps the command line at 32767 chars: send very long prompts via stdin,
  // otherwise keep the message as a real argument (contract requirement).
  const useStdin = fullPrompt.length > MAX_ARG_PROMPT;
  const args = ['run', '--format', 'json', '--auto', '--model', model, '--title', taskTitle];
  if (!useStdin) args.push(fullPrompt);

  const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  const stdio = useStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'];

  let proc;
  let launchCommand = '';
  try {
    if (commandInfo.shell && process.platform === 'win32') {
      launchCommand = useStdin
        ? `${buildShellCommand(commandInfo.command, args)} <stdin>`
        : buildShellStartCommand(commandInfo.command, args);
      proc = spawn(launchCommand, { shell: true, windowsHide: true, cwd: taskFolder, env, stdio });
    } else {
      const display = args.slice(0, useStdin ? args.length : args.length - 1);
      launchCommand = [
        commandInfo.command,
        ...display,
        useStdin ? '<stdin>' : '<fullPrompt>'
      ].map((item) => (/\s/.test(item) ? quoteShellArg(item) : item)).join(' ');
      proc = spawn(commandInfo.command, args, {
        shell: Boolean(commandInfo.shell),
        windowsHide: true,
        cwd: taskFolder,
        env,
        stdio
      });
    }
  } catch (error) {
    try {
      logStream.end();
    } catch (logError) {}
    return { ok: false, message: `تعذر تشغيل opencode: ${error?.message || 'خطأ غير معروف'}`, code: 'spawn-failed' };
  }

  if (useStdin && proc.stdin) {
    try {
      proc.stdin.on('error', () => {});
      proc.stdin.write(fullPrompt);
      proc.stdin.end();
    } catch (error) {}
  }

  const job = {
    proc,
    jobId,
    taskId,
    model,
    taskFolder,
    logPath,
    runPath: path.join(taskFolder, OPENCODE_DIR, `run-${jobId}.json`),
    statusPath,
    logStream,
    usage: emptyUsage(),
    steps: 0,
    progress: 0,
    phase: 'بدء التشغيل',
    etaSeconds: 0,
    sessionID: '',
    startedAt: nowISO(),
    endedAt: null,
    exitCode: null,
    status: 'running',
    error: '',
    lastMessage: '',
    stderrText: '',
    agentStatus: null,
    cancelled: false,
    closed: false,
    toolIds: new Set(),
    stdoutBuffer: '',
    stderrBuffer: '',
    lastUpdateAt: 0,
    updateTimer: null,
    cleanupTimer: null,
    statusListener: null,
    command: launchCommand,
    stdinUsed: useStdin
  };
  jobs.set(jobId, job);

  proc.stdout?.on('data', (chunk) => {
    try {
      job.stdoutBuffer += chunk.toString();
      if (job.stdoutBuffer.length > 4 * 1024 * 1024) {
        job.stdoutBuffer = job.stdoutBuffer.slice(-2 * 1024 * 1024);
      }
      let index = job.stdoutBuffer.indexOf('\n');
      while (index !== -1) {
        const line = job.stdoutBuffer.slice(0, index);
        job.stdoutBuffer = job.stdoutBuffer.slice(index + 1);
        handleStdoutLine(job, line);
        index = job.stdoutBuffer.indexOf('\n');
      }
    } catch (error) {}
  });

  proc.stderr?.on('data', (chunk) => {
    try {
      job.stderrBuffer += chunk.toString();
      let index = job.stderrBuffer.indexOf('\n');
      while (index !== -1) {
        const line = job.stderrBuffer.slice(0, index).replace(/\r$/, '');
        job.stderrBuffer = job.stderrBuffer.slice(index + 1);
        if (line.trim()) {
          try {
            job.logStream.write(`[stderr] ${line}\n`);
          } catch (error) {}
          job.stderrText = `${job.stderrText}\n${line}`.slice(-MAX_STDERR);
        }
        index = job.stderrBuffer.indexOf('\n');
      }
      if (job.stderrBuffer.length > 64 * 1024) {
        job.stderrText = `${job.stderrText}\n${job.stderrBuffer}`.slice(-MAX_STDERR);
        job.stderrBuffer = '';
      }
    } catch (error) {}
  });

  proc.on('error', (error) => {
    job.error = safeText(`تعذر تشغيل opencode: ${error?.message || 'خطأ غير معروف'}`, MAX_ERROR);
    finishJob(job, -1);
  });

  proc.on('close', (code) => {
    try {
      if (job.stdoutBuffer.trim()) {
        handleStdoutLine(job, job.stdoutBuffer);
        job.stdoutBuffer = '';
      }
      if (job.stderrBuffer.trim()) {
        const line = job.stderrBuffer.replace(/\r$/, '');
        try {
          job.logStream.write(`[stderr] ${line}\n`);
        } catch (error) {}
        job.stderrText = `${job.stderrText}\n${line}`.slice(-MAX_STDERR);
        job.stderrBuffer = '';
      }
    } catch (error) {}
    finishJob(job, code);
  });

  watchStatusFile(job);
  queueUpdate(job, true);

  return {
    ok: true,
    data: {
      jobId,
      pid: proc.pid || null,
      taskFolder,
      logPath,
      command: launchCommand,
      model
    }
  };
}

// ---------------------------------------------------------------- cancel / jobs

async function cancel(payload = {}) {
  const jobId = safeText(payload.jobId, 120).trim();
  if (!jobId) return { ok: false, message: 'معرّف المهمة مطلوب.', code: 'bad-job-id' };
  const job = jobs.get(jobId);
  if (!job || job.closed) return { ok: true, data: { cancelled: false } };
  job.cancelled = true;
  job.phase = 'جارٍ الإلغاء';
  killTree(job, false);
  queueUpdate(job, true);
  return { ok: true, data: { cancelled: true } };
}

async function jobsList() {
  const live = [];
  for (const job of jobs.values()) {
    if (job.closed) continue;
    live.push(snapshot(job));
  }
  return { ok: true, data: { jobs: live } };
}

// ---------------------------------------------------------------- status / log

function resolveFolderFromPayload(payload = {}) {
  const repoPath = safeText(payload.repoPath, 1000).trim();
  const taskFolder = safeText(payload.taskFolder, 1000).trim();
  if (!taskFolder) throw new Error('مسار مجلد المهمة مطلوب.');
  if (path.isAbsolute(taskFolder)) {
    const absolute = path.resolve(taskFolder);
    if (!existsDir(absolute)) throw new Error('مجلد المهمة غير موجود.');
    if (repoPath && path.isAbsolute(repoPath)) {
      if (!isInside(repoPath, absolute)) throw new Error('المسار يجب أن يكون داخل المستودع.');
    } else if (!existsDir(path.join(absolute, OPENCODE_DIR))) {
      // بلا مستودع مرجعي نقبل فقط مجلدات المهام (التي تحتوي opencode/)
      throw new Error('المسار لا يبدو مجلد مهمة صالحًا.');
    }
    return absolute;
  }
  if (!repoPath || !path.isAbsolute(repoPath)) throw new Error('مسار المستودع مطلوب للمسارات النسبية.');
  return resolveTaskFolder(repoPath, taskFolder).absolute;
}

function newestRunFile(taskFolder) {
  const dir = path.join(taskFolder, OPENCODE_DIR);
  try {
    const files = fs.readdirSync(dir)
      .filter((name) => /^run-[A-Za-z0-9_-]+\.json$/.test(name))
      .map((name) => {
        const full = path.join(dir, name);
        let time = 0;
        try {
          time = fs.statSync(full).mtimeMs;
        } catch (error) {}
        return { full, time };
      })
      .sort((a, b) => b.time - a.time);
    if (!files.length) return null;
    const parsed = readJson(files[0].full);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

async function status(payload = {}) {
  let folder;
  try {
    folder = resolveFolderFromPayload(payload);
  } catch (error) {
    return { ok: false, message: error.message || 'مسار غير صالح.', code: 'bad-folder' };
  }
  if (!existsDir(folder)) return { ok: false, message: 'مجلد المهمة غير موجود.', code: 'folder-missing' };

  const agentStatus = readAgentStatus(path.join(folder, OPENCODE_DIR, STATUS_FILE));
  const run = newestRunFile(folder);
  return { ok: true, data: { agentStatus, status: agentStatus, run } };
}

function readTail(filePath, tail) {
  const count = Math.max(1, Math.min(5000, Number(tail) || 200));
  let fd = null;
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - READ_TAIL_BYTES);
    const length = stat.size - start;
    if (length <= 0) return '';
    const buffer = Buffer.alloc(length);
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, length, start);
    const text = buffer.toString('utf8');
    const lines = text.split(/\r?\n/);
    if (start > 0) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines.slice(-count).join('\n');
  } catch (error) {
    return '';
  } finally {
    if (fd != null) {
      try {
        fs.closeSync(fd);
      } catch (error) {}
    }
  }
}

async function log(payload = {}) {
  const jobId = safeText(payload.jobId, 120).trim();
  if (!JOB_ID_RE.test(jobId)) return { ok: false, message: 'معرّف المهمة غير صالح.', code: 'bad-job-id' };
  const tail = Math.max(1, Math.min(5000, Number(payload.tail) || 200));

  let logPath = '';
  const job = jobs.get(jobId);
  if (job) logPath = job.logPath;

  if (!logPath) {
    try {
      const folder = resolveFolderFromPayload(payload);
      logPath = path.join(folder, OPENCODE_DIR, LOG_DIR, `run-${jobId}.jsonl`);
    } catch (error) {
      return { ok: false, message: error.message || 'مسار السجل غير معروف.', code: 'log-path' };
    }
  }

  if (!existsFile(logPath)) return { ok: true, data: { text: '', path: logPath } };
  return { ok: true, data: { text: readTail(logPath, tail), path: logPath } };
}

// ---------------------------------------------------------------- register / shutdown

function register(ipcMain, guard, options = {}) {
  if (options && typeof options.getWindow === 'function') getWindowRef = options.getWindow;
  const wrap = typeof guard === 'function'
    ? guard
    : (handler) => async (event, payload) => handler(payload || {});

  ipcMain.handle('opencode:health', wrap(health));
  ipcMain.handle('opencode:models', wrap(models));
  ipcMain.handle('opencode:start', wrap(start));
  ipcMain.handle('opencode:cancel', wrap(cancel));
  ipcMain.handle('opencode:jobs', wrap(jobsList));
  ipcMain.handle('opencode:status', wrap(status));
  ipcMain.handle('opencode:log', wrap(log));
}

function shutdown() {
  for (const job of jobs.values()) {
    try {
      job.cancelled = true;
      if (job.updateTimer) clearTimeout(job.updateTimer);
      if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
      unwatchStatusFile(job);
      killTree(job, true);
      job.logStream.end();
    } catch (error) {}
  }
  jobs.clear();
}

module.exports = {
  register,
  shutdown,
  resolveCommand,
  health,
  models,
  start,
  cancel,
  jobs: jobsList,
  status,
  log,
  CONTRACT_MD
};
