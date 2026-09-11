# Ballyhack Beta Workflow

This repository uses two deployment stages:

- `beta` — all development and testing changes go here first. This branch must not be used as the Netlify production branch.
- `main` — production only. Changes move here only after David explicitly approves promotion to the live site.

## Required workflow

1. Make website changes on `beta` only.
2. Test through the pull request / non-production preview.
3. Do not commit routine test changes directly to `main`.
4. When David explicitly says to publish/promote to production, merge the approved beta changes into `main` once.
5. After promotion, continue new development on `beta`.

This prevents individual test edits from creating Netlify production deploys and consuming production-deploy credits.