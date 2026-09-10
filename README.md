# Ballyhack Fall Classic Cup website

This is a working mobile-first PWA prototype for the Sept. 30-Oct. 2, 2026 trip. Open `index.html` through a local/static web server (for example `python -m http.server`) to use it.

## Included now
- Hole-by-hole gross score entry with Blue Ridge par/stroke-index Net Stableford calculation
- Live individual leaderboard, best 3 of 4 and dropped-round handling
- Cottage Cup (best 3 of 4 players each round; all four rounds count)
- Chase for the Cup progress after every round
  - After Round 1: opening standings and points behind leader
  - After Round 2: cumulative race and position
  - After Round 3: vulnerable round, Friday targets, and Path to the Podium
  - After Round 4: final best-3-of-4 results
- Pairings, tee times and forecaddie coverage
- None / 40 Ball / rotating Nassau selector
- Shortcut-completion tracker
- Trip settlement worksheet
- Offline-capable PWA shell

## Before deployment
The prototype stores scoring in each browser with `localStorage`. For true multi-device live scoring, connect the state layer to Supabase/Firebase (or another hosted database), add authentication/admin permissions, and deploy to a secure HTTPS URL. Then insert that URL and its QR code into the trip document.

The header attempts to load Ballyhack's official goat logo from Dormie Network's public media asset; the packaged local goat event mark is the offline fallback.

- Standings movement: Leaderboard and Chase show ▲ places gained, ▼ places lost, or — no change versus the prior completed round.
