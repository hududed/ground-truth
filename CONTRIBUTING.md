# Contributing edge cases

## Before you commit anything

This repo enables GitHub's secret scanning + push protection server-side. Locally, there's a second, opt-in guardrail in `.githooks/pre-commit` that catches a category GitHub's scanner doesn't: personal absolute paths and internal-planning-doc references that shouldn't leak into a public repo, plus common secret-token shapes as defense in depth. Turn it on once per clone:

```bash
git config core.hooksPath .githooks
```

It only checks what's actually staged, runs in well under a second, and blocks the commit with the offending lines printed if it finds something.

The fastest way this project gets better is people finding real cases where an AI got a Quran citation wrong (or right, in a way this tool got wrong) and reporting it. You do not need to know how to code. You do not need to know how the checker works internally. You need three things: the prompt you used, the exact response you got, and which platform it was on.

## How to report an edge case

Open a new issue using the **Edge case report** template. It asks for:

1. **The exact prompt you used.** Copy-paste it, don't paraphrase - small wording differences can matter.
2. **The AI's exact response**, either as pasted text (preferred - it's searchable and exact) or a full-screen screenshot (fine if pasting isn't convenient - a screenshot of the *whole* browser window, not just the answer, helps confirm which site and what else was on screen).
3. **Which platform** (ChatGPT, Claude, Gemini, Google AI Mode, etc.) and roughly when, since these products change their output formatting over time.
4. **What you expected vs. what Ground Truth actually showed** - did it miss a citation entirely, flag something wrongly, or show a confusing result? If you have DevTools open (optional, for anyone comfortable with it), the `[GROUND TRUTH]` console lines are useful but not required.

That's it. No account needed beyond a GitHub login, no code, no setup.

## What happens after you report one (the automated part)

Every new edge-case issue triggers an automated pass that:

1. **Extracts the reported text** from the issue body.
2. **Runs it through the current checker** (`node test/checker.test.js`-style, against the exact text you reported) and checks: does the *current* released version already handle this correctly?
   - **If yes** - the issue gets a comment explaining why it already works as of the current version, with the actual output shown, and gets closed. You don't have to wait on a human to tell you "already fixed."
   - **If no** - it proceeds to step 3.
3. **Drafts a regression test** reproducing your exact reported input and the correct expected output, and opens a **draft pull request** containing that new test (which will fail against the current code - that's the point, it proves the gap is real).
4. **Attempts a fix**, if one is mechanical and within the existing architecture (e.g. a new alternate-spelling alias, a new keyword for the bare-citation heuristic, an off-by-one in a bounds check). The attempt, whether it succeeds or not, gets pushed to the same draft PR with an explanation.
5. **Comments back on your issue** linking the draft PR, either "here's the fix, awaiting review" or "this needs human judgment, here's why" (see the governance rule below for when that happens).

## The one thing that never gets automated

**No fix ever merges without a human maintainer reviewing it first.** This is not a formality - it is the direct, load-bearing consequence of this project's entire premise. A project whose whole point is "verify the claim, especially your own confident one" cannot then turn around and let an AI silently merge its own fixes into the exact logic that makes trust claims about citations. That would be the precise failure mode this tool exists to catch, just relocated one layer up.

Concretely, this means:

- The automated pipeline can **propose**, **test**, and **draft** - it never has merge permissions.
- Anything touching **hadith grading, fiqh rulings, tafsir, or fatwa-humility scoring** (all still out of v1's scope entirely) gets flagged for explicit human escalation, full stop, regardless of how "obviously correct" an automated fix looks. This mirrors the same scholar-sign-off rule that already governs any future ground-truth expansion.
- For everything else (citation-fidelity logic, extraction regexes, UI), automated fixes still require a human to read the diff and press merge. A found-and-verified regression test that stays red until someone actually looks at it is a completely acceptable, healthy state for this repo to be in - better than a fix nobody checked.

## What makes a good edge-case report (and what doesn't)

**Good:** "Asked ChatGPT 'quote Al-Fatihah 2:5' - it said [exact response]. Ground Truth showed green VALID, but I think it should have flagged something since ayah 5 belongs to a different chapter number than what's written." (This exact class of report is what found the NAME/NUMBER MISMATCH feature - a real bug, found by a careful human noticing an inconsistency, not by random prompting.)

**Not yet actionable:** "The AI seemed wrong somewhere" with no exact text. The automation (and any human following up) needs the literal input to reproduce against - a vague description can't become a regression test.

**Out of scope for now, but still worth filing** (labelled and set aside, not closed as invalid): anything about English-translation quality/nuance, tafsir interpretation, or hadith grading. These require a scholar's involvement per the governance rule above - filing them now still builds the queue for when that capacity exists.

## If you're a scholar, or GitHub isn't your thing

The governance rule above means real progress on hadith grading, fiqh, or tafsir is gated on a named, qualified scholar reviewing and signing off on a small batch of items in writing - not a GitHub workflow requirement, an actual one. If that's you, or you know someone, you don't need a GitHub account to help: email **support@multimodeai.com** directly and it'll reach a real person. Same address for engineers who'd rather discuss the sunnah.com/dorar.net integration before opening a PR.
