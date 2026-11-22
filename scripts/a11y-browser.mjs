import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const ORIGIN='http://127.0.0.1:4173';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'inherit'});
let browser;
try {
  for(let i=0;i<80;i++){try{if((await fetch(ORIGIN)).ok)break;}catch{}if(i===79)throw new Error('Preview server not ready');await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  const issues=[];
  async function audit(label){
    const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
    for(const v of report.violations)issues.push({view:label,id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))});
  }
  for(const course of ['asl','braille','morse']){
    for(const mode of ['study','test','type']){
      await page.goto(ORIGIN+'/?course='+course+'&mode='+mode);
      await page.getByRole('tab',{name:mode[0].toUpperCase()+mode.slice(1),exact:true}).waitFor();
      await audit(course+'/'+mode);
    }
    await page.goto(ORIGIN+'/?course='+course+'&mode=test&direction=encode');
    await page.getByRole('button',{name:'Start test'}).click();
    await page.getByRole('group',{name:/Question 1:/}).waitFor();
    await audit(course+'/test-active');
    await page.getByRole('button',{name:/Option 1:/}).click();
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),'Next','Focus should move to Next after answering');
    await page.getByRole('button',{name:'Next',exact:true}).click();
    assert.match(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')||''),/Question 2/);
  }
  await page.goto(ORIGIN+'/?course=asl&mode=study');
  await page.getByRole('tab',{name:'Study',exact:true}).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:'Test',exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');
  assert.equal(await page.getByRole('tab',{name:'Type',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.evaluate(()=>document.querySelector('dialog').open),true);
  await audit('settings');
  await page.getByLabel('Larger text and controls').check();
  await page.getByLabel('Enhanced contrast').check();
  await page.getByLabel('Untimed tests only').check();
  await page.getByLabel('Show accuracy only').check();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Settings');
  await page.setViewportSize({width:320,height:568});
  for(const mode of ['study','test','type']){
    await page.goto(ORIGIN+'/?course=braille&mode='+mode+'&direction=decode');
    await page.getByRole('tab',{name:mode[0].toUpperCase()+mode.slice(1),exact:true}).waitFor();
    const result=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,large:document.querySelector('.app')?.classList.contains('large-controls')}));
    assert.ok(result.large,'Preferences must survive navigation');
    assert.ok(result.width<=result.viewport+1,'Horizontal overflow: '+mode+' '+JSON.stringify(result));
    await audit('320px enhanced '+mode);
  }
  for(const course of ['asl','braille','morse']){await page.goto(ORIGIN+'/learn/'+course+'.html');await audit('guide/'+course);}
  if(issues.length){console.error(JSON.stringify(issues,null,2));throw new Error(issues.length+' accessibility violations found');}
  console.log('Accessibility browser checks passed: 9 views, active quizzes, keyboard navigation, settings focus, preferences, 320px reflow and all learning guides.');
} finally {if(browser)await browser.close();server.kill();}
