import ts from 'typescript';
const path = ts.findConfigFile('.', ts.sys.fileExists, 'tsconfig.json');
const config = ts.readConfigFile(path, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, '.');
const roots = [
  'app/(tabs)/index.tsx', 'app/(tabs)/technicians.tsx', 'app/(tabs)/technician-profile.tsx', 'app/(tabs)/map.tsx',
  'app/(tabs)/bookings.tsx', 'app/(tabs)/request-details.tsx', 'app/(tabs)/notifications.tsx',
  'app/technician/(tabs)/index.tsx', 'app/technician/(tabs)/jobs.tsx', 'app/technician/(tabs)/history.tsx',
  'app/technician/performance.tsx', 'app/technician/notifications.tsx', 'src/components/auth/AuthSessionGate.tsx',
  'src/components/auth/ProtectedRoute.tsx', 'src/components/maps/TechnicianLocationLifecycle.tsx',
];
const program = ts.createProgram(roots, { ...parsed.options, noEmit: true, incremental: false });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: (p) => p, getNewLine: () => '\n',
}));
else console.log('Performance scope screens, Auth/GPS gates and imported dependencies: TypeScript passed.');
process.exitCode = diagnostics.length ? 1 : 0;
