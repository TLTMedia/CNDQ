# Paul's Contribution Evaluation — CNDQ Project

*Honest assessment based on full git history (161 commits, Dec 15 2025 – Feb 25 2026)*

---

## What You Actually Built

This is a non-trivial piece of software. CNDQ is a working, deployed, multi-user real-time business simulation with:
- An LP solver integrated into gameplay (shadow prices)
- A multi-team negotiation system with state machines
- NPC trading agents with pluggable strategy patterns
- An admin panel for session management
- Playwright-based end-to-end testing + accessibility auditing
- A production deployment that real students are using in class

That's roughly 17,000+ lines of source code across a PHP/SQLite backend and a web-component JS frontend — in about 10 weeks.

---

## What You Contributed (Genuinely)

**1. The core idea and domain expertise**
The Problem.md is clearly your own writing. You understand the educational problem deeply — shadow prices, non-zero-sum trades, how the classroom exercise runs. No AI made that up. This drove every real design decision.

**2. Product direction from real usage**
Your commits reference actual events: meetings, classroom sessions, stakeholder feedback. "Changes based on Feb16 meeting", "working on final reports", "tutorial", "after meeting" — this is someone running the thing and responding to what breaks or doesn't work. That's genuine product ownership, not passive observation.

**3. Persistence**
161 commits over 10 weeks is consistent effort. You didn't abandon it. Many educational software projects die after 2–3 weeks.

**4. UX judgment**
You caught things the AI wouldn't: UX friction, confusing flows, accessibility gaps. The chopstick principle (PLAN.md), the complexity selector, the tutorial — these reflect real observations from watching students use the tool.

**5. You deployed and maintained it**
There's a production server. Students used it in class. That's real.

---

## Where the Contribution Is Weaker

**1. The AI wrote most of the code**
Be honest about this. Roughly 80%+ of the actual implementation — the NPC strategy patterns, the negotiation state machine, the test framework, the accessibility testing, the refactors — came from AI-generated commits. Your commits tend to be directional ("working on X", "better Y") while the formally-named commits (feat:, fix:, refactor:) are AI output. You were the PM and QA; the AI was the developer.

**2. The same infrastructure problem came up 6 times**
There are 6 commits related to path/absolute path issues: "struggling with paths" (×2), "Absolute paths" (×3), "always with the absolute paths". This suggests a gap in understanding how the deployment environment works that never got fully resolved — it kept being patched around rather than understood.

**3. Commit hygiene is poor**
"f", "WIP", "final screne", "more better", "improvements" — these describe nothing. If this were open-source or a team project, the history would be nearly unreadable. The repo also has 54+ debug screenshots and JSON log files committed to the root. Version control is being used as a file sync tool rather than a proper project history.

**4. The root directory is a mess**
~92 files in the root: debug scripts, test HTML files, screenshots, massive JSON logs, `.php` one-off utilities. This is technical debt that would confuse any future contributor (or future you in 6 months).

**5. No branching strategy**
Everything is on main. No feature branches, no PRs, no review process. This works when you're solo but creates unnecessary risk on a live teaching tool.

---

## The Honest Bottom Line

You are the product owner, not the lead engineer. That's a legitimate role, and you're doing it — you have domain knowledge, you're driving from real feedback, you're keeping the project alive. But you should be clear-eyed that the ratio of your code to AI code is probably 15/85 at best.

What that means practically: if the AI collaboration ended tomorrow, the project would stall. The risk isn't that you've been lazy — you haven't — it's that the technical understanding hasn't transferred. The recurring path issues are a symptom of that.

The work that's clearly, inarguably yours: the problem framing, the educational goals, the classroom testing, the product decisions, keeping it deployed and running. That stuff matters and it's not nothing.

The work that's largely the AI's: the architecture, the implementation patterns, the test framework, the refactors. You approved it and directed it, but you didn't write it.

---

*Written Feb 25, 2026. Based on full git log review.*
