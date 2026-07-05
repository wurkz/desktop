# Phase 2 Backlog — Repair Module

> **Status:** Core repair loop complete; asset detail done. Remaining: asset edit/soft-delete, bookings, photos.  
> **Scope:** Asset Management, Job Orders, Service History, Mechanic Views, Billing  
> **Completed items live in:** [`phase-2-completed.md`](./phase-2-completed.md)

---

## BACK-2-010 · Booking CRUD

**Priority:** 🟢 Low  
**Area:** `packages/features/repair/src/dal/`, `apps/desktop/src/features/repair/`  
**Description:**  
`BookingsTable` schema exists but has no repository or UI.

**Acceptance Criteria:**
- [ ] `BookingRepository` created with `create`, `list`, `updateStatus` methods
- [ ] "Today's Schedule" view on dashboard or repair page showing pending bookings
- [ ] "Convert to Job Ticket" action on a booking skips the Asset Recognition step
- [ ] Booking status transitions: `pending` → `confirmed` → `in_progress` → `completed`

---

## BACK-2-011 · Photo Capture & Local File Store

**Priority:** 🟡 Medium  
**Area:** `apps/desktop/src-tauri/`, `apps/desktop/src/features/repair/`  
**Description:**  
The intake form requires photo uploads. Photos should be saved to the local filesystem (not SQLite blobs) and referenced by path.

**Acceptance Criteria:**
- [ ] Tauri `fs` plugin used to save uploaded images to `{app_data_dir}/media/{order_id}/`
- [ ] File paths stored as JSON array string in `orders` table (or separate `order_photos` table)
- [ ] Photo thumbnail grid displayed in Intake form and Job Ticket detail
- [ ] Delete photo removes file from disk and updates record

---
