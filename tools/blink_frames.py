#!/usr/bin/env python3
"""Seamless blink frames: half and closed are the OPEN frame everywhere except the eye area,
which is taken from ChatGPT's half/closed renders. Fixes drift such as the lightened denim.
Usage: blink_frames.py open.png half.png closed.png outdir"""
import sys, numpy as np
from PIL import Image, ImageFilter, ImageChops
from collections import deque

def load(p): return Image.open(p).convert('RGB')

def eye_mask(o, f, size):
    """Mask of where f differs from o, kept to the head area and grown + feathered."""
    a, b = np.asarray(o).astype(int), np.asarray(f).astype(int)
    d = np.abs(a - b).max(axis=2)
    h, w = d.shape
    m = (d > 28)
    m[int(h * 0.36):, :] = False          # head only: nothing below the face may change
    m[:int(h * 0.12), :] = False          # nor the cap crown
    ys, xs = np.where(m)
    if not len(ys): raise SystemExit('no eye difference found')
    # bound box around the eyes, padded
    y0, y1 = np.percentile(ys, 2), np.percentile(ys, 98); x0, x1 = np.percentile(xs, 2), np.percentile(xs, 98)
    pad = 14
    box = Image.new('L', (w, h), 0)
    box.paste(255, (int(x0 - pad), int(y0 - pad), int(x1 + pad), int(y1 + pad)))
    return box.filter(ImageFilter.GaussianBlur(6)), (int(x0), int(y0), int(x1), int(y1))

def cutout(im, thr=7):
    a = np.asarray(im).astype(int); h, w, _ = a.shape; lum = a.max(axis=2)
    bg = np.zeros((h, w), bool)
    q = deque([(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)])
    while q:
        y, x = q.popleft()
        if y < 0 or y >= h or x < 0 or x >= w or bg[y, x] or lum[y, x] > thr: continue
        bg[y, x] = True; q.extend([(y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)])
    m = Image.fromarray(((~bg) * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    o = im.convert('RGBA'); o.putalpha(m); return o

if __name__ == '__main__':
    op, hp, cp, out = sys.argv[1:5]
    o, hf, cf = load(op), load(hp), load(cp)
    assert o.size == hf.size == cf.size, 'frames differ in size'
    frames = {'open': o}
    for name, f in (('half', hf), ('closed', cf)):
        m, box = eye_mask(o, f, o.size)
        frames[name] = Image.composite(f, o, m)
        print(name, 'eye box', box)
    # one alpha for all three (from the open frame) so the silhouette never shifts
    base = cutout(o); alpha = base.getchannel('A'); bbox = alpha.getbbox()
    for name, f in frames.items():
        r = f.convert('RGBA'); r.putalpha(alpha); r = r.crop(bbox)
        r = r.resize((400, int(r.height * 400 / r.width)), Image.LANCZOS)
        r.save(f'{out}/resident{"" if name == "open" else "-" + name}.webp', 'WEBP', quality=88, method=6)
        # outside-eye check
    a = np.asarray(frames['open']).astype(int)
    for name in ('half', 'closed'):
        d = np.abs(np.asarray(frames[name]).astype(int) - a).max(axis=2)
        print(name, 'pixels changed below the face:', int((d[int(d.shape[0] * 0.36):] > 0).sum()))
