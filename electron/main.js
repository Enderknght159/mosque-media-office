'use strict';

const { app, BrowserWindow, Menu, protocol, net, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const APP_ROOT = path.join(__dirname, '..');
const APP_SCHEME = 'app';
const APP_HOST = 'mosque-media-office';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const START_URL = `${APP_ORIGIN}/index.html`;
const ALLOWED_TOP = new Set(['index.html', 'css', 'js', 'vendor', 'assets']);
const DEV = !app.isPackaged;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

if (process.env.MMO_USER_DATA) {
  try {
    app.setPath('userData', path.resolve(process.env.MMO_USER_DATA));
  } catch (error) {}
}

let mainWindow = null;
const repo = require('./repo');
const opencode = require('./opencode');

function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (!raw || typeof raw !== 'object') return {};
    const width = Math.max(900, Number(raw.width) || 1440);
    const height = Math.max(600, Number(raw.height) || 900);
    return {
      width,
      height,
      x: Number.isFinite(raw.x) ? raw.x : undefined,
      y: Number.isFinite(raw.y) ? raw.y : undefined,
      maximized: Boolean(raw.maximized)
    };
  } catch (error) {
    return {};
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({
      ...bounds,
      maximized: mainWindow.isMaximized()
    }), 'utf8');
  } catch (error) {}
}

function resolveAsset(url) {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch (error) {
    return null;
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const filePath = path.resolve(APP_ROOT, `.${pathname}`);
  const relative = path.relative(APP_ROOT, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const segments = relative.split(path.sep).filter(Boolean);
  const top = segments[0];
  if (!top) return null;
  if (segments.length === 1 && top !== 'index.html') return null;
  if (segments.length > 1 && !ALLOWED_TOP.has(top)) return null;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  return filePath;
}

function registerProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveAsset(request.url);
    if (!filePath) {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    const response = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self' data: blob:"
    ].join('; '));
    return new Response(response.body, { status: 200, headers });
  });
}

function buildMenu() {
  const template = [
    {
      label: 'ملف',
      submenu: [
        { role: 'reload', label: 'إعادة تحميل' },
        { role: 'forceReload', label: 'إعادة تحميل قسرية' },
        { type: 'separator' },
        { role: 'quit', label: 'خروج' }
      ]
    },
    {
      label: 'عرض',
      submenu: [
        { role: 'resetZoom', label: 'الحجم الطبيعي' },
        { role: 'zoomIn', label: 'تكبير' },
        { role: 'zoomOut', label: 'تصغير' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'ملء الشاشة' },
        ...(DEV ? [{ type: 'separator' }, { role: 'toggleDevTools', label: 'أدوات المطور' }] : [])
      ]
    },
    {
      label: 'مساعدة',
      submenu: [
        {
          label: 'مجلد بيانات التطبيق',
          click: () => shell.openPath(app.getPath('userData')).catch(() => {})
        },
        {
          label: 'عن البرنامج',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'المكتب الإعلامي',
              message: 'المكتب الإعلامي — النسخة 2',
              detail: `الإصدار ${app.getVersion()}\nElectron ${process.versions.electron}\nNode ${process.versions.node}`,
              buttons: ['حسنًا']
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const state = readWindowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#f5f5f7',
    title: 'المكتب الإعلامي',
    autoHideMenuBar: false,
    icon: path.join(APP_ROOT, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: DEV
    }
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', saveWindowState);
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    }
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer gone:', details);
  });

  mainWindow.loadURL(START_URL);
}

function getWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function registerIpc() {
  const { ipcMain } = require('electron');
  const guard = (fn) => async (event, payload) => {
    try {
      const result = await fn(payload || {});
      return result === undefined ? { ok: true } : result;
    } catch (error) {
      return { ok: false, message: error?.message || 'حدث خطأ غير متوقع.', code: error?.code || 'unknown' };
    }
  };

  ipcMain.handle('mmo:info', guard(async () => ({
    ok: true,
    data: {
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      platform: process.platform,
      userData: app.getPath('userData'),
      isPackaged: app.isPackaged
    }
  })));

  ipcMain.handle('mmo:open-external', guard(async ({ url }) => {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('رابط غير مسموح');
    await shell.openExternal(url);
    return { ok: true };
  }));

  repo.register(ipcMain, guard);
  opencode.register(ipcMain, guard, { getWindow });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerProtocol();
    buildMenu();
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    saveWindowState();
    opencode.shutdown();
  });
}
