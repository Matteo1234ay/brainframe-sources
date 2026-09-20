# Brainframe Sources

Sito editoriale statico per rendere verificabili le fonti effettivamente usate nei video Brainframe sull’intelligenza artificiale.

## Avvio locale

```bash
npm install
npm run dev
```

Verifica e build:

```bash
npm run check
npm run build
```

## Contenuti

Il workflow editoriale normale usa **Google Sheets come mini-CMS**: il team compila i tab `VIDEO` e `FONTI`, Matteo approva, quindi il comando **AGGIORNA BRAINFRAME SOURCES** valida i dati e aggiorna automaticamente il repository. GitHub Actions verifica e pubblica il sito; il foglio mostra `PUBBLICATO` solo dopo il deploy riuscito.

Guida di installazione del publisher: `apps-script/brainframe-sources/README.md`.

Guida editoriale quotidiana: `docs/ADDING-A-VIDEO.md`.

Nel repository, i contenuti pubblicati restano file `src/data/videos/*.json`. Ogni file genera automaticamente una SourcePage in `/fonti/<slug>/`. I JSON sono quindi ancora la sorgente di produzione e possono essere modificati manualmente come procedura di recupero.

Le descrizioni YouTube possono puntare direttamente alla pagina del relativo video, per esempio `/fonti/demo-sourcepage/`.

Le SourcePage devono contenere **solo le fonti realmente usate nel video**, non tutto ciò che è stato consultato durante la ricerca.

## GitHub Pages

Non serve un dominio personalizzato per l’MVP. Il workflow in `.github/workflows/verify-and-deploy.yml` costruisce il sito con il base path del repository, così asset e link interni funzionano anche su un URL di progetto GitHub Pages.

Video, paper e altri file pesanti restano esterni: il repository contiene soltanto metadata, testi e link.
