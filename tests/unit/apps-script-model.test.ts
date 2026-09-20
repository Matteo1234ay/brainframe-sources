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
