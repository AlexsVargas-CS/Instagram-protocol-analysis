Give me a concise project status briefing for this coding session.

## Instructions

### 1. Gather Context

Read these files to understand the current project state:
- `PROGRESS.md` — primary source of truth for project status
- `CLAUDE.md` — project architecture overview

Then run these commands to understand the current working state:
- `git status` to see uncommitted work
- `git log --oneline -5` to see the most recent commits
- `git diff --stat` to see what's been modified since last commit

### 2. Present the Briefing

Display the status in this exact format:

```
══════════════════════════════════════════════
  PROJECT STATUS BRIEFING
══════════════════════════════════════════════

Phase:    <current phase from PROGRESS.md>
Step:     <current step from PROGRESS.md>
Updated:  <last updated date from PROGRESS.md>
Sessions: <total session count>

── WHERE YOU LEFT OFF ──────────────────────

<1-2 sentences about what the last session accomplished,
 pulled from the most recent Session Log entry>

Next action: <the "Next Immediate Action" or last session's
"Next Session Goals" from PROGRESS.md>

── WHAT'S IN PROGRESS ─────────────────────

<List the incomplete tasks (- [ ]) from the current
"In Progress" section, as a clean bullet list>

── WHAT'S DONE ────────────────────────────

<Summarize completed work as a compact list, grouped
by step/session. Keep it brief — just the highlights,
not every sub-task>

── WHAT'S COMING UP ───────────────────────

<List the next 2-3 pending steps/phases from the
"Pending Tasks" and "Future Phases" sections>

── BLOCKERS & WATCH-OUTS ──────────────────

<List current blockers and known limitations from
PROGRESS.md, or "None" if clear>

── UNCOMMITTED WORK ───────────────────────

<Show git status summary: modified files, staged
changes, untracked files. Or "Clean working tree"
if nothing is pending>

══════════════════════════════════════════════
```

### 3. Rules

- This is a **read-only** command — do NOT modify any files
- Keep it concise — this is a quick briefing, not a full report
- Pull all information from PROGRESS.md and git state, do not fabricate details
- If PROGRESS.md doesn't exist or is empty, say so and suggest running `/update-progress`
- If the user provided notes via $ARGUMENTS, acknowledge them at the top (e.g., "Session focus: <their notes>") and use them to contextualize the briefing
- After the briefing, ask: "Ready to pick up where you left off, or want to adjust the plan?"

Optional session context from user: $ARGUMENTS
