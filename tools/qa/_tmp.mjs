import { chromium, BASE, mk, st, setup, wait } from './lib.mjs';
const b = await chromium.launch();
const g = await mk(b, { viewport: { width: 390, height: 844 }, ctx:{hasTouch:true,isMobile:true} });
const p = g.page;
await p.goto(BASE); await p.waitForSelector('#start');
await setup(p, { map: 'nahuel', terrain: 'agua', rules: null });
await p.click('#how'); await wait(1500);
await p.screenshot({path:'/tmp/coach3.png'});console.log(await p.evaluate(()=>{const e=document.getElementById('coach');const c=getComputedStyle(e);return [c.background,c.opacity, document.body.className, getComputedStyle(document.getElementById('hud-bottom')).opacity]}));
await b.close();
