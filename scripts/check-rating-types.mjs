import ts from "typescript";
const path = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");
const config = ts.readConfigFile(path, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const program = ts.createProgram([
  "app/(tabs)/technician-profile.tsx", "app/technician/(tabs)/profile.tsx",
  "app/technician/(tabs)/index.tsx", "app/technician/(tabs)/history.tsx",
  "app/technician/performance.tsx",
], { ...parsed.options, noEmit: true, incremental: false });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: (p) => p, getNewLine: () => "\n",
}));
else console.log("Rating screens and their imported dependencies: TypeScript passed.");
process.exitCode = diagnostics.length ? 1 : 0;
