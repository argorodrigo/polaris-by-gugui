# polaris by Gugui (shareable)

The shareable version of polaris. Anyone can set it up: no account, no server. It keeps what your AI chats decide in one place: one record per topic, an Inbox where chats propose and you decide, what is waiting on you, a Vault of file pointers and a Log.

Built 11/25/2026. None of Gugui's own records, characters or data are inside. The planet and the resident are new art made for this app.

## What is here

| path | what |
|---|---|
| `src/core.js` | parser for the POLARIS handoff block, data model, merge, Markdown export, zip. No DOM |
| `src/app.js` | the app: views, setup wizard, in-app Guide, GitHub sync |
| `src/style.css` | the polaris look |
| `src/index.template.html`, `src/sw.js`, `src/manifest.webmanifest` | page shell, offline service worker, install manifest |
| `art/` | lockup, planet, resident (and blink frames when they land). Drop a file in and rebuild |
| `icons/` | app icons made from the planet |
| `build.py` | builds `www/`: one self-contained `index.html` plus `sw.js`, manifest, icons |
| `test/parse.test.js` | parser, merge and zip tests, including real Claude and ChatGPT replies |
| `test/e2e.py` | phone and desktop run-through: setup, capture, apply, reload, injection check |

## Build

```
python3 build.py
node test/parse.test.js
python3 -m http.server 8765 -d www   # then python3 test/e2e.py
```

## The loop

1. Setup gives you start-here text for Claude Project instructions, ChatGPT custom instructions or CLAUDE.md.
2. At the end of a chat say "polaris handoff" (or paste the handoff prompt from Capture).
3. Paste the reply into Capture. The parser finds the `POLARIS v1 ... END POLARIS` block, even inside chatter, bold markers, numbered lists or JSON.
4. Apply each Inbox item: fact to Start here, decision to Decisions, waiting to Waiting, asset to the Vault, correction to Start here plus the Log.

## Data

- On this device: browser storage, plus JSON backup and a Markdown zip in repo layout (`polaris/topics/<slug>/STAR.md`).
- GitHub sync: a private repo the user owns, a fine-grained token limited to that repo with Contents read and write. Sync pulls, merges by item id and updated time, then pushes with the file sha. A clash keeps the newer side and puts the other in the Inbox as held, so nothing is lost. The token never leaves the device except to api.github.com.

## Android

Capacitor 7 wraps `www/` (package `com.argorodrigo.polaris`). Signing key is kept off the repo.

## Rules built in

Newest dated statement wins (older lines stay, marked superseded). Nothing is deleted: archive only. Locked lines cannot be edited. Every line carries its said date and source.
