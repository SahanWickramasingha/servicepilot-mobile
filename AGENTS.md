AGENTS.md — ServicePilot Professional Email Verification Experience

Goal

Improve the existing Firebase email verification experience so both of these look professional and consistent with the ServicePilot brand:

The verification email received in Gmail / other email clients.

The web page shown after the user clicks the Firebase verification link.

Do NOT replace Firebase email verification with a custom OTP system.

Keep the current Firebase built-in email verification architecture.

Current working flow:

Register
-> Firebase Auth account created
-> Firestore profile created
-> Firebase verification email sent
-> User clicks verification link
-> Firebase marks Auth emailVerified = true
-> User returns to ServicePilot
-> App reloads Firebase user
-> Firestore emailVerified is synced

The objective is to make the verification experience look professional, branded, clear, and trustworthy.

Brand Direction

Use the current ServicePilot visual identity.

Recommended style:

Brand Name: ServicePilot
Product Label: Field Service Management

Primary background: #06111F or existing project dark navy
Card background: #0D1B2A or existing project card color
Primary blue: #2F6BFF
Secondary blue: #4B8BFF
Text primary: #FFFFFF / #F8FAFC
Text secondary: #94A3B8
Border: rgba(255,255,255,0.08)
Success: #22C55E
Error: #EF4444
Warning: #F59E0B

Use the actual existing colors/tokens from the project if they differ.

Use:

clean spacing

modern typography

rounded cards

subtle shadows

subtle blue glow

simple verified/check icon

responsive mobile + desktop layout

Avoid:

huge gradients

excessive animation

unnecessary decorative effects

clutter

fake trust badges

fake progress indicators

Professional Firebase Verification Email

The current email is too generic:

Hello,
Follow this link to verify your email address.
<very long Firebase URL>

Replace the wording with a professional ServicePilot message using Firebase Authentication email template customization.

Recommended subject:

Verify your ServicePilot email

Alternative:

Complete your ServicePilot registration

Recommended sender display name where Firebase allows it:

ServicePilot

Do not pretend to use a sender domain/address that is not actually configured.

Recommended Verification Email Copy

Use professional, concise wording:

Welcome to ServicePilot

Thanks for creating your account.

Please verify your email address to complete your ServicePilot registration and secure your account.

Verify Email

If the button does not work, use the verification link provided in this email.

If you did not create a ServicePilot account, you can safely ignore this message.

ServicePilot
Field Service Management

Keep it short and clear.

Do not include unnecessary technical information such as:

Firebase

oobCode

API key

internal project ID

backend implementation details

Email CTA / Link Presentation

Where Firebase's template system supports it, present the main action as:

Verify Email

Do NOT hard-code the generated Firebase verification URL.

Use Firebase's required action-link placeholder.

If Firebase's built-in email template cannot produce the exact branded HTML layout desired, do not hack around the platform. Improve the supported template text/subject and focus full branding on the custom browser action page.

Custom Professional Verification Web Page

The default Firebase verification result page currently looks like a generic white Firebase page.

Replace that browser experience with a ServicePilot-branded custom email action handler page.

The page must process Firebase email verification links securely.

Read Firebase action parameters such as:

mode
oobCode
continueUrl
lang

Do not display raw query parameters to the user.

For email verification, use Firebase Auth's supported action-code APIs.

Do not mark a user verified only from a URL flag.

The action code must actually be validated/applied through Firebase.

Verification Web Page States

Loading

Verifying your email...
Please wait a moment.

Use a professional loading indicator.

Success

Email Verified

Your ServicePilot email has been verified successfully.

You can now return to the ServicePilot app and sign in.

Primary CTA:

Open ServicePilot

Secondary CTA where useful:

Back to Sign In

If deep linking is not configured yet, use a safe fallback:

Return to the ServicePilot app and tap "I've Verified Email".

Do not create a broken deep link.

Already Used / Already Verified

Email Already Verified

This verification link has already been used or the account is already verified.

You can return to ServicePilot and sign in.

Do not present this as a severe error.

Expired / Invalid Link

Verification Link Expired

This verification link is no longer valid.

Return to the ServicePilot app and request a new verification email.

Unexpected Error

Unable to Verify Email

We couldn't verify your email right now.

Please return to ServicePilot and request a new verification email.

Do not expose raw Firebase error messages, stack traces, internal IDs, API keys, or implementation details.

Verification Page Visual Layout

Recommended layout:

Dark full-page background

          ServicePilot Logo

        SERVICEPILOT
     Field Service Management

      ┌───────────────────────┐
      │        ✓              │
      │    Email Verified     │
      │                       │
      │ Your email has been   │
      │ verified successfully │
      │                       │
      │ [ Open ServicePilot ] │
      │                       │
      │ Back to Sign In       │
      └───────────────────────┘

        © ServicePilot

Use a centered responsive card.

Desktop:

max-width: ~440–520px

Mobile:

width: calc(100% - safe margins)

The page should look polished on desktop Chrome, Android Chrome, mobile Gmail browser, and common modern browsers.

Logo Handling

Reuse the existing ServicePilot logo from the project.

Do not create a new unrelated logo.

If the browser verification page is hosted separately, copy only the required public image asset into that page's public assets.

Do not expose private files or secrets.

Firebase Action Handler Requirements

Implement the custom action handler using Firebase's supported client SDK flow.

Conceptually:

Read mode + oobCode
-> validate required values
-> if mode === verifyEmail
-> applyActionCode(auth, oobCode)
-> show success state
-> otherwise show appropriate error/state

Do not implement insecure verification logic manually.

Do not set:

emailVerified = true

in Firestore merely because the URL contains mode=verifyEmail.

The Firebase action code must be successfully applied first.

Firestore Synchronization

Keep the existing mobile sync architecture.

Expected mobile flow after browser verification succeeds:

User returns to ServicePilot
-> taps "I've Verified Email"
-> app reloads current Firebase Auth user
-> checks user.emailVerified
-> refreshes token if required
-> safely updates Firestore users/{uid}.emailVerified

Keep any Firestore security requirement that only permits setting:

emailVerified = true

when Firebase Authentication's verified-email state/token supports it.

Do not weaken Firestore rules.

Mobile Verify Email Screen

Keep the existing professional dark Verify Email screen.

Recommended copy:

Verify Your Email

We've sent a verification link to:

<user email>

Open the link in your inbox, then return to ServicePilot and tap the button below.

Primary button:

I've Verified Email

Resend section:

Didn't receive the email?
Resend in 47s

After cooldown:

Resend Verification Email

Footer:

Already verified? Back to Login

Do not bring back 6-digit OTP boxes.

Resend Behaviour

Keep a resend cooldown.

Do not allow unlimited rapid verification emails.

Expected behaviour:

Send verification email
-> start cooldown
-> disable resend action
-> enable resend after cooldown

Success feedback:

A new verification email has been sent.

Error feedback:

Unable to send verification email. Please try again.

Do not show raw Firebase errors directly.

Customer and Technician Behaviour

The email verification experience is shared by both Customer and Technician.

Customer:

Register
-> Verify Email
-> Firebase emailVerified = true
-> Firestore sync
-> Customer may sign in

Technician:

Register
-> Verify Email
-> Firebase emailVerified = true
-> Firestore sync
-> technicianApprovalStatus remains "pending"
-> show Technician Pending Approval state

Email verification must NOT automatically approve a Technician.

Dispatcher approval remains separate.

Technician Pending Approval Message

After email verification, Technician should see:

Registration Submitted

Your email has been verified successfully.

Your technician information is now under review.
Please wait while we confirm your qualifications and account details.

You will be able to sign in after your account has been approved.

When a pending Technician later tries to log in:

Your technician account is still under review.

Please wait while we confirm your information.
You'll be able to sign in once your account is approved.

Hosting Recommendation

Prefer Firebase Hosting for the custom verification page if it fits the existing project.

Possible approach:

Firebase Hosting
-> professional verification action page
-> Firebase Auth action-code handling

Use the existing Firebase-hosted project URL initially.

Do not require purchasing a custom domain.

If the project already uses another suitable hosting path, reuse it rather than introducing unnecessary infrastructure.

Firebase Console / Manual Configuration Notes

Codex must clearly report Firebase Console steps that cannot be done purely through code.

Examples may include:

Authentication
-> Templates
-> Email address verification
-> edit subject/message/sender display settings supported by Firebase

Authentication
-> Templates
-> configure/customize email action URL if required for the custom handler

Do not claim these console steps were completed automatically if they require manual configuration.

Provide exact manual steps after implementation.

Security Requirements

Do NOT:

expose Firebase private credentials

expose service-account keys

expose .env secrets

expose API secrets

bypass Firebase action-code validation

trust arbitrary oobCode values without Firebase validation

set verification status just because the browser opened a page

weaken Firestore rules

expose raw Firebase errors to end users

Files To Inspect

Inspect the actual project before making changes.

Important files may include:

app/(auth)/register.tsx
app/(auth)/verify-email.tsx
app/(auth)/login.tsx
src/services/auth.service.ts
src/services/user.service.ts
src/firebase/config.ts
firestore.rules
firebase.json

Also find:

ServicePilot logo assets

app color/theme constants

Firebase Hosting configuration if it exists

web/public folder if it exists

any existing verification/action-handler page

Use actual filenames found in the project.

Do not create duplicate implementations if equivalent files already exist.

Old OTP Flow

The current production direction is Firebase built-in verification links.

Do NOT reconnect:

Cloudflare Worker OTP
Cloudflare KV OTP
Resend OTP
6-digit OTP entry UI

to the active verification flow.

If old OTP files remain, do not delete them blindly.

First identify whether anything still imports or uses them.

Report unused legacy files separately.

Testing Checklist

Email Template

Verify:

Professional subject
ServicePilot wording
No generic developer wording
Clear verification CTA/link
No raw technical explanations

Custom Browser Page

Test:

Valid verification link
Already-used link
Expired link
Invalid link
Missing oobCode
Unsupported mode
Desktop layout
Mobile layout

Customer Flow

Register Customer
Receive verification email
Open link
Professional ServicePilot verification page appears
Verification succeeds
Return to app
Tap "I've Verified Email"
Customer can sign in

Technician Flow

Register Technician
Receive verification email
Open link
Professional ServicePilot verification page appears
Verification succeeds
Return to app
Tap "I've Verified Email"
Technician remains pending
Pending-review message appears

Resend

Resend disabled during cooldown
Resend works after cooldown
New verification email received
Errors handled cleanly

Final Expected Experience

ServicePilot Register
        |
        v
Professional ServicePilot Verify Email screen
        |
        v
Professional ServicePilot verification email
        |
        v
User clicks Verify Email
        |
        v
Professional dark ServicePilot browser success page
        |
        v
Return to ServicePilot
        |
        v
I've Verified Email
        |
        +--> Customer -> Login
        |
        +--> Technician -> Pending Approval

The verification flow should feel like one consistent product, not separate Firebase/default pages.

Immediate Codex Task

Read this entire AGENTS.md first.

Then:

Inspect the current working Firebase email verification implementation.

Preserve Firebase built-in email verification.

Improve the mobile Verify Email wording if needed.

Prepare professional Firebase email-template content.

Implement a professional ServicePilot custom email verification action page.

Handle loading/success/already-used/expired/error states.

Reuse the existing ServicePilot branding and logo.

Keep Customer and Technician behavior unchanged except for presentation improvements.

Do not auto-approve Technicians.

Preserve Firestore security.

Do not restore the old custom OTP flow.

Make the smallest clean changes necessary.

Report every file changed and why.

Report Firebase Console steps that must be done manually.

Provide exact deploy/test commands.

Provide exact end-to-end test steps.

Do not mark this task complete unless both of these look professional:

1. Verification email received by the user
2. Browser page shown after clicking the verification link