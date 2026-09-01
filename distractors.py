import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

import json, re, random
from collections import defaultdict

V = json.load(open(P("build", "vocab.json")))
N = len(V)
random.seed(7)

STOP = set("""a an the to of in on for with and or but not is are was were be being been
by from as at it its his her their our your my this that these that's if then than so such
someone something somebody anyone one who whom which what when where how very more most
other others another way ways thing things person people able can could would should may
might will shall do does did done have has had make makes made get gets got given give
gives take takes taken use uses used usually often always never sometimes especially
about into over under out up down off again further once here there all any both each few
this those own same too also just even only""".split())

def toks(s):
    s = s.lower()
    s = re.sub(r"^\d\)\s*", " ", s)
    words = re.findall(r"[a-z]+", s)
    return [w for w in words if w not in STOP and len(w) > 2]

def stem(s):
    for suf in ("ations","ation","ities","ity","ness","ments","ment","ances","ance",
                "ences","ence","ously","ing","ers","er","est","ed","es","ly","s","e"):
        if len(s) - len(suf) >= 4 and s.endswith(suf):
            return s[:-len(suf)]
    return s

defstems = []
wordstems = []
antsets = []
for e in V:
    defstems.append(set(stem(t) for t in toks(e["definition"])))
    wordstems.append(stem(re.sub(r"[^A-Za-z]", "", e["word"]).lower()))
    antsets.append(set(stem(t) for t in toks(e["antonym"])))

# inverted index over definition stems -> only compare words that share a stem
index = defaultdict(list)
for i, ds in enumerate(defstems):
    for s in ds:
        index[s].append(i)

def jaccard(a, b):
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / (len(a) + len(b) - inter)

# --- 1. near-synonym blacklist (would create two correct answers) ---
banned = [set() for _ in range(N)]
for i in range(N):
    cand = set()
    for s in defstems[i]:
        if len(index[s]) < 220:            # skip ultra-generic stems
            cand.update(index[s])
    cand.discard(i)
    for j in cand:
        if jaccard(defstems[i], defstems[j]) >= 0.30:
            banned[i].add(j); banned[j].add(i)

# same word family (content / contented, decisive / decisiveness)
byfam = defaultdict(list)
for i, ws in enumerate(wordstems):
    byfam[ws].append(i)
for ws, group in byfam.items():
    for a in group:
        for b in group:
            if a != b:
                banned[a].add(b); banned[b].add(a)

# a word whose form appears inside another's definition is also unsafe
for i in range(N):
    ws = wordstems[i]
    if len(ws) >= 5:
        for j in index.get(ws, []):
            if j != i:
                banned[i].add(j); banned[j].add(i)

print("avg banned per word:", round(sum(len(b) for b in banned) / N, 2))
print("max banned:", max(len(b) for b in banned))

# --- 2. orthographic look-alikes (great hard distractors) ---
def sig(w):
    return re.sub(r"[^a-z]", "", w.lower())

lookalike = defaultdict(set)
byprefix = defaultdict(list)
for i, e in enumerate(V):
    s = sig(e["word"])
    if len(s) >= 5:
        byprefix[s[:4]].append(i)
for pref, group in byprefix.items():
    if len(group) < 2:
        continue
    for a in group:
        for b in group:
            if a != b and b not in banned[a]:
                lookalike[a].add(b)

# --- 3. build the pools ---
DIFF_ORDER = {"easy": 0, "medium": 1, "hard": 2}
bypos = defaultdict(list)
for i, e in enumerate(V):
    bypos[e["pos"]].append(i)
allidx = list(range(N))

POOL = 18
pools = []
for i, e in enumerate(V):
    pos = e["pos"]
    di = DIFF_ORDER[e["difficulty"]]
    seen = set()
    pool = []

    def add(j):
        if j == i or j in banned[i] or j in seen:
            return False
        seen.add(j); pool.append(j)
        return True

    # tier 1: look-alikes with a matching part of speech
    la = [j for j in lookalike[i] if V[j]["pos"] == pos]
    random.shuffle(la)
    for j in la[:3]:
        add(j)

    # tier 2: same POS, same difficulty band
    same = [j for j in bypos[pos] if DIFF_ORDER[V[j]["difficulty"]] == di]
    random.shuffle(same)
    for j in same:
        if len(pool) >= 10:
            break
        add(j)

    # tier 3: same POS, adjacent difficulty
    near = [j for j in bypos[pos] if abs(DIFF_ORDER[V[j]["difficulty"]] - di) == 1]
    random.shuffle(near)
    for j in near:
        if len(pool) >= 15:
            break
        add(j)

    # tier 4: anything with the same POS, then anything at all
    for src in (bypos[pos], allidx):
        pool_src = list(src)
        random.shuffle(pool_src)
        for j in pool_src:
            if len(pool) >= POOL:
                break
            add(j)
        if len(pool) >= POOL:
            break

    pools.append(pool)

short = [i for i, p in enumerate(pools) if len(p) < 6]
print("words with a thin pool (<6):", len(short))
print("avg pool size:", round(sum(len(p) for p in pools) / N, 2))

for i, e in enumerate(V):
    e["d"] = pools[i]

# sanity check: no distractor is a near-synonym of its own word
bad = 0
for i, e in enumerate(V):
    for j in e["d"]:
        if jaccard(defstems[i], defstems[j]) >= 0.30:
            bad += 1
print("distractors that are near-synonyms:", bad)

json.dump(V, open(P("data", "vocabulary.build.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print("bytes:", len(open(P("data", "vocabulary.build.json")).read()))

# show a sample question
import textwrap
for i in (0, 500, 1200):
    e = V[i]
    print("\n" + e["word"], "—", e["definition"], f"[{e['pos']}/{e['difficulty']}]")
    for j in e["d"][:5]:
        print("    x", V[j]["word"], "—", V[j]["definition"][:60], f"[{V[j]['pos']}/{V[j]['difficulty']}]")
