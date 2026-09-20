# Brainframe Sources — Google Sheets Publishing Design

Date: 2026-09-20
Status: Proposed design for user review

## 1. Goal

Turn Google Sheets into the editorial control panel for Brainframe Sources so the team can prepare video metadata and source references without editing JSON or opening GitHub.

The publishing flow is:

Google Sheet -> validation -> Google Apps Script -> GitHub repository -> automated verification -> GitHub Pages -> updated Brainframe Sources site.

The system must preserve the existing editorial rule: only sources actually used in a Brainframe video are published.

## 2. Roles and publishing authority

- Team members can edit content in the Sheet.
- Matteo is the final publisher.
- A video can be sent to the site only when its status is `APPROVATO`.
- The publish action is triggered by a visible `AGGIORNA BRAINFRAME SOURCES` control in the Sheet.
- Approval should be protected in the Sheet so only the final publisher can change it.

## 3. Google Sheet structure

### Tab: VIDEO

One row per Brainframe video.

Columns:

- `Titolo`
- `Slug`
- `Categoria`
- `YouTube`
- `Data pubblicazione`
- `Descrizione`
- `Stato editoriale`
- `Approvato`
- `Stato pubblicazione`
- `Ultimo aggiornamento`
- `URL SourcePage`

Allowed categories:

- `filosofia`
- `design`
- `economia`
- `ingegneria`

Allowed editorial states:

- `BOZZA`
- `DA REVISIONARE`
- `APPROVATO`
- `PUBBLICATO`
- `MODIFICATO - DA RIPUBBLICARE`

The slug is generated automatically from the title for a new video and becomes stable after first publication so public URLs do not change accidentally.

### Tab: FONTI

One row per source attached to a claim.

Columns:

- `Video slug`
- `Timestamp`
- `Claim`
- `Titolo fonte`
- `Autore / Ente`
- `URL fonte`
- `Nota Brainframe`

Several rows can share the same `Video slug`, `Timestamp`, and `Claim`. Those rows are grouped into one claim with multiple sources in the generated JSON.

### Optional tab: LOG

Human-readable publication log containing:

- date/time
- video slug
- action
- result
- GitHub commit/PR reference when available
- error message when publication fails

This tab is useful for auditing and troubleshooting but is not required for the site build itself.

## 4. Sheet UX

The Sheet will contain a prominent action named:

`AGGIORNA BRAINFRAME SOURCES`

Implementation can be exposed through a custom Apps Script menu and, optionally, a drawing/button assigned to the same function.

On click:

1. Read all rows marked `APPROVATO` or `MODIFICATO - DA RIPUBBLICARE`.
2. Validate the video and source rows.
3. Stop before GitHub if any validation error exists.
4. Show precise errors such as:
   - `FONTI riga 12: manca URL fonte`
   - `VIDEO riga 4: link YouTube non valido`
   - `quanto-costa-ai: nessuna fonte associata`
5. If valid, generate the site JSON.
6. Send the change to GitHub.
7. Update `Stato pubblicazione` to `IN PUBBLICAZIONE`.
8. After successful GitHub verification/deploy, update it to `PUBBLICATO` and fill `Ultimo aggiornamento` + `URL SourcePage`.
9. If verification/deploy fails, set `ERRORE PUBBLICAZIONE` and retain the error reference.

## 5. Validation rules

Apps Script should mirror the existing site validation so bad content is rejected before it reaches the repository.

Required video fields:

- non-empty title
- valid stable slug
- allowed category
- valid YouTube URL
- publication date
- at least one claim

Required claim/source fields:

- timestamp in `MM:SS` or longer-minute form already supported by the site
- non-empty claim
- at least one source per claim
- non-empty source title
- valid `http` or `https` source URL

Additional checks:

- duplicate video slugs are rejected
- duplicate source rows may be detected and warned about
- timestamps are sorted automatically before JSON generation
- unapproved videos are never published

## 6. Generated data format

Apps Script generates or updates one file per video at:

`src/data/videos/<slug>.json`

It must remain compatible with the current `VideoRecord` schema:

```json
{
  "title": "Quanto costa davvero l’AI?",
  "slug": "quanto-costa-ai",
  "category": "economia",
  "youtube": "https://www.youtube.com/watch?v=...",
  "published": "2026-10-20",
  "description": "Le fonti usate nel video Brainframe.",
  "claims": [
    {
      "time": "00:35",
      "claim": "Primo punto sostenuto da fonti.",
      "note": "Nota opzionale.",
      "sources": [
        {
          "title": "Fonte A",
          "author": "Autore / Ente",
          "url": "https://example.com/a"
        }
      ]
    }
  ],
  "corrections": []
}
```

No thumbnail URL needs to be stored in the JSON.

## 7. YouTube integration

The existing `youtube` field remains the source of truth.

The site will support common YouTube URL formats, including normal watch URLs, `youtu.be`, Shorts, embed URLs, and live URLs where possible.

From that URL the site extracts the YouTube video ID and derives the thumbnail automatically.

Thumbnail strategy:

1. Prefer the high-resolution YouTube thumbnail when available.
2. Fall back to the standard YouTube high-quality thumbnail if the high-resolution asset is missing.
3. Fall back to the existing Brainframe visual placeholder if no valid video ID can be extracted.

No team member has to upload a thumbnail manually.

## 8. Site changes for videos

### Homepage / video cards

Each video card should show:

- YouTube thumbnail
- category
- video title
- short description when available
- `Vedi le fonti`
- a clear `Guarda su YouTube` action

The thumbnail itself is clickable and opens the original YouTube video.

### SourcePage

At the top of each SourcePage, show:

- category
- title
- publication date
- YouTube thumbnail
- `Guarda il video su YouTube` action
- description
- source timeline

The image and YouTube action should open the original video in a new tab.

Design decision for v1: do not embed the YouTube player directly inside the SourcePage. This keeps the page faster, avoids unnecessary third-party player loading/cookies, and preserves the Sources-first editorial experience. An embedded player can be added later if desired.

## 9. GitHub publishing strategy

For reliability, the Sheet should not blindly overwrite production without checks.

Recommended flow:

1. Apps Script validates the Sheet locally.
2. Apps Script writes the generated JSON through the GitHub API.
3. GitHub Actions runs the existing unit tests, Astro checks, build, and Playwright tests.
4. GitHub Pages deploys only after the verification job succeeds.
5. If verification fails, the previous live site remains online.

For the first implementation, writes may go directly to `main` after Apps Script validation because the existing deploy job already gates publication on successful verification. If stronger repository isolation is needed later, this can be upgraded to temporary content branches + automatic PR merge after green CI.

## 10. Authentication and secrets

GitHub credentials must never be stored in Sheet cells.

Use a fine-grained GitHub personal access token restricted to:

- repository: `Matteo1234ay/brainframe-sources`
- only the repository permissions required to update content

Store the token in Google Apps Script `Script Properties`.

The script reads the token at runtime. Team members editing the Sheet do not need to know or handle the token.

The token should be revocable and replaceable without changing the Sheet structure.

## 11. Synchronization behavior

After a successful publish:

- `Stato editoriale` becomes `PUBBLICATO`
- `Stato pubblicazione` becomes `PUBBLICATO`
- `Ultimo aggiornamento` is filled
- `URL SourcePage` is generated automatically

If an already published row is modified, Apps Script should mark it `MODIFICATO - DA RIPUBBLICARE` so the Sheet never falsely appears synchronized with the website.

The Sheet is the editorial workspace; the repository remains the production source consumed by the website.

## 12. Failure behavior

The publish process must fail closed.

Examples:

- missing field -> do not call GitHub
- invalid URL -> do not call GitHub
- unknown category -> do not call GitHub
- video with no sources -> do not call GitHub
- GitHub API error -> mark publication as failed
- CI/build failure -> live site stays on the previous successful deployment

Errors should be understandable to non-developers and point to the exact tab/row where possible.

## 13. Scope for the first implementation

Included:

- VIDEO tab
- FONTI tab
- optional LOG tab
- protected approval workflow
- custom publish control
- Apps Script validation
- JSON generation
- GitHub API publishing
- publication status feedback
- YouTube ID parsing
- automatic YouTube thumbnails
- clickable thumbnail and YouTube CTA on cards and SourcePages
- automated tests for generated content and YouTube presentation

Not included in v1:

- custom standalone CMS/backend
- user accounts outside Google permissions
- embedded YouTube player
- automated source discovery
- automatic claim fact-checking
- automatic extraction of sources from the video itself

## 14. Success criteria

The feature is complete when:

1. A team member can prepare a new Brainframe video entirely from Google Sheets.
2. Matteo can approve it and trigger publication without opening GitHub or editing JSON.
3. Invalid rows are blocked with useful messages.
4. Valid data produces the correct `src/data/videos/<slug>.json` file.
5. Existing GitHub verification still passes.
6. A successful publish updates GitHub Pages automatically.
7. The Sheet receives the resulting public SourcePage URL and publication state.
8. Homepage cards and SourcePages show the YouTube thumbnail automatically.
9. Clicking the thumbnail or YouTube CTA opens the correct video.
10. Existing SourcePages remain backward compatible.

## 15. Open assumption for user approval

For v1, `Guarda su YouTube` and the thumbnail open the original YouTube video in a new browser tab rather than embedding playback inside Brainframe Sources. This is intentional for speed and simplicity, but can be changed before implementation if the desired behavior is in-page playback.
