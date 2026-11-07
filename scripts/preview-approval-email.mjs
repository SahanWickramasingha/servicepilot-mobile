// Local browser previews only: no provider calls, login, email sends or deployment.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const ts = require('../admin-worker/node_modules/typescript');
const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'functions/src/domain/technicianDecisionEmail.ts');
const source = await readFile(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const domain = { exports: {} };
const domainRequire = createRequire(sourcePath);
new Function('require', 'module', 'exports', compiled)(
  id => id === './trustedRequestError' ? { TrustedRequestError: Error } : domainRequire(id),
  domain, domain.exports,
);
const message = domain.exports.decisionEmailMessage(
  'sender@example.test', 'technician@example.test', 'Alex Perera', 'approved', '',
);
const artifacts = resolve(root, 'docs/email-previews');
await mkdir(artifacts, { recursive: true });
await writeFile(resolve(artifacts, 'technician-approval.html'),
  '<!-- Local design preview generated from decisionEmailMessage; sample name: Alex Perera. -->\n' + message.html + '\n');

const browserPath = process.env.SERVICEPILOT_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
await access(browserPath);
const profile = resolve(root, '.expo/approval-email/chrome-' + process.pid);
await mkdir(profile, { recursive: true });
const server = createServer((request, response) => {
  if (request.url !== '/email') { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(message.html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(browserPath, [
  '--headless=new', '--disable-gpu', '--in-process-gpu', '--disable-software-rasterizer',
  '--no-first-run', '--disable-background-networking', '--disable-extensions',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
browser.stderr.on('data', () => {});
let socket;
try {
  let target;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (browser.exitCode !== null) throw Error('Preview browser exited: ' + browser.exitCode);
    try {
      const port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(row => row.type === 'page');
      if (target) break;
    } catch { /* Wait for the local browser to start. */ }
    await delay(100);
  }
  assert.ok(target, 'preview browser must start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, {
      resolve: result => { clearTimeout(timer); resolve(result); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  // Serve the identical local source bytes for the already-verified public URL.
  // Screenshots need no external requests and retain the real email HTML/src.
  const logo = (await readFile(resolve(root, 'assets/images/servicepilot-logo.png'))).toString('base64');
  socket.onmessage = event => {
    const result = JSON.parse(event.data);
    if (result.id) {
      const callback = pending.get(result.id);
      pending.delete(result.id);
      if (callback) result.error ? callback.reject(Error(result.error.message)) : callback.resolve(result.result);
    } else if (result.method === 'Fetch.requestPaused') {
      send('Fetch.fulfillRequest', {
        requestId: result.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: logo,
      }).catch(error => console.error(error.message));
    }
  };
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://servicepilot-756d9.web.app/assets/images/servicepilot-logo.png' }] });
  for (const [name, width, height] of [['desktop', 960, 1000], ['mobile', 390, 1100], ['narrow-mobile', 320, 1100]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: origin + '/email' });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      ready = await evaluate('!!document.querySelector("img")?.complete && document.querySelector("img").naturalWidth > 0');
      if (ready) break;
      await delay(50);
    }
    assert.ok(ready, name + ': logo decoded');
    const layout = await evaluate(`(() => {
      const image = document.querySelector('img');
      const brand = image.closest('tr').cells[1];
      const a = image.getBoundingClientRect();
      const b = brand.getBoundingClientRect();
      return { width: a.width, height: a.height, gap: b.left - a.right,
        imageCenter: a.top + a.height / 2, textCenter: b.top + b.height / 2,
        overflow: document.documentElement.scrollWidth > innerWidth, brand: brand.textContent };
    })()`);
    assert.equal(layout.width, 40); assert.equal(layout.height, 40); assert.equal(layout.gap, 12);
    assert.equal(layout.imageCenter, layout.textCenter); assert.equal(layout.brand, 'ServicePilot');
    assert.equal(layout.overflow, false, name + ': no horizontal overflow');
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(resolve(artifacts, `technician-approval-${name}.png`), Buffer.from(screenshot.data, 'base64'));
    // Simulate an email client blocking remote images; visible text still labels the header.
    assert.equal(await evaluate(`(() => {
      const image = document.querySelector('img'); image.style.visibility = 'hidden';
      const brand = image.closest('tr').cells[1];
      return brand.textContent === 'ServicePilot' && getComputedStyle(brand).color === 'rgb(255, 255, 255)';
    })()`), true);
    console.log(JSON.stringify({ preview: name, viewport: width, ...layout }));
  }
} finally {
  socket?.close();
  browser.kill();
  await new Promise(resolve => server.close(resolve));
}
