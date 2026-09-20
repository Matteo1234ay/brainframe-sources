function text_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function slugify_(value) {
  var input = text_(value);
  if (input.normalize) input = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isHttpUrl_(value) {
  return /^https?:\/\/[^\s]+$/i.test(text_(value));
}

function extractYouTubeVideoId_(value) {
  var raw = text_(value);
  var match = raw.match(/^https?:\/\/(?:www\.|m\.)?youtu\.be\/([A-Za-z0-9_-]{6,})(?:[/?#].*)?$/i);
  if (match) return match[1];

  match = raw.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})(?:[/?#].*)?$/i);
  if (match) return match[1];

  match = raw.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?([^#]*)$/i);
  if (!match) return null;
  var pairs = match[1].split('&');
  for (var i = 0; i < pairs.length; i += 1) {
    var parts = pairs[i].split('=');
    if (parts[0] === 'v') {
      var id = decodeURIComponent(parts.slice(1).join('='));
      return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
    }
  }
  return null;
}

function normalizeDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    if (typeof Utilities !== 'undefined' && typeof Session !== 'undefined') {
      return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Europe/Rome', 'yyyy-MM-dd');
    }
    return value.toISOString().slice(0, 10);
  }
  var raw = text_(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function timestampSeconds_(value) {
  var match = text_(value).match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function selectedForPublication_(row) {
  var state = text_(row['Stato editoriale']);
  return row['Approvato da Matteo'] === true && (state === 'APPROVATO' || state === 'MODIFICATO - DA RIPUBBLICARE');
}

function buildPublicationModels_(videoRows, sourceRows) {
  var errors = [];
  var models = [];
  var selected = (videoRows || []).filter(selectedForPublication_);
  var seenSlugs = {};

  selected.forEach(function(videoRow) {
    var rowNumber = videoRow.row || '?';
    var title = text_(videoRow['Titolo']);
    var slug = text_(videoRow['Slug']) || slugify_(title);
    var category = text_(videoRow['Categoria']);
    var youtube = text_(videoRow['YouTube']);
    var published = normalizeDate_(videoRow['Data pubblicazione']);
    var description = text_(videoRow['Descrizione']);
    var localErrors = [];

    if (!title) localErrors.push('VIDEO riga ' + rowNumber + ': manca Titolo');
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) localErrors.push('VIDEO riga ' + rowNumber + ': Slug non valido');
    if (slug && seenSlugs[slug]) localErrors.push('VIDEO riga ' + rowNumber + ': slug duplicato "' + slug + '"');
    if (slug) seenSlugs[slug] = true;
    if (BF.CATEGORIES.indexOf(category) === -1) localErrors.push('VIDEO riga ' + rowNumber + ': Categoria non valida');
    if (!extractYouTubeVideoId_(youtube)) localErrors.push('VIDEO riga ' + rowNumber + ': link YouTube non valido o senza ID video');
    if (!published) localErrors.push('VIDEO riga ' + rowNumber + ': Data pubblicazione non valida (usa YYYY-MM-DD)');

    var attached = (sourceRows || []).filter(function(sourceRow) {
      return text_(sourceRow['Video slug']) === slug;
    });

    var claimMap = {};
    var claimOrder = [];
    attached.forEach(function(sourceRow) {
      var sourceRowNumber = sourceRow.row || '?';
      var time = text_(sourceRow['Timestamp']);
      var claimText = text_(sourceRow['Claim']);
      var sourceTitle = text_(sourceRow['Titolo fonte']);
      var author = text_(sourceRow['Autore / Ente']);
      var sourceUrl = text_(sourceRow['URL fonte']);
      var note = text_(sourceRow['Nota Brainframe']);
      var seconds = timestampSeconds_(time);

      if (seconds === null) localErrors.push('FONTI riga ' + sourceRowNumber + ': Timestamp non valido');
      if (!claimText) localErrors.push('FONTI riga ' + sourceRowNumber + ': manca Claim');
      if (!sourceTitle) localErrors.push('FONTI riga ' + sourceRowNumber + ': manca Titolo fonte');
      if (!isHttpUrl_(sourceUrl)) localErrors.push('FONTI riga ' + sourceRowNumber + ': URL fonte non valido');
      if (seconds === null || !claimText || !sourceTitle || !isHttpUrl_(sourceUrl)) return;

      var key = time + '\u0000' + claimText;
      if (!claimMap[key]) {
        claimMap[key] = { time: time, claim: claimText, note: note, sources: [], _seconds: seconds, _sourceKeys: {} };
        claimOrder.push(key);
      } else if (claimMap[key].note !== note) {
        localErrors.push('FONTI riga ' + sourceRowNumber + ': Nota Brainframe incoerente per lo stesso claim');
        return;
      }

      var sourceKey = sourceTitle + '\u0000' + author + '\u0000' + sourceUrl;
      if (!claimMap[key]._sourceKeys[sourceKey]) {
        var source = { title: sourceTitle, url: sourceUrl };
        if (author) source.author = author;
        claimMap[key].sources.push(source);
        claimMap[key]._sourceKeys[sourceKey] = true;
      }
    });

    errors = errors.concat(localErrors);
    if (localErrors.length) return;

    var claims = claimOrder.map(function(key) {
      return claimMap[key];
    }).sort(function(a, b) {
      return a._seconds - b._seconds;
    }).map(function(claim) {
      var clean = { time: claim.time, claim: claim.claim, sources: claim.sources };
      if (claim.note) clean.note = claim.note;
      return clean;
    });

    if (attached.length && !claims.length) {
      errors.push(slug + ': nessun claim valido');
      return;
    }

    var model = {
      title: title,
      slug: slug,
      category: category,
      youtube: youtube,
      published: published,
      claims: claims,
      corrections: [],
      _sheetRow: Number(videoRow.row) || 0
    };
    if (description) model.description = description;
    models.push(model);
  });

  if (errors.length) return { models: [], errors: errors };
  return { models: models, errors: [] };
}

function serializeVideo_(model) {
  var output = {
    title: model.title,
    slug: model.slug,
    category: model.category,
    youtube: model.youtube,
    published: model.published
  };
  if (model.description) output.description = model.description;
  output.claims = model.claims;
  output.corrections = Array.isArray(model.corrections) ? model.corrections : [];
  return JSON.stringify(output, null, 2) + '\n';
}
