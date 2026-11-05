# Clinic Desk: working rules

## Invariants

- `context.state` is the only data owner: clinic, doctors, leave, patients, appointments and a small `ui` block. `normalize()` runs first on every action and drops anything malformed or pointing at a missing record.
- Free slots are derived by `freeSlots()` from hours, break, leave, the clinic clock and held appointments (booked, checked in, completed). Never store slots. Overlap is by interval, so a changed visit length cannot create a double booking.
- Booking, reopening, doctor retirement and leave re-check against the records at the moment of the action; the on-screen slot list is advisory only.
- "Today" and "now" come from the clinic's time zone (`wall()`), not the engine's.
- Status changes follow the `NEXT` table. Cancelled and no-show appointments free the slot.
- Surfaces use chips for doctor choices (no placeholder option); a blank doctor pick is ignored, never an error. Waiting-list entries are removed when that patient books. Reminders are exported text only.
- Patients match by digits of the phone plus name. Deleting a patient is blocked while upcoming appointments exist.
- Spoken text (`/spoken/brief`) and the CSV come from the same records as the visible list. CSV cells starting with `=`, `@`, tab or a sign before a non-digit are prefixed with an apostrophe.

## Intelligence, programme and assistant

- `intel.ts` holds both estimators. They read only resolved visits (completed or no-show), smooth toward the clinic base rate, and return nothing under `MIN_HISTORY`. Add a factor only with a test showing it changes the estimate and a reason string; keep it explainable and local. Nothing is stored or trained elsewhere.
- `insights.ts` derives everything for Insights, Doctors, attention prompts and patient facts from the records on each run (nothing stored). Capacity uses the same hours, break and leave as `freeSlots`, so utilisation cannot disagree with Book. Prompts are rules (high no-show risk, waiting-list backfill, missed and not rebooked, 6-month recall, full day likely to lose visits); each carries its reason and ends in a call, an offer or a rebooking by a person. Add a rule only with a test and a reason string.
- Surfaces: Schedule (day list, week, month; tabs for appointments, attention, waiting list, reminders, week ahead), Book, Patients (list beside the record; profile facts, allergies and emergency contact are front-desk fields, not a medical record), Doctors (roster beside the profile; calendar, upcoming and results tabs), Insights (period and doctor filters; summary, trends, patterns and by-doctor tabs; CSV report), Setup (clinic and doctors tabs).
- Layout: each view is one screen with a summary caption, one action bar and tabs, never a long scroll or a second title. Navigation goes through `go(ui, screen, tab)`, so a moving action lands on its tab. Keep each figure in one place.
- `show.ts` turns plain facts into the programme at `/spoken/brief` (Listen and Watch; see docs/features/PROGRAMMES.md). It names patients by first name and initial and carries no phone numbers.
- Assistant exports in `app.json`: `get_clinic_context`, `find_free_slots`, `get_attention_list` and `get_insights` (read-only, `handleQuery`; no patient phone numbers, notes, allergies or contacts) and `prepare_booking` (fills the Book draft; never books). Keep their data minimal and the `assistantWorkflow` review pointing at `book`. Keep the built-in `clinic-desk` skill in step with these exports.

## Change method

1. Edit `server.ts`; keep node ids stable and emit only nodes that apply now.
2. Each action returns only the surfaces it affects (`touched`).
3. Run `node scripts/app-surfaces.ts`, then `node --test test/clinic-desk.test.ts`.
4. Bump `version` in `app.json` for every shipped change, and keep these four documents in step with the manifest and handlers.

## Host engine

This app runs in the sandbox (`runtime.engine: "node26"`) like every other app, with no tools, no database and no network. Keep it that way. Anything that needs an integration or a model belongs in the shared assistant or an integration app. Shared host contract: Access, Background operation, Settings and the shared assistant apply as for every app; there is no app permission store.
