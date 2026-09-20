import { describe, expect, it, vi } from 'vitest';
import { loadAppsScript } from './apps-script-harness';

describe('Apps Script trigger installation', () => {
  it('installs both edit and structural change triggers without duplicates', () => {
    const spreadsheet = {};
    const existing = [
      { getHandlerFunction: () => 'handleBrainframeEdit' },
      { getHandlerFunction: () => 'handleBrainframeChange' },
      { getHandlerFunction: () => 'someOtherTrigger' }
    ];
    const deleteTrigger = vi.fn();
    const created: Array<{ handler: string; kind: string }> = [];
    const newTrigger = vi.fn((handler: string) => {
      let kind = '';
      const builder: any = {
        forSpreadsheet: (_spreadsheet: any) => builder,
        onEdit: () => { kind = 'edit'; return builder; },
        onChange: () => { kind = 'change'; return builder; },
        create: () => { created.push({ handler, kind }); return {}; }
      };
      return builder;
    });

    const ctx = loadAppsScript(['Config.gs', 'SheetSetup.gs'], {
      SpreadsheetApp: { getActive: () => spreadsheet },
      ScriptApp: {
        getProjectTriggers: () => existing,
        deleteTrigger,
        newTrigger
      }
    });

    ctx.installBrainframeTriggers_();

    expect(deleteTrigger).toHaveBeenCalledTimes(2);
    expect(created).toEqual([
      { handler: 'handleBrainframeEdit', kind: 'edit' },
      { handler: 'handleBrainframeChange', kind: 'change' }
    ]);
  });
});
