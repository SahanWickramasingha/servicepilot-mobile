import ts from "typescript";
const path = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");
const config = ts.readConfigFile(path, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const program = ts.createProgram([
  "app/(tabs)/create-request.tsx", "app/(tabs)/request-details.tsx",
  "app/technician/job-details.tsx", "app/technician/job-action.tsx",
  "app/(tabs)/bookings.tsx", "app/technician/(tabs)/jobs.tsx",
], { ...parsed.options, noEmit: true, incremental: false });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: (p) => p, getNewLine: () => "\n",
}));
else console.log("Booking screens and imported dependencies: TypeScript passed.");
process.exitCode = diagnostics.length ? 1 : 0;
