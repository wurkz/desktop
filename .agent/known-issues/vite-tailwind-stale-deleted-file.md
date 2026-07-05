# Vite / Tailwind ENOENT on a Deleted Scanned File (dev-server only)

> **Status:** Not a code bug — stale dev-server state. Fix: restart `tauri dev`.

## Symptom

While `npm run tauri dev` is running, deleting a source file that Tailwind
scans for class names causes a Vite error overlay in the webview like:

```
[plugin:vite:css] [postcss] ENOENT: no such file or directory,
open 'D:\Projects\Zorviz\apps\desktop\src\lib\crypto.ts'
D:/Projects/Zorviz/packages/ui/src/styles.css:undefined:null
  ...tailwindcss/lib/lib/expandTailwindAtRules.js
  ...tailwindcss/lib/processTailwindFeatures.js
```

The stack trace points at `styles.css` and `tailwindcss`, which makes it look
like a CSS/styles problem — it is not.

## Cause

Tailwind's JIT content-scanner caches the list of files it globs for classes.
When a scanned `.ts`/`.tsx` file is **deleted while the dev server is running**,
the watcher keeps the old path in its cached content list. The next CSS
reprocess (triggered by any HMR event) tries to read the now-missing file and
throws `ENOENT`. The code is fine; only the running watcher is stale.

## How we hit it

Increment 4 (single-path migration) deleted `apps/desktop/src/lib/crypto.ts`
(plus `db.ts`, `tauri-dialect.ts`). A `tauri dev` process that had been running
since *before* the deletion later reprocessed CSS and threw on `crypto.ts`.

## Fix

Restart the dev server so the watcher rebuilds its content list from disk:

1. Stop the running `tauri dev` (and make sure its child processes on :1420
   Vite and :3030 Rust are gone).
2. `cd apps/desktop && npm run tauri dev` again.

No source change is needed. Confirmed clean after restart: no
`vite-error-overlay`, `#root` renders, zero console errors. A `tauri build`
was never affected (fresh process each time).

## Rule of thumb

**When you delete a source file that Tailwind scans, restart the dev server**
rather than trusting HMR to reconcile. Same applies to renames/moves of
scanned files. Not a concern for production builds.
