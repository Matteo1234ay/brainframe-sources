# Aggiungere un video Brainframe

## Procedura normale — Google Sheets

Il Google Sheet condiviso è il pannello editoriale di Brainframe Sources. Non serve modificare JSON o aprire GitHub per il normale lavoro di redazione.

### 1. Compila il tab VIDEO

Aggiungi una riga dalla riga 5 in poi con:

- **Titolo**
- **Slug** — facoltativo; se vuoto viene generato automaticamente dal titolo
- **Categoria** — una tra `filosofia`, `design`, `economia`, `ingegneria`
- **YouTube** — link a un video specifico, non al canale
- **Data pubblicazione** — formato `YYYY-MM-DD`
- **Descrizione** — facoltativa
- **Stato editoriale** — usa `BOZZA`, poi `DA REVISIONARE`, infine `APPROVATO`

La miniatura del sito viene ricavata automaticamente dal link YouTube. Non va caricata a mano.

### 2. Compila il tab FONTI

Ogni riga rappresenta una fonte realmente usata nel video:

- **Video slug**
- **Timestamp**
- **Claim**
- **Titolo fonte**
- **Autore / Ente**
- **URL fonte**
- **Nota Brainframe** facoltativa

Per uno stesso claim con più fonti, crea più righe con gli stessi `Video slug`, `Timestamp` e `Claim`.

**Non inserire fonti soltanto consultate ma non effettivamente usate nel video.**

### 3. Revisione e approvazione

Quando il contenuto è pronto:

1. imposta `Stato editoriale` su `APPROVATO`;
2. Matteo controlla video e fonti;
3. Matteo seleziona la checkbox protetta **Approvato da Matteo**.

Solo le righe che soddisfano entrambe le condizioni vengono prese in carico dal publisher.

### 4. Pubblica

Clicca **AGGIORNA BRAINFRAME SOURCES** in alto nel tab `VIDEO` oppure usa il menu **Brainframe**.

Lo script:

1. controlla tutti i dati;
2. blocca la pubblicazione se trova un errore;
3. raggruppa automaticamente più fonti dello stesso claim;
4. genera `src/data/videos/<slug>.json`;
5. pubblica tutti i video approvati in un unico commit GitHub;
6. imposta `Stato pubblicazione` su `IN PUBBLICAZIONE`;
7. aspetta GitHub Actions;
8. passa a `PUBBLICATO` soltanto dopo `verify` + `deploy` riusciti;
9. scrive automaticamente l’URL della SourcePage.

La pagina finale è:

```text
https://matteo1234ay.github.io/brainframe-sources/fonti/<slug>/
```

La miniatura e il pulsante **Guarda su YouTube** aprono il video originale in una nuova scheda.

### 5. Se modifichi qualcosa dopo la pubblicazione

Una modifica ai dati del video o alle sue fonti:

- rimuove automaticamente l’approvazione finale;
- imposta `MODIFICATO - DA RIPUBBLICARE`;
- segnala `MODIFICHE NON PUBBLICATE`.

Il contenuto deve essere ricontrollato e riapprovato prima di aggiornare il sito.

## Errori

Se i dati non sono validi, non viene creato alcun commit GitHub. Gli errori indicano il foglio e la riga da correggere quando possibile.

Se invece GitHub riceve il commit ma build o deploy falliscono, la riga passa a `ERRORE PUBBLICAZIONE` e il dettaglio viene registrato nel tab `LOG`. Lo Sheet non dichiara il contenuto `PUBBLICATO` finché il deploy non è realmente riuscito.

## Procedura manuale di recupero

Il flusso JSON resta disponibile soltanto come fallback tecnico.

1. Duplica `src/data/videos/demo-sourcepage.json`.
2. Rinomina il file con lo slug del video, per esempio `costo-ai.json`.
3. Compila `title`, `slug`, `category`, `youtube`, `published`, `description`.
4. Per ogni punto realmente sostenuto da una fonte nel video, aggiungi un elemento in `claims` con timestamp, claim e una o più fonti.
5. **Non inserire fonti soltanto consultate ma non usate nel video.**
6. Lascia `corrections: []` se non esistono correzioni.
7. Esegui `npm run build`: se il file è malformato, la build si ferma.
8. Controlla `/fonti/<slug>/` in locale prima di pubblicare.

Esempio:

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

Per l’installazione iniziale del Google Sheet e del token GitHub, consulta `apps-script/brainframe-sources/README.md`.
