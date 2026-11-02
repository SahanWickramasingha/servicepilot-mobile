// EAS disables dotenv when evaluating Expo config. Never load local files here.
import { evaluatePreviewConfig } from './lib/preview-config-check.mjs';

const result = evaluatePreviewConfig();
for (const diagnostic of result.diagnostics) console.log(diagnostic);
console.log(result.ok ? 'PASS' : 'FAIL');
process.exitCode = result.ok ? 0 : 1;
