# Cloudflare migration

The site is prepared for Cloudflare Pages plus D1. Netlify remains untouched until the Cloudflare beta is verified.

## Environment design

- `beta` branch -> Cloudflare beta Pages project -> `ballyhack-beta` D1 database
- `main` branch -> Cloudflare production Pages project -> `ballyhack-production` D1 database

The databases must never be shared between projects. Production deployment remains manual and requires David's approval.

## Cloudflare setup

1. Create the two D1 databases.
2. Apply `cloudflare/migrations/0001_initial.sql` to each database.
3. Create a Pages project for `beta` with the repository root as the output directory and no build command.
4. Bind its D1 database to the variable `DB` for both preview and production in that beta project.
5. After beta verification, create the production Pages project from `main` and bind the production D1 database as `DB`.

The shared API is `/api/secure-state`, implemented by `functions/api/secure-state.js`.

## Release controls

- Develop and test on `beta` only.
- Batch changes before pushing.
- Never point the beta project at the production D1 database.
- Promote `beta` to `main` only after explicit approval and a database backup.
