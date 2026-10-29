import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function diagnosticFixture() {
  const exports = {}, logs = [];
  new Function('exports', '__DEV__', 'console', ts.transpileModule(readFileSync('src/utils/requestSubmissionDiagnostics.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(exports, true, { warn: (...args) => logs.push(args) });
  return { ...exports, logs };
}
test('development diagnostics retain safe response/status evidence without echoing private server details', () => {
  const f = diagnosticFixture(), secret = 'PRIVATE-IDENTITY-TOKEN-IMAGE-URL';
  f.reportSubmissionFailure('photo-metadata', { code: 'storage/unknown', message: secret, stack: secret,
    customData: { serverResponse: JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: secret, errors: [{ reason: secret }] } }) },
    request: secret, path: secret,
  }, { authenticated: true, verified: true, ownerMatches: true, byteCount: 1234, mime: 'image/jpeg' });
  const printed = JSON.stringify(f.logs);
  assert.ok(!printed.includes(secret)); assert.equal(f.logs[0][1].httpStatus, 403);
  assert.equal(f.logs[0][1].serverStatus, 'PERMISSION_DENIED'); assert.equal(f.logs[0][1].operation, 'photo-metadata');
  assert.equal(f.sanitizedSubmissionFailure({ code: 'storage/unknown', serverResponse: '<html>private text</html>' }).httpStatus, null);
  assert.equal(f.sanitizedSubmissionFailure({ code: secret }).code, 'unclassified');
});
test('permission, upload configuration, connectivity and uncertain-booking messages remain distinct and actionable', () => {
  const f = diagnosticFixture();
  assert.match(f.submissionFailureMessage({ code: 'permission-denied' }, 'receipt-read'), /Booking access was denied/);
  assert.match(f.submissionFailureMessage({ code: 'storage/unknown' }, 'photo-upload'), /configuration or connection/);
  assert.match(f.submissionFailureMessage({ code: 'storage/unauthorized' }), /Photo access was denied/);
  assert.match(f.submissionFailureMessage({ code: 'unavailable' }), /retry this same submission/);
  assert.match(f.submissionOperationError('photo-upload', { code: 'storage/unknown' }).message, /remove photos/);
  const acknowledged = f.submissionOperationError('photo-confirm', { code: 'storage/unknown' }, true);
  assert.equal(acknowledged.uploadAcknowledged, true); assert.match(acknowledged.message, /was uploaded/);
  assert.match(f.submissionFailureMessage(acknowledged), /No booking was submitted/);
});
