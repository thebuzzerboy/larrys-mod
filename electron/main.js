const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const dgram = require('dgram');
const http = require('http');

const BEACON_PORT = 38472;
const PROTOCOL = 'sandbox-protocol-owner-lan-v1';

function discoverOwner(timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let finished = false;
    const found = new Map();
    const finish = () => {
      if (finished) return;
      finished = true;
      try { socket.close(); } catch {}
      resolve(Array.from(found.values()));
    };
    socket.on('error', err => {
      if (!finished) { finished = true; try { socket.close(); } catch {} reject(err); }
    });
    socket.on('message', (message, remote) => {
      try {
        const beacon = JSON.parse(message.toString('utf8'));
        if (beacon.protocol !== PROTOCOL || !Number.isInteger(beacon.port)) return;
        found.set(remote.address, { address: remote.address, port: beacon.port, sessionId: beacon.sessionId });
      } catch {}
    });
    socket.bind(BEACON_PORT, '0.0.0.0', () => {
      socket.setBroadcast(true);
      const probe = Buffer.from(JSON.stringify({ protocol: 'sandbox-protocol-discovery-v1' }));
      socket.send(probe, 0, probe.length, BEACON_PORT, '255.255.255.255', () => {});
      setTimeout(finish, timeoutMs);
    });
  });
}

function postPair(owner, code, request) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({ code, request }));
    const req = http.request({
      host: owner.address, port: owner.port, path: '/pair', method: 'POST',
      timeout: 65000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; if (raw.length > 65536) req.destroy(new Error('Owner response too large.')); });
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch { return reject(new Error('Owner returned invalid JSON.')); }
        if (res.statusCode !== 200) return reject(new Error(data.error || 'Owner rejected activation.'));
        resolve(data);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Timed out waiting for Owner Client approval.')));
    req.on('error', reject);
    req.end(body);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 900, minHeight: 600,
    title: 'Sandbox Protocol', backgroundColor: '#1b1e26',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, '..', 'desktop-assets', 'index.html'));
}
ipcMain.handle('sp:redeem-activation', async (_event, code, request) => {
  if (typeof code !== 'string' || !/^[A-Z0-9 -]{6,16}$/i.test(code)) throw new Error('Enter the short activation code from Owner Client.');
  if (!request || request.protocol !== 'sandbox-protocol-pairing-v1') throw new Error('Device pairing request is invalid.');
  const owners = await discoverOwner();
  if (!owners.length) throw new Error('No Owner Client found. Check that both devices are on the same Wi-Fi network and that local network discovery is allowed.');
  let lastError;
  for (const owner of owners) {
    try { return await postPair(owner, code, request); }
    catch (e) { lastError = e; }
  }
  throw lastError || new Error('Could not contact Owner Client.');
});
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
