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

  it('can run setup from the script editor without requiring a spreadsheet UI context', () => {
    const range: any = {
      insertCheckboxes: () => range,
      setValue: () => range,
      setFontWeight: () => range,
      setValues: () => range,
      setDataValidation: () => range,
      protect: () => protection
    };
    const protection: any = {
      setDescription: () => protection,
      getEditors: () => [],
      removeEditors: vi.fn(),
      addEditor: vi.fn(),
      canDomainEdit: () => false,
      setDomainEdit: vi.fn()
    };
    const sheet: any = {
      getRange: () => range,
      getProtections: () => [],
      setFrozenRows: vi.fn(),
      getMaxRows: () => 1000,
      autoResizeColumns: vi.fn()
    };
    const spreadsheet: any = {
      getSheetByName: () => sheet,
      insertSheet: () => sheet
    };
    const validationBuilder: any = {
      requireValueInList: () => validationBuilder,
      setAllowInvalid: () => validationBuilder,
      build: () => ({})
    };
    const triggerBuilder: any = {
      forSpreadsheet: () => triggerBuilder,
      onEdit: () => triggerBuilder,
      onChange: () => triggerBuilder,
      create: () => ({})
    };

    const ctx = loadAppsScript(['Config.gs', 'SheetSetup.gs'], {
      SpreadsheetApp: {
        getActive: () => spreadsheet,
        getUi: () => { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); },
        newDataValidation: () => validationBuilder,
        ProtectionType: { RANGE: 'RANGE' }
      },
      ScriptApp: {
        getProjectTriggers: () => [],
        deleteTrigger: vi.fn(),
        newTrigger: () => triggerBuilder
      },
      Session: {
        getEffectiveUser: () => ({})
      }
    });

    expect(() => ctx.setupBrainframeSheet()).not.toThrow();
  });
});
