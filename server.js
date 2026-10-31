const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const types = {
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

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent((request.url || '/').split('?')[0]);
  } catch (error) {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  const relative = path.relative(root, filePath).split(path.sep).join('/');
  const topLevel = relative.split('/')[0];
  const allowed = relative === 'index.html' || ['css', 'js', 'vendor', 'assets'].includes(topLevel);
  if (!allowed) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    response.end(data);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Mosque Media Office running at http://localhost:${port}`);
});
