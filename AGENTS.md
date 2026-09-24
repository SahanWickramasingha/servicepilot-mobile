# AGENTS.md — ServicePilot Customer Module

## Goal

Build the complete Customer side of the ServicePilot mobile application.

The existing authentication flow is already working and must be preserved.

Customer flow:

```text
Register
-> Verify Email
-> Login
-> Customer Dashboard
```

Do not rebuild authentication unless a real regression is found.

Focus on the Customer experience after successful login.

---

# Customer Module Scope

The Customer side should include:

```text
Customer
├── Home Dashboard
├── Create Service Request
├── My Requests
├── Request Details
├── Service Tracking
├── Notifications
├── Profile
└── Rating / Feedback
```

---

# Navigation

Use a clean bottom navigation suitable for the existing ServicePilot dark UI.

Recommended tabs:

```text
Home
Requests
+ Request
Notifications
Profile
```

Do not create unnecessary tabs.

Preserve the current ServicePilot brand:

- dark navy background
- blue accent
- rounded modern cards
- clean typography
- subtle shadows/glow
- responsive mobile layout

---

# 1. Customer Dashboard

The Customer Dashboard should be the main landing screen after login.

Show:

```text
Welcome, <Customer Name>
```

Use the logged-in Customer profile from Firestore.

Do not hard-code the customer name.

Recommended dashboard sections:

### Summary Cards

```text
Active Requests
Pending Requests
Completed Requests
```

Optional additional card:

```text
Cancelled Requests
```

Counts must come from Firestore data for the logged-in Customer.

### Primary CTA

```text
Request a Service
```

This button should open the Create Service Request screen.

### Recent Requests

Show the latest Customer service requests.

Each card should show:

```text
service category
title
status
date
assigned technician if available
```

Tapping a request should open Request Details.

---

# 2. Firestore Service Request Model

Create/reuse a Firestore collection:

```text
service_requests/{requestId}
```

Recommended fields:

```text
customerId
customerName
customerEmail
customerPhone

serviceCategory
title
description

address
serviceArea

preferredDate
preferredTime

priority
status

assignedTechnicianId
assignedTechnicianName

assignedDispatcherId

imageUrls

createdAt
updatedAt
```

Use Firebase server timestamps.

Do not trust client-supplied privileged assignment fields.

A Customer must NOT be able to manually assign:

```text
assignedTechnicianId
assignedDispatcherId
```

Those should be controlled by Dispatcher/admin-authorized workflows.

---

# 3. Request Status Model

Use consistent status values.

Recommended:

```text
pending
assigned
in_progress
completed
cancelled
```

If the current project already uses different values, preserve the existing terminology instead of creating duplicates.

Suggested Customer-facing labels:

```text
pending      -> Pending
assigned     -> Technician Assigned
in_progress  -> In Progress
completed    -> Completed
cancelled    -> Cancelled
```

Avoid mismatched status strings across screens.

---

# 4. Priority

Recommended values:

```text
normal
urgent
```

If an existing priority system already exists, reuse it.

Do not allow Customers to create arbitrary priority strings.

---

# 5. Create Service Request Screen

Create a professional Customer form.

Recommended fields:

```text
Service Category
Problem Title
Description
Address / Service Location
Preferred Date
Preferred Time
Priority
Photo Upload (optional)
```

Use current Customer profile data where useful.

For example:

```text
default address from Customer profile
```

but allow editing the request-specific service location.

### Validation

Require:

```text
serviceCategory
title
description
address
preferredDate
```

Prevent empty or invalid requests.

Show inline validation or clean user-facing errors.

### Submit Flow

Expected:

```text
Customer fills form
-> Validate fields
-> Upload optional images if implemented
-> Create Firestore service_requests document
-> status = "pending"
-> customerId = current Firebase UID
-> createdAt = server timestamp
-> updatedAt = server timestamp
-> show success state
-> navigate to Request Details or My Requests
```

Do not let the client specify privileged assignment fields.

---

# 6. Service Categories

Use existing categories if the project already defines them.

If not, create a clean initial list such as:

```text
Electrical
Plumbing
Air Conditioning
Appliance Repair
IT / Computer Support
General Maintenance
Other
```

Keep categories centralized in a constants/config file rather than duplicating strings in multiple screens.

---

# 7. My Requests Screen

Show only requests belonging to the logged-in Customer.

Query by:

```text
customerId == currentUser.uid
```

Recommended views/filters:

```text
All
Pending
In Progress
Completed
Cancelled
```

Do not expose other Customers' requests.

Each request card should show:

```text
category
title
status
created date
preferred date/time
technician name if assigned
```

Tapping a request opens Request Details.

---

# 8. Request Details Screen

Show complete request information:

```text
Service Category
Title
Description
Service Address
Preferred Date
Preferred Time
Priority
Current Status
Created Date
Assigned Technician
Attachments / Images
```

If no Technician is assigned yet:

```text
Waiting for technician assignment
```

Do not show `undefined`, `null`, or empty raw values in the UI.

---

# 9. Service Tracking Timeline

Provide a simple visual timeline.

Expected lifecycle:

```text
Request Submitted
        ↓
Dispatcher Review
        ↓
Technician Assigned
        ↓
Work In Progress
        ↓
Completed
```

Map backend status to the timeline.

Do not fake statuses that are not present in Firestore.

---

# 10. Cancel Request

A Customer may cancel a request only when appropriate.

Recommended:

```text
pending
```

Optionally:

```text
assigned
```

if business rules allow it.

Do NOT allow cancellation after:

```text
in_progress
completed
```

Cancellation should update:

```text
status = "cancelled"
updatedAt = server timestamp
```

---

# 11. Notifications

Customer notifications should eventually support events such as:

```text
Request submitted
Technician assigned
Schedule updated
Work started
Request completed
Request cancelled
```

Recommended Firestore collection:

```text
notifications/{notificationId}
```

Possible fields:

```text
userId
type
title
message
relatedRequestId
read
createdAt
```

Only show notifications where:

```text
userId == currentUser.uid
```

Do not expose notifications belonging to another user.

---

# 12. Customer Profile

Show:

```text
Full Name
Email
Phone
Address
Role
Email Verification Status
```

Allow editing safe profile fields such as:

```text
fullName
phone
address
```

Do NOT allow Customer to edit:

```text
uid
role
emailVerified
technicianApprovalStatus
admin fields
```

---

# 13. Password / Account Actions

Profile screen may include:

```text
Change Password / Forgot Password
Logout
```

Use Firebase Authentication.

Do not build custom password storage.

---

# 14. Rating / Feedback

After a request is completed, allow Customer to submit feedback.

Recommended fields:

```text
rating: 1–5
comment
requestId
customerId
technicianId
createdAt
```

Possible collection:

```text
service_reviews/{reviewId}
```

Prevent multiple reviews for the same completed request unless editing is explicitly allowed.

Only completed requests should be reviewable.

---

# 15. Dashboard Counts

Counts must be based on the logged-in Customer's requests.

Examples:

```text
Active Requests:
status in ["pending", "assigned", "in_progress"]

Pending Requests:
status == "pending"

Completed Requests:
status == "completed"
```

Do not calculate counts from all users' requests.

---

# 16. Real-time Updates

Where practical, use Firestore real-time listeners for:

```text
request status
assigned technician
notifications
dashboard request counts
```

Clean up subscriptions correctly when screens unmount.

---

# 17. Loading / Empty / Error States

Every main Customer screen should handle:

```text
loading
empty
error
success
```

Examples:

```text
No service requests yet.
Need help with something?
Create your first service request.
```

```text
You're all caught up.
```

Do not leave blank screens.

---

# 18. Firestore Security

This is critical.

A Customer should be able to:

```text
create their own service request
read their own service requests
update only allowed Customer-controlled fields where permitted
read their own notifications
edit safe profile fields
create a review for their own completed request
```

A Customer must NOT be able to:

```text
read another Customer's request
assign a Technician
assign a Dispatcher
change privileged request status arbitrarily
change their own role
set emailVerified manually
approve Technicians
edit another user's notifications
create reviews for someone else's request
```

Do not rely only on hidden UI.

Firestore rules must enforce authorization.

---

# 19. Status Write Security

Customers should not have unrestricted write access to:

```text
status
assignedTechnicianId
assignedTechnicianName
assignedDispatcherId
```

If cancellation is allowed, restrict the allowed transition specifically.

Example:

```text
pending -> cancelled
```

Do not allow:

```text
pending -> completed
pending -> in_progress
customer assigns technician
```

---

# 20. Authentication Guard

Customer routes require:

```text
Firebase authenticated user
AND
Firestore user profile exists
AND
role === "customer"
AND
emailVerified === true
```

Do not allow Technician, Dispatcher, Super Admin, or unverified users to access Customer-only screens.

---

# 21. Suggested Folder Structure

Use the current Expo Router structure.

Do not reorganize unnecessarily.

Possible structure:

```text
app/
  (customer)/
    _layout.tsx
    index.tsx
    requests/
      index.tsx
      [id].tsx
    create-request.tsx
    notifications.tsx
    profile.tsx
```

Use actual existing routes if Customer files already exist.

Do not create duplicate screens.

---

# 22. Suggested Service Layer

Prefer reusable service modules.

Possible:

```text
src/services/request.service.ts
src/services/notification.service.ts
src/services/review.service.ts
```

Do not place all Firestore logic directly inside UI components if a service layer already exists.

---

# 23. UI Requirements

Preserve existing ServicePilot design.

Use:

```text
dark navy backgrounds
blue primary CTA
rounded cards
consistent spacing
modern icons
clean status badges
responsive layout
```

Reuse existing logo, colors, fonts, and component patterns where available.

---

# 24. Immediate Implementation Order

Implement in this order:

```text
1. Customer route/layout protection
2. Customer Dashboard
3. Firestore service_requests model/service
4. Create Service Request
5. My Requests
6. Request Details
7. Service Tracking
8. Notifications
9. Customer Profile
10. Rating / Feedback
```

Do not attempt unrelated Dispatcher/Super Admin redesigns during this task.

---

# 25. Files To Inspect First

Inspect the project before editing.

Find actual files for:

```text
Customer dashboard
Customer route/layout
Existing request screens
Existing request services
Firebase config
User service
Auth/session context
Firestore rules
Theme/colors/components
```

Also inspect:

```text
app/_layout.tsx
src/firebase/config.ts
src/services/user.service.ts
firestore.rules
```

Use real existing filenames.

---

# 26. Required Tests

## Customer Login

```text
verified Customer -> Customer Dashboard
unverified Customer -> blocked
Technician -> Customer route blocked
Dispatcher -> Customer route blocked
```

## Create Request

```text
valid request -> created
missing required field -> blocked
customerId set from authenticated UID
status defaults to pending
createdAt uses server timestamp
privileged assignment fields not client-controlled
```

## My Requests

```text
only current Customer requests shown
filters work
empty state works
request card opens details
```

## Request Details

```text
own request opens
another Customer request blocked
technician assignment renders correctly
status renders correctly
```

## Cancellation

```text
allowed status -> cancel works
in_progress -> cancel blocked
completed -> cancel blocked
```

## Notifications

```text
only own notifications shown
mark read works if implemented
empty state works
```

## Profile

```text
safe fields editable
role not editable
emailVerified not editable
logout works
```

## Feedback

```text
completed request can be reviewed
active request cannot be reviewed
customer cannot review another user's request
duplicate review prevented if required
```

---

# 27. Final Codex Task

Read this entire `AGENTS.md` first.

Then:

1. Inspect the existing Customer-side implementation.
2. Preserve existing authentication.
3. Build Customer route protection.
4. Build a modern Customer Dashboard.
5. Implement service request creation.
6. Implement My Requests.
7. Implement Request Details.
8. Implement service tracking/status timeline.
9. Implement Customer notifications UI/data flow.
10. Implement Customer profile editing with safe-field restrictions.
11. Implement completed-request rating/feedback.
12. Update Firestore rules only as needed, without weakening security.
13. Reuse existing UI components/theme.
14. Make the smallest clean changes.
15. Report every changed file and why.
16. Report Firestore collections/fields added.
17. Report any indexes required.
18. Provide exact manual test steps.
19. Do not alter Technician approval architecture.
20. Do not create mobile Super Admin functionality.

Do not mark the task complete unless:

```text
Customer can login securely.
Customer Dashboard works.
Customer can create a service request.
Customer sees only their own requests.
Customer can open request details.
Status tracking works.
Customer can cancel only when allowed.
Notifications are scoped to the Customer.
Profile editing is safe.
Completed requests can be reviewed.
Firestore authorization prevents cross-user access and privilege escalation.
```
