import { describe, expect, it, vi } from 'vitest';
import { loadAppsScript } from './apps-script-harness';

type Grid = Record<number, Record<number, any>>;

function makeSheet(name: string, grid: Grid) {
  const sheet: any = {
    getName: () => name,
    getLastRow: () => Math.max(0, ...Object.keys(grid).map(Number)),
    getRange: (row: number, col: number, numRows = 1, numCols = 1) => ({
      getValue: () => grid[row]?.[col] ?? '',
      setValue: (value: any) => { grid[row] ||= {}; grid[row][col] = value; return this; },
      getValues: () => Array.from({ length: numRows }, (_, r) => Array.from({ length: numCols }, (_, c) => grid[row + r]?.[col + c] ?? '')),
      setValues: (values: any[][]) => {
        values.forEach((valuesRow, r) => valuesRow.forEach((value, c) => {
          grid[row + r] ||= {};
          grid[row + r][col + c] = value;
        }));
      }
    })
  };
  return sheet;
}

function makeContext(videoGrid: Grid, sourceGrid: Grid = {}) {
  const videoSheet = makeSheet('VIDEO', videoGrid);
  const fontiSheet = makeSheet('FONTI', sourceGrid);
  const spreadsheet = {
    getSheetByName: (name: string) => name === 'VIDEO' ? videoSheet : name === 'FONTI' ? fontiSheet : null
  };
  const publishApprovedVideos = vi.fn();
  const ctx = loadAppsScript(['Config.gs', 'Triggers.gs'], {
    SpreadsheetApp: { getActive: () => spreadsheet },
    publishApprovedVideos
  });
  return { ctx, videoSheet, fontiSheet, publishApprovedVideos };
}

function videoRow(state = 'PUBBLICATO', approved = true, publication = 'PUBBLICATO') {
  return {
    1: 'Titolo', 2: 'video-test', 3: 'economia', 4: 'https://youtu.be/dQw4w9WgXcQ', 5: '2026-10-20', 6: 'Descrizione',
    7: state, 8: approved, 9: publication, 10: '2026-10-20 10:00', 11: 'https://example.test/fonti/video-test/'
  };
}

function eventRange(sheet: any, row: number, column: number, a1 = '') {
  let value: any = true;
  return {
    getSheet: () => sheet,
    getRow: () => row,
    getColumn: () => column,
    getA1Notation: () => a1,
    getValue: () => value,
    setValue: (next: any) => { value = next; },
    read: () => value
  };
}

describe('Apps Script edit invalidation', () => {
  it('clears approval when published VIDEO content is edited', () => {
    const grid: Grid = { 5: videoRow() };
    const { ctx, videoSheet } = makeContext(grid);
    const range = eventRange(videoSheet, 5, 1);
    ctx.handleBrainframeEdit({ range, value: 'Nuovo titolo' });
    expect(grid[5][7]).toBe('MODIFICATO - DA RIPUBBLICARE');
    expect(grid[5][8]).toBe(false);
    expect(grid[5][9]).toBe('MODIFICHE NON PUBBLICATE');
  });

  it('clears approval when an associated FONTI row is edited', () => {
    const videoGrid: Grid = { 5: videoRow() };
    const sourceGrid: Grid = { 2: { 1: 'video-test', 2: '00:35', 3: 'Claim', 4: 'Fonte' } };
    const { ctx, fontiSheet } = makeContext(videoGrid, sourceGrid);
    ctx.handleBrainframeEdit({ range: eventRange(fontiSheet, 2, 4), value: 'Fonte aggiornata' });
    expect(videoGrid[5][7]).toBe('MODIFICATO - DA RIPUBBLICARE');
    expect(videoGrid[5][8]).toBe(false);
  });

  it('ignores script-owned VIDEO status columns', () => {
    const grid: Grid = { 5: videoRow() };
    const { ctx, videoSheet } = makeContext(grid);
    ctx.handleBrainframeEdit({ range: eventRange(videoSheet, 5, 9), value: 'IN PUBBLICAZIONE' });
    expect(grid[5][7]).toBe('PUBBLICATO');
    expect(grid[5][8]).toBe(true);
    expect(grid[5][9]).toBe('PUBBLICATO');
  });

  it('runs the publish action once from VIDEO!A1 and always resets the checkbox', () => {
    const grid: Grid = { 5: videoRow() };
    const { ctx, videoSheet, publishApprovedVideos } = makeContext(grid);
    const range = eventRange(videoSheet, 1, 1, 'A1');
    ctx.handleBrainframeEdit({ range, value: 'TRUE' });
    expect(publishApprovedVideos).toHaveBeenCalledTimes(1);
    expect(range.read()).toBe(false);
  });
});
