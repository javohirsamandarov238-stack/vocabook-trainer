# Vocabook Trainer

A spaced-repetition vocabulary trainer built from **Vocabook by @satashkent**, 2nd and 3rd
editions. 1,343 words, five question formats, adaptive scheduling, no backend.

Open `index.html` in any browser. Nothing is installed, nothing is served, nothing leaves
your device.

## Credit

The vocabulary in this project -- every word, definition, example sentence and antonym --
is the work of **[@satashkent](https://t.me/satashkent)**, from *Vocabook* (2nd and 3rd
editions). This repository is a study tool built on top of that book, not a replacement for
it, and no part of the book's own layout, explanations or practice questions is reproduced
here.

If you are the author and would prefer this taken down or changed, open an issue and it
will be removed.

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | The built app — a single self-contained file. Committed so a clone works immediately. |
| `src/` | Source: `app.css`, five JS modules (numeric prefixes fix concatenation order), and the HTML shell. |
| `tools/build.py` | Inlines `src/` and the dataset into `index.html`. |
| `data/vocabulary.build.json` | The dataset the app is built from, including word positions and vetted distractor pools. |
| `data/vocabulary.json` | The same words in a clean, hand-editable form. |
| `data/prefixes-suffixes.json` | 127 word-part entries, extracted but not yet used by the app. |
| `tools/` | The pipeline that produced the dataset from the source PDFs, plus the build script. |
| `tests/` | Question-engine tests, interface tests, and the contrast/design audit. |

## Working on it

```bash
npm install          # jsdom, for the interface tests
npm run build        # regenerate index.html from src/
npm test             # 68 engine + 74 interface checks + contrast audit
npm start            # serve at http://localhost:8000
```

`index.html` is generated. Edit files in `src/`, then rebuild — CI fails the build if the
committed `index.html` has drifted from source.

## CI and deploying

Every push to `main` runs all three suites and fails if the committed `index.html` has
drifted from `src/`.

`.github/workflows/pages.yml` deploys to GitHub Pages on every push to `main`. Enable it
once under **Settings → Pages → Source → GitHub Actions**; after that it is automatic. The
published site is readable by anyone.

The source PDFs are excluded by `.gitignore`. `tools/` documents how the dataset was
derived, but re-running it needs your own copy of the books in `pdfs/`.

## What's in the dataset

**1,343 unique words**, merged across both editions and de-duplicated.

| Source chapter | Words |
|---|---|
| Ivy Global 500 Words | 426 |
| College Panda 400 Words | 401 |
| SATashkent Words (Edition 8.0) | 374 |
| Advanced Package Vocabulary | 142 |

Every entry keeps the book's own definition, example sentence, and antonym, unchanged.

Three fields were **derived**, not taken from the book:

- **Part of speech** — inferred from the definition's wording and from how the word is
  used in its example sentence. 93% resolved; the rest show no part of speech and are flagged.
- **Difficulty** — easy / medium / hard, split into roughly equal thirds using the source
  chapter, word length, definition complexity, and whether the word has multiple senses.
- **Word position** — where the target word sits inside its example sentence, so
  fill-in-the-blank can remove it. Where a sentence uses the word twice (*Yield*, *Yearn*),
  both occurrences are removed.

**132 entries are flagged** in the app rather than silently patched — missing antonyms,
a part of speech that couldn't be determined, or a likely typo in the source
(`Suffraage`). Flags appear under the word in the library and in answer feedback.

Five headwords are printed in the book with a leading "To " (*To Mimic*) and nineteen with a
trailing marker (*Delegate (verb)*, *Glutton(ous)*). These display normalised, because an
option formatted differently from its three neighbours gives the answer away. The library
shows the book's original spelling underneath.

## The interface

Two themes, neither one an inversion of the other. **Dark** is a near-black with a violet
cast, warm off-white type, and soft ambient blooms behind the page. **Light** is warm ivory
paper with dark ink — a study notebook rather than a white SaaS panel. A single periwinkle
accent is reserved for two things only: the word currently under study, and progress.

Typography splits the work. *Instrument Serif* carries the vocabulary itself — headwords in
tests run up to 5.4rem — while *Manrope* handles all interface text and stays quiet. Both
fall back to system faces if you are offline.

The home screen proposes an action rather than reporting history: an editorial greeting, a
ring showing today's session against a 20-question goal, one large accuracy figure with a
sparkline of your last tests, and the daily challenge as the main event. Below that,
insights drawn from your own record — which question type you're improving at, a word of
the day you've actually met, and the words causing most of your mistakes. On a brand-new
account none of that exists, so it shows the shape of the collection instead; nothing is
invented to fill the space.

Training modes are a numbered editorial list, 01 to 05, with the adaptive mixed test set
apart as the recommended route. The test screen drops all chrome — no header, no cards —
leaving the word, four choices, and a thin thread of progress that fills green or red as
you go. Words are browsable as cards that expand for the sentence, opposite, and source.

Motion is present but restrained: numbers count up, rings and bars draw in, the nav
indicator slides between tabs, correct answers pulse once and wrong ones nudge. All of it
is disabled under `prefers-reduced-motion`.

Contrast was measured rather than eyeballed — every text and accent pair clears WCAG AA in
both themes, the lowest being 3.19:1 for faint meta text and 15.24:1 for body copy.

## How the testing works

Five formats: word to definition, definition to word, fill in the blank, meaning in
context, and a mixed test that shuffles all four. Every option in every question is a real
word from your dataset.

**Distractors are vetted, not random.** Each word carries a pre-checked pool of 18
alternatives that share its part of speech and difficulty, and that are *not* near-synonyms.
All four options in a question are checked against each other, so you never get two
choices that mean the same thing and can be eliminated as a pair. Fill-in-the-blank also
excludes any word already visible in the sentence, and prefers options with the same
ending shape (`-ing`, `-ed`) as the word being tested, so grammar alone won't give it away.
The correct answer never lands in the same slot three questions running.

**Mastery** runs 0 to 5. A correct answer moves a word up one level, a miss moves it down
one. Level 4 counts as mastered. A missed word joins your review list and only leaves it
after you answer it correctly twice at level 4 or higher.

**Adaptive selection** works like real spaced repetition. At most 40 words are in active
learning at once. New words are only introduced to top that cohort back up, and take no
more than 40% of any test — the rest of every test is revision. Within revision, weight
goes up with low accuracy, low mastery, time since you last saw the word, and a history of
repeated misses; it goes down after a run of correct answers. Without the cap, 1,343 words
would each be seen once and none would ever stick.

Simulated at 70% accuracy, 20 questions a day: about 16 words mastered after 12 sessions,
86 after 40, with the active set holding steady near 40.

## Your progress

Saved on your device and never sent anywhere. The app writes to browser storage, falling
back automatically depending on where you open it. If storage is blocked entirely, the
Progress page says so plainly instead of pretending to save.

Use **Download my progress** on the Progress page to keep a backup or move to another
device, and **Load progress from a file** to restore it.

## Keyboard

- `1` `2` `3` `4` or `A` `B` `C` `D` — answer
- `Enter` — next question

## Adding or changing words

`data/vocabulary.json` is the same dataset in a clean, editable form. To add a word, append an
entry with at least `word`, `definition`, and `example`:

```json
{
  "word": "Perspicacious",
  "definition": "Having keen insight",
  "example": "Her perspicacious remarks impressed the panel.",
  "antonym": "Obtuse",
  "pos": "adjective",
  "difficulty": "hard",
  "chapter": "My additions"
}
```

Add it to `data/vocabulary.build.json` and run `npm run build`. (`data/vocabulary.json`
is a readable export, not the build input.)

You don't need to work out word positions or distractors. On load the app finds the target
word inside your example sentence itself (handling `-ed`, `-ing`, doubled consonants and
`y` to `i`), and builds a vetted distractor pool for any word that doesn't have one.
`pos` and `difficulty` are optional but improve the questions.

## Not yet wired in

The 127 prefix and suffix entries in `data/prefixes-suffixes.json` were extracted from the
book's Prefix/Suffix chapter but aren't used by the app yet — they'd suit a separate
word-parts drill.
