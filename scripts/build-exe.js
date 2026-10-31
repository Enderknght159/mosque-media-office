const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const distDir = path.join(root, 'dist');
const appName = 'MosqueMediaOffice';
const exePath = path.join(distDir, `${appName}.exe`);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function collectFiles() {
  const files = {};
  const addFile = (relative) => {
    const absolute = path.join(root, relative);
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) return;
    const extension = path.extname(absolute).toLowerCase();
    files[relative.split(path.sep).join('/')] = {
      type: mimeTypes[extension] || 'application/octet-stream',
      data: fs.readFileSync(absolute).toString('base64')
    };
  };
  addFile('index.html');
  for (const directory of ['assets', 'css', 'js', 'vendor']) {
    const walk = (relative) => {
      for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
        const next = path.join(relative, entry.name);
        if (entry.isDirectory()) walk(next);
        else addFile(next);
      }
    };
    walk(directory);
  }
  return files;
}

function embeddedServer(files) {
  return `'use strict';
const http = require('http');
const { exec } = require('child_process');
const files = ${JSON.stringify(files)};
const host = '127.0.0.1';
const port = Number(process.env.MMO_PORT) || 43177;
const url = 'http://' + host + ':' + port + '/';

function openBrowser() {
  if (process.env.MMO_NO_OPEN === '1') return;
  const command = process.platform === 'win32'
    ? 'start "" "' + url + '"'
    : (process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"');
  exec(command, { windowsHide: true }, () => {});
}

const server = http.createServer((request, response) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent((request.url || '/').split('?')[0]);
  } catch (error) {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }
  const key = pathname === '/' ? 'index.html' : pathname.replace(/^\\/+/, '');
  const file = files[key];
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': file.type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  response.end(Buffer.from(file.data, 'base64'));
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log('Already running. Opening ' + url);
    openBrowser();
    setTimeout(() => process.exit(0), 800);
    return;
  }
  console.error('Server error:', error.message);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log('Mosque Media Office: ' + url);
  openBrowser();
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
`;
}

function run(args) {
  execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
}

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

const files = collectFiles();
const serverSource = embeddedServer(files);
fs.writeFileSync(path.join(buildDir, 'embedded-server.cjs'), serverSource, 'utf8');
fs.writeFileSync(path.join(buildDir, 'sea-config.json'), JSON.stringify({
  main: 'build/embedded-server.cjs',
  output: 'build/sea-prep.blob',
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false
}, null, 2), 'utf8');

console.log('Embedding application files...');
run(['--experimental-sea-config', 'build/sea-config.json']);

console.log('Creating Windows executable...');
fs.copyFileSync(process.execPath, exePath);

run([
  path.join(root, 'node_modules', 'postject', 'dist', 'cli.js'),
  exePath,
  'NODE_SEA_BLOB',
  path.join(buildDir, 'sea-prep.blob'),
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
]);

const size = fs.statSync(exePath).size;
console.log(`Done: ${exePath}`);
console.log(`Size: ${(size / (1024 * 1024)).toFixed(1)} MB`);
