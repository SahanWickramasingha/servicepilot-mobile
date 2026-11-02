// Vite loads its own .env* later. Apply the same production precedence here.
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...loadEnv('production', root, 'VITE_'), ...process.env };
const allowed = new Set(['VITE_DISPATCHER_API_URL', 'VITE_USE_FIREBASE_EMULATORS']);
let valid = !Object.keys(env).some(key => key.startsWith('VITE_') && !allowed.has(key));
try {
  const url = new URL(env.VITE_DISPATCHER_API_URL);
  valid &&= url.protocol === 'https:' && url.origin === env.VITE_DISPATCHER_API_URL &&
    !url.username && !url.password && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
} catch { valid = false; }
valid &&= env.VITE_USE_FIREBASE_EMULATORS !== '1';
if (!valid) {
  console.error('FAIL: require a public HTTPS VITE_DISPATCHER_API_URL origin, disabled VITE_USE_FIREBASE_EMULATORS, and only approved public VITE_* names.');
  process.exitCode = 1;
} else console.log('PASS: Pages public build configuration');
