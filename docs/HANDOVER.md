# Pianoverse — Handover

Τελευταία ενημέρωση: 2026-11-09. Για να συνεχιστεί η δουλειά από άλλο μηχάνημα ή από νέο Claude session.

## 1. Τι είναι

Εφαρμογή (web τώρα, iOS/Android αργότερα) που ηχογραφεί ή φορτώνει ένα τραγούδι, βγάζει **διασκευή για πιάνο σε 3 επίπεδα** (εύκολο/μέτριο/δύσκολο) και τη διδάσκει με **falling notes**, πληκτρολόγιο που φωτίζεται και **συγχορδίες**. Ελληνικά και αγγλικά.

Έγγραφα:
- Κεντρικό spec: [specs/2026-11-07-pianoverse-design.md](superpowers/specs/2026-11-07-pianoverse-design.md) — §9 σειρά υλοποίησης, §10 αποτελέσματα spike.
- Backend + «Νέο τραγούδι»: [specs/2026-11-09-backend-design.md](superpowers/specs/2026-11-09-backend-design.md) και πλάνο [plans/2026-11-09-backend.md](superpowers/plans/2026-11-09-backend.md).

## 2. Πού βρισκόμαστε

| Βήμα (spec §9) | Κατάσταση |
|---|---|
| 1. Μηχανή διασκευής (Python) | ✅ `engine/` |
| 2. Mockups | ✅ στυλ «Α · Σκηνή» — https://claude.ai/artifact/DbK1P2a9X7r5Y6u183dZHz (ιδιωτικό) |
| 3. Player | ✅ `app/` |
| 4. Backend | ✅ **τοπικά** (server στο `engine/`, SQLite) · ⏭ **cloud: επόμενο** (Supabase, Modal) |
| 5. Ηχογράφηση/Upload στο app | ✅ τοπικά · ⏭ από κινητό μετά το cloud (χρειάζεται HTTPS) |
| 6. Capacitor (iOS/Android) | ⏳ |

Το πλάνο του backend έχει 11 tasks: **1–9 έγιναν** (PR #3, merge στο `main`), **10–11 (cloud) μένουν**.

**Branches** (GitHub `athanasu/pianoverse`):
- `main` — όλη η δουλειά. Συνέχισε πάντα από εδώ, σε νέο branch.
- `feat/cloud` — άδειο ακόμα (= `main`)· εδώ πάνε τα tasks 10–11.
- `feat/backend`, `feat/player`, `feat/engine-spike`, `docs/readme` — έχουν γίνει merge.

## 3. Στήσιμο σε νέο Mac

**1. Εργαλεία** (μία φορά):

```bash
brew install git ffmpeg wget uv pnpm node
node --version   # must be 22.22 or newer
```

- Python 3.11: το `uv` την κατεβάζει μόνο του.
- **pnpm, ποτέ npm/npx** (το `pnpm dlx` επιτρέπεται).

**2. Κώδικας:**

```bash
git clone git@github.com:athanasu/pianoverse.git ~/Code/athanasu/pianoverse
```

Χωρίς SSH key στο GitHub: `git clone https://github.com/athanasu/pianoverse.git ~/Code/athanasu/pianoverse`.

**3. Μηχανή + server:**

```bash
cd ~/Code/athanasu/pianoverse/engine
uv sync          # Python libraries, a few GB (mostly PyTorch)
uv run pytest    # fast tests: 314 passed
```

Τα μοντέλα κατεβαίνουν μόνα τους με το πρώτο τραγούδι: Demucs, beat_this, Basic Pitch, BTC (στο `~/.cache/pianoverse/`), ByteDance piano (στο `~/piano_transcription_inference_data/`, θέλει `wget`). Το `uv run pytest -m slow` τρέχει τα tests με τα πραγματικά μοντέλα.

**4. Εφαρμογή:**

```bash
cd ~/Code/athanasu/pianoverse/app
pnpm install
cp .env.example .env.local                 # then set VITE_API_KEY (see below)
pnpm test                                  # 158 passed
pnpm exec playwright install chromium      # once
pnpm test:e2e                              # 3 passed (demo + mocked-API new-song flow)
```

**5. Το κλειδί:** διάλεξε ένα δικό σου (π.χ. `my-key`). Στο `app/.env.local`:

```
VITE_API_URL=http://127.0.0.1:8000
VITE_API_KEY=my-key
```

Το `.env.local` δεν μπαίνει στο git.

## 4. Πώς το τρέχεις

Δύο terminals:

```bash
cd ~/Code/athanasu/pianoverse/engine && PIANOVERSE_API_KEY=my-key uv run pianoverse-server
```

```bash
cd ~/Code/athanasu/pianoverse/app && pnpm dev
```

Άνοιξε το **http://localhost:5173** — ακριβώς `localhost`, όχι `127.0.0.1` (αλλιώς μπλοκάρει το CORS και η ηχογράφηση).

- «＋ Νέο» → **Ηχογράφηση** (μικρόφωνο, έως 7:58, τουλάχιστον 10,5″) ή **Από αρχείο** (mp3/m4a/wav, έως 50 MB, 10″–8′) → οθόνη «Ανάλυση» → ανοίγει μόνος του ο player. Ένα τραγούδι 4′ θέλει ~1–1,5′ στη CPU ενός MacBook.
- **Αν η θύρα 5173 είναι πιασμένη** (στο προηγούμενο Mac την κρατούσε άλλο project), το Vite ανοίγει σε άλλη, π.χ. 5174. Τότε ξεκίνα τον server με τη θύρα αυτή στο CORS:
  ```bash
  PIANOVERSE_API_KEY=my-key PIANOVERSE_CORS_ORIGINS=http://localhost:5174 uv run pianoverse-server
  ```
- **Χωρίς `VITE_API_URL`** το app δείχνει μόνο το offline demo (χωρίς «＋ Νέο»).
- **Τα τραγούδια σου** (βάση + αρχεία) είναι στο `engine/data/`, που **δεν** μπαίνει στο git. Για να τα πάρεις σε άλλο Mac, αντέγραψε ολόκληρο τον φάκελο `engine/data/` στην ίδια θέση.
- Όλες οι ρυθμίσεις του server (μεταβλητές `PIANOVERSE_*`): [engine/README.md](../engine/README.md#server). Του app: [app/README.md](../app/README.md).

Η μηχανή τρέχει και χωρίς server, ως CLI:

```bash
cd engine && uv run pianoverse-engine path/to/song.mp3 --out out/my-song
```

Μην κάνεις commit τραγούδια που δεν σου ανήκουν (`engine/samples/`, `engine/out/`, `engine/data/` είναι gitignored).

## 5. Επόμενο: cloud (tasks 10–11 του πλάνου)

Στόχος: το app να δουλεύει από παντού, και η ηχογράφηση από browser κινητού (HTTPS). Branch `feat/cloud`.

**Task 10 — Supabase** (Postgres για τη βάση, Storage για τα αρχεία). Πρώτα ο χρήστης φτιάχνει project (δωρεάν) και συμπληρώνει το `engine/.env.local` — αναλυτικά βήματα στο πλάνο, Task 10 Step 12. Το αρχείο:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...
PIANOVERSE_DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
PIANOVERSE_TEST_DATABASE_URL=<same as above>
```

Δεν μπαίνει στο git: πριν το Task 10 προσθέσει τη γραμμή `.env.local` στο `engine/.gitignore`, έλεγξε `git check-ignore engine/.env.local` — αν δεν τυπώνει τίποτα, πρόσθεσέ το πρώτα. **Ποτέ κλειδιά στο chat ή σε commit.**

**Task 11 — Modal** (API + GPU worker) **και Cloudflare Pages** (web app με HTTPS). Λογαριασμοί και `uv run modal setup` / `pnpm dlx wrangler login` — βήματα στο πλάνο, Task 11 Step 10.

**Αλλαγές που πρέπει να μπουν στα tasks 10–11** (βρέθηκαν στα reviews των 1–9· το πλάνο δεν τις έχει):
- Τα tests χρησιμοποιούν **`httpx2`** (όχι `httpx`) ως dev dependency. Το Task 10 χρειάζεται `uv add httpx` ως κανονική εξάρτηση για το `SupabaseBlobs` / `httpx.MockTransport`.
- Το Task 11 δίνει έτοιμη νέα `app_from_env`· το σημερινό `api.py` έχει πλέον και `forbidden_origin` guard και middleware για τα 500 (ώστε να έχουν CORS) — η αλλαγή πρέπει να τα κρατήσει.
- **Worker στο Modal:** οι εγγραφές προόδου/«done» είναι χωρίς όρο, άρα ένα job που ο κανόνας των 20′ έκανε `interrupted` μπορεί να «ξαναζωντανέψει»· κάν' τες υπό όρο (`WHERE status IN ACTIVE_STATUSES`). Το `create_song` να γίνει upsert (το retry του Modal αλλιώς αποτυγχάνει).
- **Πριν βγει το API στο internet:** έλεγχος κλειδιού και `Content-Length` (≤ 50 MB) **πριν** διαβαστεί το upload (σήμερα το FastAPI διαβάζει όλο το body πρώτα)· `-protocol_whitelist file,pipe` (ή σταθερή λίστα demuxers) στις κλήσεις ffmpeg/ffprobe του `audio.py`.
- Στο Modal όρισε ρητά `PIANOVERSE_DATA_DIR` (το προεπιλεγμένο `engine/data` δεν ισχύει σε εγκατεστημένο πακέτο).
- Το `uv.lock` έχασε κάποια Linux x86_64 wheels (συμπεριφορά του uv 0.13.7, όχι λάθος)· έλεγξε ότι χτίζεται το image του Modal, αλλιώς η εναλλακτική με `uv export` του πλάνου.

## 6. Ποιότητα — το επόμενο μεγάλο θέμα

- **Ο χρήστης έκρινε τις διασκευές «μέτριες»** (δοκιμή 2026-11-09 με «Στο Πήλιο έναν Αύγουστο», «Κομπλεξικό» και ηχογράφηση μικροφώνου). Ξεκίνα ρωτώντας τι ακούστηκε χειρότερα: μελωδία, συγχορδίες ή ρυθμός.
- Συγχορδίες από μικρόφωνο: το BTC είναι καλό σε καθαρά αρχεία, αδύναμο σε ηχογράφηση (εμφανίζεται προειδοποίηση). Ιδέες: προεπεξεργασία ήχου, fallback.
- Το beat_this έβγαλε 0 beats σε ηχογράφηση → fallback librosa.
- Το ByteDance (σόλο πιάνο) δεν έχει δοκιμαστεί σε πραγματική ηχογράφηση πιάνου.
- Το `beat-this` είναι κλειδωμένο σε `main.zip` (μόνο hash στο lockfile) — κλείδωσέ το σε commit.

## 7. Αποφάσεις που πρέπει να ξέρεις

**Backend / Νέο τραγούδι (2026-11-09):**
- Όλος ο **κώδικας στα αγγλικά** (ονόματα, comments, logs, μηνύματα της μηχανής, CLI). Ελληνικά **μόνο** στα κείμενα του UI (`app/src/i18n/messages.ts`, ονόματα νοτών/συγχορδιών στο `music.ts`).
- Το API γυρίζει σφάλματα `{"error": {"code", "message"}}` με αγγλικό `message`· το app μεταφράζει πάντα από το `code`.
- Ο κανόνας «job χωρίς πρόοδο 20′ → interrupted» ισχύει **μόνο** στο cloud· τοπικά, στην εκκίνηση του server όσα έτρεχαν γίνονται `interrupted`.
- Ηχογράφηση: ≥ 10,5″ και αυτόματο stop στα 7:58 (περιθώριο από τα όρια 10″/8′ του server).
- Χωρίς κλειδί ο server ακούει μόνο στο `127.0.0.1` και απορρίπτει αιτήματα από άλλα websites (`forbidden_origin`).
- Τα αποτυχημένα jobs φαίνονται στη βιβλιοθήκη μέχρι να τα απορρίψεις· δεν υπάρχει endpoint για τον αρχικό ήχο (ο player παίζει μόνο πιάνο).
- Σε κινητό 375×812 μίκρυναν λίγο η κυματομορφή (64 px), το κουμπί ηχογράφησης (152 px) και τα «φαντάσματα» νοτών (128 px) για να χωράνε πάνω από το κάτω κουμπί.

**Player:**
- Δικό μας ρολόι (`TransportClock`) αντί για Tone.Transport.
- **Χέρια και ήχος (απόφαση χρήστη):** και τα δύο αναμμένα → ακούγονται και τα δύο· ένα αναμμένο → αυτό **σωπαίνει** (το παίζεις εσύ) και ακούγεται μόνο το άλλο, αχνό.
- Ταχύτητες 25/50/75/100%. Ονόματα νοτών ανά γλώσσα (Ντο Ρε Μι / C D E)· σύμβολα συγχορδιών και οκτάβες (C2–C8) διεθνή.
- Ο ήχος πιάνου (Salamander, tonejs.github.io) φορτώνει μόλις ανοίξει ο player· το Play περιμένει έως 8 s· χωρίς δίκτυο συνεχίζει χωρίς ήχο.

## 8. Γνωστά μικρά (δεν μπλοκάρουν)

- Το μήνυμα «πολύ μικρή ηχογράφηση» λέει 10″ ενώ το όριο είναι 10,5″.
- Αν αποτύχει μόνο το polling των jobs, η βιβλιοθήκη δεν το δείχνει· ένα αποτυχημένο reload σβήνει τα τραγούδια που είχαν φορτώσει.
- Η μπάρα προόδου στις κάρτες jobs δεν έχει `role="progressbar"` για screen readers.
- iPhone: αν το πρώτο Play πατηθεί πριν κατέβει το Tone.js, μένει σιωπηλό ως το επόμενο Play. Τα chips προειδοποιήσεων κόβονται σε στενές οθόνες.
- **Αναβλήθηκαν (player):** μετρονόμος με count-in, λίστα όλων των συγχορδιών, particles/ripple, Framer Motion, TanStack Query, Home/End στο timeline, επιδόσεις canvas.

## 9. Πώς δουλεύουμε (για το επόμενο Claude session)

- Ο χρήστης γράφει **ελληνικά**· απαντάμε ελληνικά, βήμα-βήμα, με ερωτήσεις πολλαπλής επιλογής και πρόταση.
- **Η εφαρμογή πρέπει να είναι πολύ όμορφη** — mockups πριν από κάθε νέο UI, και έλεγχος με screenshots σε μέγεθος κινητού.
- Ροή: brainstorming → spec → πλάνο (`docs/superpowers/plans/`) → εκτέλεση με subagent ανά task, review ανά task και τελικό review → PR → merge (ο χρήστης επιτρέπει merge κατά την κρίση μας, με merge commit).
- pnpm, ποτέ npm/npx. Κώδικας μόνο στα αγγλικά.
- Οι σημειώσεις προόδου του πλάνου (`.superpowers/`) δεν μπαίνουν στο git· ό,τι χρειάζεται για τη συνέχεια είναι σε αυτό το αρχείο (§5).

**Επόμενο βήμα:** Task 10 (Supabase) μόλις ο χρήστης φτιάξει το project και συμπληρώσει το `engine/.env.local`· ή, μέχρι τότε, η ποιότητα των διασκευών (§6).
