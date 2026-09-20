import { describe, expect, it } from 'vitest';
import { loadAppsScript } from './apps-script-harness';

function response(code: number, body: unknown) {
  return {
    getResponseCode: () => code,
    getContentText: () => JSON.stringify(body)
  };
}

function githubContext(queue: ReturnType<typeof response>[], token: string | null = 'secret-token') {
  const calls: Array<{ url: string; options: any }> = [];
  const globals = {
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (key: string) => key === 'GITHUB_TOKEN' ? token : null })
    },
    Utilities: {
      base64Encode: (value: string) => Buffer.from(value, 'utf8').toString('base64')
    },
    UrlFetchApp: {
      fetch: (url: string, options: any) => {
        calls.push({ url, options });
        const next = queue.shift();
        if (!next) throw new Error('Unexpected GitHub request: ' + url);
        return next;
      }
    }
  };
  return { ctx: loadAppsScript(['Config.gs', 'GitHub.gs'], globals), calls };
}

describe('Apps Script GitHub client', () => {
  it('refuses to call GitHub when the token is missing', () => {
    const { ctx, calls } = githubContext([], null);
    expect(() => ctx.githubRequest_('GET', '/git/ref/heads/main')).toThrow(/GITHUB_TOKEN/);
    expect(calls).toHaveLength(0);
  });

  it('publishes multiple JSON files in one Git commit', () => {
    const { ctx, calls } = githubContext([
      response(200, { object: { sha: 'base-sha' } }),
      response(200, { tree: { sha: 'base-tree' } }),
      response(201, { sha: 'blob-a' }),
      response(201, { sha: 'blob-b' }),
      response(201, { sha: 'new-tree' }),
      response(201, { sha: 'new-commit', html_url: 'https://github.com/example/commit/new-commit' }),
      response(200, { object: { sha: 'new-commit' } })
    ]);

    const result = ctx.commitVideoFiles_([
      { path: 'src/data/videos/a.json', content: '{"slug":"a"}\n' },
      { path: 'src/data/videos/b.json', content: '{"slug":"b"}\n' }
    ]);

    expect(JSON.parse(JSON.stringify(result))).toEqual({
      sha: 'new-commit',
      url: 'https://github.com/example/commit/new-commit'
    });
    expect(calls.filter((call) => call.url.endsWith('/git/blobs'))).toHaveLength(2);
    expect(calls.filter((call) => call.url.endsWith('/git/trees'))).toHaveLength(1);
    expect(calls.filter((call) => call.url.endsWith('/git/commits'))).toHaveLength(1);
    expect(calls.filter((call) => call.url.endsWith('/git/refs/heads/main'))).toHaveLength(1);
    expect(calls[0].options.headers.Authorization).toBe('Bearer secret-token');
    expect(calls.some((call) => String(call.options.payload || '').includes('secret-token'))).toBe(false);
  });

  it('reports pending while the push workflow has not appeared yet', () => {
    const { ctx } = githubContext([response(200, { workflow_runs: [] })]);
    expect(JSON.parse(JSON.stringify(ctx.getDeployState_('abc123')))).toEqual({ state: 'pending' });
  });

  it('reports success only when verify and deploy both succeeded', () => {
    const { ctx } = githubContext([
      response(200, { workflow_runs: [{ id: 99, name: 'Verify and deploy Brainframe Sources', event: 'push', head_sha: 'abc123', status: 'completed', conclusion: 'success', html_url: 'https://github.com/run/99' }] }),
      response(200, { jobs: [
        { name: 'verify', status: 'completed', conclusion: 'success' },
        { name: 'deploy', status: 'completed', conclusion: 'success' }
      ] })
    ]);
    expect(JSON.parse(JSON.stringify(ctx.getDeployState_('abc123')))).toEqual({ state: 'success', runUrl: 'https://github.com/run/99' });
  });

  it('does not call a successful commit published while deploy is still running', () => {
    const { ctx } = githubContext([
      response(200, { workflow_runs: [{ id: 100, name: 'Verify and deploy Brainframe Sources', event: 'push', head_sha: 'abc123', status: 'in_progress', conclusion: null, html_url: 'https://github.com/run/100' }] }),
      response(200, { jobs: [
        { name: 'verify', status: 'completed', conclusion: 'success' },
        { name: 'deploy', status: 'in_progress', conclusion: null }
      ] })
    ]);
    expect(JSON.parse(JSON.stringify(ctx.getDeployState_('abc123')))).toEqual({ state: 'pending', runUrl: 'https://github.com/run/100' });
  });

  it('reports a failed verification or deploy as failure', () => {
    const { ctx } = githubContext([
      response(200, { workflow_runs: [{ id: 101, name: 'Verify and deploy Brainframe Sources', event: 'push', head_sha: 'abc123', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/run/101' }] }),
      response(200, { jobs: [
        { name: 'verify', status: 'completed', conclusion: 'failure' },
        { name: 'deploy', status: 'completed', conclusion: 'skipped' }
      ] })
    ]);
    const result = JSON.parse(JSON.stringify(ctx.getDeployState_('abc123')));
    expect(result.state).toBe('failure');
    expect(result.runUrl).toBe('https://github.com/run/101');
    expect(result.message).toMatch(/verify/i);
  });

  it('surfaces GitHub API errors without exposing the token', () => {
    const { ctx } = githubContext([response(422, { message: 'Reference update failed' })]);
    expect(() => ctx.githubRequest_('GET', '/broken')).toThrow(/GitHub 422: Reference update failed/);
    try { ctx.githubRequest_('GET', '/broken-again'); } catch (error) {
      expect(String(error)).not.toContain('secret-token');
    }
  });
});
