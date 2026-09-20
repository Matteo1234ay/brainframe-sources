# Brainframe Sources — Google Sheets publisher

Questo progetto Apps Script trasforma un Google Sheet condiviso nel pannello editoriale di Brainframe Sources.

Il team compila i contenuti nel foglio; la pubblicazione finale richiede la checkbox protetta **Approvato da Matteo**. Il pulsante **AGGIORNA BRAINFRAME SOURCES** valida i dati, genera i JSON del sito, crea un unico commit su GitHub e aspetta che `verify` e `deploy` siano entrambi riusciti prima di mostrare `PUBBLICATO`.

## Installazione una tantum

1. Crea o apri il Google Sheet condiviso di Brainframe.
2. Apri **Estensioni → Apps Script**.
3. Nel progetto Apps Script crea questi file e incolla le versioni presenti in questa cartella del repository:
   - `Config.gs`
   - `SheetSetup.gs`
   - `Model.gs`
   - `GitHub.gs`
   - `Publishing.gs`
   - `Triggers.gs`
4. Abilita la visualizzazione del manifest nelle impostazioni dell’editor Apps Script e sostituisci `appsscript.json` con quello presente in questa cartella.
5. Su GitHub crea un **fine-grained personal access token** limitato esclusivamente al repository `Matteo1234ay/brainframe-sources`, con:
   - **Contents: Read and write**
   - **Actions: Read**
6. In Apps Script apri **Project Settings → Script properties** e crea:
   - nome: `GITHUB_TOKEN`
   - valore: il token appena creato
7. Esegui manualmente `setupBrainframeSheet()` una sola volta dall’editor Apps Script e autorizza gli scope Google richiesti.
8. Ricarica il Google Sheet e verifica che siano presenti:
   - menu **Brainframe**
   - checkbox/pulsante visibile **AGGIORNA BRAINFRAME SOURCES** in `VIDEO!A1`
   - tab `VIDEO`, `FONTI`, `LOG`
9. Condividi il foglio con i membri del team come editor. Non rimuovere la protezione dalla colonna **Approvato da Matteo**.
10. Prima dell’uso editoriale normale, esegui una pubblicazione di prova con un video Brainframe reale e almeno una fonte realmente usata nel video.

**Non inserire mai il valore di `GITHUB_TOKEN` in una cella del foglio, in un file del repository o in una chat.** Deve rimanere esclusivamente nelle Script Properties di Apps Script.

## Struttura del foglio

### VIDEO

I dati iniziano dalla riga 5.

| Colonna | Contenuto |
| --- | --- |
| Titolo | Titolo pubblico del video |
| Slug | Facoltativo; se vuoto viene generato dal titolo |
| Categoria | `filosofia`, `design`, `economia`, `ingegneria` |
| YouTube | URL del video YouTube; deve contenere un ID video |
| Data pubblicazione | `YYYY-MM-DD` |
| Descrizione | Facoltativa |
| Stato editoriale | `BOZZA`, `DA REVISIONARE`, `APPROVATO`, ecc. |
| Approvato da Matteo | Checkbox protetta che abilita la pubblicazione |
| Stato pubblicazione | Gestito dallo script |
| Ultimo aggiornamento | Gestito dallo script |
| URL SourcePage | Gestito dallo script |

### FONTI

Una riga = una fonte usata per un claim.

| Colonna | Contenuto |
| --- | --- |
| Video slug | Deve corrispondere allo slug del video |
| Timestamp | Formato `MM:SS` o minuti superiori, per esempio `75:04` |
| Claim | Punto/affermazione del video sostenuto dalla fonte |
| Titolo fonte | Titolo del paper, report, articolo, documentazione, ecc. |
| Autore / Ente | Facoltativo |
| URL fonte | URL `http`/`https` |
| Nota Brainframe | Facoltativa; deve essere uguale per tutte le fonti dello stesso claim |

Per collegare più fonti allo stesso claim, ripeti **Video slug + Timestamp + Claim** su più righe cambiando i dati della fonte.

Pubblicare significa rendere visibili **solo fonti effettivamente usate nel video**, non tutto il materiale consultato durante la ricerca.

## Workflow quotidiano

1. Il team compila `VIDEO` e `FONTI`.
2. Quando il contenuto è pronto, imposta `Stato editoriale` su `APPROVATO`.
3. Matteo controlla il contenuto e seleziona **Approvato da Matteo**.
4. Clicca la checkbox **AGGIORNA BRAINFRAME SOURCES** oppure usa il menu **Brainframe → AGGIORNA BRAINFRAME SOURCES**.
5. Lo script valida tutto prima di contattare GitHub.
6. Se la validazione passa, tutti i video approvati vengono inviati in **un solo commit**.
7. `Stato pubblicazione` diventa `IN PUBBLICAZIONE`.
8. Lo script controlla GitHub Actions in background.
9. Soltanto quando `verify` e `deploy` risultano entrambi riusciti, la riga diventa `PUBBLICATO` e riceve l’URL della SourcePage.

Se la build o il deploy falliscono, la riga mostra `ERRORE PUBBLICAZIONE` e il dettaglio viene registrato nel tab `LOG`. La versione live precedente del sito non viene marcata come aggiornata.

## Modifiche dopo la pubblicazione

Se viene modificato un dato editoriale di un video già pubblicato o una sua riga `FONTI`, lo script:

- toglie automaticamente **Approvato da Matteo**;
- imposta lo stato su `MODIFICATO - DA RIPUBBLICARE`;
- mostra `MODIFICHE NON PUBBLICATE`.

Il contenuto deve essere ricontrollato e approvato prima di una nuova pubblicazione.

## Errori comuni

- **GITHUB_TOKEN non configurato** → aggiungi la Script Property con quel nome esatto.
- **Link YouTube non valido o senza ID video** → usa il link a un video specifico, non il link al canale.
- **Nessuna fonte associata** → aggiungi almeno una riga in `FONTI` con lo stesso slug.
- **Pubblicazione già in corso** → attendi che lo stato precedente termini; i doppi click vengono bloccati apposta.
- **ERRORE PUBBLICAZIONE** → consulta `LOG` e il riferimento alla workflow GitHub indicato nella riga.

## Sicurezza

Il token GitHub non è presente nel codice e non viene letto da celle del foglio. È recuperato esclusivamente da `PropertiesService.getScriptProperties()`.

Il token deve essere limitato al solo repository Brainframe Sources e ai soli permessi necessari. Se viene esposto, revocalo su GitHub e sostituisci il valore della Script Property.
