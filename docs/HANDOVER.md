# Pianoverse — Handover

Τελευταία ενημέρωση: 2026-11-07. Για να συνεχιστεί η υλοποίηση από άλλο μηχάνημα (ή από νέο Claude session).

## 1. Τι είναι

Εφαρμογή (web τώρα, iOS/Android αργότερα) που ηχογραφεί ή φορτώνει ένα τραγούδι, βγάζει **διασκευή για πιάνο σε 3 επίπεδα** (εύκολο/μέτριο/δύσκολο) και τη διδάσκει με **falling notes**, πληκτρολόγιο που φωτίζεται και **συγχορδίες**. Ελληνικά και αγγλικά.

Όλες οι αποφάσεις: [specs/2026-11-07-pianoverse-design.md](superpowers/specs/2026-11-07-pianoverse-design.md) — ειδικά §9 (σειρά υλοποίησης) και §10 (αποτελέσματα spike).

## 2. Πού βρισκόμαστε

| Βήμα (spec §9) | Κατάσταση |
|---|---|
| 1. Μηχανή διασκευής (CLI, Python) | ✅ Έτοιμη — `engine/` |
| 2. Mockups | ✅ Εγκρίθηκε το στυλ «Α · Σκηνή» — https://claude.ai/artifact/DbK1P2a9X7r5Y6u183dZHz |
| 3. Player με τοπικά JSON | ✅ Έτοιμος — `app/` (βλ. §5 για ό,τι έμεινε) |
| 4. Backend (FastAPI σε Modal + Supabase) | ⏭ **Επόμενο** — χρειάζεται πλάνο |
| 5. Ηχογράφηση/Upload flow στο app | ⏳ |
| 6. Capacitor (iOS/Android) | ⏳ |

**Branches** (όλα στο GitHub, `athanasu/pianoverse`):
- `feat/player` — **η πιο πρόσφατη δουλειά**· περιέχει και όλη τη μηχανή. Συνέχισε από εδώ.
- `feat/engine-spike` — παλαιότερο σημείο (πριν τον player).
- `main` — μόνο το αρχικό commit· τίποτα δεν έχει γίνει merge ακόμα.

## 3. Στήσιμο σε νέο Mac

```bash
git clone git@github.com:athanasu/pianoverse.git
cd pianoverse
git checkout feat/player
```

**Εργαλεία:**

```bash
brew install ffmpeg wget uv pnpm
```

- Node **≥ 22.22** (π.χ. `nvm install 22` ή νεότερο).
- Python 3.11 — το `uv` την κατεβάζει μόνο του.
- **Χρησιμοποιούμε pnpm, ποτέ npm/npx.**

**Μηχανή:**

```bash
cd engine
uv sync
uv run pytest            # γρήγορα tests (226)
uv run pytest -m slow    # με πραγματικά μοντέλα — την 1η φορά κατεβάζει ~300 MB
```

Τα μοντέλα κατεβαίνουν μόνα τους την πρώτη φορά (Demucs, beat_this, Basic Pitch, BTC στο `~/.cache/pianoverse/`, ByteDance piano στο `~/piano_transcription_inference_data/` — αυτό θέλει `wget`).

**Εφαρμογή:**

```bash
cd app
pnpm install
pnpm dev                              # άνοιξε το URL που τυπώνει
pnpm test                             # unit + component tests (95)
pnpm exec playwright install chromium # μία φορά
pnpm test:e2e                         # τεστ σε πραγματικό browser
```

## 4. Πώς δοκιμάζεις με δικό σου τραγούδι

```bash
cd engine
uv run pianoverse-engine path/to/song.mp3 --out out/my-song
cp out/my-song/song.json ../app/public/songs/my-song/song.json   # φτιάξε πρώτα τον φάκελο
```

Πρόσθεσε μια εγγραφή στο `app/public/songs/index.json` (`id`, `title`, `key`, `bpm`, `durationSec`, `sourceType`, `chords`). **Μην κάνεις commit τραγούδια που δεν σου ανήκουν** (`engine/samples/` και `engine/out/` είναι ήδη gitignored).

Για ηχογράφηση από μικρόφωνο στο Mac: `ffmpeg -f avfoundation -i ":1" -t 30 samples/rec.wav` (η συσκευή `:1` ήταν το μικρόφωνο του MacBook· δες τη λίστα με `ffmpeg -f avfoundation -list_devices true -i ""`).

## 5. Ανοιχτά θέματα και αποφάσεις που πρέπει να ξέρεις

**Γνωστά προβλήματα ποιότητας (μηχανή):**
- **Συγχορδίες από μικρόφωνο:** το BTC δουλεύει καλά σε καθαρά αρχεία, αλλά σε ηχογραφήσεις μικροφώνου βγάζει κυρίως «καμία συγχορδία» (τώρα εμφανίζεται προειδοποίηση). Θέλει ρεαλιστικό τεστ (κινητό → εξωτερικό ηχείο) και πιθανώς προεπεξεργασία ήχου πριν το BTC ή fallback στον παλιό αλγόριθμο.
- Το beat_this έβγαλε 0 beats σε ηχογράφηση μικροφώνου → υπάρχει fallback στο librosa.
- Το μοντέλο σόλο πιάνου (ByteDance) δεν έχει δοκιμαστεί ακόμα σε πραγματική ηχογράφηση πιάνου.
- Το `beat-this` είναι κλειδωμένο σε `main.zip` (μόνο μέσω hash στο lockfile) — κλείδωσέ το σε commit πριν το backend.

**Αποφάσεις player:**
- Δικό μας ρολόι (`TransportClock`) αντί για Tone.Transport· μόνο ήχος «πιάνο» (το αρχικό τραγούδι/μίξη έρχεται με το backend).
- **Χέρια και ήχος (απόφαση χρήστη):** και τα δύο αναμμένα → ακούγονται και τα δύο· ένα αναμμένο → αυτό **σωπαίνει** (το παίζεις εσύ) και ακούγεται μόνο το άλλο, αχνό.
- Ταχύτητες 25/50/75/100%.
- Ονόματα νοτών ανά γλώσσα (Ντο Ρε Μι / C D E)· σύμβολα συγχορδιών και ετικέτες οκτάβας (C2–C8) διεθνή.

- Ο ήχος πιάνου (δείγματα Salamander από το tonejs.github.io) αρχίζει να φορτώνει μόλις ανοίξει ο player· το Play περιμένει έως 8 s. Χωρίς δίκτυο ο player συνεχίζει χωρίς ήχο (μήνυμα πάνω δεξιά, κρύβεται σε 5 s).

**Γνωστά μικρά (player):** σε iPhone, αν το πρώτο Play πατηθεί πριν κατέβει ο κώδικας του Tone.js, μένει σιωπηλό ως το επόμενο Play· τα chips προειδοποιήσεων κόβονται σε στενές οθόνες (το πλήρες κείμενο είναι μόνο σε tooltip).

**Αναβλήθηκαν στο επόμενο πλάνο του player:** μετρονόμος με count-in, λίστα όλων των συγχορδιών του τραγουδιού, particles/ripple στο πάτημα, Framer Motion transitions, TanStack Query, κατάσταση φόρτωσης στη βιβλιοθήκη, Home/End στο timeline, επιδόσεις canvas (allocations ανά frame, redraw σε παύση), validation για χειροποίητα `song.json`.

## 6. Πώς δουλεύουμε (για το επόμενο Claude session)

- Ο χρήστης γράφει **ελληνικά**· απαντάμε ελληνικά, βήμα-βήμα, με ερωτήσεις πολλαπλής επιλογής και πρόταση.
- **Η εφαρμογή πρέπει να είναι πολύ όμορφη** — mockups πριν από κάθε νέο UI.
- Ροή: brainstorming → spec → πλάνο (`docs/superpowers/plans/`) → εκτέλεση με subagent ανά task, review ανά task και τελικό review.
- pnpm, ποτέ npm/npx.

**Επόμενο βήμα:** πλάνο για το **backend** (spec §4.2–§4.3: FastAPI σε Modal, Supabase για βιβλιοθήκη/αρχεία, jobs με polling), και μετά τη ροή ηχογράφησης/upload στο app.
