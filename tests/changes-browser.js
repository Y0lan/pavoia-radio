// Playwright CLI callback. All history records here are browser-only test data.
async page => {
 const assert=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let mode='baseline',held,hold=false;
 const entry=(sequence,kind,title)=>({sequence:String(sequence),kind,id:String(sequence),title,artist:'Test artist',album:'Test album',observedAt:'2026-10-07T01:00:00Z'});
 await page.route('**/changes?**',async route=>{
  if(hold){hold=false;await new Promise(resolve=>{held=resolve;});}
  const before=new URL(route.request().url()).searchParams.get('before');
  const data=mode==='pending'?{trackingSince:null,changes:[],next:null}:
   mode==='baseline'?{trackingSince:'2026-10-07T00:00:00Z',changes:[],next:null}:
   {trackingSince:'2026-10-07T00:00:00Z',changes:before?[entry(1,'added','Earlier test track')]:[entry(3,'added','New test track'),entry(2,'removed','Removed test track')],next:before?null:'2'};
  await route.fulfill({status:mode==='error'?503:200,json:data}).catch(()=>{});
 });
 await page.locator('#language [value=en]').dispatchEvent('click');
 await page.locator('#changes-panel summary').click();
 await page.waitForFunction(()=>document.getElementById('changes-status').textContent.startsWith('No changes'));
 assert((await page.locator('#changes-since').textContent()).includes('Tracking since'),'Missing baseline date');
 mode='pending';await page.locator('#changes-refresh').click();
 await page.waitForFunction(()=>document.getElementById('changes-status').textContent.startsWith('Waiting'));
 mode='records';await page.locator('#changes-refresh').click();
 await page.waitForFunction(()=>document.querySelectorAll('#changes-list li').length===2);
 await page.locator('#changes-more').click();
 await page.waitForFunction(()=>document.querySelectorAll('#changes-list li').length===3);
 assert(await page.locator('#changes-more').isHidden(),'Final page cursor not cleared');
 await page.locator('#language [value=de]').dispatchEvent('click');
 assert((await page.locator('#changes-list').textContent()).includes('Hinzugefügt'),'Added not translated');
 assert((await page.locator('#changes-list').textContent()).includes('Entfernt'),'Removed not translated');
 for(const width of [320,390,760,1440]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`History overflow ${width}`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#changes-panel').scrollIntoViewIfNeeded();
 await page.screenshot({path:'changes-fixture-mobile-de.png'});
 await page.locator('#language [value=en]').dispatchEvent('click');
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#changes-panel').scrollIntoViewIfNeeded();
 await page.screenshot({path:'changes-fixture-desktop.png'});
 mode='error';await page.locator('#changes-refresh').click();
 await page.waitForFunction(()=>document.getElementById('changes-status').textContent.includes('unavailable'));
 assert(await page.locator('#changes-list li').count()===0,'Stale history shown after refresh failure');
 mode='baseline';await page.locator('#changes-refresh').click();
 await page.waitForFunction(()=>document.getElementById('changes-status').textContent.startsWith('No changes'));
 hold=true;await page.locator('#changes-refresh').click();
 for(let i=0;!held && i<50;i++)await page.waitForTimeout(20);
 assert(held,'Held request did not start');
 await page.locator('input[name="mood"][value="05"]').check();
 await page.waitForFunction(()=>document.getElementById('changes-status').textContent.startsWith('No changes'));
 held();await page.waitForTimeout(100);
 assert((await page.locator('#changes-since').textContent()).startsWith('Essentials'),'Old station overwrote history');
 assert(await page.locator('#audio').getAttribute('src')===null,'History started audio');
 assert(errors.length===0,errors.join('; '));
 return {checks:'baseline, unknown baseline, additions/removals, pagination, EN/DE, error recovery, station race, paused audio',widths:[320,390,760,1440],pageErrors:errors};
}
