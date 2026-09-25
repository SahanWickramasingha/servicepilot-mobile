# AGENTS.md — ServicePilot Division Map UI

## Goal

Implement the Customer `Map` tab for ServicePilot as a free Division-based Technician map.

This task must NOT use:

- Google Maps
- paid map APIs
- live GPS tracking
- exact Technician home/current locations

Use the existing ServicePilot dark UI and `react-native-svg`.

The map is only for showing approved Technicians by service Division.

---

# 1. Current Product Architecture

Customer bottom navigation must remain:

```text
Home
Technicians
Map
Requests
Profile
```

Current marketplace flow:

```text
Customer
-> Browse approved Technicians
-> Filter by Category / Division
-> View Technician Profile
-> Select Technician
-> Create Service Request
```

Dispatcher is NOT responsible for normal service job assignment.

Dispatcher only reviews Technician qualifications and approves/rejects Technician applications.

Do not change this architecture while implementing the map.

---

# 2. Map Scope

The Map tab should show Technician availability by Division only.

Example concept:

```text
Technicians by Division

[ Search Division ]

        Sri Lanka Map

     Kandy
     👨‍🔧 4

          Walapane
          👨‍🔧 3

     Nuwara Eliya
     👨‍🔧 6
```

Do not expose:

```text
exact GPS
live Technician position
home address coordinates
route tracking
```

---

# 3. Technology

Use:

```text
react-native-svg
```

If not installed:

```powershell
npx expo install react-native-svg
```

Do not add Google Maps or a paid map SDK.

---

# 4. Files To Inspect First

Before editing, inspect the existing project and find the real files for:

```text
app/(tabs)/map.tsx
Technician list screen
Technician profile screen
technician.service / user service
Firebase config
Firestore rules
theme/colors/components
Expo Router navigation
```

Also inspect:

```text
src/services/
src/constants/
firestore.rules
```

Do not create duplicate services if Technician query logic already exists.

---

# 5. Approved Technician Query

Customer Map must show only approved Technicians.

Every map/list query must enforce:

```text
role == "technician"
technicianApprovalStatus == "approved"
```

Do not include:

```text
pending
rejected
unverified
non-technician users
```

If Firestore rules require the same query constraints, keep the query and rules aligned.

Do not weaken security just to make the query work.

---

# 6. Canonical Division Field

Inspect the current Technician schema first.

Use ONE canonical Technician division field.

Preferred field:

```text
serviceDivision
```

Do not create several conflicting fields such as:

```text
division
serviceArea
serviceAreas
serviceDivision
```

without a migration plan.

If the current project already has a canonical equivalent, reuse it.

---

# 7. Division Grouping

Approved Technicians should be grouped by:

```text
serviceDivision
```

Example:

```text
Walapane -> 3 approved Technicians
Kandy -> 4 approved Technicians
Nuwara Eliya -> 6 approved Technicians
```

The map should calculate Technician counts from Firestore data.

Do not hard-code counts.

---

# 8. Division Data File

Create a centralized Division map config only if needed.

Suggested file:

```text
src/constants/divisions.ts
```

Possible shape:

```ts
export type DivisionMapItem = {
  id: string;
  name: string;
  x: number;
  y: number;
};

export const DIVISIONS: DivisionMapItem[] = [
  {
    id: "walapane",
    name: "Walapane",
    x: 64,
    y: 48,
  },
];
```

Important:

`x` and `y` are visual SVG positions only.

They are NOT GPS coordinates.

Add only verified/needed Division names.

Do not invent exact geographic boundaries.

---

# 9. Map UI

Build a polished ServicePilot map screen.

Recommended layout:

```text
Map Header

Technicians by Division
Find approved ServicePilot professionals by service area.

[ Search Division ]

[ SVG Map Area ]

Selected Division Card
```

Use:

```text
dark navy background
blue accent
rounded cards
subtle borders
modern icons
clean typography
responsive spacing
```

Preserve the existing ServicePilot theme.

---

# 10. Division Marker

For each Division with approved Technicians, show a marker.

Recommended marker content:

```text
3
👨‍🔧
Walapane
```

Or equivalent ServicePilot iconography.

Marker should communicate:

```text
Division Name
Approved Technician Count
```

Do not show misleading availability markers where Technician count is zero.

---

# 11. Marker Interaction

When Customer taps a Division marker:

- keep the marker selected
- visually highlight selected marker
- show a bottom/section card

Example:

```text
Walapane Division

3 Approved Technicians

Kasun Perera
Electrical
⭐ 4.8

Nimal Silva
Plumbing
⭐ 4.6

[ View All Technicians ]
```

Show up to 3 top-rated approved Technicians in the selected Division.

---

# 12. View All Technicians

`View All Technicians` must navigate to the existing Technician List screen.

The Technician List should open with the selected Division filter already applied.

Example:

```text
Map
-> Walapane
-> View All Technicians
-> Technicians screen
-> Division filter = Walapane
```

Reuse Expo Router query/search params or existing navigation pattern.

Do not create a second Technician List screen.

---

# 13. Search Division

Add a search field above the map.

Example:

```text
Search Division
```

Typing:

```text
Walapane
```

should filter or highlight the matching Division.

If the matching Division has no approved Technicians, show a clean empty state.

Do not show fake availability.

---

# 14. Top Rated Logic

Inside the selected Division card:

- sort approved Technicians by rating descending
- show up to 3
- if rating is missing, handle gracefully
- do not show `undefined` or `NaN`

Possible fields:

```text
averageRating
reviewCount
```

If the project derives ratings from `service_reviews` instead, reuse the existing rating logic.

Do not create a conflicting rating system.

---

# 15. Empty / Loading / Error States

The Map screen must support:

```text
loading
empty
error
selected division
search with no result
```

Examples:

### No approved Technicians

```text
No approved technicians are available yet.
```

### Division empty

```text
No approved technicians are currently available in this division.
```

### Firestore error

Show a concise ServicePilot error state.

Do not leave the screen blank.

---

# 16. Firestore Security

Customer should be able to read only public-safe approved Technician profile data.

Customer must NOT gain access to:

```text
pending Technician applications
rejected Technician applications
private qualification documents
dispatcher notes
rejection reasons
admin metadata
```

If the current `users` document mixes public and private data, inspect the existing rules carefully.

Do not make the full `users` collection publicly readable.

---

# 17. Technician Public Fields

The map and Technician cards may use safe public fields such as:

```text
uid
fullName
profilePhotoUrl
specialization
experience
serviceDivision
averageRating
reviewCount
completedJobs
technicianApprovalStatus
```

Only approved Technician profiles should be visible.

Do not expose sensitive/internal fields.

---

# 18. Firestore Indexes

Possible query patterns:

```text
role == technician
technicianApprovalStatus == approved
serviceDivision == selectedDivision
```

and possibly:

```text
specialization == selectedCategory
```

If Firestore reports a composite-index requirement:

- do not weaken Firestore rules
- report the exact index
- use the Firebase-provided index link or exact fields

Do not create random indexes.

---

# 19. Suggested Component Structure

Use existing project structure first.

If new components are needed, suggested organization:

```text
src/components/map/
  DivisionMap.tsx
  DivisionMarker.tsx
  DivisionTechnicianCard.tsx
```

Possible config:

```text
src/constants/divisions.ts
```

Do not over-engineer.

---

# 20. Map Visual Strategy

Initial version should be simple and reliable.

Recommended:

```text
SVG Sri Lanka silhouette / service-region graphic
+
Division markers
+
Technician counts
```

If no accurate Sri Lanka boundary asset exists in the project, use a clean schematic map area and clearly keep it as a Division availability visualization.

Do not fabricate exact Divisional Secretariat boundaries.

Do not claim schematic marker positions are exact geographic coordinates.

---

# 21. No Live Tracking

This task does NOT include:

```text
real GPS
Technician current location
Customer live location
route navigation
ETA
distance calculation
live map movement
```

Those may be added later.

---

# 22. Preserve Existing Features

Do not break:

```text
authentication
email verification
Customer profile
Technician approval
Technician List
Technician Profile
service requests
request history
reviews
```

Map implementation must integrate with existing marketplace flow.

---

# 23. Runtime Permission Issue

If Technician Map/List currently logs:

```text
FirebaseError: Missing or insufficient permissions
```

inspect:

```text
firestore.rules
Technician queries
approved Technician filtering
```

Customer-side Technician queries should align with rules:

```text
role == "technician"
technicianApprovalStatus == "approved"
```

Do NOT solve this by making all users readable.

---

# 24. Required Tests

## Empty State

```text
0 approved Technicians
-> Map loads
-> no fake markers
-> clean empty state
```

## One Technician

Firestore Technician:

```text
role = technician
technicianApprovalStatus = approved
serviceDivision = Walapane
```

Expected:

```text
Walapane marker appears
count = 1
```

## Multiple Technicians

Add several approved Technicians in the same Division.

Expected:

```text
count updates automatically
top-rated card shows correct Technicians
```

## Pending Technician

```text
technicianApprovalStatus = pending
```

Expected:

```text
must NOT appear
must NOT affect count
```

## Rejected Technician

Expected:

```text
must NOT appear
```

## Marker Navigation

```text
Tap Walapane
-> selected card opens
-> View All Technicians
-> Technician List opens
-> Walapane filter already selected
```

## Search

```text
Search Walapane
-> matching Division highlighted/selected
```

## Security

Customer must not gain access to private Technician application fields.

---

# 25. Final Codex Task

Read this entire AGENTS.md before making changes.

Then:

1. Inspect the existing Map tab, Technician query/service, navigation, Firestore schema, and rules.
2. Install `react-native-svg` only if missing.
3. Build the free Division-based Technician map.
4. Query only approved Technicians.
5. Group them by canonical service Division.
6. Show Division markers with live Technician counts.
7. Add Division search.
8. Add selected-Division detail card.
9. Show up to 3 top-rated Technicians in the selected Division.
10. Make `View All Technicians` open the existing Technician List with the Division filter applied.
11. Handle loading, empty, and error states.
12. Keep exact GPS/live tracking out of scope.
13. Preserve the ServicePilot UI.
14. Do not weaken Firestore security.
15. Report any required Firestore indexes.

After implementation, report:

```text
Files changed
Why each file changed
Firestore query used
Canonical Division field used
Division data/config added
Navigation behavior
Firestore rule changes
Indexes required
Manual test steps
Any TODOs
```

Do not mark the task complete unless approved Technician data can drive the map/list securely and dynamically.
