#!/usr/bin/env python3
"""Builds www/: index.html (single file), sw.js, manifest, icons. Drop renders in art/planet.(png|webp) and art/resident.(png|webp)."""
import base64, json, os, re, hashlib, shutil, glob, sys
R=os.path.dirname(os.path.abspath(__file__))
NAME=sys.argv[sys.argv.index('--name')+1] if '--name' in sys.argv else ''
W=os.path.join(R,'www' if not NAME else 'www-'+NAME.lower()); os.makedirs(W,exist_ok=True)
rd=lambda p: open(os.path.join(R,p),encoding='utf-8').read()
def art(name):
    for ext,mime in (('webp','image/webp'),('png','image/png'),('jpg','image/jpeg')):
        p=os.path.join(R,'art',name+'.'+ext)
        if os.path.exists(p): return 'data:%s;base64,%s'%(mime,base64.b64encode(open(p,'rb').read()).decode())
    return ''
ART={'planet':art('planet'),'resident':art('resident'),'residentHalf':art('resident-half'),'residentClosed':art('resident-closed'),'lockup':art('lockup')}
html=rd('src/index.template.html')
html=html.replace('/*STYLE*/',rd('src/style.css')).replace('/*ART*/','window.POLARIS_ART='+json.dumps(ART)+';window.POLARIS_PRESET='+json.dumps({'name':NAME})+';').replace('/*CORE*/',rd('src/core.js')).replace('/*APP*/',rd('src/app.js'))
open(os.path.join(W,'index.html'),'w',encoding='utf-8').write(html)
ver=hashlib.sha256(html.encode()).hexdigest()[:10]
sw=rd('src/sw.js').replace('__VER__',ver); open(os.path.join(W,'sw.js'),'w').write(sw)
shutil.copy(os.path.join(R,'src','manifest.webmanifest'),W)
os.makedirs(os.path.join(W,'icons'),exist_ok=True)
for f in glob.glob(os.path.join(R,'icons','*.png')): shutil.copy(f,os.path.join(W,'icons'))
print('built',len(html),'bytes, cache',ver,'art:',{k:bool(v) for k,v in ART.items()})
