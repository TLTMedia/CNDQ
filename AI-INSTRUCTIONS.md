# CNDQ — AI Working Instructions

This file contains standing rules for any AI assistant working on this codebase. It is AI-agnostic and applies equally to Claude, GitHub Copilot, ChatGPT, Gemini, or any other tool.

When starting a session with a new AI assistant, tell it:
> *"Read the file AI-INSTRUCTIONS.md before doing anything else."*

For codebase structure, key concepts, and architecture, also direct the AI to:
> *"Read AI-ASSISTANT-GUIDE.md for full project context."*

---

## The Test Suite Is the Source of Truth

The Playwright test suite in `tests/playwright/` simulates a real student using the game end-to-end. It has been the primary tool for catching regressions introduced by code changes, including AI-generated ones. Treat it accordingly.

### The Cardinal Rule: Fix the Code, Not the Test

**When a test fails, the correct response is to find and fix the bug in the application code.**

Never make a failing test pass by weakening the test itself. This is the most common way AI assistance quietly breaks a production application — the tests turn green, the problem is hidden, and it surfaces later in a classroom.

### Forbidden Test Changes

Do not make any of the following changes unless explicitly instructed by the user AND the change is clearly additive (testing more, not less):

| Forbidden change | Why it's harmful |
|---|---|
| Removing an assertion | The thing being asserted may now be broken |
| Reducing a timeout | The operation may now be silently failing faster |
| Adding `.skip` to a failing test | Hides the failure entirely |
| Replacing a specific assertion with a weaker one | e.g. `expect(x).toBe(5)` → `expect(x).toBeDefined()` |
| Removing a test step that is timing out | May mean the UI element it depends on is broken |
| Changing expected values to match wrong output | Locks in the bug as the expected behavior |
| Catching and swallowing errors in test helpers | Masks failures as successes |

### What a Legitimate Test Change Looks Like

- A new feature was added and new assertions are needed to cover it
- A UI element was intentionally renamed and the selector needs updating
- A test was testing the wrong thing and is being corrected
- A new test is being added to cover a previously untested case

In all legitimate cases, the change makes the tests **more rigorous**, not less.

### When a Test Fails

1. Read the failing test and explain what it is asserting
2. Identify the exact step and error message
3. Trace that failure back to the application code
4. Propose a fix to the application code
5. Explain why that fix should make the test pass

If you are not certain of the cause, say so. Do not guess and patch the test.

---

## Running the Test Suite

```bash
# Start the PHP server in the background
php -S localhost:8000 &

# Give it a moment to start
sleep 2

# Run the full test suite
npx playwright test
```

The base URL defaults to `http://localhost:8000/CNDQ/`. To override:

```bash
BASE_URL=http://cndq.test/CNDQ/ npx playwright test
```

To run a single spec by name:

```bash
npx playwright test health    # API health checks
npx playwright test trade     # deterministic trade balance checks
npx playwright test ui-smoke  # browser smoke tests
```

The test entry point is `playwright.config.js` in the project root. Spec files live in `tests/playwright/` and follow the `*.spec.js` naming convention.

After running, report:
- How many passed and how many failed
- The exact error and step for each failure
- Which application file is the likely source of each problem

---

## General Working Rules

- **Paths**: All application code uses relative references (`./` and `../`). Never introduce absolute URLs or hardcoded hostnames.
- **Database**: SQLite at `data/cndq.db`, event-sourced. There is no `advertisements` table (ads are events in `marketplace_events`). There is no `teams` table (team data is in `team_events` and `team_state_cache`).
- **Local URL**: `http://localhost:8000/CNDQ/` (PHP built-in server) or `http://cndq.test/CNDQ/` (Herd). Never hardcode either in application code.
- **Authentication**: Production uses Shibboleth (university SSO). Local development bypasses this via `dev.php`.
- **Codebase context**: Read `AI-ASSISTANT-GUIDE.md` before starting any non-trivial task.
