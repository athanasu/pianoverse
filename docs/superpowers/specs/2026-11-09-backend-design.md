# Pianoverse — Backend και «Νέο τραγούδι» (Design)

Ημερομηνία: 2026-11-09
Κατάσταση: προς έγκριση
Βασίζεται στο: [2026-11-07-pianoverse-design.md](2026-11-07-pianoverse-design.md) (§4 Δεδομένα & API, §5.1 Οθόνες, §7 Σφάλματα, §9 βήματα 4–5)

Καλύπτει τα βήματα **4 (Backend)** και **5 (Ηχογράφηση/Upload)** του §9 σε ένα πλάνο: ο χρήστης ηχογραφεί ή ανεβάζει τραγούδι από το app, το backend τρέχει τη μηχανή και το τραγούδι εμφανίζεται στη βιβλιοθήκη και ανοίγει στον player.

## 1. Αποφάσεις (χρήστης, 2026-11-09)

| Θέμα | Απόφαση |
|---|---|
| Hosting | **Πρώτα τοπικά, μετά cloud.** Ίδιος κώδικας· τοπικά SQLite + φάκελος + worker thread, στο τέλος Modal + Supabase |
| Λογαριασμοί | Ο χρήστης φτιάχνει Modal / Supabase / Cloudflare όταν φτάσουμε στα cloud tasks, με οδηγίες βήμα-βήμα |
| Εύρος | Backend **μαζί με** την οθόνη ηχογράφησης/upload (βήματα 4 + 5) |
| Αρχιτεκτονική | FastAPI **μέσα στο `engine/`** (ίδιο Python project), με τρία βύσματα: Store, Blobs, Runner |
| UI | Όπως τα εγκεκριμένα mockups «Νέο τραγούδι» και «Ανάλυση», χωρίς push ειδοποιήσεις και χωρίς εκτίμηση χρόνου |
| Web deploy | Cloudflare Pages (HTTPS → ηχογράφηση και από browser κινητού) |
| Γλώσσα κώδικα | **Όλος ο κώδικας στα αγγλικά** (ονόματα, comments, logs, μηνύματα engine, CLI). Ελληνικά μόνο στα κείμενα UI του app (`messages.ts`) |

## 2. Αρχιτεκτονική

```
app (React)  ──HTTPS, Bearer key──►  FastAPI  (engine/src/pianoverse_engine/server/)
                                       │
                 ┌─────────────────────┼──────────────────────┐
                 ▼                     ▼                      ▼
              Store                  Blobs                 Runner
      (songs, jobs μεταδεδομένα)  (ήχος, JSON, MIDI)   (πού τρέχει το pipeline)
  τοπικά: SQLite             τοπικά: φάκελος       τοπικά: 1 worker thread
  cloud:  Supabase Postgres  cloud:  Supabase      cloud:  Modal GPU function
                                     Storage
```

- **Store**: μία υλοποίηση με SQLAlchemy Core· αλλάζει μόνο το URL (`sqlite:///…` ή `postgresql+psycopg://…`). Τα ίδια contract tests τρέχουν σε SQLite πάντα και σε Postgres όταν υπάρχει `PIANOVERSE_TEST_DATABASE_URL`.
- **Blobs**: interface `put(key, bytes|path)`, `get(key) → bytes`, `open_path(key)`· `LocalBlobs` (φάκελος) και `SupabaseBlobs` (Storage REST μέσω httpx).
- **Runner**: interface `submit(job_id)`· `LocalRunner` (ένα daemon thread, ουρά, ένα job τη φορά) και `ModalRunner` (`process_job.spawn(job_id)`).
- Το job εκτελείται από **μία** συνάρτηση `process_job(job_id, store, blobs)` κοινή για τοπικά και Modal: διαβάζει τον ήχο από τα Blobs, τρέχει `run_pipeline`, γράφει song.json + MIDI στα Blobs, γράφει γραμμή στο `songs`, ενημερώνει το job.
- Ρυθμίσεις από env:
  - `PIANOVERSE_API_KEY` — αν λείπει, το auth είναι κλειστό **και** ο server δέχεται μόνο `127.0.0.1`.
  - `PIANOVERSE_DATA_DIR` (προεπιλογή `engine/data/`, gitignored), `PIANOVERSE_DATABASE_URL`, `PIANOVERSE_CORS_ORIGINS` (προεπιλογή `http://localhost:5173`).
  - Cloud: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PIANOVERSE_RUNNER=local|modal`.
- Εντολή `pianoverse-server` (uvicorn) για τοπική εκτέλεση.

## 3. Μηχανή: πρόοδος και «βρήκα μέχρι τώρα»

- Τα στάδια γίνονται **4** ώστε να ταιριάζουν με την οθόνη: `separating` (0.05) → `analyzing` (0.35, ρυθμός + συγχορδίες + τόνος) → `melody` (0.6) → `arranging` (0.85) → `done`.
- Νέο προαιρετικό callback `preview(Preview)` στο `run_pipeline`, καλείται μόλις τελειώσει το `analyzing`: `{ key, bpm, timeSignature, chords: string[] }` (οι πρώτες 4 διαφορετικές συγχορδίες, χωρίς `N`).
- Το CLI τυπώνει και το preview· καμία άλλη αλλαγή συμπεριφοράς.

## 4. API

Όλα κάτω από `/api`. Auth: `Authorization: Bearer <PIANOVERSE_API_KEY>` (εκτός `GET /api/health`). Σφάλματα: `{ "error": { "code", "message" } }`, με `message` στα αγγλικά ως fallback — το app μεταφράζει από το `code`.

| Endpoint | Απάντηση |
|---|---|
| `GET /api/health` | `{ ok: true }` |
| `POST /api/jobs` | multipart `audio`, `title`, `mode=auto\|vocal\|instrumental\|solo_piano`, `source=recording\|file` → `202 { jobId }` |
| `GET /api/jobs?active=1` | jobs που δεν έχουν τελειώσει (για τις κάρτες της βιβλιοθήκης) |
| `GET /api/jobs/{id}` | `Job` (βλ. κάτω) |
| `GET /api/songs` | `SongSummary[]` (ίδιο σχήμα με το σημερινό `index.json`), νεότερα πρώτα |
| `GET /api/songs/{id}` | Song JSON (schema v1) |
| `GET /api/songs/{id}/midi?level=` | `audio/midi` |

```ts
type JobStatus = 'queued' | 'separating' | 'analyzing' | 'melody' | 'arranging' | 'done' | 'failed'
type Job = {
  id: string; title: string; status: JobStatus; progress: number   // 0..1
  source: 'recording' | 'file'; durationSec: number              // από το ffprobe του POST
  createdAt: string; songId?: string
  preview?: { key: { tonic: string; mode: 'major' | 'minor' }; bpm: number; timeSignature: [number, number]; chords: string[] }
  error?: { code: string; message: string }
}
```

**Έλεγχος στο `POST /api/jobs`** (πριν μπει στην ουρά):
- Μέγεθος ≤ 50 MB, αλλιώς `413 too_large`.
- `ffprobe`: μη αναγνώσιμο → `unsupported_format`· διάρκεια < 10″ → `too_short`· > 8′ → `too_long`.
- Μη έγκυρο `mode` → `bad_mode`· μη έγκυρο `source` → `bad_source`· κενός τίτλος → `bad_title`.
- Η σιωπή (`silent`) ελέγχεται στη μηχανή, όπως σήμερα.

**Αποτυχίες job:** `EngineError` → `failed` με τον κωδικό του (`silent`, `no_beats`, `no_melody`, …). Οτιδήποτε άλλο → `failed` με `internal` και log με traceback. Job που έμεινε σε ενδιάμεσο στάδιο:
- Τοπικά, στην εκκίνηση του server → `failed` με `interrupted`.
- Παντού: job χωρίς ενημέρωση για 20′ → `failed` με `interrupted` όταν διαβαστεί.
- Στο Modal: 1 αυτόματο retry της function πριν το `failed`.

## 5. Δεδομένα

- `songs`: `id`, `title`, `created_at`, `duration_sec`, `source_type`, `key_tonic`, `key_mode`, `bpm`, `chords` (JSON, τα 4 πρώτα σύμβολα για την κάρτα).
- `jobs`: `id`, `title`, `mode`, `source`, `duration_sec`, `status`, `progress`, `preview` (JSON), `song_id`, `error_code`, `error_message`, `audio_key`, `attempts`, `created_at`, `updated_at`.
- Blobs: `audio/{jobId}{ext}`, `songs/{songId}/song.json`, `songs/{songId}/{level}.mid`.
- Όλα ιδιωτικά· στο Supabase ένα private bucket `pianoverse`, πρόσβαση μόνο με το service key από τον server.
- Διαγραφή τραγουδιών: εκτός εύρους (επόμενη φάση).

## 6. App

### 6.1 Σύνδεση με το API
- `VITE_API_URL` + `VITE_API_KEY`. **Χωρίς** `VITE_API_URL` το app δουλεύει όπως σήμερα (τοπικά demo από `/songs/…`, χωρίς «＋ Νέο»), ώστε τα υπάρχοντα tests και το demo να μένουν ίδια.
- Ένα `api` module (fetch + Bearer + χαρτογράφηση σφαλμάτων σε `code`)· ο `loader` διαλέγει πηγή (API ή στατικά αρχεία).
- Polling ανά 2″ με ένα μικρό hook (`usePoll`)· όχι TanStack Query ακόμα — αρκεί μία λίστα και ένα job τη φορά.
- Το κλειδί υπάρχει μέσα στο web bundle: αποδεκτό για προσωπικό εργαλείο (spec §4.3)· λογαριασμοί χρηστών όταν γίνει δημόσιο.

### 6.2 Οθόνες (ακολουθούν τα mockups `Library`, `Record`, `Processing`)
1. **Βιβλιοθήκη** — το «Νέο τραγούδι — σύντομα» γίνεται κουμπί **＋ Νέο** (route `/new`). Τα jobs σε εξέλιξη εμφανίζονται πρώτα ως κάρτες με στάδιο και λεπτή μπάρα· tap → οθόνη ανάλυσης. Αποτυχημένα jobs: κάρτα με το μήνυμα και «Απόρριψη».
2. **Νέο τραγούδι** (`/new`):
   - Segmented «Ηχογράφηση | Από αρχείο».
   - Ηχογράφηση: `MediaRecorder` (webm/opus ή mp4/aac ανάλογα με τον browser), χρονόμετρο σε JetBrains Mono, ζωντανή κυματομορφή από `AnalyserNode`, μεγάλο πορτοκαλί κουμπί έναρξης/stop με glow, αυτόματο stop στα 8:00.
   - Από αρχείο: επιλογή αρχείου (`audio/*`), όνομα και διάρκεια του αρχείου.
   - Chips «Αυτόματο · Τραγούδι · Instrumental · Σόλο πιάνο» → `mode`.
   - Tip για καθαρό ήχο (μόνο στην ηχογράφηση).
   - Τίτλος: όνομα αρχείου χωρίς κατάληξη, ή «Ηχογράφηση 9 Νοε, 14:32» / «Recording Nov 9, 14:32».
   - Κουμπί «Τέλος — βγάλε μου πιάνο» → upload → `/processing/:jobId`.
3. **Ανάλυση** (`/processing/:jobId`):
   - Kicker «Ηχογράφηση · 0:27» ή «Αρχείο · 3:12», τίτλος «Φτιάχνω τη διασκευή σου».
   - Διακοσμητικό piano roll με «φαντάσματα» νοτών και φωτεινή γραμμή που προχωρά με την πρόοδο.
   - 4 βήματα με ✓ / ενεργό σημάδι / αναμονή· στο ενεργό βήμα μια indeterminate μπάρα (δεν έχουμε πρόοδο μέσα στο στάδιο).
   - «Βρήκα μέχρι τώρα»: chips συγχορδιών + BPM, μόλις έρθει το `preview`.
   - Στο `done` → αυτόματα στον player (`/song/:songId`).
   - Κουμπί «Συνέχισε στο παρασκήνιο» → βιβλιοθήκη.
4. Όλα τα κείμενα σε `el` και `en` μέσα από `messages.ts`· touch targets ≥ 44 px· tokens από `theme.ts`.

### 6.3 Σφάλματα (spec §7)
| Περίπτωση | Συμπεριφορά |
|---|---|
| Άρνηση μικροφώνου / δεν υπάρχει μικρόφωνο / μη ασφαλές origin | Κάρτα εξήγησης (πώς δίνεις άδεια) + κουμπί «Ανέβασε αρχείο» |
| Ηχογράφηση < 10″ | Προειδοποίηση· το κουμπί αποστολής μένει ανενεργό |
| Αποτυχία δικτύου στο upload | Μήνυμα + «Ξαναδοκίμασε»· η ηχογράφηση μένει στη μνήμη |
| `400`/`413` από το API | Μήνυμα ανά `code` (`too_short`, `too_long`, `too_large`, `unsupported_format`) |
| Job `failed` | Μήνυμα ανά `code` (`silent`, `no_beats`, `no_melody`, `interrupted`, `internal`) + «Δοκίμασε ξανά» (πίσω στο Νέο τραγούδι) |
| Χωρίς σύνδεση με το backend | Η βιβλιοθήκη δείχνει «Δεν βρίσκω τον server» με «Ξαναδοκίμασε» |

## 7. Cloud (τελευταία tasks)
- **Supabase**: project, private bucket `pianoverse`, connection string και service key. Οι πίνακες φτιάχνονται από τον κώδικα (`metadata.create_all`) — χωρίς ξεχωριστό εργαλείο migrations ακόμα.
- **Modal**: ένα app με
  - `api` (ASGI, CPU, scale-to-zero) — το ίδιο FastAPI με `PIANOVERSE_RUNNER=modal`.
  - `process_job` (GPU, timeout 15′, `retries=1`)· τα βάρη των μοντέλων (Demucs, BTC, Basic Pitch, ByteDance) κατεβαίνουν στο build του image.
  - Secrets: API key, Supabase.
- **Cloudflare Pages**: build του `app/` με `VITE_API_URL` = URL του Modal, SPA fallback (`_redirects`), CORS στο API για το domain του Pages.
- Κόστος: δωρεάν επίπεδα + ~$0.01–0.03 ανά τραγούδι στο Modal (spec §4.3).

## 8. Testing
- **Engine (γρήγορα, χωρίς μοντέλα):**
  - Pipeline: σειρά σταδίων και `preview` με ψεύτικες μηχανές (`Engines`).
  - Store contract tests (SQLite· Postgres όταν υπάρχει URL).
  - Blobs tests (`LocalBlobs`· `SupabaseBlobs` με mocked httpx).
  - API tests με `TestClient`, `LocalRunner` και ψεύτικο `run_pipeline`: auth, έλεγχος upload, ροή job ως `done`/`failed`, songs, MIDI, `interrupted`.
- **App:**
  - vitest: api client, recorder (ψεύτικο `MediaRecorder`/`getUserMedia`), οθόνες Νέο τραγούδι/Ανάλυση/Βιβλιοθήκη, μεταφράσεις σφαλμάτων.
  - Playwright: upload → ανάλυση → player με mocked API (`page.route`)· το υπάρχον demo e2e χωρίς API μένει ως έχει.
- **Χειροκίνητα:** μία πραγματική διαδρομή στο Mac (server + app, upload και ηχογράφηση)· μετά το cloud, μία από browser κινητού.

## 9. Σειρά υλοποίησης
1. Μηχανή: 4 στάδια + `preview`.
2. Store + Blobs (τοπικά) με contract tests.
3. Jobs API + `LocalRunner` + έλεγχος upload + auth.
4. Songs API + `pianoverse-server`.
5. App: api client, πηγή δεδομένων, βιβλιοθήκη από το API με κάρτες jobs.
6. Νέο τραγούδι: upload.
7. Νέο τραγούδι: ηχογράφηση.
8. Οθόνη ανάλυσης + σφάλματα.
9. E2E + πραγματική δοκιμή στο Mac — **εδώ όλα δουλεύουν τοπικά**.
10. Supabase (Store + Blobs) — ο χρήστης φτιάχνει λογαριασμό.
11. Modal (API + GPU worker) + Cloudflare Pages.

## 10. Εκτός εύρους
Διαγραφή/μετονομασία τραγουδιών, λογαριασμοί χρηστών, push ειδοποιήσεις, εκτίμηση χρόνου, αναπαραγωγή αρχικού ήχου στον player, Capacitor (βήμα 6).
