# Ballyhack Beta Workflow

This repository uses two deployment stages:

- `beta` — all development and testing changes go here first. This branch deploys only to the isolated Cloudflare beta project and beta D1 database.
- `main` — production only. Changes move here only after David explicitly approves promotion to the live site.

## Required workflow

1. Make website changes on `beta` only.
2. Test through the pull request / non-production preview.
3. Do not commit routine test changes directly to `main`.
4. When David explicitly says to publish/promote to production, merge the approved beta changes into `main` once.
5. After promotion, continue new development on `beta`.

This prevents individual test edits from changing production and keeps beta data isolated from live tournament scores.

## Pre-promotion verification

Run `npm test`. The test suite uses an in-memory SQLite database and exercises the Cloudflare API across four rounds, both Nassau press stages, 40 Ball selections, locks, concurrent edits, and checkpoint restore. It does not replace a real two-phone/mobile visual rehearsal.

On beta, test a wager and a Press from one phone while the opposing golfer uses another phone to Press the Press. Confirm that both appear separately in the Ledger. Then create a commissioner checkpoint, edit a score, restore it, and verify both phones refresh before scoring again. Only scores are queued offline; wagers and side-game choices must be submitted while connected.

Deploy Preview entry path: `/`
