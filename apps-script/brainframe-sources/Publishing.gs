var BF_PENDING_KEY = 'BF_PENDING_PUBLICATION';

function sheetRows_(sheet, headerRow, dataRow, headers) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < dataRow) return [];
  var count = lastRow - dataRow + 1;
  var values = sheet.getRange(dataRow, 1, count, headers.length).getValues();
  return values.map(function(valuesRow, index) {
    var row = { row: dataRow + index };
    headers.forEach(function(header, column) {
      row[header] = valuesRow[column];
    });
    return row;
  }).filter(function(row) {
    return headers.some(function(header) { return text_(row[header]) !== ''; });
  });
}

function publicationTimestamp_() {
  return new Date().toISOString();
}

function appendPublicationLog_(spreadsheet, slug, result, reference, error) {
  var log = spreadsheet.getSheetByName(BF.LOG_SHEET);
  if (!log || !log.appendRow) return;
  log.appendRow([
    publicationTimestamp_(),
    slug || '',
    'PUBBLICAZIONE',
    result || '',
    reference || '',
    error || ''
  ]);
}

function pollTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === 'pollPendingPublications';
  });
}

function ensurePublicationPoll_() {
  if (pollTriggers_().length) return;
  ScriptApp.newTrigger('pollPendingPublications').timeBased().after(30000).create();
}

function clearPublicationPolls_() {
  pollTriggers_().forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
}

function readPendingPublication_() {
  var raw = PropertiesService.getScriptProperties().getProperty(BF_PENDING_KEY);
  if (!raw) return null;
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || !parsed.sha || !Array.isArray(parsed.rows)) throw new Error('invalid');
    return parsed;
  } catch (error) {
    throw new Error('Stato di pubblicazione pendente non valido. Controlla le Script Properties.');
  }
}

function publishApprovedVideos() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Un’altra pubblicazione Brainframe è già in corso.');

  try {
    var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty(BF_PENDING_KEY)) {
      throw new Error('Una pubblicazione Brainframe è già in corso. Attendi il completamento del deploy.');
    }

    var spreadsheet = SpreadsheetApp.getActive();
    var videoSheet = spreadsheet.getSheetByName(BF.VIDEO_SHEET);
    var fontiSheet = spreadsheet.getSheetByName(BF.FONTI_SHEET);
    if (!videoSheet || !fontiSheet) throw new Error('Mancano i fogli VIDEO o FONTI. Esegui setupBrainframeSheet().');

    var videos = sheetRows_(videoSheet, BF.VIDEO_HEADER_ROW, BF.VIDEO_DATA_ROW, BF.VIDEO_HEADERS);
    var sources = sheetRows_(fontiSheet, 1, 2, BF.FONTI_HEADERS);
    var built = buildPublicationModels_(videos, sources);

    if (built.errors.length) {
      throw new Error('Pubblicazione bloccata:\n- ' + built.errors.join('\n- '));
    }
    if (!built.models.length) {
      throw new Error('Nessun video APPROVATO con “Approvato da Matteo” selezionato.');
    }

    var files = built.models.map(function(model) {
      return {
        path: 'src/data/videos/' + model.slug + '.json',
        content: serializeVideo_(model)
      };
    });
    var commit = commitVideoFiles_(files);
    var pendingRows = [];

    built.models.forEach(function(model) {
      if (!model._sheetRow) return;
      videoSheet.getRange(model._sheetRow, 9).setValue('IN PUBBLICAZIONE');
      pendingRows.push({ row: model._sheetRow, slug: model.slug });
      appendPublicationLog_(spreadsheet, model.slug, 'IN PUBBLICAZIONE', commit.url, '');
    });

    var pending = {
      sha: commit.sha,
      commitUrl: commit.url || '',
      rows: pendingRows,
      startedAt: publicationTimestamp_()
    };
    properties.setProperty(BF_PENDING_KEY, JSON.stringify(pending));
    ensurePublicationPoll_();
    return pending;
  } finally {
    lock.releaseLock();
  }
}

function pollPendingPublications() {
  var pending = readPendingPublication_();
  if (!pending) {
    clearPublicationPolls_();
    return { state: 'idle' };
  }

  var state = getDeployState_(pending.sha);
  if (state.state === 'pending') {
    ensurePublicationPoll_();
    return state;
  }

  var spreadsheet = SpreadsheetApp.getActive();
  var videoSheet = spreadsheet.getSheetByName(BF.VIDEO_SHEET);
  if (!videoSheet) throw new Error('Manca il foglio VIDEO durante la sincronizzazione del deploy.');
  var properties = PropertiesService.getScriptProperties();
  var now = publicationTimestamp_();

  if (state.state === 'success') {
    pending.rows.forEach(function(item) {
      videoSheet.getRange(item.row, 7).setValue('PUBBLICATO');
      videoSheet.getRange(item.row, 9).setValue('PUBBLICATO');
      videoSheet.getRange(item.row, 10).setValue(now);
      videoSheet.getRange(item.row, 11).setValue(BF.SITE_BASE + '/fonti/' + item.slug + '/');
      appendPublicationLog_(spreadsheet, item.slug, 'PUBBLICATO', state.runUrl || pending.commitUrl || '', '');
    });
    properties.deleteProperty(BF_PENDING_KEY);
    clearPublicationPolls_();
    return state;
  }

  if (state.state === 'failure') {
    pending.rows.forEach(function(item) {
      videoSheet.getRange(item.row, 9).setValue('ERRORE PUBBLICAZIONE');
      appendPublicationLog_(
        spreadsheet,
        item.slug,
        'ERRORE PUBBLICAZIONE',
        state.runUrl || pending.commitUrl || '',
        state.message || 'Deploy GitHub non riuscito'
      );
    });
    properties.deleteProperty(BF_PENDING_KEY);
    clearPublicationPolls_();
    return state;
  }

  ensurePublicationPoll_();
  return { state: 'pending' };
}
