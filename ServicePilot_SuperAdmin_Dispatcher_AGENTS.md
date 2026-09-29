# AGENTS.md — ServicePilot Super Admin Web + Dispatcher Management

## Goal

Build the ServicePilot **Super Admin Web Portal** and secure **Dispatcher account management** while preserving the current mobile marketplace architecture.

The final role architecture is:

```text
PUBLIC MOBILE REGISTRATION
├── Customer
└── Technician

MOBILE LOGIN
├── Customer
├── Technician
└── Dispatcher

WEB ONLY
└── Super Admin
```

Important:

- Customer and Technician may self-register in the mobile app.
- Dispatcher must NOT self-register.
- Super Admin must NOT self-register publicly.
- Super Admin is WEB ONLY.
- Super Admin creates Dispatcher accounts securely.
- Dispatcher reviews Technician applications and approves/rejects Technicians.
- Dispatcher does NOT assign normal service jobs.
- Customers directly select approved Technicians and send service requests.
- Do not reconnect the old OTP system.
- Preserve the current Firebase built-in email verification flow.

---

# 1. Current ServicePilot Architecture

## Customer

```text
Register
-> Verify Email
-> Login
-> Home
-> Browse Categories
-> Browse Approved Technicians
-> Technician Profile
-> Select Technician
-> Create Request
-> Technician Accept / Reject
-> In Progress
-> Completed
-> Review / Rating
```

Customer bottom navigation:

```text
Home
Technicians
Map
Requests
Profile
```

## Technician

```text
Register
-> Verify Email
-> technicianApprovalStatus = "pending"
-> Dispatcher reviews qualifications
-> Dispatcher Approves / Rejects
-> Approved Technician may login
-> Receive direct Customer requests
-> Accept / Reject
-> Start Job
-> Complete Job
```

Technician access requires:

```text
role == "technician"
emailVerified == true
technicianApprovalStatus == "approved"
```

## Dispatcher

Dispatcher is an internal operational role.

Dispatcher:

```text
does NOT self-register
is created by Super Admin
logs in through mobile app
reviews Technician applications
checks qualifications
checks certifications
checks experience
checks service division
approves or rejects Technicians
```

Dispatcher must NOT be responsible for:

```text
normal job assignment
Customer -> Technician assignment
Super Admin functions
creating another Dispatcher
promoting users
```

## Super Admin

Super Admin is:

```text
WEB ONLY
```

Super Admin:

```text
logs into admin-web
views system overview
creates/manages Dispatchers
views Customers
views Technicians
monitors Service Requests
views Reviews
views Reports
views Audit Logs
manages system-level configuration where implemented
```

Do NOT add Super Admin routes/tabs to the mobile app.

---

# 2. Existing Project Structure

Inspect the real project before editing.

The repository currently includes areas such as:

```text
servicepilot-mobile/
├── app/
├── src/
├── admin-web/
├── functions/
├── firestore.rules
├── firebase.json
└── package.json
```

Important instruction:

**Use the existing `admin-web/` project.**

Do not create a completely separate admin project unless the current `admin-web/` is unusable.

Inspect first:

```text
admin-web/
functions/
firestore.rules
src/firebase/
app/(auth)/
current user schema
current role guards
current Firebase config
```

Reuse current Firebase project/configuration.

Firebase project:

```text
servicepilot-756d9
```

Do not hard-code private credentials.

---

# 3. Super Admin Account Creation

There must be NO public Super Admin registration page.

The first Super Admin must be created through a trusted bootstrap process.

Accepted approaches:

```text
A. Firebase Console + trusted Firestore setup
OR
B. One-time local Firebase Admin SDK bootstrap script
```

Prefer a secure one-time Admin SDK bootstrap script if practical.

Possible file:

```text
scripts/bootstrap-super-admin.mjs
```

The script must:

1. Create/find Firebase Auth user.
2. Create/update `users/{uid}`.
3. Set:

```text
uid
fullName
email
role: "super_admin"
accountStatus: "active"
createdAt
updatedAt
```

4. Never hard-code the Super Admin password in Git.
5. Never commit service-account credentials.
6. Never print the password.
7. Never expose a service-account private key to mobile/web client code.

The bootstrap process should accept the Super Admin email/password through secure CLI input or environment variables.

If the project cannot safely support the bootstrap script with the current environment, provide exact Firebase Console manual bootstrap steps instead.

Do NOT create:

```text
/super-admin/register
```

or any public equivalent.

---

# 4. Super Admin Web Login

Create/use a dedicated Super Admin login screen inside `admin-web`.

UI:

```text
SERVICEPILOT
Admin Portal

Email
Password

[ Sign In ]
```

Login flow:

```text
Email + Password
-> Firebase signInWithEmailAndPassword
-> load users/{uid}
-> verify role == "super_admin"
-> verify accountStatus == "active"
-> allow admin dashboard
```

If authenticated user is not `super_admin`:

```text
sign out
show Access Denied
```

Customer / Technician / Dispatcher must not gain access to the Super Admin portal.

Do not trust only client-side route hiding.

Firestore rules and privileged backend operations must enforce authorization.

---

# 5. Super Admin Route Guard

Protect all Admin Web routes.

Concept:

```text
/admin
/admin/technicians
/admin/dispatchers
/admin/customers
/admin/requests
/admin/reviews
/admin/reports
/admin/audit
/admin/settings
```

Every protected route should require:

```text
authenticated user
AND
users/{uid}.role == "super_admin"
AND
accountStatus == "active"
```

Display loading state while auth/profile is being resolved.

Never briefly expose privileged admin data before the role check finishes.

---

# 6. Super Admin Web Navigation

Recommended sidebar:

```text
Dashboard
Technicians
Dispatchers
Customers
Service Requests
Reviews
Categories
Service Areas
Reports
Audit Logs
Settings
Logout
```

Only include pages that are actually implemented.

Do not leave fake clickable navigation.

---

# 7. Admin Dashboard Overview

Build a real-data dashboard.

Recommended KPI cards:

```text
Total Customers
Total Technicians
Approved Technicians
Pending Technician Applications
Rejected Technicians
Active Service Requests
Completed Jobs
Cancelled Jobs
Total Reviews
Average Technician Rating
```

Possible sections:

```text
Recent Technician Applications
Recent Service Requests
Top Rated Technicians
Jobs by Status
Jobs by Category
Jobs by Division
```

Important:

- No hard-coded metrics.
- No fake charts.
- Empty system -> show 0 / clean empty states.
- Use actual Firestore data.

If a chart cannot be backed by real data, omit it.

---

# 8. Dispatcher Management

Super Admin must have a dedicated:

```text
Dispatchers
```

page.

Features:

```text
View Dispatchers
Search Dispatchers
Filter Active / Disabled
Create Dispatcher
View Dispatcher
Activate / Deactivate Dispatcher
```

Super Admin is the ONLY normal UI role allowed to create Dispatcher accounts.

Dispatcher must never create another Dispatcher.

---

# 9. Create Dispatcher UI

Create a professional form:

```text
Create Dispatcher

Full Name
Email
Phone
Temporary Password
Confirm Password

[ Create Dispatcher ]
```

Validation:

```text
Full Name required
Valid email required
Phone required if current schema requires it
Strong password required
Password confirmation must match
Email must not already exist
```

Never display or log the password after creation.

Do not store plaintext passwords in Firestore.

---

# 10. Critical Dispatcher Creation Security

DO NOT create Dispatcher users directly from Admin Web with the normal client SDK:

```ts
createUserWithEmailAndPassword(...)
```

on the primary Firebase Auth instance.

That can replace/change the currently signed-in Super Admin session and is not sufficient privileged authorization.

Dispatcher creation must happen through a trusted backend.

Recommended architecture:

```text
Super Admin Web
        ↓
Authenticated callable/HTTPS backend
        ↓
Firebase Admin SDK
        ↓
Create Firebase Auth Dispatcher
        ↓
Create Firestore users/{dispatcherUid}
```

Use the existing `functions/` project if suitable.

Suggested callable function:

```text
createDispatcher
```

The backend must obtain the requesting UID from authenticated Firebase context.

Do NOT accept a client-supplied "I am super admin" flag.

---

# 11. createDispatcher Backend Authorization

Before creating a Dispatcher, the backend must verify the caller.

Server-side:

```text
request.auth != null
```

Then load:

```text
users/{request.auth.uid}
```

Require:

```text
role == "super_admin"
accountStatus == "active"
```

Otherwise:

```text
permission-denied
```

Do not rely on a client-side role variable.

---

# 12. Dispatcher Firebase Auth Creation

Use Firebase Admin SDK server-side.

Concept:

```ts
admin.auth().createUser({
  email,
  password,
  displayName: fullName,
  disabled: false
})
```

Do not expose Admin SDK/service-account credentials to the browser.

Handle:

```text
email already exists
invalid email
weak/invalid password
backend unavailable
profile creation failure
```

Do not expose internal stack traces to the UI.

---

# 13. Dispatcher Firestore Profile

After Auth user creation, create:

```text
users/{dispatcherUid}
```

Recommended fields:

```text
uid
fullName
email
phone
role: "dispatcher"
emailVerified
accountStatus: "active"
createdBy
createdAt
updatedAt
```

Where:

```text
createdBy = current Super Admin UID
```

Optional:

```text
mustChangePassword: true
```

if a first-login temporary-password flow is implemented.

Do NOT store:

```text
password
confirmPassword
plaintext temporaryPassword
```

in Firestore.

---

# 14. Dispatcher Email Verification

Use the current system direction.

Do not reconnect the old OTP flow.

If Dispatcher accounts should be email-verified before mobile access, implement one consistent policy.

Preferred:

```text
Super Admin creates Dispatcher
-> Dispatcher receives/uses Firebase email verification or controlled first-login flow
-> Firestore/Firebase verification state becomes authoritative
-> Dispatcher mobile login allowed after required verification
```

If the current implementation does not yet send Dispatcher verification emails, clearly report it as a TODO instead of faking verification.

Do not silently set `emailVerified: true` on the client.

---

# 15. Temporary Password / First Login

If Super Admin creates a Dispatcher with a temporary password, support a safe first-login experience.

Optional model:

```text
mustChangePassword: true
```

Flow:

```text
Dispatcher Login
-> role == dispatcher
-> mustChangePassword == true
-> Change Password screen
-> Firebase updatePassword()
-> update mustChangePassword = false
-> Dispatcher Dashboard
```

Only implement this if it fits the current project cleanly.

If not implemented now, document it as a TODO.

Do not store password history in Firestore.

---

# 16. Dispatcher Disable / Reactivate

Super Admin should be able to disable/re-enable Dispatcher access.

This must happen securely through backend/Admin SDK.

Suggested backend function:

```text
setDispatcherDisabled
```

Disable:

```text
Firebase Auth disabled = true
Firestore accountStatus = "disabled"
```

Enable:

```text
Firebase Auth disabled = false
Firestore accountStatus = "active"
```

Only Super Admin may perform this.

Require confirmation UI before disabling.

Do not hard-delete Dispatcher history just to remove access.

---

# 17. Dispatcher Password Reset

Prefer Firebase password-reset flow instead of exposing passwords.

Possible Super Admin action:

```text
Send Password Reset
```

Use an existing safe Firebase reset-email flow if already available.

Do NOT show or retrieve the Dispatcher's current password.

Passwords are not readable from Firebase Auth.

If custom reset backend is not implemented, document the safe supported approach.

---

# 18. Dispatcher Mobile Login

Preserve the existing generic mobile login.

There should be NO Dispatcher role selector.

Flow:

```text
Email
Password
-> Firebase Auth
-> users/{uid}
-> role == dispatcher
-> account status checks
-> Dispatcher dashboard
```

Dispatcher public registration remains unavailable.

If:

```text
role == "super_admin"
```

on mobile:

```text
block mobile access
show:
"Super Admin access is available through the web portal."
```

---

# 19. Dispatcher Mobile Dashboard

Keep Dispatcher responsibilities simple.

Recommended dashboard:

```text
Pending Applications
Approved Technicians
Rejected Applications

Recent Technician Applications
```

Bottom navigation may be:

```text
Home
Applications
Technicians
Profile
```

Do not add job assignment/dispatch board for the current marketplace architecture.

---

# 20. Technician Approval Workflow

Dispatcher primary flow:

```text
Technician Registers
-> email verified
-> technicianApprovalStatus = "pending"
-> Dispatcher sees application
-> reviews details
-> Approve / Reject
```

Application detail should show:

```text
Full Name
Email
Phone
Specialization
Experience
Qualifications
Certifications
Service Division
Supporting Documents (if implemented)
Application Date
```

Approve:

```text
technicianApprovalStatus = "approved"
reviewedBy = dispatcher UID
reviewedAt = serverTimestamp()
updatedAt = serverTimestamp()
```

Reject:

```text
technicianApprovalStatus = "rejected"
reviewedBy = dispatcher UID
reviewedAt = serverTimestamp()
rejectionReason = required/optional according to current UI
updatedAt = serverTimestamp()
```

Technician must never self-approve.

---

# 21. Super Admin Technician Management

Admin Web should provide a system-level Technician page.

Recommended filters:

```text
All
Pending
Approved
Rejected
```

Display:

```text
Technician
Specialization
Division
Experience
Rating
Approval Status
Created Date
```

Super Admin may:

```text
view Technician records
monitor approval state
view qualifications
view approval reviewer metadata
```

Do not silently replace Dispatcher as the normal Technician reviewer.

If Super Admin approval override is implemented, it must be explicit, audited, and server/rules authorized.

If not needed now, keep Super Admin Technician page read-only for approval workflow.

---

# 22. Customer Management

Admin Web Customer page:

```text
Search Customers
View Customer
View basic profile
View request count
View request history
View account status if implemented
```

Do not expose passwords.

Do not expose unnecessary private data.

Avoid broad edit capabilities unless specifically required.

---

# 23. Service Request Monitoring

Admin Web should be able to view system requests.

Filters:

```text
All
Requested
Accepted
In Progress
Completed
Rejected
Cancelled
```

Display:

```text
Request ID
Customer
Technician
Category
Scheduled Date/Time
Status
Created At
```

Detail:

```text
Customer
Technician
Service details
Schedule
Status timeline
Cancellation / rejection reason
Created / accepted / started / completed timestamps
```

Important:

**Super Admin monitors requests.**

Do NOT reintroduce Dispatcher job assignment.

Current architecture is:

```text
Customer directly selects Technician
```

---

# 24. Reviews Management

Admin Web Reviews page may show:

```text
Customer
Technician
Rating
Comment
Request
Created At
```

Do not modify normal customer ratings unless moderation functionality is explicitly added.

Average Technician ratings must remain based on real reviews.

No fake rating values.

---

# 25. Categories

If service categories are currently hard-coded and not yet managed in Firestore, inspect before changing architecture.

If category management is implemented:

```text
Add Category
Edit Category
Enable / Disable Category
```

Do not break existing request category constants without a migration plan.

Avoid creating duplicate category systems.

---

# 26. Service Areas / Divisions

Admin Web may manage supported service Divisions if the project is ready for dynamic configuration.

Current mobile map is Division-based, not live GPS.

Do not introduce exact Technician location tracking.

Use one canonical Technician field:

```text
serviceDivision
```

If current code uses another canonical field, preserve/migrate deliberately.

---

# 27. Reports

Reports should use real Firestore data.

Possible reports:

```text
Requests by Status
Requests by Category
Requests by Division
Completed Jobs by Month
Technician Activity
Technician Ratings
Customer Activity
```

Do not fabricate analytics.

If efficient reporting requires aggregate backend logic later, document it as TODO.

---

# 28. Audit Logs

Privileged administrative actions should be auditable.

Create/use a collection such as:

```text
audit_logs
```

Recommended fields:

```text
action
actorUid
actorRole
targetUid
targetType
metadata
createdAt
```

Examples:

```text
SUPER_ADMIN_CREATED_DISPATCHER
SUPER_ADMIN_DISABLED_DISPATCHER
SUPER_ADMIN_ENABLED_DISPATCHER
DISPATCHER_APPROVED_TECHNICIAN
DISPATCHER_REJECTED_TECHNICIAN
```

Never store:

```text
passwords
tokens
secrets
full sensitive payloads
```

Audit logs should be append-only for normal clients.

---

# 29. Firestore User Model

General fields:

```text
uid
fullName
email
phone
address
role
emailVerified
accountStatus
createdAt
updatedAt
```

Technician fields:

```text
specialization
experience
qualifications
certifications
serviceDivision
technicianApprovalStatus
reviewedBy
reviewedAt
rejectionReason
```

Dispatcher fields:

```text
role: "dispatcher"
accountStatus
createdBy
mustChangePassword (optional)
```

Super Admin:

```text
role: "super_admin"
accountStatus: "active"
```

Use current existing field names where already established.

Do not create duplicate role/status fields without migration.

---

# 30. Firestore Role Security

Client applications must NEVER be able to self-promote.

A Customer/Technician/Dispatcher must NOT directly change:

```text
role
uid
accountStatus
createdBy
technicianApprovalStatus
reviewedBy
reviewedAt
```

except authorized approval/status flows.

Never allow:

```text
customer -> dispatcher
customer -> super_admin
technician -> dispatcher
technician -> super_admin
dispatcher -> super_admin
technicianApprovalStatus -> approved by Technician
```

Do not solve permission errors by making `users` globally writable.

---

# 31. Admin Read Security

Admin Web may need broader reads than mobile clients.

Firestore rules should permit required Super Admin reads only when:

```text
signed in
AND
requesting user is super_admin
AND
accountStatus is active
```

Do not rely only on hidden UI.

If a privileged backend is a safer fit for sensitive reads, use the backend.

---

# 32. Backend Privilege Model

All high-risk account actions must use Firebase Admin SDK / trusted backend.

Examples:

```text
Create Dispatcher Auth user
Disable Dispatcher Auth user
Enable Dispatcher Auth user
Optional privileged password/reset operations
Potential custom claims
```

Never place Firebase Admin SDK credentials in:

```text
admin-web client bundle
Expo app
public env variables
Git repository
```

---

# 33. Cloud Function / Backend Functions

Use the existing `functions/` folder if suitable.

Minimum suggested privileged function:

```text
createDispatcher
```

Optional functions:

```text
setDispatcherStatus
sendDispatcherPasswordReset
```

Do not create unnecessary functions.

Each privileged function must:

```text
verify Firebase auth
load caller profile server-side
verify role == super_admin
verify active account
validate input
perform action
write audit log
return safe response
```

Technician approval can remain Firestore-rule controlled from Dispatcher if the current secure implementation already works.

---

# 34. Transaction / Failure Handling for Dispatcher Creation

Potential sequence:

```text
create Auth user
-> create Firestore profile
-> write audit log
```

Handle partial failure safely.

If Auth user creation succeeds but Firestore profile creation fails:

- do not pretend success
- attempt safe rollback if practical
- otherwise return a clear recoverable admin error
- log the failure server-side without secrets

Avoid orphan Auth users.

---

# 35. Duplicate Dispatcher Creation

Before creating a Dispatcher:

```text
normalize email
validate required fields
```

If Firebase reports email already exists:

show:

```text
An account with this email already exists.
```

Do not automatically overwrite the existing user's role.

Never convert an existing Customer/Technician into Dispatcher merely because the same email was entered.

---

# 36. Admin UI Design

Use a modern professional ServicePilot admin style.

Recommended:

```text
dark navy / deep neutral surfaces
blue ServicePilot accent
clean sidebar
responsive dashboard
rounded cards
data tables
status chips
search/filter bars
confirmation modals
loading skeletons
clean empty states
```

Desktop-first, responsive enough for tablet/smaller desktop.

Do not copy the mobile layout directly.

---

# 37. Dispatcher Status Chips

Use clear states:

```text
Active
Disabled
```

Technician status:

```text
Pending
Approved
Rejected
```

Request status:

```text
Requested
Accepted
In Progress
Completed
Rejected
Cancelled
```

Keep status labels consistent across Admin Web and mobile apps.

---

# 38. No Mock Data

Search Admin Web for demo content.

Remove any fake:

```text
names
counts
charts
requests
ratings
customers
technicians
dispatchers
```

Use real Firestore data.

If collection is empty, show:

```text
0
No records found
```

not demo records.

---

# 39. Current Request Architecture Must Stay

Do NOT revert ServicePilot to Dispatcher-assigned jobs.

Current request flow:

```text
Customer
-> Browse approved Technician
-> Select Technician
-> Create Request
-> technicianId saved
-> Technician accepts/rejects
-> Start Job
-> Complete
-> Customer Review
```

Dispatcher is only Technician approval/review.

Super Admin monitors system data.

---

# 40. Existing Request Status Model

Current direct-flow statuses:

```text
requested
accepted
rejected
in_progress
completed
cancelled
```

Do not reintroduce:

```text
Dispatcher Review
Technician Assigned
assigned
```

except temporary backward compatibility for old data if required.

---

# 41. Current Technician Request Actions

Preserve current/new functionality:

```text
requested -> accepted
requested -> rejected
accepted -> in_progress
accepted -> cancelled (if implemented)
in_progress -> completed
```

Reason fields may include:

```text
rejectionReason
technicianCancellationReason
customerCancellationReason
cancelledBy
```

Admin Web request detail should show real reasons when present.

---

# 42. Authentication Direction

Preserve Firebase built-in email verification.

Do NOT reconnect:

```text
Cloudflare OTP
Resend OTP
6-digit OTP
```

Old folders/files may remain but must stay inactive.

Do not delete legacy files blindly unless references are verified.

---

# 43. Super Admin Must Stay Web-Only

Mobile app must NOT contain:

```text
Super Admin registration
Super Admin dashboard
Super Admin bottom tab
Super Admin role card
```

If a Super Admin attempts mobile login:

```text
block protected mobile access
show a clean message directing them to the web portal
```

Do not expose an admin URL containing secrets.

---

# 44. Dispatcher Must Not Self-Register

Public role selection must contain only:

```text
Customer
Technician
```

No:

```text
Dispatcher
Admin
Super Admin
```

Even if a malicious client modifies registration payload, Firestore rules must prevent privileged role creation.

---

# 45. Required Security Tests

Test:

```text
Customer cannot create Dispatcher
Technician cannot create Dispatcher
Dispatcher cannot create Dispatcher
Super Admin can create Dispatcher through trusted backend
Unauthenticated user cannot call createDispatcher
Customer calling createDispatcher -> denied
Technician calling createDispatcher -> denied
Dispatcher calling createDispatcher -> denied
Disabled Super Admin -> denied
```

Test role tampering:

```text
customer -> super_admin
customer -> dispatcher
technician -> super_admin
technician -> dispatcher
dispatcher -> super_admin
```

All must fail.

---

# 46. Super Admin Login Tests

Test:

```text
valid Super Admin
wrong password
non-existing account
Customer credentials
Technician credentials
Dispatcher credentials
disabled Super Admin
missing Firestore profile
```

Only active Super Admin reaches dashboard.

---

# 47. Dispatcher Creation Tests

Test:

```text
valid Dispatcher
duplicate email
invalid email
weak password
password mismatch
missing full name
missing phone if required
backend failure
Firestore profile failure
```

After success verify:

```text
Firebase Authentication user exists
users/{uid} exists
role == dispatcher
createdBy == Super Admin UID
accountStatus == active
password is NOT in Firestore
audit log exists
```

---

# 48. Dispatcher Mobile Tests

After Super Admin creates a Dispatcher:

```text
Dispatcher login in mobile
-> Firebase Auth succeeds
-> role resolves as dispatcher
-> Dispatcher dashboard opens
```

Customer/Technician dashboards must not open for Dispatcher.

If verification/change-password policy is active, test those guards too.

---

# 49. Technician Approval Tests

Create/register Technician:

```text
role = technician
technicianApprovalStatus = pending
```

Dispatcher:

```text
sees pending application
opens application
sees qualifications
approves/rejects
```

Approved:

```text
technicianApprovalStatus = approved
```

Customer:

```text
Technician appears in Technician List
Technician appears in Division Map
```

Rejected/Pending:

```text
must NOT appear to Customers
```

---

# 50. Dashboard Data Tests

For empty database sections:

```text
0
No data
```

For populated sections verify counts against Firestore.

Do not calculate system metrics using only currently loaded paginated records unless intentionally documented.

If full aggregate counts require Firebase count aggregation or backend work, use the correct approach or report TODO.

---

# 51. Firestore Indexes

If Admin queries require indexes:

- do not weaken rules
- do not remove filters
- report exact required index
- use Firebase's generated index recommendation where applicable

Possible query combinations include:

```text
users: role + technicianApprovalStatus
users: role + accountStatus
service_requests: status + createdAt
service_reviews: technicianId + createdAt
```

Create only indexes actually needed.

---

# 52. Loading / Empty / Error States

Every Admin Web page must handle:

```text
loading
empty
error
permission denied
network failure
```

Do not leave blank tables.

Do not expose raw Firebase stack traces to normal UI.

Development console logs may contain safe technical details but never passwords/tokens/secrets.

---

# 53. Audit / Logging Safety

Never log:

```text
password
temporary password
ID token
refresh token
service account key
SMTP secret
API key
private user secrets
```

Safe logs may include:

```text
action name
actor UID
target UID
error code
timestamp
```

---

# 54. Implementation Order

Follow this order:

```text
1. Inspect admin-web, functions, Firestore rules, user schema
2. Confirm Super Admin bootstrap strategy
3. Implement Super Admin Web login
4. Implement Super Admin route guard
5. Build Admin layout/sidebar
6. Build real-data Dashboard overview
7. Build Dispatcher list
8. Implement secure createDispatcher backend
9. Build Create Dispatcher form
10. Add Dispatcher activate/disable if feasible
11. Build Technician monitoring page
12. Build Customer monitoring page
13. Build Service Request monitoring
14. Build Reviews page
15. Add Reports using real data
16. Add Audit Logs
17. Update Firestore security rules
18. Add required indexes
19. Test cross-role security
20. Run end-to-end Super Admin -> Dispatcher -> Technician approval flow
```

Do not start by rewriting the mobile app.

---

# 55. Minimum Viable First Milestone

If the whole Admin Portal is too large for one safe change set, complete this milestone first:

```text
Super Admin bootstrap
Super Admin Web Login
Protected Admin Dashboard
Dispatcher List
Create Dispatcher
Secure backend authorization
Dispatcher Firestore profile
Dispatcher mobile login
```

Then continue with the rest.

Do NOT mark the full task complete after only building static UI.

---

# 56. Final End-to-End Flow

The target flow is:

```text
FIRST SETUP

Trusted bootstrap
-> Super Admin Auth account
-> users/{uid}.role = super_admin


NORMAL OPERATION

Super Admin Web Login
        ↓
Dispatcher Management
        ↓
Create Dispatcher
        ↓
Firebase Auth Dispatcher
        ↓
Firestore Dispatcher Profile
        ↓
Dispatcher Mobile Login
        ↓
Pending Technician Applications
        ↓
Review Qualifications
        ↓
Approve Technician
        ↓
Customer Mobile App
        ↓
Approved Technician visible
        ↓
Customer selects Technician
        ↓
Service Request
        ↓
Technician Accept / Start / Complete
        ↓
Customer Review
```

---

# 57. Completion Criteria

Do not mark this task complete unless:

```text
Super Admin cannot self-register publicly
Super Admin can login only through Web Admin
Non-Super-Admins cannot access Admin Web
Dispatcher cannot self-register
Super Admin can create Dispatcher securely
Dispatcher creation does not log out/switch Super Admin session
Dispatcher password is never saved in Firestore
Dispatcher profile has role = dispatcher
Dispatcher can login to mobile
Dispatcher can review Technician applications
Dispatcher can approve/reject Technician
Technician cannot self-approve
Approved Technician appears to Customers
Pending/Rejected Technician does not appear
Customer directly selects Technician
Dispatcher is not required for job assignment
Firestore rules block privilege escalation
Privileged account operations use trusted backend
No mock Admin dashboard data remains
```

---

# 58. Final Codex Instruction

Read this entire AGENTS.md before making any code changes.

First inspect the real implementation.

Do not assume that filenames, frameworks, data fields, or current rules match this document exactly.

Reuse existing code where safe.

Do not rewrite working authentication/mobile modules unnecessarily.

Priorities:

```text
Security
Correct role architecture
Real Firebase data
Minimal regression risk
Clean professional UI
Auditability
```

Important:

- Do NOT create Dispatcher accounts from the normal browser Firebase client Auth SDK.
- Do NOT put Firebase Admin credentials in frontend/mobile code.
- Do NOT make Firestore permissive to bypass errors.
- Do NOT restore old OTP.
- Do NOT add Super Admin to mobile.
- Do NOT reintroduce Dispatcher job assignment.

After implementation, report:

1. Files changed
2. Admin Web framework/structure found
3. Super Admin bootstrap approach
4. Super Admin login/route guard behavior
5. Backend function(s) added
6. Exact `createDispatcher` authorization logic
7. Dispatcher Firestore schema
8. Firestore rule changes
9. Firestore indexes required
10. Audit-log behavior
11. Any Firebase Console/manual setup required
12. Any Blaze/Cloud Functions deployment requirement
13. Exact deploy commands
14. Exact manual test steps
15. Remaining TODOs

Do not report completion if privileged operations are only protected by UI checks.
