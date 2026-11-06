import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..'), directory = resolve(root, '.firebase/review-config/full-audit');
const commands = [];
for (const file of readdirSync(directory).filter(name => name.endsWith('.json'))) {
  const result = JSON.parse(readFileSync(resolve(directory, file), 'utf8'));
  if (!result.command || !result.name) continue;
  const { name, command, cwd, exitCode, timedOut, seconds, tests, pass, fail, skip } = result;
  const item = { name, command, cwd, exitCode, timedOut, seconds, tests, pass, fail, skip };
  if (timedOut) {
    const log = readFileSync(resolve(directory, name + '.log'), 'utf8');
    item.observedPassBeforeTimeout = [...log.matchAll(/^ok \d+ - /gm)].length;
    item.observedFailBeforeTimeout = [...log.matchAll(/^not ok \d+ - /gm)].length;
  }
  commands.push(item);
}
commands.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(resolve(root, 'scripts/FULL_FUNCTIONAL_AUDIT_COMMANDS.json'), JSON.stringify({
  scope: 'Local functional audit; overlapping retries are separate runs, not a combined pass rate. Metadata reads and manual device checks are described in the report.', commands,
}, null, 2) + '\n');
console.log(`Saved ${commands.length} audit command results; overlapping retries are separate runs.`);
