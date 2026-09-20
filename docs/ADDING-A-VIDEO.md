# Aggiungere un video Brainframe

1. Duplica `src/data/videos/demo-sourcepage.json`.
2. Rinomina il file con lo slug del video, per esempio `costo-ai.json`.
3. Compila `title`, `slug`, `category`, `youtube`, `published`, `description`.
4. Per ogni punto realmente sostenuto da una fonte nel video, aggiungi un elemento in `claims` con timestamp, claim e una o più fonti.
5. **Non inserire fonti soltanto consultate ma non usate nel video.**
6. Lascia `corrections: []` se non esistono correzioni.
7. Esegui `npm run build`: se il file è malformato, la build si ferma.
8. Controlla `/fonti/<slug>/` in locale prima di pubblicare.

Categorie ammesse: `filosofia`, `design`, `economia`, `ingegneria`.

```json
{
  "title": "Quanto costa davvero l’AI?",
  "slug": "quanto-costa-ai",
  "category": "economia",
  "youtube": "https://www.youtube.com/watch?v=...",
  "published": "2026-10-20",
  "description": "Le fonti usate nel video Brainframe.",
  "claims": [
    {
      "time": "00:35",
      "claim": "Primo punto sostenuto da fonti.",
      "sources": [
        { "title": "Fonte A", "author": "Autore / Ente", "url": "https://example.com/a" },
        { "title": "Fonte B", "author": "Autore / Ente", "url": "https://example.com/b" }
      ]
    }
  ],
  "corrections": []
}
```
