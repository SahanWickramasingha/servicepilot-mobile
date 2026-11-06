// Audit-only control. Existing suites seed pre-policy user records yet mock the
// acceptance UI. Add CURRENT acceptance to synthetic ADMIN fixture writes only.
// This never patches the app, client writes, Rules or any non-loopback project.
import { createRequire } from 'node:module';
const project = 'demo-servicepilot-review-author';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '') || process.env.GCLOUD_PROJECT !== project) throw Error('Audit fixture control requires loopback demo project.');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { DocumentReference } = require('firebase-admin/firestore');
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require('./lib/domain/legalPolicy.js');
const set = DocumentReference.prototype.set;
DocumentReference.prototype.set = function (data, ...args) {
  if (/^users\/[^/]+$/.test(this.path) && this.firestore.projectId === project) data = {
    termsVersion: TERMS_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION, acceptedAt: new Date(), ...data,
  };
  return set.call(this, data, ...args);
};
