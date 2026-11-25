import asyncio, json, sys
from playwright.async_api import async_playwright
URL='http://localhost:8765/'
HANDOFF='''Sure, here it is.
```
POLARIS v1
topic: Garden
---
kind: fact
said: 11/24/2026
words:
proposal: Three raised beds now, not two.
base:
---
kind: waiting
said: 11/24/2026
proposal: Pick up compost Friday.
---
kind: decision
said: 11/24/2026
words: "fine, drip line"
proposal: assistant call: drip line on a timer.
---
END POLARIS
```'''
async def main():
    errs=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        for name,vp in (('desk',{'width':1360,'height':860}),('phone',{'width':390,'height':844})):
            ctx=await b.new_context(viewport=vp, device_scale_factor=2 if name=='phone' else 1)
            pg=await ctx.new_page(); pg.on('pageerror',lambda e: errs.append(name+': '+str(e))); pg.on('console',lambda m: errs.append(name+' console: '+m.text) if m.type=='error' else None)
            await pg.goto(URL); await pg.wait_for_timeout(600)
            await pg.screenshot(path=f'/tmp/shots/{name}-0-empty.png')
            # setup wizard
            await pg.goto(URL+'#setup'); await pg.fill('#su-name','Sam'); await pg.click('[data-act=setup-next]')
            await pg.check('input[value="Work"]'); await pg.check('input[value="Home"]'); await pg.fill('#su-custom','Garden'); await pg.click('[data-act=setup-next]')
            await pg.click('[data-act=setup-next]'); await pg.click('[data-act=setup-next]')
            await pg.screenshot(path=f'/tmp/shots/{name}-1-setup-last.png')
            await pg.click('[data-act=setup-next]'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'/tmp/shots/{name}-2-home.png', full_page=True)
            # capture
            await pg.goto(URL+'#capture'); await pg.fill('#cap-text',HANDOFF); await pg.click('[data-act=parse]'); await pg.wait_for_timeout(200)
            await pg.screenshot(path=f'/tmp/shots/{name}-3-capture.png', full_page=True)
            await pg.click('[data-act=cap-add]'); await pg.wait_for_timeout(200)
            await pg.screenshot(path=f'/tmp/shots/{name}-4-inbox.png', full_page=True)
            for _ in range(3):
                btn=pg.locator('[data-act=apply]').first
                if await btn.count()==0: break
                await btn.click(); await pg.wait_for_timeout(200)
                if await pg.locator('#scrim').count(): await pg.click('[data-act=close]')
            st=await pg.evaluate('window.__polaris.state()')
            g=[t for t in st['topics'] if t['name']=='Garden'][0]
            print(name,'topics',[t['name'] for t in st['topics']],'garden start',len(g['start']),'dec',[(d['text'],d.get('who')) for d in g['decisions']],'waiting',len(st['waiting']),'log',[l['type'] for l in st['log']],'inbox',[i['status'] for i in st['inbox']])
            await pg.goto(URL+'#topic/'+g['id']); await pg.wait_for_timeout(200); await pg.screenshot(path=f'/tmp/shots/{name}-5-topic.png', full_page=True)
            await pg.click('[data-act=tab][data-v=decisions]'); await pg.screenshot(path=f'/tmp/shots/{name}-6-decisions.png', full_page=True)
            for r in ['waiting','vault','log','review','guide','settings','more']:
                await pg.goto(URL+'#'+r); await pg.wait_for_timeout(150); await pg.screenshot(path=f'/tmp/shots/{name}-r-{r}.png', full_page=True)
            # example + reload persistence
            await pg.goto(URL+'#home'); await pg.click('#app [data-act=load-example]') if await pg.locator('#app [data-act=load-example]').count() else None
            await pg.reload(); await pg.wait_for_timeout(300)
            print(name,'after reload topics',await pg.evaluate('window.__polaris.state().topics.length'))
            # xss check
            await pg.goto(URL+'#capture'); await pg.fill('#cap-text','POLARIS v1\ntopic: <img src=x onerror=alert(1)>\n---\nkind: fact\nproposal: <script>window.pwned=1</script><img src=x onerror="window.pwned=2">\n'); await pg.click('[data-act=parse]'); await pg.click('[data-act=cap-add]')
            await pg.wait_for_timeout(300); print(name,'pwned?',await pg.evaluate('window.pwned||0'))
            await ctx.close()
        await b.close()
    print('ERRORS:',errs or 'none')
asyncio.run(main())
