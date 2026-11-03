---
name: write-code
description: Write, set up or explain source code, scripts, functions, config files and project setup in any programming language, framework or cloud SDK, file by file.

compatibility: Language-agnostic. Uses the Microsoft Learn, AWS Knowledge and Library docs integrations and Sandboxed execution when they are enabled; works without them.
metadata:
  category: code
  author: Vakyartha
  version: "1.0.0"
allowed-tools: use_skill microsoft-learn__microsoft_docs_search microsoft-learn__microsoft_docs_fetch microsoft-learn__microsoft_code_sample_search aws-knowledge__aws___search_documentation aws-knowledge__aws___read_documentation context7__resolve-library-id context7__query-docs run_command
---

# Writing Code

Answers that give the user code to use: a script, a function, a service, configuration or a project setup. Work through the steps in order; each step is small and finishes before the next starts.

## Skill chaining

- Load `debug-error` instead when the request starts from an error, a failing test or broken behaviour.
- Load `code-review` instead when the user asks to review or improve code they supplied.
- Load `shell-command` for install, build and run commands beyond a single obvious line.
- Load `sandbox` before running anything (step 5).

## Step 1: Pin down the target

Decide, and say in one line: the language and its version, the framework or SDK, and what the code must do. When the request leaves one of these open, pick the current common choice and say it is an assumption. Ask only when a wrong guess would make the whole answer useless.

## Step 2: Look up current documentation

APIs change between versions; remembered code is often outdated. Use the source below that matches the request, when its tools are available; then go on to step 3.

- **Microsoft products** (Azure, .NET, Microsoft 365, PowerShell, SQL Server):
  1. `microsoft-learn__microsoft_code_sample_search` with a narrow task ("Service Bus queue runtime properties C#").
  2. `microsoft-learn__microsoft_docs_search` with the same task when samples are missing or need the setup steps.
  3. `microsoft-learn__microsoft_docs_fetch` with one result's URL only when its excerpt leaves out what the code needs.
- **AWS services**:
  1. `aws-knowledge__aws___search_documentation` with a narrow task.
  2. `aws-knowledge__aws___read_documentation` with one result's URL when the excerpt is not enough.
- **Any other library or framework**:
  1. `context7__resolve-library-id` with the library name ("express", "pandas").
  2. `context7__query-docs` with that id and a narrow question ("health check route").

Use the package names, class names and method signatures the documentation shows, and name the page or library version you followed. When no documentation tool is available, write from general knowledge and say which version the code targets.

## Step 3: Plan the files

List the files the answer needs, one line each: path and purpose. Keep it to what the task requires. Configuration and code that belong together still go in separate files.

## Step 4: Write each file

For each file in the plan, in order:

1. One short line naming the file in backticks, ending with a colon: Add the function in `QueueStatus.cs`:
2. One fenced block with a language tag, holding that file's complete contents (or say which part it replaces).

Rules for every file:

- Name a real path the user would create (`src/server.js`, `local.settings.json`, `.github/workflows/test.yml`), never "the main file".
- Keep secrets out of code: read them from configuration or environment variables and show placeholder values.
- Write code as ordinary fenced blocks. Do not render code as an interface.

## Step 5: Verify

When `run_command` is available and the code can run in isolation, load `sandbox`, then run the smallest check (compile, type check, or the test) and report the real result. Never claim code was run when it was not. When it cannot be run here, say so.

## Step 6: Present how to use it

- Install and run commands go in their own `bash` block, introduced as commands, not as a file.
- Give the exact command that shows it working.
- Keep explanation short and after the code it explains; do not repeat the code in prose.
