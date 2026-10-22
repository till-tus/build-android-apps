import { test, expect } from '@playwright/test';
import { installAnnotationHost } from './annotation-host.mjs';
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
test('host annotation cursor styles load above the emulator and selections retain Android context',async({page,request})=>{
 await page.addInitScript(installAnnotationHost);
 const response=await page.goto(await session(request));
 // Supporting the host's styles must not allow inline page scripts.
 expect(response.headers()['content-security-policy']).toContain("script-src 'self';");
 await expect(page.getByText('Connecting to Android…')).toBeHidden();
 const canvas=page.locator('#screen'),bounds=await canvas.boundingBox();
 const point={x:bounds.x+bounds.width*100/360,y:bounds.y+bounds.height*160/720};
 const before=(await(await request.get('http://127.0.0.1:18378/actions')).json()).length;
 await page.getByRole('button',{name:'Annotate screen',exact:true}).click();
 await expect(page.locator('#annotate')).toHaveAttribute('aria-pressed','true');
 await page.mouse.move(point.x,point.y);
 const pointer=page.locator('#test-annotation-host .annotation-pointer');
 await expect(pointer).toHaveCSS('position','fixed');
 await expect(pointer).toHaveCSS('width','24px');
 const cursor=await pointer.boundingBox();
 expect(cursor.x).toBeCloseTo(point.x,0);expect(cursor.y).toBeCloseTo(point.y,0);
 expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,point)).toBe('test-annotation-host');
 await page.mouse.click(point.x,point.y);
 const picked=await page.evaluate(()=>window.annotationHost.picks.at(-1));
 expect(picked.metadata.resourceId).toBe('counter');expect(picked.role).toBe('android-element');
 expect((await(await request.get('http://127.0.0.1:18378/actions')).json()).length).toBe(before);
 expect(await page.evaluate(()=>window.annotationHost.violations)).toEqual([]);
});
