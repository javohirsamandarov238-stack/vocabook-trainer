import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

import json, os, re, glob


V = json.load(open(P("data", "vocabulary.build.json")))

# ---- clean, editable copy for the user (no internal distractor indices) ----
clean = []
for e in V:
    c = {k: v for k, v in e.items() if k not in ("d", "span")}
    clean.append(c)
json.dump(clean, open(P("data", "vocabulary.json"), "w"), ensure_ascii=False, indent=1)

# ---- app payload ----
payload = "const VOCAB = " + json.dumps(V, ensure_ascii=False, separators=(",", ":")) + ";\n"
payload += "const VOCAB_SOURCE = " + json.dumps({
    "title": "Vocabook by @satashkent",
    "editions": ["2nd Edition", "3rd Edition"],
    "words": len(V)
}, ensure_ascii=False) + ";\n"

css = open(P("src", "app.css"), encoding="utf-8").read()

js_files = sorted(glob.glob(P("src", "[0-9]-*.js")))
js = "\n\n".join(open(f, encoding="utf-8").read() for f in js_files)
js = "(function(){\n'use strict';\n" + js + "\n})();"

tpl = open(P("src", "index.tpl.html"), encoding="utf-8").read()
html = (tpl
        .replace("/*__CSS__*/", css)
        .replace("/*__DATA__*/", payload)
        .replace("/*__JS__*/", js))

path = P("index.html")
open(path, "w", encoding="utf-8").write(html)
print("wrote", path, round(len(html) / 1024), "KB")
print("js files:", [os.path.basename(f) for f in js_files])
print("words:", len(V))
