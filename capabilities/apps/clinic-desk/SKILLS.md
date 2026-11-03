# Clinic Desk: skills

Clinic Desk calls no tools. It declares five assistant exports (`get_clinic_context`, `find_free_slots`, `get_attention_list`, `get_insights`, `prepare_booking`) and the built-in `clinic-desk` skill (capabilities/skills/clinic-desk) carries the front-desk procedure: grounded answers, estimates presented as estimates, no medical advice, bookings as proposals a person confirms, and decisions between options scored with `decision-eval` / `decision-chain` (ask below 0.7 confidence). When a person asks the assistant about their clinic schedule, these domain skills are relevant:

- **app-operator**: opening Clinic Desk, booking, checking in and rescheduling through the shared host controls.
- **app-maintainer**: changing doctors' hours, visit lengths, leave and the package documents; bumping the version and running the tests.
- **app-debugger**: finding why a slot is missing (day off, leave, break, past time, held appointment) or a status change was refused.
- **app-admin**: reviewing Access and Background operation; this app needs no tools, so there is nothing to grant.
- **app-authoring**: the method for any change to the package; keep the template and these documents synchronized.

Reports and charts built from the schedule load the enabled `interactive-ui` and `surface-design` skills rather than defining their own. Patient names and phones are personal data: do not copy them into chats or exports the person did not ask for.
