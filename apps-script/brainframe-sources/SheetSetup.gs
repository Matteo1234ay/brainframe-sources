function onOpen() {
  SpreadsheetApp.getUi().createMenu('Brainframe')
    .addItem('AGGIORNA BRAINFRAME SOURCES', 'publishApprovedVideos')
    .addItem('Configura / ripara foglio', 'setupBrainframeSheet')
    .addToUi();
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function writeHeaders_(sheet, row, headers) {
  sheet.getRange(row, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
}

function installBrainframeTriggers_() {
  var spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    var handler = trigger.getHandlerFunction();
    if (handler === 'handleBrainframeEdit' || handler === 'handleBrainframeChange') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('handleBrainframeEdit').forSpreadsheet(spreadsheet).onEdit().create();
  ScriptApp.newTrigger('handleBrainframeChange').forSpreadsheet(spreadsheet).onChange().create();
}

function protectApprovalColumn_(sheet, rowCount) {
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function(protection) {
    if (protection.getDescription() === 'Brainframe final approval') protection.remove();
  });

  var approvalRange = sheet.getRange(BF.VIDEO_DATA_ROW, 8, rowCount, 1);
  var protection = approvalRange.protect().setDescription('Brainframe final approval');
  var editors = protection.getEditors();
  if (editors.length) protection.removeEditors(editors);
  protection.addEditor(Session.getEffectiveUser());
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}

function setupBrainframeSheet() {
  var spreadsheet = SpreadsheetApp.getActive();
  var video = getOrCreateSheet_(spreadsheet, BF.VIDEO_SHEET);
  var fonti = getOrCreateSheet_(spreadsheet, BF.FONTI_SHEET);
  var log = getOrCreateSheet_(spreadsheet, BF.LOG_SHEET);

  video.getRange(BF.PUBLISH_CONTROL).insertCheckboxes().setValue(false);
  video.getRange('B1').setValue('AGGIORNA BRAINFRAME SOURCES').setFontWeight('bold');
  video.getRange('A2:B2').setValues([['Solo i video approvati da Matteo vengono pubblicati.', 'Modificare un contenuto pubblicato azzera l’approvazione.']]);

  writeHeaders_(video, BF.VIDEO_HEADER_ROW, BF.VIDEO_HEADERS);
  writeHeaders_(fonti, 1, BF.FONTI_HEADERS);
  writeHeaders_(log, 1, BF.LOG_HEADERS);

  video.setFrozenRows(BF.VIDEO_HEADER_ROW);
  fonti.setFrozenRows(1);
  log.setFrozenRows(1);

  var videoRows = Math.max(1, video.getMaxRows() - BF.VIDEO_DATA_ROW + 1);
  var categoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(BF.CATEGORIES, true)
    .setAllowInvalid(false)
    .build();
  var stateRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(BF.EDITORIAL_STATES, true)
    .setAllowInvalid(false)
    .build();

  video.getRange(BF.VIDEO_DATA_ROW, 3, videoRows, 1).setDataValidation(categoryRule);
  video.getRange(BF.VIDEO_DATA_ROW, 7, videoRows, 1).setDataValidation(stateRule);
  video.getRange(BF.VIDEO_DATA_ROW, 8, videoRows, 1).insertCheckboxes();
  protectApprovalColumn_(video, videoRows);

  video.autoResizeColumns(1, BF.VIDEO_HEADERS.length);
  fonti.autoResizeColumns(1, BF.FONTI_HEADERS.length);
  log.autoResizeColumns(1, BF.LOG_HEADERS.length);

  installBrainframeTriggers_();
}
