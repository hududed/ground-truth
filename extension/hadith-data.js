// Canonical hadith collection name-recognition data for the six Sunni
// collections known as "Kutub al-Sittah" (the six books): Bukhari, Muslim,
// Abu Dawud, Tirmidhi, An-Nasa'i, Ibn Majah.
//
// This is NAME-RECOGNITION data ONLY - it exists so hadith-checker.js can
// tell "Sahih al-Bukhari 1234" apart from "Sunan Ibn Majah 1234". It
// contains no hadith text, no numbering ranges, no grading, and cannot be
// used to check whether any specific hadith actually exists - that requires
// a real licensed source (sunnah.com, dorar.net), which this project does
// not have access to yet. See drafts/ground-truth/.lavish/v1-build-plan.html
// for the outreach status.
//
// `name` is the canonical display label used in every detected citation and
// every user-facing message - one spelling per collection, chosen to match
// the labels already used in the v1 build plan.
//
// `variants` is every spelling this project has actually seen an AI use for
// that collection, including alternate transliterations (Dawud/Dawood),
// with-and-without-"Sahih/Sunan/Jami" prefixed forms, and both straight (')
// and curly (') apostrophe variants - AI chat UIs commonly auto-curl
// straight quotes, and a literal-substring match has to cover both or it
// silently misses every curly-quoted citation. hadith-checker.js's init()
// sorts every variant across all collections by length, LONGEST FIRST,
// before building the recognition regex - the same defensive ordering
// checker.js's surah-name matching already relies on, so a longer, more
// specific variant (e.g. "Sahih al-Bukhari") is never shadowed by a shorter
// one (e.g. "Bukhari") that happens to be tried first in the same
// alternation.
window.HADITH_COLLECTIONS = [
  {
    id: 'bukhari',
    name: 'Bukhari',
    variants: ['Sahih al-Bukhari', 'Sahih Al-Bukhari', 'Sahih Bukhari', 'Al-Bukhari', 'Bukhari'],
  },
  {
    id: 'muslim',
    name: 'Muslim',
    variants: ['Sahih Muslim', 'Muslim'],
  },
  {
    id: 'abudawud',
    name: 'Abu Dawud',
    variants: ['Sunan Abu Dawud', 'Sunan Abi Dawud', 'Abu Dawood', 'Abi Dawud', 'Abu Dawud'],
  },
  {
    id: 'tirmidhi',
    name: 'Tirmidhi',
    variants: ["Jami' at-Tirmidhi", 'Jami’ at-Tirmidhi', 'Jami at-Tirmidhi', 'Sunan at-Tirmidhi', 'At-Tirmidhi', 'Al-Tirmidhi', 'Tirmidhi'],
  },
  {
    id: 'nasai',
    name: "An-Nasa'i",
    variants: ["Sunan an-Nasa'i", 'Sunan an-Nasa’i', 'Sunan an-Nasai', "An-Nasa'i", 'An-Nasa’i', 'An-Nasai', "Al-Nasa'i", 'Nasai'],
  },
  {
    id: 'ibnmajah',
    name: 'Ibn Majah',
    variants: ['Sunan Ibn Majah', 'Ibn Majah', 'Ibn Maja'],
  },
];
