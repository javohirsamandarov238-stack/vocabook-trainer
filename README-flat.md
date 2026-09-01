# Vocabook Trainer

A spaced-repetition vocabulary trainer built from **Vocabook by @satashkent**, 2nd and 3rd
editions. 1,343 words, five question formats, adaptive scheduling, no backend.

**Study here: https://javohirsamandarov238-stack.github.io/vocabook-trainer/**

Your progress saves in your own browser, on your own device. Nothing is uploaded anywhere,
and nobody else can see your scores.

## Credit

The vocabulary in this project -- every word, definition, example sentence and antonym --
is the work of **[@satashkent](https://t.me/satashkent)**, from *Vocabook* (2nd and 3rd
editions). This is a study tool built on top of that book, not a replacement for it, and
none of the book's own layout, explanations or practice questions is reproduced here.

If you are the author and would prefer this taken down or changed, open an issue and it
will be removed.

## Files

`index.html` is the whole application -- one self-contained file with the vocabulary built
in. Open it in any browser and it works, online or off. Everything else in this repository
is the source it was generated from, kept for reference:

| File | What it is |
|---|---|
| `index.html` | The app. This is what the website serves. |
| `1-core.js` ... `5-library.js`, `app.css`, `index.tpl.html` | Source for the app. |
| `vocabulary.build.json` | The dataset the app embeds, with word positions and distractor pools. |
| `vocabulary.json` | The same words in a clean, readable form. |
| `prefixes-suffixes.json` | 127 word-part entries, extracted but not used by the app yet. |
| `extract.py`, `enrich.py`, `distractors.py`, `build.py` | The pipeline that produced the dataset from the source PDFs. |
| `logic.test.js`, `ui.test.js`, `audit.js` | Test suites: 68 engine checks, 74 interface checks, and a contrast audit. |

Note that these files were uploaded flat rather than in folders, so the build and test
scripts will not run as-is without moving them back into `src/`, `data/`, `tools/` and
`tests/`. The app itself is unaffected -- `index.html` needs nothing else.

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

## Not yet wired in

The 127 prefix and suffix entries in `prefixes-suffixes.json` were extracted from the
book's Prefix/Suffix chapter but aren't used by the app yet -- they'd suit a separate
word-parts drill.
