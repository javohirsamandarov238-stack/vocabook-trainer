import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

import json, re
from collections import Counter

V = json.load(open(P("build", "vocab_raw.json")))

# ============ headword normalisation ============
def base_forms(word):
    w = word.strip()
    w = re.sub(r"\s*\((?:verb|noun|adj|adjective|adv|adverb)\)\s*$", "", w, flags=re.I)
    w = re.sub(r"^[Tt]o\s+", "", w)
    outs = []
    m = re.match(r"^([A-Za-z\-]+)\(([A-Za-z]+)\)$", w)
    if m:
        outs += [m.group(1), m.group(1) + m.group(2)]
    if "/" in w:
        outs += [p.strip() for p in w.split("/") if p.strip()]
    toks = re.findall(r"[A-Za-z\-]+", w)
    if toks:
        outs.append(toks[0])
        if len(toks) > 1:
            outs.append(" ".join(toks))
    outs.append(re.sub(r"[^A-Za-z\- ]", "", w))
    seen, res = set(), []
    for o in outs:
        o = o.strip().lower()
        if o and o not in seen:
            seen.add(o); res.append(o)
    return res

IRREGULAR = {
    "behold": ["beheld", "beholding", "beholds"],
    "hew": ["hewed", "hewn", "hews"],
    "forgo": ["forwent", "forgone"],
    "undergo": ["underwent", "undergone"],
    "suffraage": ["suffrage"],
}

def stem(s):
    s = s.lower()
    for suf in ("iness", "ously", "ements", "ement", "ations", "ation", "ingly",
                "ities", "ity", "ness", "ments", "ment", "ances", "ance",
                "ences", "ence", "ists", "ism", "ies", "ied", "ier", "iest",
                "ing", "ers", "er", "est", "ed", "es", "s", "ly", "e"):
        if len(s) - len(suf) >= 3 and s.endswith(suf):
            return s[: -len(suf)]
    return s

TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z\-']*")

def find_span(sentence, word):
    cands = base_forms(word)
    for c in sorted(cands, key=len, reverse=True):
        m = re.search(r"\b" + re.escape(c) + r"\b", sentence, re.I)
        if m:
            return m.span()
    for c in cands:
        for form in IRREGULAR.get(c, []):
            m = re.search(r"\b" + form + r"\b", sentence, re.I)
            if m:
                return m.span()
    forms = set()
    for c in cands:
        if len(c) < 3 or " " in c:
            continue
        b = c[:-1] if c.endswith("e") else c
        for suf in ("s", "es", "ed", "d", "ing", "ment", "ance", "ence",
                    "ous", "ent", "ive", "al", "ful", "ings"):
            forms.add(c + suf); forms.add(b + suf)
        if len(c) >= 3 and c[-1] not in "aeiouwxy" and c[-2] in "aeiou" and c[-3] not in "aeiou":
            for suf in ("ed", "ing", "er", "y"):
                forms.add(c + c[-1] + suf)
        if c.endswith("y"):
            for suf in ("ed", "es", "er", "est"):
                forms.add(c[:-1] + "i" + suf)
    for f in sorted(forms, key=len, reverse=True):
        if len(f) < 4:
            continue
        m = re.search(r"\b" + re.escape(f) + r"\b", sentence, re.I)
        if m:
            return m.span()
    stems = {stem(c) for c in cands if len(c) >= 3}
    for m in TOKEN_RE.finditer(sentence):
        tok = m.group(0)
        if len(tok) < 4:
            continue
        st = stem(tok)
        if st in stems:
            return m.span()
        for s2 in stems:
            if len(s2) >= 4 and (st.startswith(s2) or s2.startswith(st)) and abs(len(st) - len(s2)) <= 2:
                return m.span()
    return None


def all_forms(word):
    """Every surface form of the headword we should be willing to blank out."""
    cands = base_forms(word)
    forms = set()
    for c in cands:
        if len(c) < 3:
            continue
        forms.add(c)
        forms.update(IRREGULAR.get(c, []))
        if " " in c:
            continue
        b = c[:-1] if c.endswith("e") else c
        for suf in ("s", "es", "ed", "d", "ing", "ings", "ment", "ments",
                    "ance", "ence", "ous", "ent", "ive", "al", "ful", "ly", "ness", "ity"):
            forms.add(c + suf); forms.add(b + suf)
        if len(c) >= 3 and c[-1] not in "aeiouwxy" and c[-2] in "aeiou" and c[-3] not in "aeiou":
            for suf in ("ed", "ing", "er", "y"):
                forms.add(c + c[-1] + suf)
        if c.endswith("y"):
            for suf in ("ed", "es", "er", "est"):
                forms.add(c[:-1] + "i" + suf)
    return {f for f in forms if len(f) >= 3}

def find_spans(sentence, word):
    """All occurrences of the headword family. The primary span comes first."""
    primary = find_span(sentence, word)
    if not primary:
        return []
    spans = [primary]
    surface = sentence[primary[0]:primary[1]].lower()
    forms = all_forms(word) | {surface}
    for f in sorted(forms, key=len, reverse=True):
        for m in re.finditer(r"\b" + re.escape(f) + r"\b", sentence, re.I):
            sp = m.span()
            if any(not (sp[1] <= a or sp[0] >= b) for a, b in spans):
                continue
            spans.append(sp)
    spans.sort()
    return spans

# ============ part of speech ============
DET   = {"a","an","the","his","her","their","its","my","your","our","this","that","these","those","every","each","some","no","any"}
MODAL = {"to","will","would","can","could","should","must","might","may","let","help","helped","helps","not","never","also","always","often","only","just","finally","quickly","slowly","then","soon","still","really"}
LINK  = {"was","is","were","are","been","being","be","seemed","seems","felt","feels","looked","looks","became","becomes","appeared","appears","remained","stayed","sounded","smelled","tasted","grew","stays"}
DEG   = {"so","very","quite","too","more","most","extremely","rather","somewhat","incredibly","utterly","fairly","less","least","pretty","highly","truly","completely","totally","entirely","especially","particularly","unusually","deeply"}
SUBJ  = {"he","she","they","i","we","you","it","who","which"}

def context_pos(example, span):
    if not span:
        return None
    before = TOKEN_RE.findall(example[:span[0]])
    surface = example[span[0]:span[1]].lower()
    prev  = before[-1].lower() if before else ""
    prev2 = before[-2].lower() if len(before) > 1 else ""
    if prev in DEG or (prev2 in DEG and prev in LINK):
        return "adjective"
    if prev in LINK:
        return "adjective" if not surface.endswith("ing") else None
    if prev in DET:
        return None
    if prev in MODAL:
        return "verb"
    if prev in SUBJ:
        return "verb"
    return None

ADJ_SUF  = ("ous","ive","able","ible","ful","less","ical","ic","ant","ent","ary",
            "ish","ile","oid","some","ward","like","proof","worthy","ate")
NOUN_SUF = ("tion","sion","ness","ment","ity","ance","ence","ism","ist","ship",
            "hood","ure","age","cy","dom","tude","logy","archy","ery")

def infer_pos(word, definition, example, span):
    raw = word.strip()
    explicit = re.search(r"\((verb|noun|adj|adjective|adv|adverb)\)\s*$", raw, re.I)
    if explicit:
        v = explicit.group(1).lower()
        return {"adj": "adjective", "adv": "adverb"}.get(v, v), "source"
    if re.match(r"^[Tt]o\s+\w", raw):
        return "verb", "source"

    w = re.sub(r"[^A-Za-z\- ]", "", raw).strip().lower()
    head_tok = w.split()[0] if w.split() else w
    d = re.sub(r"^\d\)\s*", "", definition.strip()).lower().strip()

    if re.match(r"^to\s+\w", d):
        return "verb", "inferred"
    if head_tok.endswith("ly") and not head_tok.endswith(("ply","lly")) and len(head_tok) > 4:
        return "adverb", "inferred"
    if re.match(r"^(in a |in an )", d):
        return "adverb", "inferred"
    if re.match(r"^(the act of|the quality of|the state of|a person who|someone who|"
                r"the ability to|the practice of|a feeling of|the condition of|"
                r"the process of|the fact of|the belief|the amount|the degree|"
                r"the importance|the result|a group of|a period|a lack of|the lack of|"
                r"an? [a-z\-]+ (who|that|of|for|in)\b)", d):
        return "noun", "inferred"
    if re.match(r"^(having|not |very |extremely |characterised|characterized|"
                r"marked by|full of|lacking|showing|relating to|related to|able to|"
                r"willing to|unable|easily |likely to|tending to|so |too |"
                r"capable of|difficult|impossible|possible|hard to|easy to)", d):
        return "adjective", "inferred"
    if head_tok.endswith(NOUN_SUF):
        return "noun", "inferred"
    if head_tok.endswith(ADJ_SUF):
        return "adjective", "inferred"
    if head_tok.endswith(("ing", "ed")) and len(head_tok) > 5:
        return "adjective", "inferred"
    cp = context_pos(example or "", span)
    if cp:
        return cp, "inferred"
    first = re.findall(r"[a-z\-]+", d)
    if first:
        f = first[0]
        if f.endswith(NOUN_SUF):
            return "noun", "inferred"
        if f.endswith(ADJ_SUF) or f.endswith(("ing", "ed")):
            return "adjective", "inferred"
    if re.match(r"^(an? |the )", d):
        return "noun", "inferred"
    return None, "unknown"

# ============ difficulty (tertiles of a continuous score) ============
TIER = {
    "College Panda 400 Words": 0.0,
    "Ivy Global 500 Words": 1.0,
    "SATashkent Words (EDITION 8.0)": 1.2,
    "Advanced Package Vocabulary": 2.0,
}

def score(e):
    s = TIER.get(e["chapter"], 1.0)
    core = re.sub(r"[^A-Za-z]", "", e["word"])
    s += (len(core) - 8) * 0.16
    s += max(0, (e["set"] or 1) - 1) * 0.035
    s += (len(e["definition"]) - 40) * 0.010
    if re.search(r"\b\d\)", e["definition"]):
        s += 0.5          # multiple senses = harder
    return s

# ============ build ============
scored = sorted((score(e), i) for i, e in enumerate(V))
rank = {}
for r, (_, i) in enumerate(scored):
    rank[i] = r
n = len(V)

out, flags = [], []
for i, e in enumerate(V):
    spans = find_spans(e["example"], e["word"])
    span = spans[0] if spans else None
    pos, src = infer_pos(e["word"], e["definition"], e["example"], span)
    r = rank[i]
    diff = "easy" if r < n * 0.34 else ("medium" if r < n * 0.72 else "hard")

    senses = [s.strip() for s in re.split(r"\s*\d\)\s*", e["definition"]) if s.strip()]

    rec = {
        "id": i + 1,
        "word": e["word"],
        "definition": e["definition"],
        "example": e["example"],
        "antonym": e["antonym"],
        "chapter": e["chapter"],
        "set": e["set"],
        "pos": pos,
        "difficulty": diff,
    }
    if len(senses) > 1:
        rec["senses"] = senses
    if spans:
        rec["spans"] = [[a, b] for a, b in spans]

    issues = []
    if not span:
        issues.append("Target word could not be located in its example sentence, so this word is skipped in fill-in-the-blank questions.")
    if not e["antonym"]:
        issues.append("No antonym given in the source book.")
    if src == "unknown":
        issues.append("Part of speech is not stated in the source and could not be inferred reliably.")
    if len(e["definition"]) < 10:
        issues.append("The source definition is very short — check it against a dictionary.")
    if re.search(r"(.)\1\1", e["word"]) or e["word"].lower() in ("suffraage",):
        issues.append("Possible spelling error in the source book.")
    if issues:
        rec["issues"] = issues
        flags.append((e["word"], issues))
    out.append(rec)

print("total:", len(out))
print("no span:", sum(1 for r in out if "span" not in r))
print("flagged:", len(flags))
print("pos:", Counter(r["pos"] for r in out))
print("difficulty:", Counter(r["difficulty"] for r in out))
print("multi-sense:", sum(1 for r in out if "senses" in r))

json.dump(out, open(P("build", "vocab.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print("bytes:", len(open(P("build", "vocab.json")).read()))
