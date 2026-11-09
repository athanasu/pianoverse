export type Lang = 'el' | 'en'

// Stage names are shared by the library's job cards and the processing screen's steps.
const elStages = {
  separating: 'Χωρίζω τα όργανα',
  analyzing: 'Βρίσκω ρυθμό και συγχορδίες',
  melody: 'Βγάζω τη μελωδία',
  arranging: 'Γράφω τη διασκευή',
}

const el = {
  common: {
    back: 'Πίσω στη βιβλιοθήκη',
    retry: 'Δοκίμασε ξανά',
    close: 'Κλείσιμο',
    langLabels: { el: 'ΕΛ', en: 'EN' },
  },
  library: {
    yourSongs: 'Τα κομμάτια σου',
    empty: 'Δεν υπάρχουν ακόμα κομμάτια.',
    newSongSoon: 'Η ηχογράφηση έρχεται σύντομα',
    newSong: 'Νέο',
    language: 'Γλώσσα',
    sourceType: { vocal: 'Φωνή', instrumental: 'Ορχηστρικό', solo_piano: 'Πιάνο' },
    processingCard: { queued: 'Σε αναμονή', ...elStages },
    dismiss: 'Απόρριψη',
    serverDown: 'Δεν βρίσκω τον server.',
  },
  player: {
    loading: 'Φορτώνω το κομμάτι…',
    levelGroup: 'Επίπεδο δυσκολίας',
    levels: { easy: 'Εύκολο', medium: 'Μέτριο', hard: 'Δύσκολο', original: 'Πρωτότυπο' },
    chordCard: 'Κάρτα συγχορδίας',
    now: 'Τώρα',
    fingers: 'δάχτυλα',
    play: 'Αναπαραγωγή',
    pause: 'Παύση',
    loop: 'Επανάληψη A–B',
    speed: 'Ταχύτητα',
    timeline: 'Θέση στο κομμάτι',
    leftHand: 'Αριστερό χέρι',
    rightHand: 'Δεξί χέρι',
    leftShort: 'Αρ.',
    rightShort: 'Δεξ.',
    noteNames: 'Ονόματα νοτών',
    noteNamesShort: 'Ντο Ρε',
    rollLabel: 'Νότες που πέφτουν προς το πληκτρολόγιο',
    pianoLoading: 'Φορτώνω τον ήχο του πιάνου…',
    pianoFailed: 'Δεν φορτώθηκε ο ήχος του πιάνου· οι νότες συνεχίζουν χωρίς ήχο.',
    rotate: 'Γύρισε το κινητό οριζόντια',
  },
  // One chip per engine warning code; unknown codes show the engine's own message.
  warnings: {
    chords_uncertain: (n: number) => (n === 1 ? 'Αβέβαιες συγχορδίες σε 1 σημείο' : `Αβέβαιες συγχορδίες σε ${n} σημεία`),
    melody_sparse: (_n: number) => 'Η μελωδία ακούγεται μόνο σε λίγα σημεία του κομματιού.',
  },
  errors: {
    network: 'Δεν μπόρεσα να φορτώσω το κομμάτι. Έλεγξε τη σύνδεση.',
    not_found: 'Δεν βρέθηκε αυτό το κομμάτι.',
    schema_mismatch: 'Το κομμάτι είναι από νεότερη έκδοση. Ενημέρωσε την εφαρμογή.',
  },
  // Keyed by the API's stable error codes (spec §4, §6.3); see errorText() for the fallback order.
  apiErrors: {
    network: 'Δεν βρίσκω τον server. Έλεγξε τη σύνδεση.',
    unauthorized: 'Ο server δεν δέχτηκε το κλειδί της εφαρμογής.',
    not_found: 'Δεν βρέθηκε αυτή η ανάλυση.',
    too_large: 'Το αρχείο είναι πολύ μεγάλο — μέγιστο 50 MB.',
    too_short: 'Ο ήχος είναι πολύ μικρός — χρειάζονται τουλάχιστον 10 δευτερόλεπτα.',
    too_long: 'Το κομμάτι είναι πολύ μεγάλο — μέγιστο 8 λεπτά.',
    unsupported_format: 'Δεν μπόρεσα να διαβάσω αυτό το αρχείο ήχου.',
    bad_title: 'Χρειάζεται τίτλος.',
    silent: 'Δεν ακούγεται τίποτα στην ηχογράφηση.',
    no_beats: 'Δεν βρήκα σταθερό ρυθμό στο κομμάτι.',
    no_melody: 'Δεν μπόρεσα να βρω μελωδία στο κομμάτι.',
    interrupted: 'Η ανάλυση διακόπηκε πριν τελειώσει.',
    internal: 'Κάτι πήγε στραβά στον server.',
    fallback: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.',
  },
}

export type Messages = typeof el

const enStages = {
  separating: 'Separating the instruments',
  analyzing: 'Finding the beat and chords',
  melody: 'Extracting the melody',
  arranging: 'Writing the arrangement',
}

const en: Messages = {
  common: {
    back: 'Back to library',
    retry: 'Try again',
    close: 'Close',
    langLabels: { el: 'ΕΛ', en: 'EN' },
  },
  library: {
    yourSongs: 'Your songs',
    empty: 'No songs yet.',
    newSongSoon: 'Recording is coming soon',
    newSong: 'New',
    language: 'Language',
    sourceType: { vocal: 'Vocals', instrumental: 'Instrumental', solo_piano: 'Piano' },
    processingCard: { queued: 'Waiting', ...enStages },
    dismiss: 'Dismiss',
    serverDown: "Can't reach the server.",
  },
  player: {
    loading: 'Loading the song…',
    levelGroup: 'Difficulty',
    levels: { easy: 'Easy', medium: 'Medium', hard: 'Hard', original: 'Original' },
    chordCard: 'Chord card',
    now: 'Now',
    fingers: 'fingers',
    play: 'Play',
    pause: 'Pause',
    loop: 'Loop A–B',
    speed: 'Speed',
    timeline: 'Position in song',
    leftHand: 'Left hand',
    rightHand: 'Right hand',
    leftShort: 'L',
    rightShort: 'R',
    noteNames: 'Note names',
    noteNamesShort: 'C D E',
    rollLabel: 'Notes falling towards the keyboard',
    pianoLoading: 'Loading the piano sound…',
    pianoFailed: "The piano sound didn't load; the notes keep going without sound.",
    rotate: 'Turn your phone sideways',
  },
  warnings: {
    chords_uncertain: (n: number) => (n === 1 ? 'Uncertain chords in 1 place' : `Uncertain chords in ${n} places`),
    melody_sparse: (_n: number) => 'The melody was only found in parts of the song.',
  },
  errors: {
    network: "Couldn't load the song. Check your connection.",
    not_found: "We couldn't find this song.",
    schema_mismatch: 'This song is from a newer version. Update the app.',
  },
  apiErrors: {
    network: "Can't reach the server. Check your connection.",
    unauthorized: "The server didn't accept the app's key.",
    not_found: "We couldn't find this analysis.",
    too_large: 'The file is too big — 50 MB at most.',
    too_short: 'The audio is too short — it needs at least 10 seconds.',
    too_long: 'The song is too long — 8 minutes at most.',
    unsupported_format: "Couldn't read this audio file.",
    bad_title: 'It needs a title.',
    silent: "There's nothing to hear in the recording.",
    no_beats: "Couldn't find a steady beat in the song.",
    no_melody: "Couldn't find a melody in the song.",
    interrupted: 'The analysis stopped before it finished.',
    internal: 'Something went wrong on the server.',
    fallback: 'Something went wrong. Try again.',
  },
}

export const messages: Record<Lang, Messages> = { el, en }
