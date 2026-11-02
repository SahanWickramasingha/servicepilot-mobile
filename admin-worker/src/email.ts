import { ProviderError, type Env } from './runtime';

/** Built-in Firebase template delivery, not Admin generatePasswordResetLink.
 * API key selects the project; Admin authorization remains in the shared engine.
 * Do not request returnOobLink, pass OAuth credentials, or parse/return link data.
 */
export function firebaseSetupEmail(env: Env, transport: typeof fetch) {
  return async (email: string): Promise<'accepted'> => {
    let response: Response;
    try {
      response = await transport('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + encodeURIComponent(env.FIREBASE_WEB_API_KEY ?? ''), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email, continueUrl: env.ADMIN_WEB_ORIGIN + '/login' }) });
    } catch {
      // The provider might have accepted the request before the connection failed.
      throw new ProviderError('email/outcome-unknown');
    }
    if (response.ok) {
      // Email enumeration protection can suppress account-existence information.
      // Success is only request acceptance, never proof of delivery or verification.
      await response.body?.cancel().catch(() => undefined);
      return 'accepted';
    }
    const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const code = data.error?.message?.split(' : ')[0];
    if (response.status === 429 || ['TOO_MANY_ATTEMPTS_TRY_LATER', 'QUOTA_EXCEEDED', 'RESET_PASSWORD_EXCEED_LIMIT'].includes(code ?? '')) {
      throw new ProviderError('email/quota-exceeded');
    }
    if (['CAPTCHA_CHECK_FAILED', 'MISSING_RECAPTCHA_TOKEN', 'INVALID_RECAPTCHA_TOKEN', 'RECAPTCHA_NOT_ENABLED'].includes(code ?? '')) {
      throw new ProviderError('email/abuse-protection');
    }
    if (response.status >= 500) throw new ProviderError('email/outcome-unknown');
    throw new ProviderError('email/request-failed');
  };
}

export function setupEmail(env: Env, transport: typeof fetch) {
  return async (email: string, resetLink: string): Promise<'sent'> => {
    const response = await transport('https://api.resend.com/emails', { method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.ADMIN_EMAIL_FROM, to: [email],
        subject: 'Set up your ServicePilot Dispatcher account',
        text: `You have been invited to ServicePilot as a Dispatcher. Set your password using this Firebase link:\n\n${resetLink}\n\nIf you did not expect this invitation, contact your ServicePilot administrator.` }) });
    const data = await response.json() as { id?: string };
    if (!response.ok || typeof data.id !== 'string' || !data.id) throw new ProviderError('admin/email-unavailable');
    // Provider accepted, not proof of inbox delivery. Never log link or recipient.
    return 'sent';
  };
}
