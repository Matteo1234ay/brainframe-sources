# Brainframe Sources Google Sheets Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Google Sheets into the editorial control panel for Brainframe Sources, publish approved video/source data to GitHub with one action, and show each YouTube video thumbnail + direct YouTube link on the site.

**Architecture:** Keep the Astro site as the production renderer and GitHub repository as the production source of truth. Add a small Google Apps Script package in-repo that creates/configures the Sheet, validates editorial rows, batches approved videos into one Git commit, and polls the resulting GitHub Actions deploy; the site gains a reusable YouTube parser/thumbnail component. The Sheet is an editorial workspace only: it never bypasses site validation or GitHub Actions.

**Tech Stack:** Astro, TypeScript, Vitest, Playwright, Google Apps Script (V8 runtime), Google Sheets, GitHub REST API, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-20-sheets-publishing-design.md`

## Global Constraints

- Only sources actually used in a Brainframe video may be published.
- Team members can edit content; final publication requires the protected `Approvato da Matteo` checkbox.
- Editing a published VIDEO row or an associated FONTI row clears approval and marks the content `MODIFICATO - DA RIPUBBLICARE`.
- Allowed categories are exactly `filosofia`, `design`, `economia`, `ingegneria`.
- Generated production files remain `src/data/videos/<slug>.json` and must stay compatible with `VideoRecord`.
- GitHub credentials must never be stored in Sheet cells; use Apps Script `Script Properties`.
- Publishing must fail closed before GitHub on validation errors.
- GitHub Pages deploys only after the existing verify job succeeds.
- `Guarda su YouTube` and the thumbnail open the original video in a new tab; no embedded player in v1.
- New Sheet-authored videos must use a YouTube URL from which a video ID can be extracted; the existing demo channel URL remains backward-compatible and uses the placeholder thumbnail.
- The first release must not add a custom backend, external paid service, or account system.

## File Structure

- Create `src/lib/youtube.ts` — parse/validate YouTube URLs and derive thumbnail URLs.
- Create `src/components/YouTubeThumbnail.astro` — reusable thumbnail with max-res -> HQ -> Brainframe placeholder fallback.
- Modify `src/pages/index.astro` — add thumbnails and YouTube CTA to video cards.
- Modify `src/pages/fonti/[slug].astro` — add thumbnail and new-tab YouTube CTA to SourcePage header.
- Modify `src/lib/videos.ts` — reuse YouTube URL validation without breaking the legacy demo.
- Modify `tests/unit/videos.test.ts` — video URL compatibility tests.
- Create `tests/unit/youtube.test.ts` — YouTube URL parser/thumbnail tests.
- Modify `tests/e2e/site.spec.ts` — thumbnail/link behavior on homepage and SourcePage.
- Create `apps-script/brainframe-sources/Config.gs` — sheet names, columns, repository/site constants.
- Create `apps-script/brainframe-sources/SheetSetup.gs` — build VIDEO/FONTI/LOG layout, validations, protections, menu, installable edit trigger.
- Create `apps-script/brainframe-sources/Model.gs` — read rows, normalize values, validate, group claims/sources, generate JSON payloads.
- Create `apps-script/brainframe-sources/GitHub.gs` — authenticated GitHub API requests, one batched Git commit, Actions run lookup.
- Create `apps-script/brainframe-sources/Publishing.gs` — publish orchestration, Sheet status updates, deploy polling.
- Create `apps-script/brainframe-sources/Triggers.gs` — edit invalidation and one-click control handling.
- Create `apps-script/brainframe-sources/appsscript.json` — V8 manifest and OAuth scopes.
- Create `apps-script/brainframe-sources/README.md` — one-time installation and token setup.
- Create `tests/unit/apps-script-harness.ts` — load exact `.gs` sources into a Node VM with Google service mocks.
- Create `tests/unit/apps-script-model.test.ts` — exact Apps Script validation/grouping tests.
- Create `tests/unit/apps-script-github.test.ts` — exact request/commit/status parsing tests with mocks.
- Modify `README.md` — link editorial publishing instructions.
- Modify `docs/ADDING-A-VIDEO.md` — make Sheets the normal workflow; retain JSON as recovery/manual path.

## Review Focus

1. **YouTube URL variants:** `watch?v=`, `youtu.be`, `/shorts/`, `/embed/`, `/live/`, query strings, and channel URLs must not produce wrong IDs; Task 1 pins each case.
2. **Multiple sources for one claim:** repeated VIDEO slug + timestamp + claim must become one claim with multiple sources, while inconsistent note/claim metadata must fail; Task 4 pins grouping behavior.
3. **Published-content edits:** edits to VIDEO metadata or FONTI rows for a published slug must clear approval but script-authored status writes must not recursively invalidate; Task 6 pins this.
4. **Partial GitHub failure:** no Sheet row may be marked `PUBBLICATO` merely because the commit succeeded; only a successful verify + deploy run can do that; Task 5 pins status parsing and Task 7 pins orchestration.
5. **Concurrent/repeated publish clicks:** a second click while a publication is pending must not create another commit for the same rows; Task 7 pins the lock/pending-state behavior.

---

### Task 1: YouTube URL parsing and media helpers

**Files:**
- Create: `src/lib/youtube.ts`
- Create: `tests/unit/youtube.test.ts`
- Modify: `src/lib/videos.ts`
- Modify: `tests/unit/videos.test.ts`

**Interfaces:**
- Produces: `isYouTubeUrl(url: string): boolean`
- Produces: `extractYouTubeVideoId(url: string): string | null`
- Produces: `getYouTubeThumbnailUrls(url: string): { maxres: string; hq: string } | null`
- `src/lib/videos.ts` continues to export the existing `VideoRecord`, `parseVideos`, `getAllVideos`, and category APIs unchanged.

- [ ] **Step 1: Write failing parser tests**

Add `tests/unit/youtube.test.ts` with exact cases:

```ts
import { describe, expect, it } from 'vitest';
import { extractYouTubeVideoId, getYouTubeThumbnailUrls, isYouTubeUrl } from '../../src/lib/youtube';

const id = 'dQw4w9WgXcQ';

describe('YouTube URLs', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${id}`, id],
    [`https://youtu.be/${id}?si=abc`, id],
    [`https://www.youtube.com/shorts/${id}`, id],
    [`https://www.youtube.com/embed/${id}`, id],
    [`https://www.youtube.com/live/${id}?feature=share`, id]
  ])('extracts a video id from %s', (url, expected) => {
    expect(extractYouTubeVideoId(url)).toBe(expected);
  });

  it('accepts a YouTube channel URL but returns no video id', () => {
    const url = 'https://www.youtube.com/@BrainframeIT';
    expect(isYouTubeUrl(url)).toBe(true);
    expect(extractYouTubeVideoId(url)).toBeNull();
  });

  it('rejects lookalike and non-http hosts', () => {
    expect(isYouTubeUrl('https://youtube.com.evil.example/watch?v=' + id)).toBe(false);
    expect(isYouTubeUrl('ftp://youtube.com/watch?v=' + id)).toBe(false);
  });

  it('derives maxres and hq thumbnails', () => {
    expect(getYouTubeThumbnailUrls(`https://youtu.be/${id}`)).toEqual({
      maxres: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      hq: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    });
  });
});
```

Extend `tests/unit/videos.test.ts` with:

```ts
it('rejects non-YouTube video links', () =>
  expect(() => parseVideos([{ ...base, youtube: 'https://example.com/video' }])).toThrow(/youtube/i));

it('keeps the legacy Brainframe channel URL valid', () =>
  expect(parseVideos([{ ...base, youtube: 'https://www.youtube.com/@BrainframeIT' }])).toHaveLength(1));
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/youtube.test.ts tests/unit/videos.test.ts
```

Expected: FAIL because `src/lib/youtube.ts` does not exist and `videos.ts` does not validate YouTube hosts.

- [ ] **Step 3: Implement the parser**

Create `src/lib/youtube.ts`:

```ts
const VIDEO_ID = /^[A-Za-z0-9_-]{6,}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

function parse(url: string) {
  try {
    const value = new URL(url);
    if (!['http:', 'https:'].includes(value.protocol) || !HOSTS.has(value.hostname.toLowerCase())) return null;
    return value;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(url: string) {
  return parse(url) !== null;
}

export function extractYouTubeVideoId(url: string) {
  const value = parse(url);
  if (!value) return null;

  let candidate: string | null = null;
  if (value.hostname.toLowerCase() === 'youtu.be') candidate = value.pathname.split('/').filter(Boolean)[0] ?? null;
  else if (value.pathname === '/watch') candidate = value.searchParams.get('v');
  else {
    const parts = value.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live'].includes(parts[0] ?? '')) candidate = parts[1] ?? null;
  }

  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

export function getYouTubeThumbnailUrls(url: string) {
  const id = extractYouTubeVideoId(url);
  return id ? {
    maxres: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    hq: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
  } : null;
}
```

Modify `src/lib/videos.ts` so `validateVideo` rejects non-YouTube hosts after `assertUrl(raw.youtube, 'youtube')`:

```ts
import { isYouTubeUrl } from './youtube';
// ...
assertUrl(raw.youtube, 'youtube');
if (!isYouTubeUrl(raw.youtube)) throw new Error('youtube must be a YouTube URL');
```

- [ ] **Step 4: Run focused tests and full unit suite**

Run:

```bash
npm run test:unit -- tests/unit/youtube.test.ts tests/unit/videos.test.ts
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube.ts src/lib/videos.ts tests/unit/youtube.test.ts tests/unit/videos.test.ts
git commit -m "feat: add YouTube media helpers"
```

---

### Task 2: YouTube thumbnails and links on Brainframe Sources

**Files:**
- Create: `src/components/YouTubeThumbnail.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/fonti/[slug].astro`
- Modify: `tests/e2e/site.spec.ts`

**Interfaces:**
- Consumes: `getYouTubeThumbnailUrls(url)` from Task 1.
- Produces component props: `{ youtube: string; title: string; class?: string }`.
- The component must link to the original `youtube` URL and open a new tab.

- [ ] **Step 1: Add failing browser assertions**

Extend the demo SourcePage test:

```ts
const youtubeLink = page.getByRole('link', { name: /Guarda il video su YouTube/i });
await expect(youtubeLink).toHaveAttribute('target', '_blank');
await expect(youtubeLink).toHaveAttribute('rel', /noopener/);
await expect(page.locator('[data-youtube-thumbnail]')).toBeVisible();
```

Add a homepage assertion:

```ts
test('video cards expose YouTube media separately from the source link', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.video-card [data-youtube-thumbnail]').first()).toBeVisible();
  await expect(page.locator('.video-card a[href*="youtube.com"]').first()).toHaveAttribute('target', '_blank');
});
```

- [ ] **Step 2: Run E2E and verify RED**

Run:

```bash
npm run build
npx playwright install chromium
npm run test:e2e -- tests/e2e/site.spec.ts
```

Expected: FAIL because the thumbnail component and new-tab CTA do not exist.

- [ ] **Step 3: Implement reusable thumbnail with fallbacks**

Create `src/components/YouTubeThumbnail.astro`:

```astro
---
import { getYouTubeThumbnailUrls } from '../lib/youtube';
import { withBase } from '../lib/paths';
interface Props { youtube: string; title: string; class?: string }
const { youtube, title, class: className = '' } = Astro.props;
const media = getYouTubeThumbnailUrls(youtube);
const placeholder = withBase('/og-default.svg');
---
<a class={`youtube-thumbnail ${className}`} href={youtube} target="_blank" rel="external noopener" aria-label={`Guarda ${title} su YouTube`}>
  <img
    data-youtube-thumbnail
    src={media?.maxres ?? placeholder}
    data-hq={media?.hq ?? ''}
    data-placeholder={placeholder}
    alt={`Miniatura YouTube — ${title}`}
    loading="lazy"
  />
</a>
<script is:inline>
  document.querySelectorAll('[data-youtube-thumbnail]').forEach((image) => {
    if (image.dataset.fallbackReady === 'true') return;
    image.dataset.fallbackReady = 'true';
    image.addEventListener('error', () => {
      if (image.dataset.hq && image.src !== image.dataset.hq) image.src = image.dataset.hq;
      else if (image.dataset.placeholder && image.src !== image.dataset.placeholder) image.src = image.dataset.placeholder;
    });
  });
</script>
<style>
  .youtube-thumbnail{display:block;overflow:hidden;border-radius:18px;background:#f3f1f6;aspect-ratio:16/9}
  .youtube-thumbnail img{display:block;width:100%;height:100%;object-fit:cover}
</style>
```

- [ ] **Step 4: Add the component to homepage and SourcePage**

In `src/pages/index.astro`, import the component and render it before each card’s text. Add `Guarda su YouTube ↗` with `target="_blank" rel="external noopener"`; keep `Vedi le fonti →` unchanged.

In `src/pages/fonti/[slug].astro`, render the thumbnail in the header and change the existing YouTube link to:

```astro
<a href={video.youtube} target="_blank" rel="external noopener">Guarda il video su YouTube ↗</a>
```

Add responsive CSS so thumbnails remain 16:9 and do not cause horizontal overflow.

- [ ] **Step 5: Run site verification**

Run:

```bash
npm run check
npm run build
npm run test:e2e -- tests/e2e/site.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/YouTubeThumbnail.astro src/pages/index.astro 'src/pages/fonti/[slug].astro' tests/e2e/site.spec.ts
git commit -m "feat: show YouTube thumbnails and links"
```

---

### Task 3: Google Sheet bootstrap, layout, protections, and publish control

**Files:**
- Create: `apps-script/brainframe-sources/Config.gs`
- Create: `apps-script/brainframe-sources/SheetSetup.gs`
- Create: `apps-script/brainframe-sources/appsscript.json`
- Create: `tests/unit/apps-script-harness.ts`
- Create: `tests/unit/apps-script-model.test.ts`

**Interfaces:**
- Produces globals: `BF`, `setupBrainframeSheet()`, `onOpen()`, `installBrainframeEditTrigger_()`.
- VIDEO headers start on row 4; rows 1–2 contain the visible publish control so data rows begin at 5.
- The visible control is `VIDEO!A1`, a checkbox styled next to the text `AGGIORNA BRAINFRAME SOURCES`; an installable edit trigger handles the click. The custom `Brainframe` menu provides the same action as a fallback.

- [ ] **Step 1: Add a VM harness that can execute exact `.gs` source**

Create `tests/unit/apps-script-harness.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export function loadAppsScript(files: string[], globals: Record<string, unknown> = {}) {
  const context = vm.createContext({ console, ...globals });
  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), 'apps-script/brainframe-sources', file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  return context as Record<string, any>;
}
```

- [ ] **Step 2: Write failing config/layout tests**

Create the first tests in `tests/unit/apps-script-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadAppsScript } from './apps-script-harness';

describe('Apps Script config', () => {
  it('defines the exact editorial columns and data start row', () => {
    const ctx = loadAppsScript(['Config.gs']);
    expect(Array.from(ctx.BF.VIDEO_HEADERS)).toEqual([
      'Titolo','Slug','Categoria','YouTube','Data pubblicazione','Descrizione','Stato editoriale',
      'Approvato da Matteo','Stato pubblicazione','Ultimo aggiornamento','URL SourcePage'
    ]);
    expect(ctx.BF.VIDEO_DATA_ROW).toBe(5);
    expect(Array.from(ctx.BF.CATEGORIES)).toEqual(['filosofia','design','economia','ingegneria']);
  });
});
```

- [ ] **Step 3: Run test and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/apps-script-model.test.ts
```

Expected: FAIL because Apps Script files do not exist.

- [ ] **Step 4: Implement config and setup**

Create `Config.gs` with a single frozen configuration object:

```js
const BF = Object.freeze({
  REPO: 'Matteo1234ay/brainframe-sources',
  BRANCH: 'main',
  SITE_BASE: 'https://matteo1234ay.github.io/brainframe-sources',
  VIDEO_SHEET: 'VIDEO',
  FONTI_SHEET: 'FONTI',
  LOG_SHEET: 'LOG',
  VIDEO_HEADER_ROW: 4,
  VIDEO_DATA_ROW: 5,
  PUBLISH_CONTROL: 'A1',
  VIDEO_HEADERS: ['Titolo','Slug','Categoria','YouTube','Data pubblicazione','Descrizione','Stato editoriale','Approvato da Matteo','Stato pubblicazione','Ultimo aggiornamento','URL SourcePage'],
  FONTI_HEADERS: ['Video slug','Timestamp','Claim','Titolo fonte','Autore / Ente','URL fonte','Nota Brainframe'],
  LOG_HEADERS: ['Data/ora','Video slug','Azione','Risultato','Riferimento GitHub','Errore'],
  CATEGORIES: ['filosofia','design','economia','ingegneria'],
  EDITORIAL_STATES: ['BOZZA','DA REVISIONARE','APPROVATO','PUBBLICATO','MODIFICATO - DA RIPUBBLICARE']
});
```

`SheetSetup.gs` must:

```js
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Brainframe')
    .addItem('AGGIORNA BRAINFRAME SOURCES', 'publishApprovedVideos')
    .addItem('Configura / ripara foglio', 'setupBrainframeSheet')
    .addToUi();
}
```

`setupBrainframeSheet()` creates/reuses VIDEO/FONTI/LOG, writes headers, puts the publish checkbox in `VIDEO!A1`, writes `AGGIORNA BRAINFRAME SOURCES` beside it, adds category/state validation, checkbox validation for `Approvato da Matteo`, freezes header rows, protects the approval column to the effective user, and installs exactly one edit trigger for `handleBrainframeEdit`.

Create `appsscript.json`:

```json
{
  "timeZone": "Europe/Rome",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp"
  ]
}
```

- [ ] **Step 5: Run config tests**

Run:

```bash
npm run test:unit -- tests/unit/apps-script-model.test.ts
```

Expected: PASS for configuration tests.

- [ ] **Step 6: Commit**

```bash
git add apps-script/brainframe-sources/Config.gs apps-script/brainframe-sources/SheetSetup.gs apps-script/brainframe-sources/appsscript.json tests/unit/apps-script-harness.ts tests/unit/apps-script-model.test.ts
git commit -m "feat: scaffold Brainframe Sheets publisher"
```

---

### Task 4: Sheet data normalization, validation, and JSON generation

**Files:**
- Create: `apps-script/brainframe-sources/Model.gs`
- Modify: `tests/unit/apps-script-model.test.ts`

**Interfaces:**
- Produces: `slugify_(title: string): string`
- Produces: `extractYouTubeVideoId_(url: string): string | null`
- Produces: `buildPublicationModels_(videoRows, sourceRows): { models: object[]; errors: string[] }`
- Produces: `serializeVideo_(model): string`
- Input rows are objects keyed by the exact human Sheet headers from Task 3.

- [ ] **Step 1: Write failing model tests**

Add tests for:

```ts
it('groups repeated source rows into one claim', () => {
  const ctx = loadAppsScript(['Config.gs', 'Model.gs']);
  const result = ctx.buildPublicationModels_([
    { row: 5, 'Titolo':'Quanto costa davvero l’AI?', 'Slug':'quanto-costa-ai', 'Categoria':'economia', 'YouTube':'https://youtu.be/dQw4w9WgXcQ', 'Data pubblicazione':'2026-10-20', 'Descrizione':'', 'Stato editoriale':'APPROVATO', 'Approvato da Matteo':true }
  ], [
    { row: 2, 'Video slug':'quanto-costa-ai', 'Timestamp':'00:35', 'Claim':'Costo del training', 'Titolo fonte':'Fonte A', 'Autore / Ente':'Ente A', 'URL fonte':'https://example.com/a', 'Nota Brainframe':'' },
    { row: 3, 'Video slug':'quanto-costa-ai', 'Timestamp':'00:35', 'Claim':'Costo del training', 'Titolo fonte':'Fonte B', 'Autore / Ente':'Ente B', 'URL fonte':'https://example.com/b', 'Nota Brainframe':'' }
  ]);
  expect(result.errors).toEqual([]);
  expect(result.models[0].claims).toHaveLength(1);
  expect(result.models[0].claims[0].sources).toHaveLength(2);
});

it('rejects a Sheet video URL without an extractable video id', () => {
  const ctx = loadAppsScript(['Config.gs', 'Model.gs']);
  const result = ctx.buildPublicationModels_([
    { row: 5, 'Titolo':'Video', 'Slug':'video', 'Categoria':'filosofia', 'YouTube':'https://www.youtube.com/@BrainframeIT', 'Data pubblicazione':'2026-10-20', 'Stato editoriale':'APPROVATO', 'Approvato da Matteo':true }
  ], []);
  expect(result.errors.join('\n')).toMatch(/VIDEO riga 5.*YouTube/i);
});

it('rejects inconsistent note metadata for the same claim', () => {
  const ctx = loadAppsScript(['Config.gs', 'Model.gs']);
  const sources = [
    { row: 2, 'Video slug':'x', 'Timestamp':'00:35', 'Claim':'Claim', 'Titolo fonte':'A', 'URL fonte':'https://example.com/a', 'Nota Brainframe':'Nota A' },
    { row: 3, 'Video slug':'x', 'Timestamp':'00:35', 'Claim':'Claim', 'Titolo fonte':'B', 'URL fonte':'https://example.com/b', 'Nota Brainframe':'Nota B' }
  ];
  const result = ctx.buildPublicationModels_([{ row:5, 'Titolo':'X','Slug':'x','Categoria':'design','YouTube':'https://youtu.be/dQw4w9WgXcQ','Data pubblicazione':'2026-10-20','Stato editoriale':'APPROVATO','Approvato da Matteo':true }], sources);
  expect(result.errors.join('\n')).toMatch(/Nota Brainframe/i);
});
```

Also pin missing title, unknown category, invalid source URL, malformed timestamp, duplicate slug, no sources, and chronological sorting.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/apps-script-model.test.ts
```

Expected: FAIL because `Model.gs` does not exist.

- [ ] **Step 3: Implement exact model rules**

`Model.gs` must implement:

```js
function slugify_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isHttpUrl_(value) {
  try { const u = new URL(String(value)); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch (e) { return false; }
}

function extractYouTubeVideoId_(value) {
  try {
    const u = new URL(String(value));
    const host = u.hostname.toLowerCase();
    if (!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host)) return null;
    let id = null;
    if (host === 'youtu.be') id = u.pathname.split('/').filter(Boolean)[0] || null;
    else if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const p = u.pathname.split('/').filter(Boolean);
      if (['shorts','embed','live'].includes(p[0])) id = p[1] || null;
    }
    return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
  } catch (e) { return null; }
}
```

`buildPublicationModels_` only selects rows with `Approvato da Matteo === true` and editorial state `APPROVATO` or `MODIFICATO - DA RIPUBBLICARE`; it validates every selected video, groups FONTI by `(slug, timestamp, claim)`, rejects inconsistent notes within a group, sorts claims by timestamp, and returns JSON-compatible records with `corrections: []`.

`serializeVideo_` returns `JSON.stringify(model, null, 2) + '\n'`.

- [ ] **Step 4: Run model tests and full unit suite**

Run:

```bash
npm run test:unit -- tests/unit/apps-script-model.test.ts
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps-script/brainframe-sources/Model.gs tests/unit/apps-script-model.test.ts
git commit -m "feat: validate and generate Sheet publication data"
```

---

### Task 5: GitHub batch commit and Actions status client

**Files:**
- Create: `apps-script/brainframe-sources/GitHub.gs`
- Create: `tests/unit/apps-script-github.test.ts`

**Interfaces:**
- Consumes token from `PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN')`.
- Produces: `githubRequest_(method, path, body?)`
- Produces: `commitVideoFiles_(files: { path: string; content: string }[]): { sha: string; url: string }`
- Produces: `getDeployState_(sha: string): { state: 'pending'|'success'|'failure'; runUrl?: string; message?: string }`

- [ ] **Step 1: Write failing GitHub client tests with mocked UrlFetchApp**

Create `tests/unit/apps-script-github.test.ts` and load `Config.gs` + `GitHub.gs` with mocks for `PropertiesService`, `Utilities.base64Encode`, and `UrlFetchApp.fetch`. Pin that:

```ts
expect(requests.map((r) => r.url)).toEqual([
  'https://api.github.com/repos/Matteo1234ay/brainframe-sources/git/ref/heads/main',
  'https://api.github.com/repos/Matteo1234ay/brainframe-sources/git/commits/base-sha',
  'https://api.github.com/repos/Matteo1234ay/brainframe-sources/git/blobs',
  'https://api.github.com/repos/Matteo1234ay/brainframe-sources/git/trees',
  'https://api.github.com/repos/Matteo1234ay/brainframe-sources/git/commits',
  'https://api.github.com/repos/Matteo1234ay/brainframe-sources/git/refs/heads/main'
]);
```

For two files, expect two blob POSTs but only one tree, one commit, and one ref update.

Add deploy-state fixtures for:
- no matching run -> `pending`
- verify/deploy in progress -> `pending`
- completed run with successful deploy -> `success`
- completed run with failed verify/deploy -> `failure`

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/apps-script-github.test.ts
```

Expected: FAIL because `GitHub.gs` does not exist.

- [ ] **Step 3: Implement authenticated GitHub requests and one batched commit**

`githubRequest_` must send:

```js
{
  method: method,
  contentType: 'application/json',
  headers: {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  },
  muteHttpExceptions: true,
  payload: body == null ? undefined : JSON.stringify(body)
}
```

Non-2xx responses throw `GitHub <status>: <message>` without including the token.

`commitVideoFiles_` must:
1. read `refs/heads/main`
2. read the base commit/tree
3. create one UTF-8 blob per JSON file
4. create one tree with paths `src/data/videos/<slug>.json`
5. create one commit with the base SHA as parent
6. fast-forward `refs/heads/main`

Commit message:

```text
content: publish Brainframe Sources from Google Sheets
```

`getDeployState_` reads Actions runs filtered by the commit SHA and then jobs for the matching `Verify and deploy Brainframe Sources` push run. It returns success only when both `verify` and `deploy` jobs are completed with conclusion `success`.

- [ ] **Step 4: Run GitHub client tests**

Run:

```bash
npm run test:unit -- tests/unit/apps-script-github.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps-script/brainframe-sources/GitHub.gs tests/unit/apps-script-github.test.ts
git commit -m "feat: publish Sheet content through GitHub API"
```

---

### Task 6: Edit invalidation and approval safety

**Files:**
- Create: `apps-script/brainframe-sources/Triggers.gs`
- Modify: `tests/unit/apps-script-model.test.ts`

**Interfaces:**
- Produces: `handleBrainframeEdit(e)` installable edit handler.
- Produces: `invalidatePublishedVideo_(slug)`.
- Calls `publishApprovedVideos()` only when the publish control checkbox is clicked.

- [ ] **Step 1: Write failing edit-safety tests**

Using lightweight Sheet/range mocks, pin these behaviors:

```ts
it('clears approval when a published VIDEO content cell changes', () => { /* row state becomes MODIFICATO - DA RIPUBBLICARE; approval false */ });
it('clears approval when an associated FONTI row changes', () => { /* matching VIDEO slug invalidated */ });
it('does not invalidate when script updates publication status columns', () => { /* status writes ignored */ });
it('routes a TRUE publish-control edit to publishApprovedVideos and resets the checkbox', () => { /* one call only */ });
```

Relevant VIDEO user-edit columns are only `Titolo` through `Descrizione`; editing status/approval/output columns does not recursively invalidate. A FONTI edit invalidates by the row’s `Video slug`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/apps-script-model.test.ts
```

Expected: FAIL because trigger functions do not exist.

- [ ] **Step 3: Implement trigger routing**

`handleBrainframeEdit(e)` must:
- detect `VIDEO!A1 === TRUE`, reset it to false in `finally`, and call `publishApprovedVideos()` once;
- ignore header/control rows for normal invalidation;
- invalidate a published VIDEO when columns 1–6 change;
- invalidate the corresponding VIDEO when any meaningful FONTI column changes;
- never call GitHub for ordinary edits.

`invalidatePublishedVideo_(slug)` sets:
- `Stato editoriale = 'MODIFICATO - DA RIPUBBLICARE'`
- `Approvato da Matteo = false`
- `Stato pubblicazione = 'MODIFICHE NON PUBBLICATE'`

only when the matched row was previously `PUBBLICATO` or already marked modified.

- [ ] **Step 4: Run focused and full unit tests**

Run:

```bash
npm run test:unit -- tests/unit/apps-script-model.test.ts
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps-script/brainframe-sources/Triggers.gs tests/unit/apps-script-model.test.ts
git commit -m "feat: invalidate approval after editorial edits"
```

---

### Task 7: One-click publication orchestration and background deploy polling

**Files:**
- Create: `apps-script/brainframe-sources/Publishing.gs`
- Modify: `tests/unit/apps-script-model.test.ts`
- Modify: `tests/unit/apps-script-github.test.ts`

**Interfaces:**
- Consumes Task 4 model functions and Task 5 GitHub functions.
- Produces: `publishApprovedVideos()`.
- Produces: `pollPendingPublications()`.
- Uses `LockService.getScriptLock()` to prevent duplicate concurrent publishes.
- Stores one pending publication record in Script Properties under `BF_PENDING_PUBLICATION`.

- [ ] **Step 1: Write failing orchestration tests**

Pin:
- invalid Sheet data shows/throws the human-readable validation list and does not call `commitVideoFiles_`;
- valid approved rows produce file paths `src/data/videos/<slug>.json` and one batch commit;
- affected rows become `IN PUBBLICAZIONE` after commit;
- a pending lock/property prevents a duplicate commit;
- `pending` deploy state schedules one time-driven poll trigger;
- `success` sets editorial/publication state `PUBBLICATO`, fills `Ultimo aggiornamento`, fills `${BF.SITE_BASE}/fonti/<slug>/`, logs success, and clears the pending property/trigger;
- `failure` sets `ERRORE PUBBLICAZIONE`, logs the run URL/message, keeps the previous live site untouched, and clears the pending property/trigger.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm run test:unit -- tests/unit/apps-script-model.test.ts tests/unit/apps-script-github.test.ts
```

Expected: FAIL because publishing orchestration does not exist.

- [ ] **Step 3: Implement publication state machine**

`publishApprovedVideos()`:
1. obtains a script lock with `tryLock(1000)`; if unavailable, shows `Pubblicazione già in corso` and exits;
2. rejects if `BF_PENDING_PUBLICATION` already exists;
3. reads Sheet rows into objects;
4. calls `buildPublicationModels_`;
5. if errors exist, displays one dialog containing all exact row errors and exits before GitHub;
6. serializes models to `src/data/videos/<slug>.json` files;
7. calls `commitVideoFiles_` once;
8. marks affected rows `IN PUBBLICAZIONE`;
9. stores `{ sha, runUrl: '', slugs, videoRows, createdAt }` in `BF_PENDING_PUBLICATION`;
10. calls `pollPendingPublications()` once;
11. releases the lock in `finally`.

`pollPendingPublications()` calls `getDeployState_(sha)` and either finalizes success/failure or creates exactly one one-minute time trigger:

```js
ScriptApp.newTrigger('pollPendingPublications').timeBased().after(60 * 1000).create();
```

Before creating a trigger, delete existing triggers whose handler is `pollPendingPublications` so only one future poll exists.

- [ ] **Step 4: Run all unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps-script/brainframe-sources/Publishing.gs tests/unit/apps-script-model.test.ts tests/unit/apps-script-github.test.ts
git commit -m "feat: orchestrate one-click Sources publishing"
```

---

### Task 8: Installation docs and editorial workflow

**Files:**
- Create: `apps-script/brainframe-sources/README.md`
- Modify: `README.md`
- Modify: `docs/ADDING-A-VIDEO.md`

**Interfaces:**
- Documents the exact `GITHUB_TOKEN` Script Property name used by Task 5.
- Documents required fine-grained GitHub token permissions: repository `Matteo1234ay/brainframe-sources`, Contents read/write, Actions read.

- [ ] **Step 1: Write the Apps Script installation guide**

`apps-script/brainframe-sources/README.md` must contain these exact operational steps:

1. Create/open the shared Brainframe Google Sheet.
2. Open `Extensions -> Apps Script`.
3. Create files matching `Config.gs`, `SheetSetup.gs`, `Model.gs`, `GitHub.gs`, `Publishing.gs`, `Triggers.gs`; paste the repository versions.
4. Replace the Apps Script manifest with `appsscript.json` (show manifest in editor if necessary).
5. In GitHub, create a fine-grained token restricted to `Matteo1234ay/brainframe-sources` with **Contents: Read and write** and **Actions: Read**.
6. In Apps Script `Project Settings -> Script properties`, add `GITHUB_TOKEN` with the token value.
7. Run `setupBrainframeSheet()` once as Matteo and authorize requested Google scopes.
8. Reload the Sheet; confirm the `Brainframe` menu and the `AGGIORNA BRAINFRAME SOURCES` control are visible.
9. Share the Sheet with team editors; keep the approval range protected.
10. Run one test publication with a non-demo video row before using it as the normal editorial path.

The token value must never be pasted into Sheet cells or committed to GitHub.

- [ ] **Step 2: Update user-facing repo docs**

Change `docs/ADDING-A-VIDEO.md` so the normal path is:

```text
Compila VIDEO -> aggiungi FONTI -> Matteo spunta Approvato da Matteo -> clicca AGGIORNA BRAINFRAME SOURCES -> attendi PUBBLICATO + URL SourcePage
```

Keep the current JSON instructions under `Procedura manuale di emergenza` so the site is maintainable even if Google is unavailable.

Add a short `Editorial publishing` section to root `README.md` linking to the Apps Script guide.

- [ ] **Step 3: Verify docs contain no secret examples**

Run:

```bash
grep -R "github_pat_\|ghp_" apps-script README.md docs || true
```

Expected: no token-shaped values.

- [ ] **Step 4: Commit**

```bash
git add apps-script/brainframe-sources/README.md README.md docs/ADDING-A-VIDEO.md
git commit -m "docs: document Sheets publishing workflow"
```

---

### Task 9: Full verification, CI hardening, and deployment rehearsal

**Files:**
- Modify if required by test discovery only: `vitest.config.ts`
- Modify if required by CI only: `.github/workflows/verify-and-deploy.yml`
- Test: entire repository

**Interfaces:**
- No new production interface; this is the release gate.

- [ ] **Step 1: Run all local/static verification available in the implementation environment**

```bash
npm install
npm run test:unit
npm run check
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

Expected: every command exits 0.

- [ ] **Step 2: Confirm Vitest includes new Apps Script tests**

If `npm run test:unit` does not list `youtube.test.ts`, `apps-script-model.test.ts`, and `apps-script-github.test.ts`, update `vitest.config.ts` include globs to cover `tests/unit/**/*.test.ts`; do not include Playwright files.

Re-run:

```bash
npm run test:unit
```

Expected: all unit suites pass once each.

- [ ] **Step 3: Open the implementation PR and wait for GitHub Actions**

PR description must call out:
- YouTube thumbnails/links
- Sheet setup and protected approval
- validation/generation
- one batched GitHub commit
- deploy polling/status feedback
- edit invalidation
- token/scopes setup

Expected GitHub Actions PR run: verify job success; deploy job skipped on PR.

- [ ] **Step 4: Perform one real Google Sheet smoke test before merge**

With Matteo’s shared Sheet:
1. install the exact Apps Script files from the branch;
2. set the fine-grained token in Script Properties;
3. run `setupBrainframeSheet()`;
4. create one valid test row + source row using a real Brainframe YouTube video URL;
5. approve it;
6. click the visible publish control;
7. verify Sheet moves `IN PUBBLICAZIONE` -> `PUBBLICATO` and receives the SourcePage URL;
8. open the generated SourcePage and verify thumbnail + YouTube link;
9. edit one source field and verify approval clears + state becomes `MODIFICATO - DA RIPUBBLICARE`.

Do not merge if any of these nine checks fail.

- [ ] **Step 5: Merge only after green CI and successful Sheet smoke test**

After merge, verify the main-branch workflow has:
- verify = success
- deploy = success

Then confirm the live GitHub Pages URL contains the expected thumbnail/link UI.

- [ ] **Step 6: Final commit if release-only adjustments were necessary**

```bash
git add .
git commit -m "test: verify Sheets publishing release"
```

Only create this commit if Step 1–5 required actual file changes; otherwise do not create an empty commit.

---

## Self-Review Results

- **Spec coverage:** all approved requirements are mapped: Sheet structure, protected approval, one-click publish control, validation, JSON generation, GitHub publication, status synchronization, edit invalidation, YouTube thumbnails/links, failure behavior, docs, and backward compatibility.
- **Placeholder scan:** no `TBD`, `TODO`, “implement later”, or unspecified error-handling steps remain.
- **Type/interface consistency:** site helpers use `youtube` URL as the single source of truth; Apps Script uses the same category names, slug paths, source shape, and publication states throughout Tasks 3–7.
- **Review Focus coverage:** URL variants -> Task 1; multi-source grouping -> Task 4; edit invalidation -> Task 6; CI/deploy truth -> Tasks 5 and 7; duplicate-click concurrency -> Task 7.
- **Scope note:** the Google Sheet itself is an external artifact. Repository implementation can fully define/setup its tabs, validations, triggers, and UI control through `setupBrainframeSheet()`, but the final smoke test requires one connected/shared Google Sheet and a user-created fine-grained GitHub token because secrets cannot be created or stored on the user’s behalf in source control.
