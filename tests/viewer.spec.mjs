import { test, expect } from '@playwright/test';
async function session(request){return(await(await request.get('http://127.0.0.1:18378')).json()).url;}
test('real rendered viewer draws a frame, forwards taps, inspects nodes and fits a narrow panel',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(await session(request));
 await expect(page).toHaveTitle('Android · Build Android Apps');await expect(page.getByText('Connecting to Android…')).toBeHidden();
 const canvas=page.locator('#screen');await expect(canvas).toBeVisible();
 const b=await canvas.boundingBox();await page.mouse.click(b.x+b.width*100/360,b.y+b.height*160/720);
 await expect.poll(async()=> (await(await request.get('http://127.0.0.1:18378/actions')).json()).some(a=>a.type==='tap')).toBe(true);
 await page.getByRole('button',{name:'Inspect element'}).click();
 await page.mouse.click(b.x+b.width*100/360,b.y+b.height*160/720);
 await expect(page.getByRole('region',{name:'Element inspector'})).toBeVisible();await expect(page.locator('#properties')).toContainText('counter');
 await expect(page.locator('#properties')).not.toContainText('secret');
 await page.setViewportSize({width:320,height:720});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);await page.screenshot({path:'/tmp/android-plugin-viewer-test.png'}).catch(()=>{});
});
test('native annotation contract maps scaled picks, carries metadata, freezes input and invalidates',async({page,request})=>{
 await page.addInitScript(()=>{let active=false;Object.defineProperty(document,'oai',{value:{annotation:{registerSurface(options){window.testSurface=options;return{invalidate(){window.invalidations=(window.invalidations||0)+1;},dispose(){}};},isActive(){return active;},toggle(value){active=value;document.dispatchEvent(new CustomEvent('oaiannotationmodechange',{detail:{active}}));return{accepted:true};}}}});});
 await page.goto(await session(request));await expect(page.getByText('Connecting to Android…')).toBeHidden();await page.getByRole('button',{name:'Refresh hierarchy'}).isVisible();
 await page.getByRole('button',{name:'Annotate screen',exact:true}).click();
 const target=await page.evaluate(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return window.testSurface.hitTest({clientX:r.left+r.width*100/360,clientY:r.top+r.height*160/720});});
 expect(target.role).toBe('android-element');expect(target.metadata.resourceId).toBe('counter');expect(target.rect.width).toBeGreaterThan(0);
 const before=(await(await request.get('http://127.0.0.1:18378/actions')).json()).length;await page.locator('#screen').click();
 expect((await(await request.get('http://127.0.0.1:18378/actions')).json()).length).toBe(before);
 expect(await page.evaluate(()=>window.invalidations)).toBeGreaterThan(0);
});
