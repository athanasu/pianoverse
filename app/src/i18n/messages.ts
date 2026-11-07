export type Lang = 'el' | 'en'

const el = {
  common: { back: 'Πίσω στη βιβλιοθήκη', retry: 'Δοκίμασε ξανά' },
  library: {
    yourSongs: 'Τα κομμάτια σου',
    empty: 'Δεν υπάρχουν ακόμα κομμάτια.',
    newSongSoon: 'Η ηχογράφηση έρχεται σύντομα',
    language: 'Γλώσσα',
    sourceType: { vocal: 'Φωνή', instrumental: 'Instrumental', solo_piano: 'Πιάνο' },
  },
  player: {
    loading: 'Φορτώνω το κομμάτι…',
    levelGroup: 'Επίπεδο δυσκολίας',
    levels: { easy: 'Εύκολο', medium: 'Μέτριο', hard: 'Δύσκολο', original: 'Πρωτότυπο' },
    chordCard: 'Κάρτα συγχορδίας',
    now: 'Τώρα',
    fingers: 'δάχτ.',
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
    pianoFailed: 'Δεν φόρτωσε ο ήχος του πιάνου· οι νότες συνεχίζουν χωρίς ήχο.',
    rotate: 'Γύρισε το κινητό οριζόντια',
    uncertain: (n: number) => (n === 1 ? 'Αβέβαιες συγχορδίες σε 1 σημείο' : `Αβέβαιες συγχορδίες σε ${n} σημεία`),
  },
  errors: {
    network: 'Δεν μπόρεσα να φορτώσω το κομμάτι. Έλεγξε τη σύνδεση.',
    not_found: 'Δεν βρέθηκε αυτό το κομμάτι.',
    schema_mismatch: 'Το κομμάτι είναι από νεότερη έκδοση. Ενημέρωσε την εφαρμογή.',
  },
}

export type Messages = typeof el

const en: Messages = {
  common: { back: 'Back to library', retry: 'Try again' },
  library: {
    yourSongs: 'Your songs',
    empty: 'No songs yet.',
    newSongSoon: 'Recording is coming soon',
    language: 'Language',
    sourceType: { vocal: 'Vocals', instrumental: 'Instrumental', solo_piano: 'Piano' },
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
    uncertain: (n: number) => (n === 1 ? 'Uncertain chords in 1 place' : `Uncertain chords in ${n} places`),
  },
  errors: {
    network: "Couldn't load the song. Check your connection.",
    not_found: "This song wasn't found.",
    schema_mismatch: 'This song is from a newer version. Update the app.',
  },
}

export const messages: Record<Lang, Messages> = { el, en }
