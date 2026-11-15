# Host evidence

The host, not the model, records what happened in an assistant turn that works on an Agent Desk task. `get_task_context` returns it as `assistantExecution`: the tool names offered in this turn (an offer is not a permission) and one receipt per completed tool response. Each receipt has the host's identity for the call, the tool name, the time, whether it returned or failed, and SHA-256 digests of the actual arguments and response. The private contents are not copied.

When `propose_attempt` saves an attempt, the host attaches this record to it. Anything with a similar name in the model's own arguments is ignored. A save still in flight is not a completed receipt, and a turn with no record is saved with none.

How to use it:

- Cite a receipt's identity when a claim or a worker report rests on a tool response.
- A receipt proves a response was observed. It does not prove the response is true or that an outside change succeeded; say which of those you checked.
- With no receipt, do not state that a tool, a sandbox or a source read was used. Mark the evidence unknown.
- Workers in one turn share the turn's record; a worker has no separate receipts of its own.

`get_task_context` returns the full frozen contract and the plan, with attempts as a compact index. Ask for one attempt by its exact `attemptId` to read its full result and worker reports. Criterion IDs are `c1` to `c8`; copy them unchanged. Worker reports carry no identity of their own: they are matched to the plan by order.

Choose the output the task calls for: a text answer, source code, changed files or an interactive result. Saving an attempt rebuilds this app's own views and needs no extra canvas.
