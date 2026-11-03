# How Clinic Desk estimates missed visits

Use this wording to explain a `noShowRisk` figure. Do not add numbers that were not returned.

- The estimate is learned from this clinic's own history of completed and missed visits. Cancelled visits are left out because the slot was given back. Nothing is sent anywhere or shared between clinics.
- It starts from the clinic-wide share of missed visits, then adjusts for the patient's own past visits, the weekday, the time of day and how far ahead the visit was booked.
- With little evidence each adjustment stays small, so one missed visit does not label a patient. Under 20 resolved visits the app shows no estimate.
- A higher figure means a reminder call is worthwhile. It is not a prediction about the person and must not change how a patient is treated or whether they can book.
- `riskReasons` lists only the factors that raised the figure, for example "missed 2 of 3 earlier visits" or "booked far ahead".
