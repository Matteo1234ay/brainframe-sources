function githubRequest_(method, path, body) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN non configurato nelle Script Properties');

  var options = {
    method: String(method || 'GET').toLowerCase(),
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };
  if (body !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }

  var response = UrlFetchApp.fetch('https://api.github.com/repos/' + BF.REPO + path, options);
  var status = response.getResponseCode();
  var content = response.getContentText();
  var parsed = {};
  if (content) {
    try { parsed = JSON.parse(content); }
    catch (error) { parsed = { message: content }; }
  }
  if (status < 200 || status >= 300) {
    throw new Error('GitHub ' + status + ': ' + (parsed.message || 'richiesta fallita'));
  }
  return parsed;
}

function commitVideoFiles_(files) {
  if (!files || !files.length) throw new Error('Nessun file da pubblicare');

  var ref = githubRequest_('GET', '/git/ref/heads/' + BF.BRANCH);
  var baseSha = ref.object.sha;
  var baseCommit = githubRequest_('GET', '/git/commits/' + baseSha);
  var treeItems = files.map(function(file) {
    var blob = githubRequest_('POST', '/git/blobs', {
      content: Utilities.base64Encode(file.content),
      encoding: 'base64'
    });
    return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
  });

  var tree = githubRequest_('POST', '/git/trees', {
    base_tree: baseCommit.tree.sha,
    tree: treeItems
  });
  var commit = githubRequest_('POST', '/git/commits', {
    message: 'content: publish Brainframe Sources from Google Sheets',
    tree: tree.sha,
    parents: [baseSha]
  });
  githubRequest_('PATCH', '/git/refs/heads/' + BF.BRANCH, {
    sha: commit.sha,
    force: false
  });

  return {
    sha: commit.sha,
    url: commit.html_url || ('https://github.com/' + BF.REPO + '/commit/' + commit.sha)
  };
}

function failedConclusion_(conclusion) {
  return ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].indexOf(conclusion) !== -1;
}

function getDeployState_(sha) {
  var runs = githubRequest_('GET', '/actions/runs?head_sha=' + encodeURIComponent(sha) + '&event=push&per_page=10');
  var run = (runs.workflow_runs || []).find(function(candidate) {
    return candidate.name === 'Verify and deploy Brainframe Sources' && candidate.event === 'push' && candidate.head_sha === sha;
  });
  if (!run) return { state: 'pending' };

  var resultBase = run.html_url ? { runUrl: run.html_url } : {};
  var jobsResponse = githubRequest_('GET', '/actions/runs/' + run.id + '/jobs?per_page=100');
  var jobs = jobsResponse.jobs || [];
  var verify = jobs.find(function(job) { return job.name === 'verify'; });
  var deploy = jobs.find(function(job) { return job.name === 'deploy'; });

  if (verify && failedConclusion_(verify.conclusion)) {
    return { state: 'failure', runUrl: run.html_url, message: 'Il job verify non è riuscito: ' + verify.conclusion };
  }
  if (deploy && failedConclusion_(deploy.conclusion)) {
    return { state: 'failure', runUrl: run.html_url, message: 'Il job deploy non è riuscito: ' + deploy.conclusion };
  }
  if (verify && verify.status === 'completed' && verify.conclusion === 'success' && deploy && deploy.status === 'completed' && deploy.conclusion === 'success') {
    return { state: 'success', runUrl: run.html_url };
  }
  if (run.status === 'completed' && failedConclusion_(run.conclusion)) {
    return { state: 'failure', runUrl: run.html_url, message: 'La workflow GitHub non è riuscita: ' + run.conclusion };
  }
  return Object.assign({ state: 'pending' }, resultBase);
}
