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

Deploy Preview entry path: `/`
