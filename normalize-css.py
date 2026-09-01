import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

import re

p = P("src", "app.css")
s = open(p, encoding="utf-8").read()

# a real scale, rather than whatever number looked right at the time
TYPE  = [0.69, 0.75, 0.8125, 0.875, 0.95, 1.0, 1.2, 1.45, 1.85, 2.15, 2.5, 3.1]
RADII = [4, 8, 14, 20, 28]

def snap_type(m):
    v = float(m.group(1))
    n = min(TYPE, key=lambda t: abs(t - v))
    return f"font-size: {n:g}rem"

def snap_radius(m):
    val = m.group(1).strip()
    if val in ("99px", "50%") or "var(" in val or " " in val:
        return m.group(0)
    px = re.match(r"^(\d+)px$", val)
    if not px:
        return m.group(0)
    n = min(RADII, key=lambda t: abs(t - int(px.group(1))))
    return f"border-radius: {n}px"

before_t = len(set(re.findall(r"font-size:\s*([\d.]+)rem", s)))
before_r = len(set(re.findall(r"border-radius:\s*([^;]+);", s)))

s = re.sub(r"font-size:\s*([\d.]+)rem", snap_type, s)
s = re.sub(r"border-radius:\s*([^;]+)(?=;)", snap_radius, s)

# the glow behind the headword sits at z-index -1; without a stacking
# context on the parent it drops behind the page background and vanishes
s = s.replace(
  ".q-word {\n  font-family: var(--serif);",
  ".q-word {\n  isolation: isolate;\n  font-family: var(--serif);")

# the session ring must shrink on narrow screens
s = s.replace(".orb svg { display: block; position: relative; transform: rotate(-90deg); }",
              ".orb svg { display: block; position: relative; max-width: 100%; height: auto; transform: rotate(-90deg); }")

open(p, "w", encoding="utf-8").write(s)

after_t = sorted(set(float(x) for x in re.findall(r"font-size:\s*([\d.]+)rem", s)))
after_r = sorted(set(re.findall(r"border-radius:\s*([^;]+);", s)))
print(f"font sizes: {before_t} -> {len(after_t)}  {after_t}")
print(f"radii:      {before_r} -> {len(after_r)}  {after_r}")
