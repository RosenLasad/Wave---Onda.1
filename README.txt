Wave v1.7.0
WAVE v1.7.0 - FAMIGLIE -> SCENE -> CONTROLLI -> MUSICA

AVVIO OFFLINE CONSIGLIATO (WINDOWS)
1. Estrai l'intera cartella Wave-v1.7.0.
2. Copia i tuoi file .mid o .midi nella cartella "midi".
3. Fai doppio clic su "APRI WAVE.bat".

APRI WAVE.bat ricrea automaticamente midi/library.js e midi/library.json leggendo tutti i MIDI presenti, quindi apre index.html.

NUOVO IN v1.5.0 - 8 FAMIGLIE / 24 SCENE INIZIALI
Le 8 famiglie visuali sono ora disposte in alto, tutte sulla stessa riga. Su schermi stretti viene mostrata solo l'icona.
Cliccando una famiglia si apre un menu orizzontale sovrapposto alla parte alta del visualizzatore con le Scene disponibili.
La struttura e gia predisposta per arrivare fino a 8 Scene per Famiglia.

FAMIGLIE E SCENE
- Pure: Pulse, Prism, Kaleido, Corridor
- Ocean: Tide, Current, Storm, Abyss
- Hills: Meadow, Ridge, Echo, Valley
- Desert: Dune, Mirage, Wind, Sun Gate
- Bubbles: Drift, Orbit, Burst, Depth Drift
- Birds: Flock, Glide, Rush, Migration
- Galaxy: Spiral, Rings, Warp, Tunnel
- Bloom: Petals, Mandala, Nova, Cathedral

CONTROLLI
- Tempo: controlla la velocita di riproduzione del MIDI, senza accelerare direttamente le animazioni
- Intensita: risposta visuale molto piu marcata su ampiezza, spessori, energia e luminosita
- Tonalita: trasposizione MIDI con influenza piu forte su colore, proporzioni e geometria
- Complessita: piu strati, elementi, petali, onde, stelle e simmetrie
- Scia: da immagine quasi pulita a persistenza luminosa molto lunga
- Glow: alone luminoso ampliato fino a valori estremi
- Distorsione: deforma forme, onde, profili, petali e traiettorie
- Movimento: amplifica spostamenti, oscillazioni e reazione musicale
- Velocita: controllo visuale indipendente (25%-800%); accelera/decelera le animazioni senza cambiare il MIDI
- Scala: riduce o ingrandisce globalmente la composizione
- Rotazione: ruota la scena in entrambe le direzioni; valori negativi invertono il verso
- Colore: Musicale, Monocromatico, Gradiente, Spettro
- AUTO: scorre automaticamente tutte le Scene durante la riproduzione

CARICA MIDI
"Carica MIDI" continua a leggere direttamente qualunque file selezionato, anche se non e presente nella libreria.

ONLINE / NETLIFY
La build usa scripts/build-midi-list.js e ricrea automaticamente la libreria MIDI dai file presenti in midi/.

INTERFACCIA v1.5.0
- 8 Famiglie sempre visibili in alto.
- Menu Scene a tendina/orizzontale che puo sovrapporsi al visualizzatore senza allungare la pagina.
- 11 controlli totali: 4 leve ai bordi del visualizzatore e 7 controlli in due righe compatte sotto.
- Nomi completi su desktop e abbreviazioni sui display piu stretti.
- Colore identificativo diverso per ogni Famiglia.

NUOVO IN v1.5.2 - FLUIDITA / ANTI-SCOSSONE
- Movimento al valore di reset (100%) non sposta piu globalmente l'intero canvas.
- Lo spostamento globale entra solo oltre una zona neutra e con ampiezza ridotta.
- Pitch medio e velocity MIDI sono interpolati tra i frame per evitare salti quando entrano/escono le note.
- Le animazioni interne restano reattive alla musica e ai controlli Low / Medium / High.
- Rotazione parte ora da 0%, coerente con il suo valore di reset neutro.


NUOVO IN v1.6.0 - 8 NUOVE SCENE PROSPETTICHE / 3D
- Pure: Corridor
- Ocean: Abyss
- Hills: Valley
- Desert: Sun Gate
- Bubbles: Depth Drift
- Birds: Migration
- Galaxy: Tunnel
- Bloom: Cathedral

Le nuove scene usano punto di fuga, parallax, scala prospettica e layer atmosferici.
Le 8 famiglie hanno ora 4 scene ciascuna, per un totale di 32 scene.


NUOVO IN v1.7.0 - PANNELLO DI REGIA / VELOCITA VISIVA
- Movimento + Velocita sono ora due leve verticali sul bordo sinistro del visualizzatore.
- Scala + Rotazione sono due leve verticali sul bordo destro.
- Tempo, Intensita, Tonalita, Complessita, Scia, Glow e Distorsione sono disposti in due righe compatte sotto.
- Velocita e separata dal Tempo MIDI: 100% e il reset, 25% rallenta e la zona alta accelera in modo progressivamente piu marcato fino a 800%.
- L'accelerazione visuale e smussata per dare un senso di inerzia invece di uno scatto immediato.
- Corridor e Tunnel sfruttano particolarmente la nuova velocita per effetti di viaggio prospettico / warp.
- Low / Medium / High modulano anche la risposta della leva Velocita.
