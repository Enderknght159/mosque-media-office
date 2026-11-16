'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const call = (channel, payload) => ipcRenderer.invoke(channel, payload);

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('MMO', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  info: () => call('mmo:info'),
  openExternal: (url) => call('mmo:open-external', { url }),

  repo: {
    pick: () => call('repo:pick'),
    detect: (path) => call('repo:detect', { path }),
    link: (path) => call('repo:link', { path }),
    register: (payload) => call('repo:register', payload),
    sync: (payload) => call('repo:sync', payload),
    open: (payload) => call('repo:open', payload),
    reveal: (payload) => call('repo:reveal', payload),
    readManifest: (repoPath) => call('repo:readManifest', { repoPath }),
    pathFor: (payload) => call('repo:pathFor', payload),
    forget: () => call('repo:forget')
  },

  storage: {
    scan: (payload) => call('storage:scan', payload),
    locate: (payload) => call('storage:locate', payload),
    volume: (payload) => call('storage:volume', payload),
    onProgress: (callback) => subscribe('mmo:storage:progress', callback)
  },

  archive: {
    start: (payload) => call('archive:start', payload),
    cancel: (payload) => call('archive:cancel', payload),
    restore: (payload) => call('archive:restore', payload),
    reconcile: (payload) => call('archive:reconcile', payload),
    purgeExpired: (payload) => call('archive:purgeExpired', payload),
    onProgress: (callback) => subscribe('mmo:archive:progress', callback),
    onDone: (callback) => subscribe('mmo:archive:done', callback)
  },

  trash: {
    move: (payload) => call('trash:move', payload),
    list: (payload) => call('trash:list', payload),
    restore: (payload) => call('trash:restore', payload),
    delete: (payload) => call('trash:delete', payload),
    purge: (payload) => call('trash:purge', payload),
    onChange: (callback) => subscribe('mmo:trash:changed', callback)
  },

  store: {
    readMirror: () => call('store:readMirror'),
    writeMirror: (snapshot) => call('store:writeMirror', { snapshot }),
    backup: (payload) => call('store:backup', payload)
  },

  opencode: {
    health: (payload) => call('opencode:health', payload),
    models: (payload) => call('opencode:models', payload),
    start: (payload) => call('opencode:start', payload),
    cancel: (payload) => call('opencode:cancel', payload),
    jobs: () => call('opencode:jobs'),
    status: (payload) => call('opencode:status', payload),
    log: (payload) => call('opencode:log', payload),
    refresh: (payload) => call('opencode:refresh', payload),
    ping: (payload) => call('opencode:ping', payload),
    onEvent: (callback) => subscribe('mmo:automation:event', callback),
    onUpdate: (callback) => subscribe('mmo:automation:update', callback),
    onDone: (callback) => subscribe('mmo:automation:done', callback),
    onPing: (callback) => subscribe('mmo:automation:ping', callback)
  }
});
