// Capsid Wasteland · private squad server (no dependencies: plain Node.js 18+)
//
// It speaks the same signalling protocol as the public PeerJS server, so the game connects to it exactly the same way,
// and it adds one thing the public server can't do: when two players can't reach each other directly (strict school,
// work or mobile networks), it relays their game traffic itself.
//
//   node relay_server.js                 → listens on port 8787 (or $PORT)
//   KEY=mysecret node relay_server.js    → players must enter the same key in the game's connection settings
//   It also serves the newest capsid_wasteland_vNN.html it finds at http(s)://<server>/ : players just open that address,
//   and the page uses this server automatically. Invite links look like https://<server>/?join=ABC123
//
// Online (Render, Railway, Koyeb, Fly.io, a VPS…): see README.md. Settings, all optional, as environment variables:
//   PORT          port to listen on (hosts usually set this for you)          default 8787
//   KEY           players who open the game from a file must type it in ⚙   default none
//   MAX_PLAYERS   connected players across all squads                         default 300
//   PER_IP        connections from one address (a house with several PCs)     default 12
//   GAME_FILE     serve this file instead of the newest capsid_wasteland_vNN.html
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const SERVER_VERSION = 21;
const PORT = +process.env.PORT || 8787, KEY = process.env.KEY || 'peerjs';
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 300, PER_IP = +process.env.PER_IP || 12, STARTED = Date.now();
const perIp = new Map();                 // address -> open sockets
// behind a hosting proxy the real address is the first X-Forwarded-For entry
const ipOf = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
// the game page to serve at /: $GAME_FILE, or else the newest capsid_wasteland_vNN.html next to this script, one folder up, or in the current folder
const GAME_FILE = process.env.GAME_FILE || (() => {let best = '', bv = -1;
  for (const d of [__dirname, path.join(__dirname, '..'), process.cwd()]){let names = []; try {names = fs.readdirSync(d);} catch (e) {}
    for (const n of names){const m = /^capsid_wasteland_v(\d+)\.html$/.exec(n); if (m && +m[1] > bv){bv = +m[1]; best = path.join(d, n);}}}
  return best;})();
const MAX_MSG = 1 << 20;                 // 1 MB per message is plenty (snapshots are a few KB)
const clients = new Map();               // id -> socket
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (u.pathname.endsWith('/peerjs/id')){res.end(crypto.randomUUID()); return;}
  if (u.pathname.endsWith('/peerjs/peers')){res.setHeader('Content-Type', 'application/json'); res.end('[]'); return;}
  if (u.pathname === '/health'){res.setHeader('Cache-Control', 'no-store'); res.end('ok ' + clients.size); return;}
  if (u.pathname === '/info'){res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({server: 'capsid-squad', serverVersion: SERVER_VERSION, gameVersion: GAME_FILE ? ((/_(v\d+)\.html$/.exec(GAME_FILE) || [])[1] || null) : null, game: GAME_FILE ? path.basename(GAME_FILE) : null, players: clients.size, maxPlayers: MAX_PLAYERS, keyRequired: KEY !== 'peerjs', upSeconds: Math.round((Date.now() - STARTED) / 1000)})); return;}
  if (u.pathname === '/favicon.ico'){res.statusCode = 204; res.end(); return;}
  if ((u.pathname === '/' || u.pathname === '/play' || u.pathname === '/index.html') && GAME_FILE){
    const f = path.resolve(GAME_FILE); if (fs.existsSync(f)){const st = fs.statSync(f), tag = '"' + st.size.toString(36) + '-' + Math.round(st.mtimeMs).toString(36) + '"';
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('ETag', tag);
      if (req.headers['if-none-match'] === tag){res.statusCode = 304; res.end(); return;}
      res.setHeader('Vary', 'Accept-Encoding');
      // the page is ~5 MB of mostly text: send it gzipped (compressed once, then cached until the file changes)
      if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')){const gz = gzipOf(f, tag);
        if (gz){res.setHeader('Content-Encoding', 'gzip'); res.setHeader('Content-Length', gz.length); res.end(req.method === 'HEAD' ? undefined : gz); return;}}
      res.setHeader('Content-Length', st.size); if (req.method === 'HEAD'){res.end(); return;} fs.createReadStream(f).pipe(res); return;}}
  res.setHeader('Content-Type', 'text/plain'); res.end('Capsid Wasteland squad server is running. ' + clients.size + ' connected.');
});

let GZ = {tag: '', buf: null};
function gzipOf(f, tag){if (GZ.tag !== tag){try {GZ = {tag, buf: zlib.gzipSync(fs.readFileSync(f), {level: 9})}; log('compressed ' + path.basename(f) + ': ' + (fs.statSync(f).size/1e6).toFixed(1) + ' MB -> ' + (GZ.buf.length/1e6).toFixed(1) + ' MB');} catch (e){GZ = {tag: '', buf: null};}} return GZ.buf;}

// ------------------------------------------------------------------ a tiny RFC 6455 WebSocket implementation
server.on('upgrade', (req, sock) => {
  const u = new URL(req.url, 'http://x'), id = u.searchParams.get('id') || '', key = u.searchParams.get('key') || '';
  const wsKey = req.headers['sec-websocket-key'];
  if (!wsKey || !u.pathname.endsWith('/peerjs')){sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return;}
  const accept = crypto.createHash('sha1').update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const ws = wrap(sock), ip = ipOf(req);
  if (clients.size >= MAX_PLAYERS){ws.send({type: 'ERROR', payload: {msg: 'The squad server is full right now. Try again in a few minutes.'}}); ws.close(); return;}
  if ((perIp.get(ip) || 0) >= PER_IP){ws.send({type: 'ERROR', payload: {msg: 'Too many connections from your network.'}}); ws.close(); return;}
  if (key !== KEY){ws.send({type: 'ERROR', payload: {msg: 'Invalid key'}}); ws.close(); return;}
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)){ws.send({type: 'ERROR', payload: {msg: 'Invalid id'}}); ws.close(); return;}
  if (clients.has(id)){ws.send({type: 'ID-TAKEN', payload: {msg: 'ID is taken'}}); ws.close(); return;}
  clients.set(id, ws); ws.id = id; ws.contacts = new Set(); perIp.set(ip, (perIp.get(ip) || 0) + 1); log('+', id, '(' + clients.size + ')');
  let budget = 0, budgetT = Date.now(), strikes = 0;   // flood guard: about 150 messages a second per player is far above normal play
  ws.send({type: 'OPEN', relay: true});
  ws.onmessage = m => {
    if (!m || typeof m !== 'object') return;
    const now = Date.now(); if (now - budgetT > 1000){budgetT = now; budget = 0;}
    if (++budget > 150){if (budget === 151 && ++strikes > 20){log('flood, closing', id); ws.close();} return;}
    if (m.type === 'HEARTBEAT') return;
    if (!['OFFER', 'ANSWER', 'CANDIDATE', 'LEAVE', 'RELAY'].includes(m.type) || typeof m.dst !== 'string') return;
    const dst = clients.get(m.dst);
    if (!dst){ws.send({type: 'EXPIRE', src: m.dst, dst: id}); return;}
    ws.contacts.add(m.dst); dst.contacts.add(id);
    dst.send({type: m.type, src: id, dst: m.dst, payload: m.payload});};
  ws.onclose = () => {if (clients.get(id) === ws) clients.delete(id); const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
    for (const c of ws.contacts){const o = clients.get(c); if (o) o.send({type: 'LEAVE', src: id, dst: c});} log('-', id, '(' + clients.size + ')');};
});
function wrap(sock){
  const ws = {onmessage: () => {}, onclose: () => {}, closed: false, alive: true};
  let buf = Buffer.alloc(0), frags = [];
  ws.send = obj => {if (ws.closed) return; const data = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
    let head; if (data.length < 126) head = Buffer.from([0x81, data.length]);
    else if (data.length < 65536){head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(data.length, 2);}
    else {head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(data.length), 2);}
    try {sock.write(Buffer.concat([head, data]));} catch (e) {}};
  const ctl = (op, payload = Buffer.alloc(0)) => {try {sock.write(Buffer.concat([Buffer.from([0x80 | op, payload.length]), payload]));} catch (e) {}};
  ws.close = () => {if (ws.closed) return; ctl(0x8); ws.closed = true; setTimeout(() => sock.destroy(), 100); ws.onclose();};
  sock.on('data', chunk => {buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2){
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80; let len = buf[1] & 0x7f, off = 2;
      if (len === 126){if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4;}
      else if (len === 127){if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10;}
      if (len > MAX_MSG){ws.close(); return;}
      const need = off + (masked ? 4 : 0) + len; if (buf.length < need) return;
      let data = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked){const mask = buf.subarray(off, off + 4); data = Buffer.from(data); for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];}
      buf = buf.subarray(need);
      if (op === 0x8){ws.close(); return;}
      if (op === 0x9){ctl(0xA, data); continue;}
      if (op === 0xA){ws.alive = true; continue;}
      if (op === 0x1 || op === 0x2 || op === 0x0){frags.push(data); if (!fin) continue; const txt = Buffer.concat(frags).toString('utf8'); frags = [];
        let m; try {m = JSON.parse(txt);} catch (e){continue;} ws.alive = true; ws.onmessage(m);}}});
  sock.on('close', () => {if (!ws.closed){ws.closed = true; ws.onclose();}});
  sock.on('error', () => {});
  ws.ping = () => ctl(0x9);
  return ws;}
// drop sockets that stopped answering
setInterval(() => {for (const ws of clients.values()){if (!ws.alive){ws.close(); continue;} ws.alive = false; ws.ping();}}, 30000);

server.listen(PORT, () => {
  log('Capsid Wasteland squad server on port ' + PORT + (KEY !== 'peerjs' ? ' (key required)' : ''));
  if (!GAME_FILE){log('No game file found: put capsid_wasteland_vNN.html next to this script (or set GAME_FILE), then restart.'); return;}
  log('Serving ' + path.basename(GAME_FILE) + '. Open the game from one of these addresses (every player uses the same server):');
  log('  this PC:            http://localhost:' + PORT + '/');
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || [])
    if (a.family === 'IPv4' && !a.internal) log('  same Wi-Fi / LAN:   http://' + a.address + ':' + PORT + '/');
  log('Squads opened from these pages use this server automatically. Keep this window open while playing.');});
// hosts stop the old copy on every update: close sockets politely so games notice at once
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {log('shutting down'); for (const ws of clients.values()) ws.close(); server.close(); setTimeout(() => process.exit(0), 300);});
