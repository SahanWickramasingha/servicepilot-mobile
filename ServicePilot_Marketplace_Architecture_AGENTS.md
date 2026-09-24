# AGENTS.md — ServicePilot Marketplace Architecture Update

## Goal

Refactor ServicePilot into a simple service marketplace.

Final behavior:

- Customers browse approved Technicians.
- Customers filter Technicians by service category.
- Customers view Technicians by Division on a map-style screen.
- Customers select a Technician directly and send a service request.
- Customers can view request history and profile.
- Dispatchers only review Technician applications/qualifications and approve or reject them.
- Dispatchers do NOT assign normal service jobs.
- Super Admin remains web-only.
- Preserve the existing working authentication flow.

Do not rebuild authentication unless a real regression is found.

---

# 1. Final Role Architecture

## Customer

Main navigation:

```text
Home
Technicians
Map
Requests
Profile
```

Flow:

```text
Register
-> Verify Email
-> Login
-> Home
-> Choose Category
-> Browse Approved Technicians
-> View Technician Profile
-> Select Technician
-> Create Request
-> Technician Accept / Reject
-> In Progress
-> Completed
-> Customer Review
```

## Technician

```text
Register
-> Verify Email
-> Submit Professional Details
-> technicianApprovalStatus = "pending"
-> Dispatcher Reviews
-> Approve / Reject
-> Approved Technician appears to Customers
-> Receives direct Customer requests
-> Accept / Reject
-> In Progress
-> Completed
```

## Dispatcher

Dispatcher responsibilities must be intentionally limited to:

```text
View pending Technician applications
View Technician qualifications
View certifications
View experience
View service division
View uploaded supporting documents
Approve Technician
Reject Technician
```

Dispatcher must NOT:

```text
Assign Technicians to jobs
Assign Customers to Technicians
Manage normal service request ownership
Act as Super Admin
```

## Super Admin

Super Admin is web-only.

Do not add mobile Super Admin routes.

---

# 2. Customer Home

Build a modern marketplace-style home page.

Recommended sections:

```text
Welcome, <Customer Name>

Search Services / Technicians

Service Categories

Top Rated Technicians

Same Division Technicians

Recent Requests
```

Service categories should be clean cards/icons.

Recommended categories:

```text
Electrical
Plumbing
Air Conditioning
Appliance Repair
IT / Computer Support
General Maintenance
Other
```

When a category is tapped:

```text
Category
-> Technician List filtered by specialization/category
```

Only approved Technicians may appear.

---

# 3. Customer Bottom Navigation

Use:

```text
Home
Technicians
Map
Requests
Profile
```

Notifications should not require a separate bottom tab unless the current project truly needs one.

Use a bell icon/badge or nested notifications screen if already implemented.

---

# 4. Technician List

Create/refactor a dedicated Technician browsing screen.

Customer should be able to:

```text
view approved Technicians
filter by category
filter by division
view ratings
open Technician profile
select Technician
```

Only show:

```text
role == "technician"
AND
technicianApprovalStatus == "approved"
```

Recommended Technician card:

```text
Profile Photo
Technician Name
Specialization
⭐ Rating (Review Count)
Experience
Service Division

[View Profile]
```

Example:

```text
Kasun Perera
Electrician
⭐ 4.8 (32 reviews)
5 Years Experience
Walapane Division

[View Profile]
```

Pending/rejected Technicians must never appear.

---

# 5. Technician Profile

Technician profile should show:

```text
Profile Photo
Full Name
Specialization
Average Rating
Review Count
Experience
Qualifications
Certifications
Service Division
Completed Jobs
Customer Reviews
Availability if already supported
```

Primary CTA:

```text
Request Service
```

Flow:

```text
Request Service
-> selected Technician preserved
-> Create Request screen
```

Do not allow requests to pending/rejected Technicians.

---

# 6. Map Screen

Customer must have a map-style screen.

Important scope:

- Do NOT implement live GPS tracking yet.
- Do NOT expose exact Technician current/home location.
- Show Technician availability by Division only.

Recommended representation:

```text
Walapane       👨‍🔧 4
Hanguranketha  👨‍🔧 3
Nuwara Eliya   👨‍🔧 7
```

Each Division marker/card should show:

```text
Division Name
Approved Technician Count
Technician icon/marker
```

Tap:

```text
Walapane Division
4 Technicians Available

[View Technicians]
```

Then open Technician List filtered by that Division.

Only approved Technicians count.

---

# 7. Direct Customer -> Technician Requests

This architecture no longer uses Dispatcher job assignment.

Customer directly chooses the Technician.

Flow:

```text
Customer
-> Select Technician
-> Create Request
-> Request saved with technicianId
-> Technician receives request
```

Review old fields such as:

```text
assignedDispatcherId
assignedTechnicianId
```

Do not blindly delete them if old data depends on them.

For new flow, prefer a consistent direct reference:

```text
technicianId
technicianName
```

---

# 8. Service Request Model

Use/reuse:

```text
service_requests/{requestId}
```

Recommended fields:

```text
customerId
customerName
customerEmail
customerPhone

technicianId
technicianName

serviceCategory
title
description

address
division

preferredDate
preferredTime

priority
status

imageUrls

createdAt
updatedAt
acceptedAt
rejectedAt
startedAt
completedAt
cancelledAt
```

Use server timestamps.

---

# 9. Request Status Model

Use direct-request lifecycle:

```text
requested
accepted
rejected
in_progress
completed
cancelled
```

Customer-facing labels:

```text
requested    -> Requested
accepted     -> Accepted
rejected     -> Rejected
in_progress  -> In Progress
completed    -> Completed
cancelled    -> Cancelled
```

Do not keep conflicting status systems.

If old data uses:

```text
pending
assigned
```

create a safe compatibility mapping instead of breaking old records immediately.

---

# 10. Create Request Screen

Customer should normally reach Create Request after selecting a Technician.

Flow:

```text
Choose Category
-> Browse Technicians
-> View Technician Profile
-> Request Service
-> Create Request
```

Show selected Technician clearly:

```text
Selected Technician
Kasun Perera
Electrician
⭐ 4.8
Walapane Division
```

Form:

```text
Service Category
Problem Title
Description
Address
Division
Preferred Date
Preferred Time
Priority
Photo Upload optional/future
```

Required:

```text
technicianId
serviceCategory
title
description
address
preferredDate
```

Submit:

```text
customerId = current Firebase UID
technicianId = selected approved Technician UID
status = "requested"
createdAt = server timestamp
updatedAt = server timestamp
```

Do not allow Customer to type arbitrary Technician IDs manually.

---

# 11. Technician Request Handling

Approved Technician sees only requests where:

```text
technicianId == currentUser.uid
```

Allowed transitions:

```text
requested -> accepted
requested -> rejected
accepted -> in_progress
in_progress -> completed
```

Technician must NOT:

```text
edit another Technician's requests
change customerId
change technicianId
approve themselves
edit Customer reviews
```

---

# 12. Customer Request History

Requests screen is Customer request history.

Show only:

```text
customerId == currentUser.uid
```

Filters:

```text
All
Requested
Accepted
In Progress
Completed
Cancelled
Rejected
```

Each card:

```text
Service Category
Technician Name
Request Date
Preferred Date/Time
Status
```

Tap to open Request Details.

---

# 13. Request Details / Timeline

Show:

```text
Technician
Service Category
Title
Description
Address
Division
Preferred Date
Preferred Time
Priority
Status
Created Date
Images if available
```

Normal timeline:

```text
Request Sent
-> Technician Accepted
-> Work In Progress
-> Completed
```

Rejected:

```text
Request Sent
-> Rejected
```

Cancelled:

```text
Request Sent
-> Cancelled
```

Do not fake states.

---

# 14. Customer Cancellation

Recommended Customer transition:

```text
requested -> cancelled
```

Optionally allow:

```text
accepted -> cancelled
```

only if the product explicitly wants it.

Never allow Customer cancellation after:

```text
in_progress
completed
```

Firestore rules must enforce the transition.

---

# 15. Ratings / Reviews

Reuse existing:

```text
service_reviews
```

Recommended fields:

```text
requestId
customerId
technicianId
rating
comment
createdAt
```

Rules:

```text
Customer owns request
Request status == completed
technicianId matches request technicianId
rating between 1 and 5
one review per request
```

Technician average rating should be derived from reviews.

Do not allow Technician to edit Customer ratings.

---

# 16. Technician Public Profile Data

Recommended public-safe Technician fields:

```text
uid
fullName
profilePhotoUrl
specialization
experience
qualifications
certifications
serviceDivision
technicianApprovalStatus
averageRating
reviewCount
completedJobs
```

Do NOT expose unnecessary private/internal data such as:

```text
rejectionReason
dispatcher internal notes
admin metadata
private qualification document URLs
```

Dispatcher may see supporting documents.

Customers should see only safe qualification/certification summaries.

---

# 17. Division Model

Choose one canonical Technician division field.

Prefer:

```text
serviceDivision
```

Inspect existing project data first.

Do not create conflicting fields such as:

```text
division
serviceArea
serviceAreas
serviceDivision
```

without a migration plan.

Map and filters should use the same canonical Division field.

---

# 18. Dispatcher Dashboard

Simplify Dispatcher dashboard.

Recommended cards:

```text
Pending Applications
Approved Technicians
Rejected Applications
```

Main section:

```text
Pending Technician Applications
```

Remove/avoid normal job-assignment workflows from Dispatcher.

---

# 19. Technician Approval

Dispatcher application review should show:

```text
Technician Name
Email
Phone
Specialization
Experience
Qualifications
Certifications
Service Division
Uploaded Supporting Documents
Application Date
```

Actions:

```text
Approve
Reject
```

Approve:

```text
technicianApprovalStatus = "approved"
reviewedBy = dispatcher UID
reviewedAt = server timestamp
```

Reject:

```text
technicianApprovalStatus = "rejected"
reviewedBy = dispatcher UID
reviewedAt = server timestamp
rejectionReason = optional reason
```

Technician must never self-approve.

---

# 20. Firestore Security

## Customer may:

```text
read public-safe approved Technician profiles
create own request to an approved Technician
read own requests
cancel only allowed own requests
read own reviews
create review for own completed request
edit safe Customer profile fields
```

## Customer may NOT:

```text
read pending/rejected Technician private application data
approve Technician
change technicianApprovalStatus
mark request completed/in_progress
modify another Customer's request
send request as another Customer
target non-approved Technician
edit another user's review
```

## Technician may:

```text
read own direct requests
requested -> accepted
requested -> rejected
accepted -> in_progress
in_progress -> completed
read Customer details needed for own job
```

## Technician may NOT:

```text
approve themselves
read another Technician's jobs
change customerId
change technicianId
edit reviews
```

## Dispatcher may:

```text
read Technician applications
approve/reject Technician applications
```

Dispatcher should not receive broad unnecessary write access to Customer requests.

---

# 21. Query / Index Considerations

Likely queries:

```text
users:
role == technician
technicianApprovalStatus == approved
specialization == selectedCategory
serviceDivision == selectedDivision

service_requests:
customerId == currentUser.uid
technicianId == currentUser.uid

service_reviews:
technicianId == selectedTechnicianId
```

If Firestore requests a composite index, document the exact index required.

Do not create unnecessary indexes.

---

# 22. Navigation Structure

Use the current Expo Router structure.

Possible Customer tabs:

```text
app/(tabs)/
  index.tsx
  technicians.tsx
  map.tsx
  requests.tsx
  profile.tsx
```

Possible nested screens:

```text
app/technician/[id].tsx
app/request/create.tsx
app/request/[id].tsx
```

Use actual existing files if equivalents already exist.

Do not create duplicate screens.

---

# 23. UI Requirements

Preserve ServicePilot design:

```text
dark navy background
blue primary accents
rounded cards
modern icons
consistent spacing
clean status chips
modern typography
responsive layouts
```

Customer Home should feel like a modern service marketplace.

Use:

```text
category cards
technician cards
rating stars
profile cards
division/map markers
clear CTA buttons
```

Do not redesign working authentication unnecessarily.

---

# 24. Existing Customer Module

The project already has:

```text
Customer Dashboard
Create Request
My Requests
Request Details
Status Tracking
Notifications
Profile
Edit Profile
Rating / Feedback
```

Existing service files include:

```text
src/services/request.service.ts
src/services/notification.service.ts
src/services/review.service.ts
src/constants/serviceRequests.ts
```

Existing Firestore rules already contain logic for:

```text
service_requests
notifications
service_reviews
```

Reuse/refactor working code.

Old request flow:

```text
Customer creates request
-> Dispatcher assignment concept
```

New request flow:

```text
Customer selects approved Technician
-> Customer creates request for that Technician
-> Technician handles request directly
```

Migrate carefully.

---

# 25. Authentication Must Stay

Preserve:

Customer access:

```text
authenticated
role == customer
emailVerified == true
```

Technician access:

```text
authenticated
role == technician
emailVerified == true
technicianApprovalStatus == approved
```

Dispatcher access:

```text
authenticated
role == dispatcher
```

Super Admin:

```text
web only
```

Do not reconnect the old OTP system.

---

# 26. Old OTP Must Stay Inactive

Old files may still exist:

```text
servicepilot-otp/
src/services/otp.service.ts
```

Do NOT restore:

```text
Cloudflare OTP
Resend OTP
6-digit OTP
```

Preserve current Firebase email verification flow.

---

# 27. Photo Upload / GPS Scope

Photo upload:

- current placeholder may remain
- real Firebase Storage integration can be handled separately
- do not break request creation

GPS:

- real live tracking is NOT required now
- map is Division-based only
- never expose exact live/home location

---

# 28. Implementation Order

Follow this order:

```text
1. Inspect current files/schema/rules
2. Update Customer navigation
3. Update Home with Categories + Top Rated + Same Division + Recent Requests
4. Build/refactor Technician List
5. Build Technician Profile
6. Build Division Map screen
7. Refactor Create Request to require selected Technician
8. Update request status model
9. Update Customer Request History
10. Update Request Details/timeline
11. Add/update Technician incoming request handling
12. Simplify Dispatcher to Technician approval only
13. Update Firestore rules
14. Add only required indexes
15. Test end-to-end
```

Do not start by deleting old files.

Inspect dependencies first.

---

# 29. Required Tests

## Customer Home

```text
Customer name loads
Categories load
Only approved Technicians appear
Top Rated list works
Same Division list works
Recent Requests work
```

## Technician List

```text
Only approved Technicians shown
Category filter works
Division filter works
Profile opens
```

## Map

```text
Division markers/cards load
Only approved Technician counts used
No exact GPS exposed
Tap division -> filtered Technician list
```

## Technician Profile

```text
Professional details shown
Ratings/reviews shown
Request Service works
Pending/rejected Technician inaccessible
```

## Create Request

```text
Selected Technician preserved
Current Customer UID used
status = requested
technicianId matches selected approved Technician
server timestamps used
```

## Technician

```text
Only own requests visible
requested -> accepted works
requested -> rejected works
accepted -> in_progress works
in_progress -> completed works
cannot edit another Technician request
```

## Request History

```text
Only Customer's own requests
Technician name shown
Statuses correct
Request Details open
```

## Reviews

```text
Completed request can be reviewed
Only own completed request
One review per request
Rating 1-5
Technician rating display updates correctly or TODO documented
```

## Dispatcher

```text
Pending applications visible
Qualifications visible
Approve works
Reject works
Dispatcher does not assign normal jobs
```

## Security

Verify:

```text
Customer cannot approve Technician
Customer cannot read another Customer request
Customer cannot manually mark completed
Technician cannot read another Technician's jobs
Technician cannot change technicianId/customerId
Pending Technician not visible to Customers
Rejected Technician not visible to Customers
```

---

# 30. Final Codex Instruction

Read this entire AGENTS.md before editing.

Inspect the real project first.

Do not assume filenames or schema without checking.

Make the smallest clean refactor that converts ServicePilot from a Dispatcher-assigned job system into a Customer-selected Technician marketplace.

Final target:

```text
CUSTOMER

Home
├── Categories
├── Top Rated Technicians
├── Same Division Technicians
└── Recent Requests

Technicians
├── Category Filter
├── Division Filter
├── Ratings
└── Technician Profile

Map
└── Approved Technicians by Division

Requests
├── Direct Technician Requests
└── Request History

Profile
```

```text
TECHNICIAN

Approved Technician
├── Incoming Requests
├── Accept / Reject
├── In Progress
├── Complete
└── Profile
```

```text
DISPATCHER

Technician Applications
├── Check Qualifications
├── Check Certifications
├── Check Experience
├── Check Division
├── Approve
└── Reject
```

Dispatcher must NOT be responsible for normal service job assignment.

After implementation report:

1. Every file changed
2. Why each file changed
3. Firestore schema changes
4. Status model changes
5. Firestore rule changes
6. Firestore indexes required
7. Backward-compatibility handling
8. TODOs
9. Exact manual testing steps

Do not mark complete unless the direct Customer -> Technician request flow works securely end-to-end.
