# Pianoverse — Design (MVP)

Ημερομηνία: 2026-11-07
Κατάσταση: προς έγκριση

## 1. Τι φτιάχνουμε

Μια εφαρμογή (web + iOS + Android) όπου ο χρήστης **ηχογραφεί ή ανεβάζει ένα τραγούδι** και παίρνει πίσω μια **διασκευή για πιάνο σε επίπεδα δυσκολίας**, την οποία μαθαίνει μέσα από ένα **όμορφο piano roll με falling notes**, πληκτρολόγιο που φωτίζεται και **ονόματα/κάρτες συγχορδιών**.

Διαφοροποίηση από εφαρμογές όπως το Pianify: εκείνες διδάσκουν τραγούδια από δικό τους κατάλογο· το Pianoverse φτιάχνει μάθημα από **οποιοδήποτε τραγούδι φέρει ο χρήστης**.

### Αποφάσεις που πάρθηκαν

| Θέμα | Απόφαση |
|---|---|
| Είδος input | Οποιοδήποτε τραγούδι (με φωνή, instrumental, ή σόλο πιάνο) |
| Τι παράγεται | Παιζόμενη διασκευή με επίπεδα (μελωδία δεξί + συγχορδίες αριστερό). «Γεμάτο» cover αργότερα |
| Πηγή ήχου | Ηχογράφηση από μικρόφωνο + upload αρχείου. Όχι YouTube/Spotify links (ToS) |
| Κοινό | Προσωπικό εργαλείο τώρα, αρχιτεκτονική έτοιμη για δημόσιο προϊόν |
| Πλατφόρμα | React + Vite + TypeScript για web, Capacitor για iOS/Android |
| Learning στο MVP | Μόνο «παρακολούθησε & παίξε» (χωρίς practice mode που ακούει) |
| Μηχανή | Pipeline (separation → ανάλυση → δικός μας arranger) |
| Αισθητική | **Πρώτης γραμμής προτεραιότητα** — η εφαρμογή πρέπει να είναι πολύ όμορφη |

### Εκτός MVP (επόμενες φάσεις)

- **Practice mode** που ακούει (μικρόφωνο / MIDI), wait mode, σκορ.
- **Chord trainer**: θεωρία, drills, ear training.
- **Full cover** μέσω Pop2Piano ως εναλλακτική μηχανή.
- **Δημόσιο προϊόν**: λογαριασμοί, όρια χρήσης, συνδρομή.
- Αναγνώριση τίτλου τραγουδιού (ACRCloud/AudD), transpose, sections (verse/chorus).

## 2. Αρχιτεκτονική

```
┌───────────── app/ (React + Vite + TS, Capacitor) ─────────────┐
│ Library · New Song (record/upload) · Player (canvas + Tone.js)│
└───────────────┬───────────────────────────────────────────────┘
                │ HTTPS (REST, polling)
┌───────────────▼──────────── engine/ (Python) ─────────────────┐
│ FastAPI on Modal  ──►  pipeline job (GPU)                     │
│   separate → classify → analyze → arrange → Song JSON + MIDI  │
└───────────────┬───────────────────────────────────────────────┘
                │
        Supabase: Postgres (songs, jobs) + Storage (audio, JSON)
```

Monorepo:

```
pianoverse/
  engine/     Python (uv), pipeline + FastAPI + Modal deploy
  app/        React + Vite + TS, Capacitor
  schema/     Song JSON Schema (πηγή αλήθειας για τύπους και στις δύο πλευρές)
  docs/
```

## 3. Μηχανή διασκευής (engine/)

Κάθε στάδιο είναι ξεχωριστό module με καθαρό input/output, ώστε να τεστάρεται και να αντικαθίσταται μόνο του.

### 3.1 Στάδια

0. **Normalize** — ffmpeg → wav 44.1kHz. Απόρριψη: διάρκεια > 8 λεπτά, < 10 δευτ., σιωπή, μη υποστηριζόμενο format.
1. **Separate** — Demucs `htdemucs_6s` → vocals, drums, bass, piano, guitar, other.
2. **Classify** — ενέργεια ανά stem → `vocal` | `instrumental` | `solo_piano`. Ο χρήστης μπορεί να το ορίσει χειροκίνητα (`mode`), που υπερισχύει.
3. **Analyze** (πάντα):
   - Beats / downbeats / tempo: `beat_this`.
   - Συγχορδίες: μοντέλο μεγάλου λεξιλογίου (π.χ. BTC — maj, min, 7, maj7, m7, sus2/4, dim, aug) πάνω στο mix χωρίς drums.
   - Bass note ανά συγχορδία από το bass stem → slash chords (C/E).
   - Τονικότητα.
4. **Melody** — ανάλογα με τον τύπο:
   - `vocal`: pitch tracking στο vocals stem (π.χ. Basic Pitch / CREPE) → νότες.
   - `instrumental`: Basic Pitch στο κυρίαρχο μελωδικό stem (piano/guitar/other) → skyline (ψηλότερη γραμμή).
   - `solo_piano`: piano transcription (Transkun ή ByteDance) στο αρχικό mix → πλήρης μεταγραφή· η μελωδία = skyline της.
5. **Arrange** — δικός μας κώδικας:
   - Quantize στο beat grid, οκτάβα μελωδίας σε άνετο εύρος (C4–C6), απλοποίηση πολύ γρήγορων περασμάτων.
   - **Εύκολο**: μελωδία (R) + root/bass note ανά συγχορδία (L).
   - **Μέτριο**: μελωδία (R) + τρίφωνα με voice leading (ελάχιστη μετακίνηση χεριού) (L).
   - **Δύσκολο**: μελωδία με εναρμόνιση (R) + αρπίσματα/ρυθμικά patterns (L).
   - **Original** (μόνο `solo_piano`): η πλήρης μεταγραφή, χωρισμένη σε χέρια.
   - Περιορισμοί για κάθε επίπεδο: άνοιγμα χεριού ≤ οκτάβα, χέρια δεν διασταυρώνονται, ελάχιστη διάρκεια νότας.
6. **Export** — Song JSON (validated έναντι schema) + MIDI ανά επίπεδο.

Όπου αναφέρονται εναλλακτικά μοντέλα (chords: BTC ή άλλο· melody: Basic Pitch ή CREPE· piano: Transkun ή ByteDance), η τελική επιλογή κλειδώνει στο **engine spike** (§9, βήμα 1) με βάση το evaluation script, και καταγράφεται σε αυτό το έγγραφο.

### 3.2 Προειδοποιήσεις ποιότητας

Η μηχανή συμπληρώνει `warnings` όταν η εμπιστοσύνη είναι χαμηλή (π.χ. «η μελωδία εντοπίστηκε σε < 50% του κομματιού», «αβέβαιες συγχορδίες στο 1:20–1:45»). Η εφαρμογή τα δείχνει διακριτικά.

## 4. Δεδομένα & API

### 4.1 Song JSON (schema v1)

```ts
type Song = {
  schemaVersion: 1
  id: string
  title: string
  durationSec: number
  sourceType: 'vocal' | 'instrumental' | 'solo_piano'
  tempo: { bpm: number; beats: number[]; downbeats: number[] }   // δευτερόλεπτα
  timeSignature: [number, number]
  key: { tonic: string; mode: 'major' | 'minor' }
  chords: { start: number; end: number; symbol: string; root: string; quality: string; bass?: string }[]
  arrangements: Partial<Record<'easy' | 'medium' | 'hard' | 'original', {
    notes: { pitch: number; start: number; end: number; velocity: number; hand: 'L' | 'R' }[]
  }>>
  warnings: { code: string; message: string; start?: number; end?: number }[]
}
```

- Πηγή αλήθειας: Pydantic models στο engine → JSON Schema στο `schema/` → TypeScript types στο app (code generation). Validation και στις δύο πλευρές.
- Οι κάρτες συγχορδιών (πλήκτρα, δάχτυλα) είναι **στατική βιβλιοθήκη στο app**, κλειδωμένη στο `symbol`.

### 4.2 API (FastAPI)

| Endpoint | Περιγραφή |
|---|---|
| `POST /jobs` | multipart audio + `mode=auto\|vocal\|instrumental\|solo_piano` + `title` → `{ jobId }` |
| `GET /jobs/{id}` | `{ status: queued\|separating\|analyzing\|arranging\|done\|failed, progress, songId?, error? }` |
| `GET /songs` | λίστα βιβλιοθήκης |
| `GET /songs/{id}` | Song JSON |
| `GET /songs/{id}/audio` | αρχικός ήχος (signed URL) |
| `GET /songs/{id}/midi?level=` | MIDI export |

Polling ανά 2 δευτ. στο MVP.

### 4.3 Hosting

- **Modal**: FastAPI + pipeline σε GPU, scale-to-zero. Εκτίμηση ~$0.01–0.03/τραγούδι.
- **Supabase**: Postgres (`songs`, `jobs`), Storage (audio, JSON, MIDI). Auth διαθέσιμο για τη μετάβαση σε δημόσιο προϊόν — δεν χρησιμοποιείται στο MVP· το API προστατεύεται με ένα shared secret.
- **Web**: στατικό deploy (Vercel ή Cloudflare Pages).
- **Τοπικά**: ολόκληρο το pipeline τρέχει στο Mac (CPU/MPS) ως CLI: `pianoverse-engine song.mp3 --out song.json`.
- Όλα τα τραγούδια είναι ιδιωτικά· κανένα sharing μεταξύ χρηστών.

## 5. Εφαρμογή (app/)

### 5.1 Οθόνες

1. **Βιβλιοθήκη** — κάρτες τραγουδιών, «＋ Νέο».
2. **Νέο τραγούδι** — Ηχογράφηση (MediaRecorder, level meter, χρονόμετρο) ή Upload· επιλογή τύπου· οθόνη προόδου ανά στάδιο.
3. **Player** — βλ. παρακάτω.

### 5.2 Player

- Λωρίδα συγχορδιών πάνω, falling notes (μπλε = L, πράσινο = R), πληκτρολόγιο κάτω με auto-zoom στο εύρος του κομματιού.
- Controls: play/pause, timeline με **loop A–B**, **ταχύτητα 25–100%**, **χέρια L/R** (σβηστό χέρι = το παίζει η εφαρμογή, εμφανίζεται αχνό), επίπεδο, ονόματα νοτών, μετρονόμος με count-in.
- **Κάρτα συγχορδίας**: tap στην τρέχουσα συγχορδία → πλήκτρα, δάχτυλα, φθόγγοι· λίστα όλων των συγχορδιών του τραγουδιού.
- Mobile: landscape, wake lock.

### 5.3 Ήχος & συγχρονισμός

- Ενιαίο `PlaybackClock` interface (`now()`, `play()`, `pause()`, `seek()`, `setRate()`)· ο renderer διαβάζει μόνο `clock.now()`.
- Λειτουργίες:
  1. **Πιάνο** — Tone.js Sampler (Salamander Grand Piano), master clock = Tone.Transport.
  2. **Αρχικό** — `<audio>` με `playbackRate` + `preservesPitch`, master clock = `audio.currentTime` με εξομάλυνση.
  3. **Μίξη** — και τα δύο, ξεχωριστά volume sliders, drift correction.
- iOS: ξεκλείδωμα AudioContext σε user gesture.
- Το clock σχεδιάζεται ώστε να υποστηρίξει αργότερα wait mode (παύση μέχρι σωστό input).

### 5.4 Rendering & state

- Ένα `<canvas>` (Canvas 2D) με `requestAnimationFrame`· καμία React render ανά frame. Ο renderer είναι απομονωμένος ώστε να γίνει PixiJS/WebGL αν χρειαστεί.
- Zustand για player state, TanStack Query για server data.

## 6. Οπτικός σχεδιασμός

Η ομορφιά είναι απαίτηση, όχι «nice to have».

- **Dark-first** αισθητική (σαν σκηνή συναυλίας), με light theme ως δεύτερο.
- Falling notes με απαλά gradients και **glow** όταν «χτυπούν» το πληκτρολόγιο· διακριτικά particles/ripple στο πάτημα· πλήκτρα που φωτίζονται με το χρώμα του χεριού.
- Σταθερά **60fps**, ομαλές μεταβάσεις (Framer Motion για UI, όχι για το canvas), haptics στο mobile.
- Προσεγμένη τυπογραφία και ένα μικρό design system (χρώματα, spacing, radius, κίνηση) ως tokens.
- **Πριν το UI υλοποιηθεί**, φτιάχνουμε mockups για Βιβλιοθήκη, Νέο τραγούδι και Player και τα εγκρίνει ο χρήστης.

## 7. Σφάλματα

| Πού | Περίπτωση | Συμπεριφορά |
|---|---|---|
| Engine | Μη έγκυρο/πολύ μακρύ/σιωπηλό αρχείο | Απόρριψη στο `POST /jobs` με σαφές μήνυμα |
| Engine | Αποτυχία σταδίου | Job `failed` με φιλικό μήνυμα και το στάδιο· log με λεπτομέρειες |
| Engine | Χαμηλή εμπιστοσύνη | Επιτυχία με `warnings` |
| Engine | Infra σφάλμα Modal / timeout | Αυτόματο retry 1 φορά, μετά `failed` |
| App | Άρνηση άδειας μικροφώνου | Οθόνη εξήγησης + οδηγίες ρυθμίσεων· πρόταση για upload |
| App | Πολύ σύντομη ηχογράφηση | Προειδοποίηση πριν την αποστολή |
| App | Αποτυχία δικτύου στο upload | Retry με κουμπί, χωρίς να χαθεί η ηχογράφηση |
| App | Schema mismatch | Μήνυμα «ενημέρωσε την εφαρμογή» αντί για crash |

## 8. Testing

- **Engine**
  - Unit tests για τον arranger (καθαρές συναρτήσεις): άνοιγμα χεριού, εύρος, χωρίς διασταυρώσεις, κάθε συγχορδία καλύπτεται.
  - Golden tests: γνωστό MIDI → render σε ήχο (FluidSynth) → pipeline → σύγκριση με `mir_eval` (note F1, chord accuracy).
  - **Evaluation script** σε μικρό προσωπικό σετ τραγουδιών: μετρικές + renders για ακρόαση. Τρέχει σε κάθε αλλαγή μοντέλου.
  - Contract test: κάθε έξοδος περνάει validation έναντι του schema.
- **App**
  - Vitest: clock, time→pixel, θέσεις πλήκτρων, chord library lookups.
  - Playwright smoke: φόρτωση ενός fixture Song, play, loop, αλλαγή ταχύτητας.
  - Χειροκίνητα σε πραγματικό iPhone και Android (μικρόφωνο, landscape, απόδοση).

## 9. Σειρά υλοποίησης

1. **Engine spike (CLI, τοπικά)** — ολόκληρο το pipeline σε 3–4 τραγούδια του χρήστη. **Σημείο απόφασης**: είναι η ποιότητα αρκετά καλή; Αν όχι, αλλάζουμε μοντέλα πριν προχωρήσουμε.
2. **Mockups** — Βιβλιοθήκη, Νέο τραγούδι, Player· έγκριση.
3. **Player με τοπικά JSON** — piano roll, πληκτρολόγιο, ήχος, controls, κάρτες συγχορδιών· πλήρες visual polish.
4. **Backend** — FastAPI σε Modal, Supabase, jobs, βιβλιοθήκη.
5. **Ηχογράφηση/Upload flow** στο app, end-to-end.
6. **Capacitor** — iOS & Android builds, άδειες μικροφώνου, landscape, testing σε συσκευές.
