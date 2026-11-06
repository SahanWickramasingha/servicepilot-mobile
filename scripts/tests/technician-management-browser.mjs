// Real Edge/Chromium DOM checks with local synthetic fixtures; no production I/O.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { startTechnicianPreview } from '../lib/technician-management-preview.mjs';
const delay = ms => new Promise(r => setTimeout(r, ms));
const artifacts = resolve('.expo/technician-management-ui');
await mkdir(artifacts, { recursive: true });
const browserPath = process.env.SERVICEPILOT_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
await access(browserPath);
const listener = createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
const port = listener.address().port; await new Promise(r => listener.close(r));
const { server, origin } = await startTechnicianPreview();
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--in-process-gpu', '--disable-software-rasterizer', '--no-first-run', '--disable-background-networking', '--disable-extensions',
  `--remote-debugging-port=${port}`, `--user-data-dir=${resolve(artifacts, 'browser-profile-' + process.pid)}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
browser.stderr.on('data', value => { const line = String(value); if (/DevTools|FATAL/.test(line)) console.log(line.trim().slice(0, 500)); });
console.log(`Local UI preview ${origin}; browser PID ${browser.pid}, debugging port ${port}`);
let ws;
try {
  let target;
  for (let i = 0; i < 150; i++) {
    if (browser.exitCode !== null) throw Error('Browser exited during startup: ' + browser.exitCode);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(500) })).json()).find(t => t.type === 'page'); if (target) break; } catch { /* browser startup */ }
    await delay(100);
  }
  assert.ok(target, 'headless browser must start');
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, reject) => { ws.onopen = r; ws.onerror = reject; });
  let serial = 0; const pending = new Map();
  ws.onmessage = event => { const result = JSON.parse(event.data); if (result.id) { const done = pending.get(result.id); pending.delete(result.id); result.error ? done.reject(Error(result.error.message)) : done.resolve(result.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); } throw Error('Timed out: ' + expression); };
  const click = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing button');e.focus();e.click();})()`);
  const filter = text => evaluate(`Array.from(document.querySelectorAll('.tm-filters button')).find(b=>b.textContent===${JSON.stringify(text)}).click()`);
  const screenshot = async name => { const data = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(resolve(artifacts, name + '.png'), Buffer.from(data.data, 'base64')); };
  await send('Page.enable');
  for (const role of ['admin', 'dispatcher']) {
    for (const route of ['applications', 'technicians']) {
      for (const width of [1440, 390]) {
        console.log(`Checking ${role}/${route} at ${width}px`);
        await send('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 1000, deviceScaleFactor: 1, mobile: false });
        await send('Page.navigate', { url: `${origin}/${role}/${route}` });
        await until(`document.querySelector('[aria-label="Approve Amal Perera"]')!==null`);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${role}/${route} ${width}: no page overflow`);
        assert.equal(await evaluate(`document.querySelector('[aria-label="Approve Incomplete applicant"]')===null && document.querySelector('[aria-label="Approve Disabled applicant"]')===null`), true);
        if (role === 'dispatcher') assert.equal(await evaluate(`document.querySelector('.tm-account-actions')===null`), true, 'Dispatcher has no account management actions');
        else if (route === 'technicians') assert.equal(await evaluate(`!!document.querySelector('.tm-account-actions')`), true);
        await screenshot(`${role}-${route}-${width}`);
        await click('[aria-label="View application for Amal Perera"]');
        await until('!!document.querySelector("dialog[open]")');
        const details = await evaluate(`Object.fromEntries(Array.from(document.querySelectorAll('dialog .tm-details > div')).map(d=>[d.querySelector('dt').textContent,d.querySelector('dd').textContent]))`);
        assert.equal(details.Experience, '7 years in residential electrical maintenance');
        assert.equal(details.Qualifications, 'BSE degree');
        assert.equal(details['Declared service area'], 'Peradeniya, Kandy');
        assert.equal(await evaluate(`document.querySelector('dialog').contains(document.activeElement)`), true);
        for (let tab = 0; tab < 10; tab++) await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        for (let tab = 0; tab < 5; tab++) await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
        assert.equal(await evaluate(`document.querySelector('dialog').contains(document.activeElement)`), true, 'modal traps keyboard focus');
        if (width === 390) await screenshot(`${role}-${route}-dialog-${width}`);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await until('!document.querySelector("dialog[open]")');
        assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`), 'View application for Amal Perera', 'focus returns to opener');
      }
    }
    // Both roles use the same native confirmation/rejection flow and real hook.
    await send('Page.navigate', { url: `${origin}/${role}/applications` });
    await until(`!!document.querySelector('[aria-label="Approve Amal Perera"]')`);
    await click('[aria-label="Approve Amal Perera"]');
    assert.equal(await evaluate('window.__technicianUi.submissions.length'), 0, 'approval requires separate confirmation');
    await until(`Array.from(document.querySelectorAll('dialog button')).some(b=>b.textContent==='Confirm approval')`);
    await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Confirm approval');b.click();b.click();})()`);
    await until('!document.querySelector("dialog[open]")');
    assert.equal(await evaluate('window.__technicianUi.submissions.length'), 1, 'duplicate approval is blocked');
    assert.equal(await evaluate('window.__technicianUi.rows[0].availability'), 'offline');
    await filter('Approved'); await until(`!!document.querySelector('[aria-label="View application for Amal Perera"]')`);
    await click('.tm-heading a');
    await until(`location.pathname.endsWith('/technicians') && !!document.querySelector('[aria-label="View application for Amal Perera"]')`);
    assert.equal(await evaluate(`document.querySelector('[aria-label="View application for Amal Perera"]').closest('tr').cells[2].textContent`), 'Approved', 'technician list reflects saved application decision');
    assert.equal(await evaluate(`document.querySelector('[aria-label="View application for Amal Perera"]').closest('tr').cells[4].textContent.includes('Test Reviewer')`), true);
    await click('.tm-heading a');
    await until(`location.pathname.endsWith('/applications') && !!document.querySelector('[aria-label="Reject Kasun Silva"]')`);
    await click('[aria-label="Reject Kasun Silva"]');
    await until(`!!document.querySelector('#technician-rejection-reason')`);
    assert.equal(await evaluate(`document.querySelector('dialog button[type="submit"]').disabled`), true, 'reason required');
    await evaluate(`(()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'More certification evidence required.');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await until(`!document.querySelector('dialog button[type="submit"]').disabled`);
    await click('dialog button[type="submit"]'); await until('!document.querySelector("dialog[open]")');
    assert.equal(await evaluate('window.__technicianUi.rows[1].rejectionReason'), 'More certification evidence required.');
    await until(`!!document.querySelector('[aria-label="Approve Tharindu Fernando"]')`);
    await click('[aria-label="Approve Tharindu Fernando"]');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('dialog dt')).find(d=>d.textContent==='Experience').nextElementSibling.textContent`), 'BSE degree', 'never reclassify mis-entered stored data');
    await evaluate('window.__technicianUi.conflict=true');
    await click('dialog button[type="submit"]');
    await until(`document.querySelector('dialog [role="alert"]')?.textContent.includes('already reviewed')`);
    assert.equal(await evaluate(`document.querySelector('dialog').textContent.includes('Reviewer unavailable')`), true);
    assert.equal(await evaluate(`document.querySelector('dialog button[type="submit"]')===null`), true, 'conflict refresh removes stale approval actions');
    await click('dialog [aria-label="Close dialog"]');
    await evaluate(`window.__technicianUi.setState('error')`); await until(`!!document.querySelector('.tm-state[role="alert"]')`);
    await evaluate(`window.__technicianUi.state='loading'`); await click('.tm-state button');
    await until(`document.querySelector('.tm-state[role="status"]')?.textContent.includes('Loading technicians')`);
    await evaluate(`window.__technicianUi.setState('ready')`); await until(`!!document.querySelector('.tm-table')`);
    await click('.tm-pagination nav button:last-child'); await until(`document.querySelector('.tm-pagination').textContent.includes('Page 2') && !!document.querySelector('.tm-table')`);
    await click('.tm-pagination nav button:first-child'); await until(`document.querySelector('.tm-pagination').textContent.includes('Page 1') && !!document.querySelector('.tm-table')`);
    assert.equal(await evaluate('window.__technicianUi.listeners.size'), 1, 'pagination and Retry release old listeners');
    console.log(`PASS ${role}: desktop/narrow, four route layouts, field mapping, focus, eligibility, approval/rejection, duplicate guard, conflict, Retry and paging`);
  }
  console.log('PASS browser UI checks; screenshots: ' + artifacts);
} finally {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: 'Browser.close' }));
  ws?.close(); browser.kill(); await server.close();
}
