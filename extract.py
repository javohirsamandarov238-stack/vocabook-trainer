import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

import pdfplumber, json, re, sys, unicodedata

def clean(s):
    if s is None: return ""
    s = s.replace("\u200b", " ").replace("\xa0", " ")
    s = s.replace("\n", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s

def norm_math(s):
    # PDF uses mathematical italic unicode for highlighted words
    out = []
    for ch in s:
        n = unicodedata.normalize("NFKC", ch)
        out.append(n)
    return "".join(out)

def extract(path, label):
    rows = []
    with pdfplumber.open(path) as pdf:
        total = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            try:
                tables = page.extract_tables()
            except Exception as e:
                continue
            for t in tables:
                for r in t:
                    r = [clean(norm_math(c or "")) for c in r]
                    if len(r) < 4:
                        continue
                    rows.append({"page": i+1, "cells": r})
            if i % 50 == 0:
                print(f"{label}: page {i+1}/{total}", file=sys.stderr)
    return rows

out = {}
for label, path in [
    ("2nd", P("pdfs", "Vocabook_2nd_Edition.pdf")),
    ("3rd", P("pdfs", "Vocabook_3rd_Edition.pdf")),
]:
    out[label] = extract(path, label)
    print(f"{label}: {len(out[label])} table rows", file=sys.stderr)

with open(P("build", "raw_rows.json"), "w") as f:
    json.dump(out, f, ensure_ascii=False)
print("done")
