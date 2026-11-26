#!/usr/bin/env python3
"""Builds www/: index.html (single file), sw.js, manifest, icons. Drop renders in art/planet.(png|webp) and art/resident.(png|webp)."""
import base64, json, os, re, hashlib, shutil, glob, sys
R=os.path.dirname(os.path.abspath(__file__))
arg=lambda k: sys.argv[sys.argv.index(k)+1] if k in sys.argv else ''
NAME=arg('--name'); ED=arg('--edition'); JUMP=arg('--jumpstart'); ROLE=arg('--role')  # role: what the person does, shapes the general jumpstart (e.g. 'producer and editor')   # edition = planet art set, e.g. mercury; default is the Neptune set
ARTDIR='art' if not ED else 'art-'+ED; ICONDIR='icons' if not ED else 'icons-'+ED
W=os.path.join(R,'www'+('-'+ED if ED else '')+('-'+NAME.lower() if NAME else '')); os.makedirs(W,exist_ok=True)
rd=lambda p: open(os.path.join(R,p),encoding='utf-8').read()
def art(name):
    for ext,mime in (('webp','image/webp'),('png','image/png'),('jpg','image/jpeg')):
        p=os.path.join(R,ARTDIR,name+'.'+ext)
        if not os.path.exists(p): p=os.path.join(R,'art',name+'.'+ext) if name=='lockup' else p
        if os.path.exists(p): return 'data:%s;base64,%s'%(mime,base64.b64encode(open(p,'rb').read()).decode())
    return ''
ART={'planet':art('planet'),'resident':art('resident'),'residentHalf':art('resident-half'),'residentClosed':art('resident-closed'),'lockup':art('lockup')}
EDS={'mercury':('#C6BFDB','mercury',True),'jupiter':('#E8B57A','jupiter',True),'gemini':('#B9C7D6','mercury',True)}; ART['accent'],ART['sign'],ART['heroSign']=EDS.get(ED,('#8a74ff','neptune',True))
if ED=='gemini':  # Marcus (Gemini, ruled by Mercury). Mercury has no ring and no moons, so: silver-grey orbit, stations in Mercury's real rock colors with a sky-blue Gemini glow (11/25/2026)
    ART['fresh']=True; ART['ring']=['rgba(196,206,218,.75)','rgba(160,170,184,.4)']; ART['dot']=['radial-gradient(circle at 35% 30%,#fff,#c9cdd2 45%,#6f7379)','0 0 10px rgba(185,199,214,.85)']
if ED=='jupiter': ART['fresh']=True  # first edition he ever gets: no 'polaris got an update' note
if ED=='jupiter': ART['moons']=json.load(open(os.path.join(R,'art-jupiter','moons.json')))  # Jupiter's real moons in their real colors (Gugui, 11/25/2026)
if ED=='jupiter': ART['ring']=['rgba(222,170,118,.8)','rgba(196,140,96,.45)']  # Jupiter's real ring is faint dusty amber (Gugui, 11/25/2026)
html=rd('src/index.template.html')
html=html.replace('/*STYLE*/',rd('src/style.css')).replace('/*ART*/','window.POLARIS_ART='+json.dumps(ART)+';window.POLARIS_PRESET='+json.dumps({k:v for k,v in {'name':NAME,'jumpstart':JUMP,'role':ROLE}.items() if v})+';').replace('/*CORE*/',rd('src/core.js')).replace('/*APP*/',rd('src/app.js'))
open(os.path.join(W,'index.html'),'w',encoding='utf-8').write(html)
ver=hashlib.sha256(html.encode()).hexdigest()[:10]
sw=rd('src/sw.js').replace('__VER__',ver); open(os.path.join(W,'sw.js'),'w').write(sw)
shutil.copy(os.path.join(R,'src','manifest.webmanifest'),W)
os.makedirs(os.path.join(W,'icons'),exist_ok=True)
for f in glob.glob(os.path.join(R,ICONDIR,'*.png')): shutil.copy(f,os.path.join(W,'icons'))
print('built',len(html),'bytes, cache',ver,'art:',{k:bool(v) for k,v in ART.items()})
