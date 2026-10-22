import ts from 'typescript';
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, '.');
const roots = ['app/technician/before-photos.tsx', 'app/technician/after-photos.tsx', 'app/technician/service-notes.tsx',
  'app/technician/signature.tsx', 'app/technician/job-action.tsx', 'app/(tabs)/request-details.tsx',
  'app/technician/notifications.tsx', 'app/(tabs)/notifications.tsx', 'src/components/maps/TechnicianLocationLifecycle.tsx'];
const program = ts.createProgram(roots, { ...parsed.options, noEmit: true, incremental: false });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: (p) => p, getNewLine: () => '\n',
}));
else console.log('Job workflow, notification and GPS scope: TypeScript passed.');
process.exitCode = diagnostics.length ? 1 : 0;
