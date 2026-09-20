import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export function loadAppsScript(files: string[], globals: Record<string, unknown> = {}) {
  const context = vm.createContext({ console, URL, ...globals });
  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), 'apps-script/brainframe-sources', file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  return context as Record<string, any>;
}
