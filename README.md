# Rod Userscripts Organized Stack

Organized on **2026-06-01**. This package keeps active scripts in numbered folders and moves duplicates, broken files, empty files, and superseded versions into `99-quarantine/`.

## Folder convention

- `00-core/` runs first: boot helpers, observability, shared launcher.
- `01-devtools/` contains global debugging/editor overlays.
- `02-github/` contains GitHub-only tools.
- `03-docs/` contains documentation-site readers.
- `04-site-enhancers/` contains specific website improvements.
- `05-media/` contains media controls.
- `90-libs-and-reference/` keeps libraries, zips, TypeScript experiments, and non-active references.
- `99-quarantine/` keeps everything removed from the active stack so nothing is lost.

## Naming convention

`NNN-scope-purpose.user.js`

The number controls install/execution order. Global scripts get lower numbers. Site-specific scripts get higher numbers.

## Runtime order

1. `000-029`: boot, error capture, window/global watchers.
2. `030`: launcher/catalog.
3. `100-199`: DevTools and editor overlays.
4. `200-299`: GitHub tools.
5. `300-399`: docs readers.
6. `400-499`: site enhancers.
7. `500+`: media/global optional tools.

## Shared libraries

Rod-owned core/devtools scripts were normalized to load the shared bundle first:

```text
https://oirodolfo.github.io/bundler/bundle.iife.js?v0
```

That keeps Fábrica, Seiva and Cipó available for component-style UI without duplicating tiny DOM/style/state helpers across scripts.

## Validation

Active scripts were checked with `node --check`.

- Active scripts passing syntax check: **41**
- Active scripts failing syntax check: **0**
- Broken scripts quarantined: **7**
- Empty scripts quarantined: **7**
- Duplicate scripts quarantined: **44**
- Old/superseded versions quarantined: **62**

See `manifest.json` for the full file-by-file report.

## Install recommendation

Install only the files in `00-core` through `05-media`. Do not install files from `99-quarantine` unless you are manually rescuing an old experiment.
