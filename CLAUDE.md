# CLAUDE.md

Project-specific operating directives for Claude Code.

<!-- ai-project-status:begin -->
<!--
  This block is injected and refreshed by ai-project-status:
  https://github.com/cornjacket/ai-project-status

  It defines how this repo's log.md must be maintained so the
  meta-repo can summarize cross-portfolio activity in summary.md.

  Do not edit between the begin/end markers — local edits will be
  overwritten on the next `setup-new-repo.sh --update`. To change
  the rules, edit templates/claude-rule.md in ai-project-status
  and re-run `setup-new-repo.sh --update <this-repo-remote>`.
-->
## Work log (log.md)

This repo is monitored by [`ai-project-status`](https://github.com/cornjacket/ai-project-status). You MUST maintain `log.md` at the repo root as a date-ordered, task-granularity record of work. The mechanism is documented in [`ai-builder-lessons` lesson 038](https://github.com/cornjacket/ai-builder-lessons/blob/main/lessons/038-work-log-at-task-granularity.md).

### Rules

1. **Granularity is task / question / concept — never per-prompt.** Multiple prompts inside the same task share one entry. Open a new entry only when the focus changes (a new task starts, the user asks a substantively different question, or a meaningfully new concept comes up). Both failure modes corrupt the log: **entries-per-prompt** (noise that drowns out signal) and **tasks-without-entries** (gaps that make the log untrustworthy). When unsure whether the latest message starts a new task or continues one, **ask before writing** — picking the wrong granularity is harder to undo than asking.

2. **Entry format is fixed** — one or two sentences of *what changed and why*, ending with the short commit hash:

   ```
   - **YYYY-MM-DD** — <what changed and why>. Task: `<task-name>`. [Subtask: `<subtask-name>`.] Commit: `<short-hash>`.
   ```

   Use the fully-qualified task name (matching commit trailers and any task READMEs). Include `Subtask:` only when the entry is subtask-scoped.

3. **The commit hash is required.** If the entry is written before the commit lands, write `Commit: \`_pending_\`` and back-fill the short hash after the commit. **Do not create a dedicated commit just to back-fill the hash** — let the resolution ride into the next task's commit. Two commits per task is a smell.

4. **Announce every `log.md` edit.** Immediately after appending a new entry or back-filling a hash, output the literal string `📝 log.md updated` on its own line in chat. Silent edits do not count as a record of work — without the announcement, log activity is invisible inside long tool-call sequences.

<!--
  TODO: Rule 5 is a candidate for removal. ai-project-status only needs log.md
  discipline (rules 1–4); how a tracked repo announces commits in chat is a
  per-project Claude-Code-ergonomics concern and arguably belongs in each
  repo's own CLAUDE.md, not in a block injected by this meta-repo.
-->
5. **Announce every commit.** Immediately after creating a commit, output the literal string `✅ commit <short-hash>` on its own line in chat. This makes commits scannable in the transcript without scrolling tool calls.

## Daily plan (daily-plan.md)

`daily-plan.md` is a **forward-looking** companion to `log.md`, also at the repo root. It captures the intent for one working day. ai-project-status aggregates every tracked repo's `daily-plan.md` into [`daily-plan-summary.md`](https://github.com/cornjacket/ai-project-status/blob/main/daily-plan-summary.md).

### Rules

1. **Single-day scope.** The file represents *one* day's plan. It is **always overwritten**, never appended. History of what actually happened lives in `log.md` and `summary.md`.

2. **Header carries the date.** The first line MUST be `# Daily plan — YYYY-MM-DD`, where the date is the day the plan is *for*. The aggregator parses this to detect stale plans; an unparseable header is treated as stale.

3. **Body is a 100-ft view.** One short paragraph or list of intent, plus a small ASCII diagram (timeline, flow, milestones) that conveys the shape of the day at a glance. Don't write granular tasks — `log.md` records granularity after the fact.

4. **Forward-write rule.** Overwrite `daily-plan.md` with the next working day's plan **only when the user explicitly asks to plan tomorrow** — e.g., "write tomorrow's plan", "set up tomorrow", or an end-of-day signoff that includes a forward-planning intent. Do NOT auto-trigger on ambiguous "let's stop here" or "good for today" signoffs — wait for an explicit forward-planning ask. If today is Friday, write Monday's plan (the aggregator's weekend tolerance keeps the Friday-written-on-Friday plan valid through the weekend; Monday's plan is what's needed for Monday).

5. **Start-of-session safety net.** A `SessionStart` hook (installed at `.claude/hooks/check-daily-plan.py`) checks `daily-plan.md` freshness against today's most-recent-weekday. If stale or missing, it injects a prompt instructing you to ask the user for today's plan and overwrite the file before doing other work. Treat this as a hard precondition — don't proceed with other tasks until the plan is fresh.

<!-- ai-project-status:end -->
