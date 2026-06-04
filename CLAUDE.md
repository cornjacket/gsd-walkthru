# CLAUDE.md

Project-specific operating directives for Claude Code.

<!-- ai-project-status:begin -->
<!--
  This block is injected and refreshed by ai-project-status:
  https://github.com/cornjacket/ai-project-status

  It defines the commit-message discipline this repo must follow so
  the meta-repo can summarize cross-portfolio activity in summary.md.

  Do not edit between the begin/end markers — local edits will be
  overwritten on the next `setup-new-repo.sh --update`. To change
  the rules, edit templates/claude-rule.md in ai-project-status
  and re-run `setup-new-repo.sh --update <this-repo-remote>`.
-->
## Knowledge Extraction & Git Automation

This repo is monitored by [`ai-project-status`](https://github.com/cornjacket/ai-project-status). It no longer reads a `log.md` file — backward-looking activity is reconstructed **directly from your git history**. Your job is to make every commit message a high-level, self-contained telemetry record so the meta-repo can summarize cross-portfolio activity in `summary.md`.

### Commit-message schema

Every commit MUST follow this shape:

```
<domain>(<scope>): <high-level functional summary>
- [Context]: Why this was done / what was learned.
- [Impact]: How it alters the project or system behavior.
```

### Rules

1. **The title summarizes the functional change, not the files.** Describe the overall behavior change or architectural decision (`engine(telemetry): replace log.md mining with commit parsing`), NOT a list of touched file names (`update _lib.py and tests`). A reader scanning `git log` should grasp *what changed in the system* from the title alone.

2. **`[Context]` and `[Impact]` are required on any non-trivial commit.** `[Context]` captures the why / the lesson learned; `[Impact]` captures how the project or system behavior changes. Each may span multiple lines. Trivial mechanical commits (typo, formatting) may omit them.

3. **Commit at task granularity — never per-prompt.** Multiple prompts inside one task land in one commit. Open a new commit when the focus changes (a new task, a substantively different question, a meaningfully new concept). Avoid both **commit-per-prompt** (noise that drowns out signal) and **task-without-a-commit** (gaps that make the history untrustworthy).

4. **Automate the commit before session close.** Stage the work (`git add`) and run `git commit -m` with a schema-compliant message before ending the session. Do not leave completed work uncommitted — uncommitted work is invisible to the meta-repo.

5. **Announce each task commit.** Immediately after committing, print `✅ <short-hash> — <title>` on its own line in the conversation, so the user can scan the transcript for recorded work at a glance. One checkmark per task commit — the commit *is* the record, so there is nothing else to back-fill.

## Daily plan (daily-plan.md)

`daily-plan.md` is a **forward-looking** plan file at the repo root. It captures the intent for one working day. ai-project-status aggregates every tracked repo's `daily-plan.md` into [`daily-plan-summary.md`](https://github.com/cornjacket/ai-project-status/blob/main/daily-plan-summary.md).

### Rules

1. **Single-day scope.** The file represents *one* day's plan. It is **always overwritten**, never appended. History of what actually happened lives in your git history and `summary.md`.

2. **Header carries the date.** The first line MUST be `# Daily plan — YYYY-MM-DD`, where the date is the day the plan is *for*. The aggregator parses this to detect stale plans; an unparseable header is treated as stale.

3. **Body is a 100-ft view.** One short paragraph or list of intent, plus a small ASCII diagram (timeline, flow, milestones) that conveys the shape of the day at a glance. Don't write granular tasks — your commit history records granularity after the fact.

4. **Forward-write rule.** Overwrite `daily-plan.md` with the next working day's plan **only when the user explicitly asks to plan tomorrow** — e.g., "write tomorrow's plan", "set up tomorrow", or an end-of-day signoff that includes a forward-planning intent. Do NOT auto-trigger on ambiguous "let's stop here" or "good for today" signoffs — wait for an explicit forward-planning ask. If today is Friday, write Monday's plan (the aggregator's weekend tolerance keeps the Friday-written-on-Friday plan valid through the weekend; Monday's plan is what's needed for Monday).

5. **Start-of-session safety net.** A `SessionStart` hook (installed at `.claude/hooks/check-daily-plan.py`) checks `daily-plan.md` freshness against today's most-recent-weekday. If stale or missing, it injects a prompt instructing you to ask the user for today's plan and overwrite the file before doing other work. Treat this as a hard precondition — don't proceed with other tasks until the plan is fresh.

<!-- ai-project-status:end -->
