# Clinic Desk

Front-desk appointment booking for one clinic. Everything stays on this computer.

## Use it

- **Setup first.** Add each doctor (they start Mon to Sat, 09:00–17:00, 15-minute visits), then use **Mon to Fri / Mon to Sat / Every day** or the day chips, set hours, visit length, a daily break and any time away. Set the clinic's time zone if the computer is elsewhere; empty follows this computer.
- **Schedule.** One screen for the day: a summary line (appointments, doctors on duty, share of slots taken), one action bar (**Previous day**, the date, **Next day**, **Today**, **Walk-in**, **New booking**, **Ask assistant**, **Export CSV**), doctor chips (**All doctors** or one) and **Day list / Week / Month**, then counts for To arrive, Checked in, Completed, No-shows and Free slots. Below them, tabs: **Appointments** (one row per visit with its actions beside it; choosing the row opens the patient), **Needs attention** (calls, waiting-list offers and rebookings), **Waiting list**, **Reminders** (tomorrow's bookings, exported as messages you send yourself) and **Week ahead** (each day's load, opening its list, and the next open slots). Each appointment shows time, doctor, room, phone, allergies, visit type, reason and a no-show estimate once the clinic has history, and moves through **Check in → Complete**, or **No-show**, **Cancel** and **Reschedule**; closed outcomes can be reopened. **Listen** and **Watch** play the day as a brief.
- **Book.** Left: a doctor, a day from the seven-day strip (or another date, or **Next available**), then a time grouped into Morning, Afternoon and Evening. Right: a returning patient or a new name and phone, a visit type and reason, a summary, then **Book appointment**, or **Add to waiting list** when nothing suits. If the chosen day has no free slot, Book jumps to the first day that does. A returning patient is recognised by phone and name, and the slot is checked again on confirm. Booking returns to the day's Appointments tab.
- **Patients.** The searchable list beside the open record: attendance, last and next visit, usual doctor, **Book for this patient**, and tabs for **Details** (saved as you type) and **Visit history**. With no record open, the right side adds a patient.
- **Doctors.** The roster beside the chosen doctor: 30-day visits, no-show rate, slots used, next free slot, **Book with this doctor**, **Edit hours and leave** (Setup's Doctors tab on that doctor), and tabs for **Calendar**, **Upcoming** and **Results**.
- **Insights.** Choose 7, 30 or 90 days and all doctors or one; headline figures (each with a symbol, as on the day, patient and doctor figures), then tabs for **Summary** (plain-words notes), **Trends** (visits over time and the next seven days), **Patterns** (busiest hours, no-shows by weekday, visit types) and **By doctor**, and a CSV report.
- **Setup.** Two tabs: **Clinic** (name, tagline, phone, address and time zone, shown in headers and reminder messages) and **Doctors** (the roster beside the chosen doctor's name, specialty, room, days, hours, break and time away).
- **Patients.** Add a patient directly (name, phone, date of birth), search the directory, and open a record for details, notes, visit history (attendance, last and next visit, usual doctor, email, allergies and emergency contact), **Book for this patient** and delete. A patient with upcoming appointments cannot be deleted.

## Intelligence and assistant

- **No-show estimate.** Learned on each run from this clinic's own completed and missed visits (patient history, weekday, time of day, booking lead time). It needs 20 such visits before it shows anything, and it only suggests a reminder call.
- **Week outlook.** Booked share of each day's slots, lifted to that weekday's recent average, labelled Busy, Steady, Quiet or Closed.
- **Needs attention.** Rules over the clinic's own records: likely no-shows to call, waiting-list patients who could take an open slot, missed visits not rebooked, six-month check-up recalls and full days likely to lose visits. Each shows its reason and leads to a call, an offer or a rebooking that a person makes.
- **Assistant.** It can read the schedule, free slots, attention prompts and results (patients by first name and initial, no phone numbers or notes) and fill in the Book form. It cannot book: a person presses Book. The `clinic-desk` skill carries the procedure.

## Limits

Up to 40 doctors, 3,000 patients, 20,000 appointments and 300 waiting-list entries. Notes are for the front desk, not a medical record. Reminder messages are written for you to send; none are sent: the app has no network or messaging access.

## Runs in the sandbox

Clinic Desk runs in the shared sandbox like every app. Its logic is pure and internal: it declares no tools, no database and no network.
