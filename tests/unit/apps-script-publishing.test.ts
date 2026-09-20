import { describe, expect, it, vi } from 'vitest';
import { loadAppsScript } from './apps-script-harness';

type Grid = Record<number, Record<number, any>>;

function makeSheet(name: string, grid: Grid) {
  const appended: any[][] = [];
  return {
    getName: () => name,
    getLastRow: () => Math.max(0, ...Object.keys(grid).map(Number)),
    getRange: (row: number, col: number, numRows = 1, numCols = 1) => ({
      getValue: () => grid[row]?.[col] ?? '',
      setValue: (value: any) => { grid[row] ||= {}; grid[row][col] = value; },
      getValues: () => Array.from({ length: numRows }, (_, r) =>
        Array.from({ length: numCols }, (_, c) => grid[row + r]?.[col + c] ?? '')
      ),
      setValues: (values: any[][]) => values.forEach((valuesRow, r) => valuesRow.forEach((value, c) => {
        grid[row + r] ||= {};
        grid[row + r][col + c] = value;
      }))
    }),
    appendRow: (values: any[]) => appended.push(values),
    appended
  };
}

function validVideoRow() {
  return {
    1: 'Quanto costa l’AI?',
    2: 'quanto-costa-ai',
    3: 'economia',
    4: 'https://youtu.be/dQw4w9WgXcQ',
    5: '2026-10-20',
    6: 'Descrizione',
    7: 'APPROVATO',
    8: true,
    9: '',
    10: '',
    11: ''
  };
}

function validSourceRow() {
  return {
    1: 'quanto-costa-ai',
    2: '00:35',
    3: 'Il training ha un costo computazionale.',
    4: 'Fonte A',
    5: 'Ente A',
    6: 'https://example.com/a',
    7: ''
  };
}

function makeContext(options: {
  videoGrid?: Grid;
  sourceGrid?: Grid;
  pending?: string;
  deployState?: any;
  deployError?: Error;
  commitResult?: any;
  existingPollTrigger?: boolean;
} = {}) {
  const videoGrid = options.videoGrid ?? { 5: validVideoRow() };
  const sourceGrid = options.sourceGrid ?? { 2: validSourceRow() };
  const logGrid: Grid = {};
  const video = makeSheet('VIDEO', videoGrid);
  const fonti = makeSheet('FONTI', sourceGrid);
  const log = makeSheet('LOG', logGrid);
  const spreadsheet = { getSheetByName: (name: string) => name === 'VIDEO' ? video : name === 'FONTI' ? fonti : name === 'LOG' ? log : null };

  const props: Record<string, string> = {};
  if (options.pending) props.BF_PENDING_PUBLICATION = options.pending;
  const scriptProperties = {
    getProperty: (key: string) => props[key] ?? null,
    setProperty: (key: string, value: string) => { props[key] = value; },
    deleteProperty: (key: string) => { delete props[key]; }
  };

  const commitVideoFiles_ = vi.fn((_files: any[]) => options.commitResult ?? ({ sha: 'abc123', url: 'https://github.com/commit/abc123' }));
  const getDeployState_ = vi.fn((_sha: string) => {
    if (options.deployError) throw options.deployError;
    return options.deployState ?? ({ state: 'pending', runUrl: 'https://github.com/actions/runs/1' });
  });
  const releaseLock = vi.fn();
  const tryLock = vi.fn(() => true);
  const createdTriggers: any[] = [];
  const existingTrigger = { getHandlerFunction: () => 'pollPendingPublications' };
  const triggers = options.existingPollTrigger ? [existingTrigger] : [];
  const deleteTrigger = vi.fn((trigger: any) => {
    const index = triggers.indexOf(trigger);
    if (index >= 0) triggers.splice(index, 1);
  });
  const newTrigger = vi.fn((handler: string) => {
    const trigger = { getHandlerFunction: () => handler };
    const builder: any = {
      timeBased: () => builder,
      after: () => builder,
      create: () => { triggers.push(trigger); createdTriggers.push(trigger); return trigger; }
    };
    return builder;
  });

  const ctx = loadAppsScript(['Config.gs', 'Model.gs', 'Publishing.gs'], {
    SpreadsheetApp: { getActive: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => scriptProperties },
    LockService: { getScriptLock: () => ({ tryLock, releaseLock }) },
    ScriptApp: { getProjectTriggers: () => triggers, deleteTrigger, newTrigger },
    commitVideoFiles_,
    getDeployState_
  });

  return { ctx, videoGrid, props, log, commitVideoFiles_, getDeployState_, createdTriggers, deleteTrigger, releaseLock };
}

describe('Apps Script publishing orchestration', () => {
  it('fails closed on invalid Sheet data and never calls GitHub', () => {
    const { ctx, commitVideoFiles_ } = makeContext({ sourceGrid: {} });
    expect(() => ctx.publishApprovedVideos()).toThrow(/nessuna fonte associata/i);
    expect(commitVideoFiles_).not.toHaveBeenCalled();
  });

  it('publishes all approved models in one commit and marks rows in progress', () => {
    const { ctx, videoGrid, props, commitVideoFiles_, createdTriggers } = makeContext();
    const result = ctx.publishApprovedVideos();
    expect(commitVideoFiles_).toHaveBeenCalledTimes(1);
    const files = commitVideoFiles_.mock.calls[0]![0];
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('src/data/videos/quanto-costa-ai.json');
    expect(JSON.parse(files[0]!.content).slug).toBe('quanto-costa-ai');
    expect(videoGrid[5][9]).toBe('IN PUBBLICAZIONE');
    expect(JSON.parse(props.BF_PENDING_PUBLICATION).sha).toBe('abc123');
    expect(createdTriggers).toHaveLength(1);
    expect(result.sha).toBe('abc123');
  });

  it('blocks a second click while a publication is pending', () => {
    const pending = JSON.stringify({ sha: 'old', rows: [{ row: 5, slug: 'quanto-costa-ai' }] });
    const { ctx, commitVideoFiles_ } = makeContext({ pending });
    expect(() => ctx.publishApprovedVideos()).toThrow(/già in corso/i);
    expect(commitVideoFiles_).not.toHaveBeenCalled();
  });

  it('keeps pending publications pending and ensures one poll trigger', () => {
    const pending = JSON.stringify({ sha: 'abc123', rows: [{ row: 5, slug: 'quanto-costa-ai' }] });
    const { ctx, props, createdTriggers } = makeContext({ pending, deployState: { state: 'pending' } });
    const result = ctx.pollPendingPublications();
    expect(result.state).toBe('pending');
    expect(props.BF_PENDING_PUBLICATION).toBeTruthy();
    expect(createdTriggers).toHaveLength(1);
  });

  it('replaces the one-time poll trigger when a poll runs but deploy is still pending', () => {
    const pending = JSON.stringify({ sha: 'abc123', rows: [{ row: 5, slug: 'quanto-costa-ai' }] });
    const { ctx, props, createdTriggers, deleteTrigger } = makeContext({
      pending,
      deployState: { state: 'pending' },
      existingPollTrigger: true
    });
    const result = ctx.pollPendingPublications();
    expect(result.state).toBe('pending');
    expect(props.BF_PENDING_PUBLICATION).toBeTruthy();
    expect(deleteTrigger).toHaveBeenCalledTimes(1);
    expect(createdTriggers).toHaveLength(1);
  });

  it('reschedules polling after a transient GitHub API error', () => {
    const pending = JSON.stringify({ sha: 'abc123', rows: [{ row: 5, slug: 'quanto-costa-ai' }] });
    const { ctx, props, createdTriggers, deleteTrigger } = makeContext({
      pending,
      deployError: new Error('temporary GitHub error'),
      existingPollTrigger: true
    });
    expect(() => ctx.pollPendingPublications()).toThrow(/temporary GitHub error/i);
    expect(props.BF_PENDING_PUBLICATION).toBeTruthy();
    expect(deleteTrigger).toHaveBeenCalledTimes(1);
    expect(createdTriggers).toHaveLength(1);
  });

  it('marks rows published only after verify and deploy succeed', () => {
    const pending = JSON.stringify({ sha: 'abc123', commitUrl: 'https://github.com/commit/abc123', rows: [{ row: 5, slug: 'quanto-costa-ai' }] });
    const { ctx, videoGrid, props, log, deleteTrigger } = makeContext({
      pending,
      deployState: { state: 'success', runUrl: 'https://github.com/actions/runs/1' },
      existingPollTrigger: true
    });
    const result = ctx.pollPendingPublications();
    expect(result.state).toBe('success');
    expect(videoGrid[5][7]).toBe('PUBBLICATO');
    expect(videoGrid[5][9]).toBe('PUBBLICATO');
    expect(String(videoGrid[5][10])).not.toBe('');
    expect(videoGrid[5][11]).toBe('https://matteo1234ay.github.io/brainframe-sources/fonti/quanto-costa-ai/');
    expect(props.BF_PENDING_PUBLICATION).toBeUndefined();
    expect(deleteTrigger).toHaveBeenCalledTimes(1);
    expect(log.appended.at(-1)?.[3]).toBe('PUBBLICATO');
  });

  it('records deploy failure without marking the content published', () => {
    const pending = JSON.stringify({ sha: 'abc123', rows: [{ row: 5, slug: 'quanto-costa-ai' }] });
    const { ctx, videoGrid, props, log } = makeContext({
      pending,
      deployState: { state: 'failure', runUrl: 'https://github.com/actions/runs/1', message: 'verify failure' },
      existingPollTrigger: true
    });
    const result = ctx.pollPendingPublications();
    expect(result.state).toBe('failure');
    expect(videoGrid[5][7]).toBe('APPROVATO');
    expect(videoGrid[5][9]).toBe('ERRORE PUBBLICAZIONE');
    expect(props.BF_PENDING_PUBLICATION).toBeUndefined();
    expect(log.appended.at(-1)?.[3]).toBe('ERRORE PUBBLICAZIONE');
    expect(log.appended.at(-1)?.[5]).toContain('verify failure');
  });
});
