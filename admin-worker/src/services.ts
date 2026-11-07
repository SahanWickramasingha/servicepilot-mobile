import { createDispatcherProvisioner } from '../../functions/src/domain/adminProvisioning';
import { createAccountLifecycleService } from '../../functions/src/domain/adminLifecycle';
import { createTechnicianDecisionEmailService } from '../../functions/src/domain/technicianDecisionEmail';
import { firebaseAuth, serviceToken } from './auth';
import { firestoreStore, serverTime } from './firestore';
import { decisionEmail, decisionEmailConfigured, technicianEmailProvider, firebaseSetupEmail, setupEmail } from './email';
import { requestFetch, type Env } from './runtime';

// The core's SDK types are erased. These are the two explicit compatibility
// boundaries: only its used Auth/document transaction subset is implemented.
// Wire tests and real Firestore emulator tests exercise that subset.
export function services(env: Env) {
  const transport = requestFetch(), token = serviceToken(env, transport);
  const auth = firebaseAuth(env.FIREBASE_PROJECT_ID, token, transport) as unknown as Parameters<typeof createDispatcherProvisioner>[0]['auth'];
  const db = firestoreStore(env.FIREBASE_PROJECT_ID, token, transport) as unknown as Parameters<typeof createDispatcherProvisioner>[0]['db'];
  const dependencies = { auth, db, serverTimestamp: () => serverTime };
  return {
    provisioning: createDispatcherProvisioner({ ...dependencies, continueUrl: env.ADMIN_WEB_ORIGIN + '/login',
      ...(env.ADMIN_EMAIL_PROVIDER === 'firebase' ? { requestSetupEmail: firebaseSetupEmail(env, transport) } : { sendSetupEmail: setupEmail(env, transport) }) }),
    lifecycle: createAccountLifecycleService(dependencies),
    decisionEmails: createTechnicianDecisionEmailService({ ...dependencies,
      provider: technicianEmailProvider(env), sender: decisionEmailConfigured(env) ? env.ADMIN_EMAIL_FROM : undefined, sendEmail: decisionEmail(env, transport) }),
  };
}
