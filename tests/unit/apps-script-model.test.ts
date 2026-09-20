import { describe, expect, it } from 'vitest';
import { loadAppsScript } from './apps-script-harness';

const video = (overrides: Record<string, unknown> = {}) => ({
  row: 5,
  'Titolo': 'Quanto costa davvero l’AI?',
  'Slug': 'quanto-costa-ai',
  'Categoria': 'economia',
  'YouTube': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'Data pubblicazione': '2026-10-20',
  'Descrizione': 'Le fonti usate nel video.',
  'Stato editoriale': 'APPROVATO',
  'Approvato da Matteo': true,
  'Stato pubblicazione': '',
  'Ultimo aggiornamento': '',
  'URL SourcePage': '',
  ...overrides
});

const source = (overrides: Record<string, unknown> = {}) => ({
  row: 2,
  'Video slug': 'quanto-costa-ai',
  'Timestamp': '00:35',
  'Claim': 'Il training ha un costo computazionale.',
  'Titolo fonte': 'Fonte A',
  'Autore / Ente': 'Ente A',
  'URL fonte': 'https://example.com/a',
  'Nota Brainframe': '',
  ...overrides
});

function modelContext() {
  return loadAppsScript(['Config.gs', 'Model.gs']);
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

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

describe('Apps Script publication model', () => {
  it('groups repeated claim rows into one claim with multiple sources', () => {
    const ctx = modelContext();
    const result = plain(ctx.buildPublicationModels_([video()], [
      source(),
      source({ row: 3, 'Titolo fonte': 'Fonte B', 'Autore / Ente': '', 'URL fonte': 'https://example.com/b' })
    ]));
    expect(result.errors).toEqual([]);
    expect(result.models).toHaveLength(1);
    expect(result.models[0].claims).toHaveLength(1);
    expect(result.models[0].claims[0].sources).toEqual([
      { title: 'Fonte A', author: 'Ente A', url: 'https://example.com/a' },
      { title: 'Fonte B', url: 'https://example.com/b' }
    ]);
  });

  it('sorts claims chronologically and generates a slug when missing', () => {
    const ctx = modelContext();
    const generatedSlug = 'quanto-costa-davvero-l-ai';
    const result = plain(ctx.buildPublicationModels_([
      video({ 'Titolo': 'Quanto costa davvero l’AI?', 'Slug': '' })
    ], [
      source({ 'Video slug': generatedSlug, 'Timestamp': '12:05', 'Claim': 'Secondo claim' }),
      source({ row: 3, 'Video slug': generatedSlug, 'Timestamp': '00:42', 'Claim': 'Primo claim', 'Titolo fonte': 'Fonte B', 'URL fonte': 'https://example.com/b' })
    ]));
    expect(result.errors).toEqual([]);
    expect(result.models[0].slug).toBe(generatedSlug);
    expect(result.models[0].claims.map((claim: any) => claim.time)).toEqual(['00:42', '12:05']);
  });

  it('accepts normal timestamps with one-digit minutes', () => {
    const ctx = modelContext();
    const result = plain(ctx.buildPublicationModels_([video()], [source({ 'Timestamp': '1:05' })]));
    expect(result.errors).toEqual([]);
    expect(result.models[0].claims[0].time).toBe('1:05');
  });

  it('requires an extractable YouTube video id for Sheet-authored content', () => {
    const ctx = modelContext();
    const result = plain(ctx.buildPublicationModels_([video({ 'YouTube': 'https://www.youtube.com/@BrainframeIT' })], [source()]));
    expect(result.models).toEqual([]);
    expect(result.errors.join('\n')).toMatch(/youtube/i);
  });

  it('rejects inconsistent notes inside the same claim', () => {
    const ctx = modelContext();
    const result = plain(ctx.buildPublicationModels_([video()], [
      source({ 'Nota Brainframe': 'Nota uno' }),
      source({ row: 3, 'Titolo fonte': 'Fonte B', 'URL fonte': 'https://example.com/b', 'Nota Brainframe': 'Nota due' })
    ]));
    expect(result.errors.join('\n')).toMatch(/nota/i);
  });

  it.each([
    ['missing title', video({ 'Titolo': '' }), source(), /titolo/i],
    ['unknown category', video({ 'Categoria': 'marketing' }), source(), /categoria/i],
    ['invalid source URL', video(), source({ 'URL fonte': 'javascript:alert(1)' }), /url fonte/i],
    ['malformed timestamp', video(), source({ 'Timestamp': '0:3' }), /timestamp/i]
  ])('rejects %s', (_label, videoRow, sourceRow, expected) => {
    const ctx = modelContext();
    const result = plain(ctx.buildPublicationModels_([videoRow], [sourceRow]));
    expect(result.errors.join('\n')).toMatch(expected as RegExp);
  });

  it('rejects duplicate selected slugs', () => {
    const ctx = modelContext();
    const result = plain(ctx.buildPublicationModels_([
      video(),
      video({ row: 6, 'Titolo': 'Altro video' })
    ], [source()]));
    expect(result.errors.join('\n')).toMatch(/slug.*duplicat/i);
  });

  it('allows an approved video with no external sources', () => {
    const ctx = modelContext();
    const result = plain(ctx.buildPublicationModels_([video()], []));
    expect(result.errors).toEqual([]);
    expect(result.models).toHaveLength(1);
    expect(result.models[0].claims).toEqual([]);
  });

  it('ignores rows that are not both editorially ready and approved by Matteo', () => {
    const ctx = modelContext();
    const result = plain(ctx.buildPublicationModels_([
      video({ 'Approvato da Matteo': false }),
      video({ row: 6, 'Slug': 'bozza', 'Stato editoriale': 'BOZZA' })
    ], []));
    expect(result.errors).toEqual([]);
    expect(result.models).toEqual([]);
  });

  it('serializes a stable JSON file with corrections array', () => {
    const ctx = modelContext();
    const result = plain(ctx.buildPublicationModels_([video()], [source()]));
    const parsed = JSON.parse(ctx.serializeVideo_(result.models[0]));
    expect(parsed.slug).toBe('quanto-costa-ai');
    expect(parsed.corrections).toEqual([]);
  });
});
