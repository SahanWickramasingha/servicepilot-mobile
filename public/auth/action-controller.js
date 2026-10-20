// Firebase action codes and passwords are held only by this page's closure.
// Never log provider errors, persist form data, or navigate using URL parameters.
export const RESET_REQUEST_CONFIRMATION = "If an eligible account exists for this email, a password reset link will be sent. Check your inbox and spam folder.";

export function passwordResetMessage(error) {
  switch (error?.code) {
    case "auth/expired-action-code": return "This reset link has expired. Request a fresh link below.";
    case "auth/invalid-action-code":
    case "auth/user-not-found":
    case "auth/user-disabled": return "This reset link is invalid, already used, or no longer available. Request a fresh link below.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements": return "Choose a stronger password with at least 8 characters. Your account policy may also require uppercase, lowercase, numbers or symbols.";
    case "auth/network-request-failed": return "Unable to reach Firebase. Check your connection and try again.";
    case "auth/too-many-requests": return "Too many attempts. Please wait a while before trying again.";
    default: return "Unable to complete this request right now. Please try again.";
  }
}

export function startEmailActionPage({ api, auth, document, mode, code, invalidQuery = false }) {
  const byId = (id) => document.getElementById(id);
  const form = byId("resetForm"), fields = byId("resetFields"), password = byId("newPassword"), confirmation = byId("confirmPassword");
  const submit = byId("resetSubmit"), resetError = byId("resetError");
  const freshForm = byId("freshForm"), freshEmail = byId("freshEmail"), freshSubmit = byId("freshSubmit"), freshMessage = byId("freshMessage");
  const retry = byId("retryAction"), requestFresh = byId("requestFresh");
  let active = true, busy = false, sending = false, validated = false;
  let actionCode = typeof code === "string" ? code : "";
  requestFresh.hidden = mode !== "resetPassword";
  const removers = [];
  const listen = (element, event, callback) => {
    element.addEventListener(event, callback);
    removers.push(() => element.removeEventListener(event, callback));
  };
  const clearPasswords = () => {
    password.value = ""; confirmation.value = "";
    password.type = "password"; confirmation.type = "password";
    byId("showPassword").textContent = "Show"; byId("showConfirmation").textContent = "Show";
    byId("showPassword").setAttribute("aria-pressed", "false"); byId("showConfirmation").setAttribute("aria-pressed", "false");
  };
  const render = (heading, text, tone = "error") => {
    byId("title").textContent = heading; byId("message").textContent = text;
    byId("statusIcon").className = `status-icon ${tone}`;
    byId("statusIcon").textContent = tone === "success" ? "\u2713" : "!";
    byId("actions").hidden = false;
  };
  const invalidate = () => { validated = false; actionCode = ""; fields.disabled = true; form.hidden = true; clearPasswords(); };
  const terminal = (error) => ["auth/invalid-action-code", "auth/expired-action-code", "auth/user-not-found", "auth/user-disabled"].includes(error?.code);
  const showFresh = () => { freshForm.hidden = false; freshEmail.focus(); };
  listen(requestFresh, "click", showFresh);
  for (const [button, input] of [[byId("showPassword"), password], [byId("showConfirmation"), confirmation]]) {
    listen(button, "click", () => {
      if (!active || busy) return;
      input.type = input.type === "password" ? "text" : "password";
      button.textContent = input.type === "password" ? "Show" : "Hide";
      button.setAttribute("aria-pressed", String(input.type === "text"));
    });
  }
  listen(form, "submit", async (event) => {
    event.preventDefault();
    if (!active || busy || sending || !validated || !actionCode) return;
    resetError.textContent = "";
    if (password.value.length < 8) { resetError.textContent = "Use at least 8 characters for your new password."; return; }
    if (password.value !== confirmation.value) { resetError.textContent = "The new password and confirmation must match."; return; }
    busy = true; fields.disabled = true; submit.textContent = "Updating password...";
    try {
      // Preserve exact input, including intentional spaces. Never sign in here.
      await api.confirmPasswordReset(auth, actionCode, password.value);
      if (!active) return;
      invalidate(); freshForm.hidden = true; retry.hidden = true; requestFresh.hidden = true;
      render("Password Reset", "Your password was updated successfully. You can now sign in with your new password.", "success");
    } catch (error) {
      if (!active) return;
      if (terminal(error)) {
        invalidate(); render("Reset Link Unavailable", passwordResetMessage(error), "warning"); showFresh();
      } else resetError.textContent = passwordResetMessage(error);
    } finally {
      busy = false;
      if (active) { fields.disabled = !validated; submit.textContent = "Reset Password"; }
    }
  });
  listen(freshForm, "submit", async (event) => {
    event.preventDefault();
    if (!active || sending || busy) return;
    const email = freshEmail.value.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      freshMessage.textContent = "Enter a valid email address."; return;
    }
    sending = true; freshSubmit.disabled = true; freshEmail.disabled = true; freshMessage.textContent = "Sending request...";
    const accepted = () => {
      invalidate();
      retry.hidden = true;
      render("Check Your Email", RESET_REQUEST_CONFIRMATION, "success");
      freshMessage.textContent = RESET_REQUEST_CONFIRMATION;
    };
    try {
      await api.sendPasswordResetEmail(auth, email);
      if (active) accepted();
    } catch (error) {
      if (active) {
        if (["auth/user-not-found", "auth/user-disabled"].includes(error?.code)) accepted();
        else freshMessage.textContent = error?.code === "auth/invalid-email" ? "Enter a valid email address." : passwordResetMessage(error);
      }
    } finally {
      sending = false;
      if (active) { freshSubmit.disabled = false; freshEmail.disabled = false; }
    }
  });

  async function checkAction() {
    if (!active || busy) return;
    fields.disabled = true; form.hidden = true; retry.hidden = true;
    if (!["verifyEmail", "resetPassword"].includes(mode)) {
      render("Unsupported Action", "This ServicePilot page supports email verification and password-reset links.", "warning"); return;
    }
    if (invalidQuery || !actionCode || actionCode.length > 2048 || /\s/.test(actionCode)) {
      invalidate();
      render(mode === "resetPassword" ? "Invalid Reset Link" : "Invalid Verification Link", "This link is missing valid action information. Request a new email link.");
      if (mode === "resetPassword") showFresh();
      return;
    }
    busy = true;
    byId("title").textContent = mode === "resetPassword" ? "Checking your reset link..." : "Verifying your email...";
    byId("message").textContent = "Please wait while Firebase checks this secure link.";
    try {
      if (mode === "verifyEmail") {
        await api.applyActionCode(auth, actionCode);
        if (!active) return;
        actionCode = "";
        render("Email Verified", "Your ServicePilot email has been verified successfully. You can now return to the ServicePilot app and sign in.", "success");
      } else {
        const email = await api.verifyPasswordResetCode(auth, actionCode);
        if (!active) return;
        validated = true;
        byId("title").textContent = "Create a New Password";
        byId("message").textContent = "Use at least 8 characters and confirm your new password.";
        byId("statusIcon").textContent = "\u2713";
        byId("statusIcon").className = "status-icon";
        freshEmail.value = email; form.hidden = false; fields.disabled = false;
        password.focus();
      }
    } catch (error) {
      if (!active) return;
      if (mode === "verifyEmail") {
        if (error?.code === "auth/expired-action-code") render("Verification Link Expired", "This verification link is no longer valid. Return to ServicePilot and request a new verification email.", "warning");
        else if (error?.code === "auth/invalid-action-code") render("Email Already Verified", "This verification link has already been used or the account is already verified. You can return to ServicePilot and sign in.", "warning");
        else render("Unable to Verify Email", "We couldn't verify your email right now. Return to ServicePilot and request a new verification email.");
      } else {
        if (terminal(error)) invalidate();
        else retry.hidden = false;
        render("Unable to Check Reset Link", passwordResetMessage(error), "warning"); showFresh();
      }
    } finally { busy = false; }
  }
  listen(retry, "click", checkAction);
  return { ready: checkAction(), dispose() {
    active = false; actionCode = ""; validated = false; clearPasswords();
    fields.disabled = true; form.hidden = true;
    removers.forEach((remove) => remove());
  } };
}
