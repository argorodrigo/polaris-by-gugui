#!/usr/bin/env python3
"""Cut the globe out of a planet render with an exact circular mask (no box, no ring outside the globe).
The renders put a 1,062 px globe 237 px from each edge of a 1536 canvas. Usage: planet.py in.png out.webp"""
import sys
from PIL import Image, ImageDraw, ImageFilter
im = Image.open(sys.argv[1]).convert('RGBA'); W = im.width
r = 531 * W / 1536; c = W / 2
S = 4; m = Image.new('L', (W * S, W * S), 0)
ImageDraw.Draw(m).ellipse([(c - r + 1) * S, (c - r + 1) * S, (c + r - 1) * S, (c + r - 1) * S], fill=255)
m = m.resize((W, W), Image.LANCZOS)
im.putalpha(m)
g = im.crop((int(c - r), int(c - r), int(c + r), int(c + r))).resize((720, 720), Image.LANCZOS)
g.save(sys.argv[2], 'WEBP', quality=88, method=6); print('globe', g.size)
