# Clinic Desk

Front-desk appointment booking for one clinic. Everything stays on this computer.

## Use it

- **Setup first.** Add each doctor (they start Mon to Sat, 09:00–17:00, 15-minute visits), then use **Mon to Fri / Mon to Sat / Every day** or the day chips, set hours, visit length, a daily break and any time away. Set the clinic's time zone if the computer is elsewhere; empty follows this computer.
- **Schedule.** Day navigation, doctor chips (**All doctors** or one), and a **List / Week calendar / Month** switch, and a **Needs attention** panel. Counts for Waiting, Checked in, Completed, No-shows and Free slots sit above a day-capacity bar. Each appointment card shows time, doctor, visit type, reason and a no-show estimate once the clinic has history, and moves through **Check in → Complete**, or **No-show**, **Cancel** and **Reschedule**; closed outcomes can be reopened. **Walk-in** (today) opens Book on the soonest free slot. **Next open slots** start a booking in one tap. The **Waiting list** holds patients who want an earlier slot; **Find a slot** books them and clears the entry. **Reminders for tomorrow** lists who is booked and exports the messages as CSV for you to send yourself. The next seven days appear as a chart and clickable day cards. **Export CSV** saves the day. **Listen** and **Watch** play the day as a brief; **Ask assistant** opens the docked assistant.
- **Book.** Pick a doctor, a day from the seven-day strip (or another date, or **Next available**), then a time grouped into Morning, Afternoon and Evening. Choose an existing patient or type name and phone, a visit type and reason, review the summary card and **Book appointment**, or **Add to waiting list** when nothing suits. If the chosen day has no free slot, Book jumps to the first day that does. A returning patient is recognised by phone and name, and the slot is checked again on confirm.
- **Doctors.** A card per doctor with today's load; open one for their own week calendar, 30-day visits, no-show rate, slot use, next free slot, weekday chart and upcoming visits. **Book with this doctor** and **Edit hours and leave** continue from there.
- **Insights.** Choose 7, 30 or 90 days and all doctors or one: visits, attendance, no-show rate, slots used, how far ahead patients book, new patients, plain-words notes, charts for visits over time, busiest hours, no-shows by weekday, visit types, a doctor table, the next seven days, and a CSV report.
- **Branding.** Setup holds the clinic name, tagline, phone and address, shown in headers and in reminder messages; doctors also have a room.
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
