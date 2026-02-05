Update the PROGRESS.md file to reflect what was accomplished in this coding session.

Session notes from user: $ARGUMENTS

## Instructions

Follow these steps carefully:

### 1. Gather Context

First, read the current PROGRESS.md file to understand the existing structure and content.

Then, gather information about what changed this session by running these commands:
- `git diff --stat` to see which files were changed
- `git diff` to see the actual changes (use `git diff --cached` too for staged changes)
- `git log --oneline -10` to see recent commits
- `git status` to see the current working tree state

If the user provided session notes in $ARGUMENTS above, use those as the primary source of what happened. If $ARGUMENTS is empty or not provided, infer accomplishments from the git diff, recent commits, and the conversation history.

### 2. Determine Updates

Based on the gathered context, determine:
- **Session number:** Increment from the last session number in the Session Log
- **Today's date:** Use today's date
- **Focus area:** A short description of what this session focused on
- **Accomplishments:** Bullet list of what was completed
- **Decisions made:** Any architectural or technical decisions (if any)
- **Next session goals:** What should be tackled next time
- **Completed tasks:** Any tasks from "In Progress" that are now done
- **New issues/blockers:** Anything that came up during the session
- **Current step update:** Where we're leaving off

### 3. Show Summary Before Writing

Before making any edits, show me a summary of the proposed changes in this format:

```
=== PROGRESS.md Update Summary ===

Session: #N - <date>
Focus: <focus area>

Accomplishments:
- <bullet 1>
- <bullet 2>
...

Tasks completed (moving to ✅):
- <task 1>
- <task 2>
...

Decisions made:
- <decision or "None">

New issues/blockers:
- <issue or "None">

Next session goals:
- <goal 1>
- <goal 2>
...

Current Step updated to: <new current step>
```

Ask me to confirm before writing. If I say "looks good", "yes", "go ahead", or similar, proceed with the edits.

### 4. Apply Updates to PROGRESS.md

When updating the file, make these specific changes while preserving all existing content and markdown formatting:

1. **Update "Last Updated" date** at the top of the file to today's date

2. **Update "Current Step"** to reflect where we're leaving off

3. **Move completed tasks** from the "🔄 In Progress" section to the "✅ Completed Tasks" section:
   - Change `- [ ]` to `- [x]` for completed items
   - Add them under a new sub-heading with the session info (e.g., `#### Step N: filename (Session X - date)`)
   - Remove them from the "In Progress" section
   - If all tasks in a step are done, update the "In Progress" section to show the next step

4. **Update "Next Immediate Action"** under the In Progress section

5. **Add a new session log entry** at the TOP of the Session Log section (before existing entries), following this exact format:
   ```
   ### Session N: YYYY-MM-DD (Short Description)
   **Focus:** <what this session focused on>

   **Accomplishments:**
   - <accomplishment 1>
   - <accomplishment 2>

   **Decisions Made:**
   - <decision 1> (only include this section if decisions were made)

   **Next Session Goals:**
   - <goal 1>
   - <goal 2>
   ```

6. **Update "Known Issues & Blockers"** if any new issues were discovered

7. **Update "Key Decisions Made"** if any architectural decisions were made, following the existing numbered format with rationale and trade-offs

### 5. Confirm

After writing the updates, show a brief confirmation of what was changed.
