---
name: doctor-models
description: Fix Ollama and model problems in Vakyartha: Ollama not answering or not running, the local qwen model or the decision model missing, model downloads, local turns that are slow, time out or fail, and no provider configured. Uses the live System health report.

compatibility: Requires the built-in System health integration. Local models run in Ollama on this computer.
metadata:
  author: nranjan2code
  version: "1.0"
  requires-read: "true"
  requires-values: "true"
  unavailable-message: "System health is unavailable. Open Settings → Integrations, turn on System health, then ask again."
allowed-tools: read_skill_file use_skill system-health__health_report system-health__recent_problems
---

# Fix model problems

Call `system-health__health_report` with `areas: ["models", "ollama"]`. Add `system-health__recent_problems` when the person reports errors or slow answers, and look for `[chat] <provider>/<model> → error` and `[decision]` lines.

## What each check means

| Check | Meaning | Fix |
| --- | --- | --- |
| Model providers fail | No provider is configured: chat cannot answer | Start Ollama, or add a provider key in Settings → Models |
| Local Ollama warn | Ollama does not answer at the address shown | Open the Ollama app, or run `ollama serve`; install from ollama.com when missing |
| Primary local model warn | The local model Vakyartha is tuned for is missing | `ollama pull <model>` with the exact name from the check, or Download model in Admin console → Doctor |
| Decision model warn | The small local model that shapes each turn is missing; the heuristics stand in, so turns still work | `ollama pull <model>` with the exact name from the check |
| "is downloading" | A download started from the Doctor is running | Wait, then check again; do not start a second download |

"Configured" means the provider has what it needs to be tried (a key, or a local server address). A local server such as LM Studio can be configured and still not running; the chat's own error says so.

## Repeated chat errors

Read the times and models in the log lines. Several errors on one local model that each took minutes point at memory pressure or a timeout, not the model's ability: suggest closing other large apps, keeping one local model loaded, and checking the decision model is installed so it stays warm. Errors from a hosted provider within seconds usually mean a key, quota or model-name problem: send the person to Settings → Models to check that provider.

Downloads are several gigabytes and use the person's connection: always ask before suggesting or running one, and give the exact model name from the check. Chain to `debug-error` with the exact lines for anything else.
