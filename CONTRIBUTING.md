# Working on this repo

## Layout

    src/            the app — five JS modules plus one stylesheet and an HTML shell
    data/           the vocabulary; vocabulary.build.json is what the app embeds
    tools/          the PDF -> dataset pipeline, and the build script
    tests/          logic, interface, and design-system checks
    index.html      the built single-file app -- this is what GitHub Pages serves

`index.html` is generated. Never edit it by hand — change `src/` and rebuild.

## Build

    npm install
    npm run build        # regenerates index.html and data/vocabulary.json

## Test

    npm test             # logic + interface + audit

- `tests/logic.test.js` builds all 5,372 possible questions and checks the
  distractor and scheduling rules hold. It also simulates full study sessions.
- `tests/ui.test.js` drives the built `index.html` in jsdom, clicking through
  every user flow including a page reload to confirm progress persists.
- `tests/audit.js` measures contrast in both themes and checks the type scale
  and radii have not drifted.

`npm run inspect` dumps the rendered dashboard, a question, and a word card as
text — useful when you cannot open a browser.

## Regenerating the dataset from the PDFs

The PDFs are not in this repo and must not be committed. Put them in `pdfs/`
(gitignored) as `Vocabook_2nd_Edition.pdf` and `Vocabook_3rd_Edition.pdf`, then:

    pip install pdfplumber
    mkdir -p build
    python3 tools/extract.py       # PDF tables  -> build/raw_rows.json
    python3 tools/enrich.py        # adds part of speech, difficulty, word spans
    python3 tools/distractors.py   # vets the distractor pools
    python3 tools/build.py         # -> index.html

`tools/probe.js` simulates study sessions at different accuracy levels, for
checking that changes to the scheduler still let words reach mastery.

## Adding words by hand

Append to `data/vocabulary.json` and rebuild. Word positions and distractor
pools are worked out automatically at load time for any entry that lacks them.
