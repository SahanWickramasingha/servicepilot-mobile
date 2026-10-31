// Read only the development diagnostic ring; never inspect Auth or application payloads.
import { appendFileSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const seconds = Number(process.argv[2] ?? 120);
if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600) throw Error('Use 1-600 observation seconds.');
const directory = '.firebase/review-config/real-booking';
mkdirSync(directory, { recursive: true });
const seen = new Set();
const targets = (await (await fetch('http://127.0.0.1:8081/json/list')).json())
  .filter(target => target.appId === 'host.exp.exponent' && target.reactNative);
if (!targets.length) throw Error('No loaded Expo runtimes found on Metro 8081.');
const connections = [];
try {
  for (let index = 0; index < targets.length; index++) {
    const socket = new WebSocket(targets[index].webSocketDebuggerUrl);
    const pending = new Map(); let sequence = 0;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data); pending.get(message.id)?.(message);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('debugger-timeout')), 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('debugger-unreachable')); }, { once: true });
    });
    connections.push({ socket, async read() {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(Error('runtime-timeout')); }, 5000);
        pending.set(id, reply => {
          clearTimeout(timer); pending.delete(id);
          if (reply.error || reply.result?.exceptionDetails) reject(Error('runtime-evaluation'));
          else resolve(reply.result.result.value);
        });
        socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { returnByValue: true,
          expression: 'globalThis.__servicepilotBookingDiagnostics ? JSON.stringify(globalThis.__servicepilotBookingDiagnostics) : null' } }));
      });
    } });
  }
  const deadline = Date.now() + seconds * 1000;
  console.log(`Observing ${connections.length} Android runtimes for ${seconds}s; safe events saved to ${directory}/client-trace.jsonl`);
  do {
    for (let index = 0; index < connections.length; index++) {
      const raw = await connections[index].read();
      if (!raw) continue;
      const diagnostics = JSON.parse(raw);
      const configuration = JSON.stringify({ runtime: index + 1, origin: diagnostics.origin, project: diagnostics.project, emulator: diagnostics.emulator });
      if (!seen.has(configuration)) { seen.add(configuration); console.log(configuration); }
      for (const event of diagnostics.events) {
        const text = JSON.stringify({ runtime: index + 1, ...event });
        if (seen.has(text)) continue;
        seen.add(text); appendFileSync(`${directory}/client-trace.jsonl`, text + '\n'); console.log(text);
      }
    }
    if (Date.now() < deadline) await delay(1000);
  } while (Date.now() < deadline);
} finally { for (const { socket } of connections) socket.close(); }
