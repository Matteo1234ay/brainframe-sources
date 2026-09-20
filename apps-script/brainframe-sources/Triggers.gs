function invalidatePublishedVideo_(slug) {
  slug = String(slug || '').trim();
  if (!slug) return;

  var spreadsheet = SpreadsheetApp.getActive();
  var videoSheet = spreadsheet.getSheetByName(BF.VIDEO_SHEET);
  if (!videoSheet) return;
  var lastRow = videoSheet.getLastRow();
  if (lastRow < BF.VIDEO_DATA_ROW) return;

  var rowCount = lastRow - BF.VIDEO_DATA_ROW + 1;
  var slugs = videoSheet.getRange(BF.VIDEO_DATA_ROW, 2, rowCount, 1).getValues();
  for (var index = 0; index < slugs.length; index += 1) {
    if (String(slugs[index][0] || '').trim() !== slug) continue;
    var row = BF.VIDEO_DATA_ROW + index;
    var state = String(videoSheet.getRange(row, 7).getValue() || '').trim();
    var publication = String(videoSheet.getRange(row, 9).getValue() || '').trim();
    if (state !== 'PUBBLICATO' && state !== 'MODIFICATO - DA RIPUBBLICARE' && publication !== 'PUBBLICATO') return;

    videoSheet.getRange(row, 7).setValue('MODIFICATO - DA RIPUBBLICARE');
    videoSheet.getRange(row, 8).setValue(false);
    videoSheet.getRange(row, 9).setValue('MODIFICHE NON PUBBLICATE');
    return;
  }
}

function fillSlugFromTitle_(sheet, row, eventValue) {
  var slugCell = sheet.getRange(row, 2);
  if (String(slugCell.getValue() || '').trim()) return;
  var title = String(eventValue || sheet.getRange(row, 1).getValue() || '').trim();
  if (!title) return;
  var slug = slugify_(title);
  if (slug) slugCell.setValue(slug);
}

function handleBrainframeEdit(event) {
  if (!event || !event.range) return;
  var range = event.range;
  var sheet = range.getSheet();
  var sheetName = sheet.getName();
  var row = range.getRow();
  var column = range.getColumn();

  if (sheetName === BF.VIDEO_SHEET && range.getA1Notation && range.getA1Notation() === BF.PUBLISH_CONTROL) {
    var checked = event.value === 'TRUE' || range.getValue() === true;
    if (!checked) return;
    try {
      publishApprovedVideos();
    } finally {
      range.setValue(false);
    }
    return;
  }

  if (sheetName === BF.VIDEO_SHEET) {
    if (row < BF.VIDEO_DATA_ROW || column < 1 || column > 6) return;
    if (column === 1) fillSlugFromTitle_(sheet, row, event.value);
    invalidatePublishedVideo_(sheet.getRange(row, 2).getValue());
    return;
  }

  if (sheetName === BF.FONTI_SHEET) {
    if (row < 2 || column < 1 || column > BF.FONTI_HEADERS.length) return;
    invalidatePublishedVideo_(sheet.getRange(row, 1).getValue());
  }
}
