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

I video vivono in `src/data/videos/*.json`. Ogni file genera automaticamente una SourcePage in `/fonti/<slug>/`.

Le descrizioni YouTube possono quindi puntare direttamente alla pagina del relativo video, per esempio `/fonti/demo-sourcepage/`.

Le SourcePage devono contenere **solo le fonti realmente usate nel video**, non tutto ciò che è stato consultato durante la ricerca.

Vedi `docs/ADDING-A-VIDEO.md` per la procedura editoriale.

## GitHub Pages

Non serve un dominio personalizzato per l’MVP. Il workflow in `.github/workflows/verify-and-deploy.yml` costruisce il sito con il base path del repository, così asset e link interni funzionano anche su un URL di progetto GitHub Pages.

Video, paper e altri file pesanti restano esterni: il repository contiene soltanto metadata, testi e link.
