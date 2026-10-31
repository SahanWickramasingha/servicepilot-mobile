// Runs only an unauthenticated empty request inside each connected Expo runtime.
// Does not inspect Auth state, read tokens, or submit real booking IDs.
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { validateBookingHttps } from './lib/booking-real-config.mjs';

async function probe(target, base) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let sequence = 0;
  const key = `__bookingProbe_${randomUUID().replaceAll('-', '')}`;
  socket.addEventListener('message', event => {
    const reply = JSON.parse(event.data);
    pending.get(reply.id)?.(reply);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(Error('debugger-connectivity')), { once: true });
  });
  const evaluate = expression => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('runtime-timeout')); }, 10000);
    pending.set(id, reply => {
      clearTimeout(timer); pending.delete(id);
      if (reply.error || reply.result?.exceptionDetails) reject(Error('runtime-evaluation'));
      else resolve(reply.result?.result?.value);
    });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  try {
    await Promise.race([opened, delay(10000).then(() => { throw Error('debugger-timeout'); })]);
    // Poll a temporary result rather than relying on Hermes awaitPromise support.
    await evaluate(`globalThis[${JSON.stringify(key)}]=null; fetch(${JSON.stringify(base + '/v1/bookings/schedule')}, {
      method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
    }).then(r=>r.json().then(b=>{globalThis[${JSON.stringify(key)}]={status:r.status,code:b.code};}))
      .catch(()=>{globalThis[${JSON.stringify(key)}]={failed:true};}); true;`);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const result = await evaluate(`globalThis[${JSON.stringify(key)}]`);
      if (result) {
        if (result.status !== 401 || result.code !== 'unauthenticated') throw Error('https-boundary');
        return;
      }
      await delay(250);
    }
    throw Error('https-timeout');
  } finally {
    if (socket.readyState === WebSocket.OPEN) {
      await evaluate(`delete globalThis[${JSON.stringify(key)}]`).catch(() => {});
    }
    socket.close();
  }
}

try {
  const base = validateBookingHttps(process.env.EXPO_PUBLIC_BOOKING_API_URL);
  const response = await fetch('http://127.0.0.1:8081/json/list', { signal: AbortSignal.timeout(5000) });
  const targets = (await response.json()).filter(target => target.appId === 'host.exp.exponent');
  if (targets.length !== 2) throw Error('expected-two-expo-runtimes');
  for (let index = 0; index < targets.length; index++) {
    await probe(targets[index], base);
    console.log(`Android Expo runtime ${index + 1}: HTTPS schedule -> 401 unauthenticated.`);
  }
  console.log('Both Android network stacks reached the HTTPS API. No real booking submitted.');
} catch (error) {
  const code = ['debugger-connectivity', 'runtime-timeout', 'runtime-evaluation', 'debugger-timeout',
    'https-boundary', 'https-timeout', 'expected-two-expo-runtimes'].includes(error.message) ? error.message : 'connection';
  console.error(`Android probe failed (${code}). Ensure both Expo apps have loaded through Metro 8081 and the HTTPS server/tunnel is running. No authenticated action submitted.`);
  process.exitCode = 1;
}
