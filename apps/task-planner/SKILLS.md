# Task Planner skills

## Ships with this app

- `task-planner-guide` (`skills/task-planner-guide/SKILL.md`) helps the assistant structure personal work and explain the app's boundaries. It is optional and does not execute app actions. The app works without an assistant or enabled skill.

Voice behavior comes from the host: Dictate enters a transcription in the selected field, Listen reads the task agenda, and Read task aloud reads the current task or draft. The app stores text only.

## Related Vakyartha skills

- `task-tracker` covers general task registers and action lists.
- `plan-my-day` covers time-blocking a day. A proposed schedule is not a calendar booking.
- `app-operator` covers the shared app controls and lifecycle.

## Access

No integration tools or external services are required. The package declares no outbound access and no schedule trigger.

The packaged assistant skill uses checked domain steps for its declared tools and interpretation. Vakyartha supplies the shared presentation procedure over retained results; this skill does not author report layout. Text requests remain text, and proposal writes still require the existing permissions and personal review.
