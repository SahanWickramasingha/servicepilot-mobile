import ts from "typescript";
const path = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");
const config = ts.readConfigFile(path, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const roots = ["app/(tabs)/map.tsx", "app/(tabs)/request-details.tsx", "app/technician/_layout.tsx",
  "app/technician/(tabs)/profile.tsx", "app.config.ts"];
const program = ts.createProgram(roots, { ...parsed.options, noEmit: true, incremental: false });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: (p) => p, getNewLine: () => "\n",
}));
else console.log("Map screens and their imported dependencies: TypeScript passed.");
process.exitCode = diagnostics.length ? 1 : 0;
