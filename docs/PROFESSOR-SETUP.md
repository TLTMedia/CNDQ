# CNDQ Developer Setup Guide
*For Thomas Sexton and Herbert Lewis — the original creators of the game.*

This guide takes you from a blank Windows machine to a working local copy of the game, able to make changes with an AI assistant and send them safely to the live server.

**Time required:** About 25 minutes for first-time setup. After that, your daily workflow is 5 commands.

---

## How the System Works (Big Picture)

```
Your machine          GitHub                 Production Server
─────────────         ──────────             ─────────────────
Edit files       →    Push changes     →     IT pulls from GitHub
with AI help          Tests run              (main branch = live game)
                      automatically
```

You never touch the production server directly. You make changes locally, push them to GitHub, automated tests run to catch mistakes, and IT's system keeps the live server in sync with the main branch.

---

## Section 1: One-Time Setup

Paul has emailed you a file called `setup.ps1`. This script does everything automatically: installs all required tools, downloads the project, and prepares it to run. It takes about 10 minutes.

### Running the Setup Script

1. Save `setup.ps1` somewhere easy to find, such as your Desktop or Downloads folder.

2. Open the Start menu, search for **PowerShell**, right-click it, and choose **Run as Administrator**.

3. In the PowerShell window, paste this and press Enter:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```
   When asked, type `Y` and press Enter.

4. Navigate to where you saved the script. If it is in Downloads:
   ```powershell
   cd $HOME\Downloads
   ```

5. Run the script:
   ```powershell
   .\setup.ps1
   ```

6. The script will pause once and ask you to log in to GitHub in your browser. Follow the prompts it displays — it will tell you exactly what to do at that step.

7. When the script finishes, it prints the address to open in your browser and the commands for your daily workflow. You are done.

The setup script is also kept in the repository at `setup.ps1` for reference.

---

## Section 2: Running the Game Locally

You need two terminal windows: one for the server and one for your work.

### Start the Server (Terminal Window 1)

```powershell
cd C:\Sites
php -S localhost:8000
```

Leave this window running. You will see log messages appear as you use the app — this is normal.

### Open the Game (in your browser)

Navigate to: `http://localhost:8000/CNDQ/`

You should see the game login page. To log in during local development, visit:

`http://localhost:8000/CNDQ/dev.php`

This lets you switch between test user accounts without going through the university login system.

**Admin panel:** `http://localhost:8000/CNDQ/admin/`

### Stop the Server

In the server terminal window, press `Ctrl+C`.

---

## Section 3: The Automated Test Suite

Before making changes, it helps to understand the tests — because they are your best protection against the AI assistant quietly breaking the app.

### What Playwright Does

Playwright is a program that opens a real browser and operates the game the way a student would: it logs in, starts a session, posts buy requests, responds to negotiations, accepts deals, and verifies that the final balances are correct. It does this automatically in about 3 minutes.

This matters because some bugs are invisible in code but obvious when you actually use the app. The test suite has caught many such regressions introduced by code changes — including AI-generated ones — before they ever reached the live game.

### Running the Tests

The simplest approach is to ask the AI assistant to run them:

> *"Run the tests and tell me if anything is broken."*

The AI will start the server, run the full suite, and report back what passed, what failed, and — critically — where in the application code the problem is. You do not need to manage any terminal windows for this.

If you prefer to run them yourself, open a terminal with the server already running:

```powershell
cd C:\Sites\CNDQ
node tests/run.js --baseUrl http://localhost:8000/CNDQ/ --headless
```

Either way, if a test fails, a screenshot is saved to `tests/screenshots/` showing exactly what the browser saw at the moment of failure.

### The Most Important Rule About Tests

**If a test fails, fix the application code — never weaken the test.**

AI assistants have a consistent tendency to make failing tests pass by simplifying or removing the parts that are failing, rather than fixing the underlying problem. A passing test that has been made easier to pass tells you nothing; it is worse than useless because it creates false confidence.

**Warning signs that an AI is doing this:**

- It proposes changes to files in `tests/` when you asked it to fix something in `api/`, `lib/`, or `js/`
- It suggests removing a check, reducing a timeout, or skipping a test step
- It changes what a test expects to match the (wrong) output the app is currently producing
- It says a test was "too strict" or "overly specific" and proposes to relax it

**What to do instead:**

When a test fails, tell the AI: *"Do not change the test files. Find and fix what is broken in the application code."* If it cannot find the problem, ask it to explain step by step what the failing test is asserting and trace that assertion back to the PHP or JavaScript code responsible.

### Keeping the Tests Current

When you add a new feature, the tests should grow to cover it. When you change how something works, the test that covers it should be updated to match the new intended behavior — not deleted or skipped.

The project file `AI-INSTRUCTIONS.md` (in the root of the project) contains standing rules for any AI assistant — test integrity, path conventions, database structure. When starting a session with any AI tool, tell it:

> *"Read AI-INSTRUCTIONS.md before doing anything else."*

Claude Code reads this automatically via `CLAUDE.md`. Other AI tools (ChatGPT, Gemini, Copilot) need to be told manually at the start of each session.

---

## Section 4: Making Changes with an AI Assistant

Open VS Code:

```powershell
cd C:\Sites\CNDQ
code .
```

This opens the entire project in VS Code. From here, you can use any AI coding assistant (Claude Code, GitHub Copilot, or similar) to make changes. The AI can read every file in the project, make edits, run the test suite, interpret the results, and fix any problems it introduced — all in one conversation.

**A complete session typically sounds like this:**

> *"Read AI-ASSISTANT-GUIDE.md first so you understand the project. Then I want to add a help tooltip to the shadow price panel. After making the change, run the tests and make sure everything still works."*

The AI will:
1. Read the project context
2. Make the change
3. Start the server and run the full test suite
4. Report back what passed and what failed
5. If something broke, diagnose and fix the application code — not the tests

**Other useful prompts:**

- *"The timer on the admin panel is confusing — make it clearer, then run the tests"*
- *"Something is broken with the leaderboard. Run the tests and find out what."*
- *"A student reported that the shadow price panel is not updating. Investigate."*
- *"Run the tests and show me the output without changing anything."*

Two files in the project root orient any AI assistant:
- `AI-ASSISTANT-GUIDE.md` — what this project is, how it is structured, key concepts
- `AI-INSTRUCTIONS.md` — standing rules: test integrity, path conventions, how to run tests

Claude Code reads these automatically. For any other AI tool, paste this at the start of the session:
> *"Read AI-INSTRUCTIONS.md and AI-ASSISTANT-GUIDE.md before doing anything else."*

---

## Section 5: The Safe Way to Send Changes

Never edit the main branch directly. Instead, create a branch for each change. Think of a branch as a personal copy where you experiment — it cannot affect the live game until you deliberately merge it.

### Starting a Change

Open a second terminal window (keep the server running in the first):

```powershell
cd C:\Sites\CNDQ
```

Create a branch named after what you are working on:

```powershell
git checkout -b describe-your-change-here
```

Examples:
```powershell
git checkout -b add-help-tooltips
```
```powershell
git checkout -b fix-timer-display
```

Now make your changes (with AI help or directly).

### Testing Your Change

Ask the AI to run the tests before you send anything to GitHub:

> *"Run the tests and make sure my change didn't break anything."*

The AI will handle starting the server, running the suite, and fixing any application-code problems. Only proceed to the next step once the AI reports all tests passing.

### Sending Your Change to GitHub

```powershell
git add -A
```
```powershell
git commit -m "Brief description of what you changed"
```
```powershell
git push origin describe-your-change-here
```

### Creating a Pull Request (Proposing the Change)

```powershell
gh pr create --title "What this change does" --body "Longer explanation if needed"
```

This creates a Pull Request on GitHub — a formal proposal to add your change to the main branch. GitHub will automatically run tests (see Section 6). Once tests pass, you or IT can approve and merge it, after which the live game will update.

### After Merging — Clean Up

Switch back to main and refresh it:

```powershell
git checkout main
```
```powershell
git pull
```

---

## Section 6: What GitHub Does Automatically

Every time you push code to GitHub, the following checks run automatically within a few minutes:

1. **PHP Syntax Check** — scans every PHP file for typos and syntax errors. If any file has a mistake that would crash the server, this catches it before it reaches production.

2. **Application Smoke Test** — starts a local copy of the app and verifies it loads without errors.

You will receive an email from GitHub if a check fails. The pull request page on GitHub will show a red X for failed checks and a green checkmark for passed ones. Do not merge a pull request that has a red X.

---

## Section 7: Getting Updates from Others

If Paul or IT have pushed changes while you were working, bring them into your local copy:

```powershell
git checkout main
```
```powershell
git pull
```

Do this before starting any new branch.

---

## Section 8: Accessibility Notes for Herbert

VS Code has a Screen Reader Optimized mode that works well with NVDA and JAWS:

1. Open VS Code
2. Press `Ctrl+Shift+P`
3. Type `screen reader` and select **"Toggle Screen Reader Accessibility Mode"**

With screen reader mode on:
- The editor reads line contents as you navigate
- Error messages and suggestions are announced
- The integrated terminal (View > Terminal, or `Ctrl+backtick`) is fully accessible

**All commands in this guide are designed to be copy-paste.** No step requires clicking through a GUI menu or reading a visual dialog. The only exception is the initial GitHub login (Section 1, Step 3), which opens a browser page — but the code you need to paste is read aloud by the terminal before the page opens.

**The game itself:** The accessibility roadmap for the game (making it navigable by screen reader for students) is documented in `IMPROVEMENTS.md` in the project root.

---

## Section 9: Quick Reference — Daily Commands

```powershell
# Start the server (Terminal 1, leave running)
cd C:\Sites && php -S localhost:8000

# Start a new change (Terminal 2)
cd C:\Sites\CNDQ
git checkout main && git pull
git checkout -b my-change-name

# After making changes: save, test, send
npm test
git add -A
git commit -m "What I changed"
git push origin my-change-name
gh pr create --title "What I changed" --body ""

# After the pull request is merged: clean up
git checkout main && git pull
```

---

## Section 10: Troubleshooting

**"php is not recognized"**
Close and reopen your terminal after the winget install. If still not recognized: `winget install PHP.PHP --force`

**"git is not recognized"**
Same fix — close, reopen terminal. Git installs to a non-standard location on some systems.

**The browser shows a blank page or 404**
Make sure the PHP server is running in Terminal 1 (you should see it printing log lines). Make sure you navigated to `http://localhost:8000/CNDQ/` (with the `/CNDQ/` part).

**"Permission denied" on data/ folder**
```powershell
icacls C:\Sites\CNDQ\data /grant Everyone:F
```

**Tests fail with "Cannot connect to localhost:8000"**
The tests expect the server to be running. Start it in Terminal 1 first, then run `npm test` in Terminal 2.

**"You have diverged from the remote branch"**
```powershell
git pull --rebase
```

---

## Questions?

If anything in this guide is unclear or broken, contact Paul — he can walk you through it or update the guide.

For questions about the code itself, ask any AI assistant and include this sentence:
> "First read the file AI-ASSISTANT-GUIDE.md in this project, then help me with..."
