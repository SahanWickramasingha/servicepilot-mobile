import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join, dirname } from 'node:path';
const require = createRequire(import.meta.url), ts = require('typescript');
export function renderHarness(path, { root = '.', initial = [], dependencies = {}, effects = false } = {}) {
  const slots = [], queue = [], registrations = [], memoComponents = [], modules = new Map();
  let cursor = 0, tree, currentProps;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState: (value) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = index in initial ? initial[index] : typeof value === 'function' ? value() : value;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef: (current) => { const index = cursor++; slots[index] ??= { current }; return slots[index]; },
    useMemo: (calculate, deps) => { const index = cursor++, previous = slots[index];
      if (!previous || !same(previous.deps, deps)) slots[index] = { value: calculate(), deps }; return slots[index].value; },
    useCallback: (callback, deps) => react.useMemo(() => callback, deps),
    useEffect: (effect, deps) => { const index = cursor++, previous = slots[index];
      if (effects && (!previous || !same(previous.deps, deps))) queue.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; }); },
    memo: (component, compare) => { memoComponents.push({ component, compare }); return component; },
  };
  const jsx = (type, props, key) => { const element = { type, props, key }; registrations.push(element); return element; };
  const native = new Proxy({ StyleSheet: { create: (value) => value, absoluteFillObject: {} },
    Platform: { OS: 'android' }, PixelRatio: { get: () => 3 }, AccessibilityInfo: { announceForAccessibility() {} },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  }, { get: (object, key) => object[key] ?? key });
  const deps = { react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'react-native': native,
    'react-native-maps': { __esModule: true, default: 'MapView', Polygon: 'Polygon', Marker: 'Marker', Circle: 'Circle', PROVIDER_GOOGLE: 'google' },
    'lucide-react-native': new Proxy({}, { get: (_, key) => key }),
    'expo-image': { Image: 'Image' },
    ...dependencies };
  function load(logical) {
    if (modules.has(logical)) return modules.get(logical);
    let file = resolve(root, logical); if (!existsSync(file)) file = resolve(logical);
    if (logical.endsWith('.json')) return JSON.parse(readFileSync(file, 'utf8'));
    const output = {}, code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    modules.set(logical, output);
    new Function('exports', 'require', '__DEV__', code)(output, (id) => {
      if (id in deps) return deps[id];
      if (id.startsWith('@/')) return load(id.slice(2)+'.ts');
      if (id.startsWith('.')) return load(join(dirname(logical), id.endsWith('.json') ? id : id+'.ts'));
      return require(id);
    }, false);
    return output;
  }
  const component = load(path).default;
  return {
    slots, memoComponents, render: (props = currentProps) => { cursor = 0; registrations.length = 0; currentProps = props;
      tree = component(props); while (queue.length) queue.shift()(); return tree; },
    elements: () => registrations, cleanup: () => slots.forEach((slot) => slot?.cleanup?.()),
  };
}
