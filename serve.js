// Minimal static file server for local testing.
//   node serve.js [port]
// Not part of the game; the game itself runs from index.html with no server.
var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var PORT = parseInt(process.argv[2], 10) || 8144;

var TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.md': 'text/plain; charset=utf-8',
  '.json': 'application/json'
};

http.createServer(function (req, res) {
  var url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  var file = path.join(ROOT, path.normalize(url).replace(/^(\.\.[\/\\])+/, ''));
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end('forbidden'); return; }

  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 ' + url);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(PORT, function () {
  console.log('Serving ' + ROOT + ' at http://localhost:' + PORT + '/');
});
