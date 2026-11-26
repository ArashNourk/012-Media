/**
 * Responsive fidelity check (PRD §5, §14): screenshots at 320, 375, 390, 430,
 * 768, 1024 and 1440 px plus layout assertions. Usage:
 *   BASE_URL=http://localhost:4012 npm run screenshots [-- out-dir]
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4012';
const OUT = process.argv[2] ?? 'docs/screenshots';
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440];

interface Finding {
  width: number;
  page: string;
  problem: string;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const findings: Finding[] = [];
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1 });
    for (const [name, path] of [
      ['home', '/'],
      ['method', '/method'],
      ['brief', '/brief'],
    ] as const) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      // Passed as a string: the TS loader would otherwise inject helpers that do not exist in the page.
      const m = (await page.evaluate(`(function(){
        const doc = document.documentElement;
        const items = [...document.querySelectorAll('.method .m-item')].map((e) => e.getBoundingClientRect().top);
        const form = document.querySelector('.access');
        const input = document.querySelector('.access-input');
        const btn = document.querySelector('.access-button');
        const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
        const fr = form?.getBoundingClientRect();
        const clipped = [...document.querySelectorAll('h1, h2, p, a, button, input, label')].filter((e) => {
          if (e.closest('.skip, .hp, .sr-only, [hidden]')) return false;
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
        }).length;
        return {
          overflow: doc.scrollWidth > window.innerWidth,
          methodRows: new Set(items.map((t) => Math.round(t))).size,
          methodFont: items.length ? parseFloat(getComputedStyle(document.querySelector('.method')).fontSize) : 0,
          formUnified: fr && input && btn ? inside(input.getBoundingClientRect(), fr) && inside(btn.getBoundingClientRect(), fr) : null,
          inputFont: input ? parseFloat(getComputedStyle(input).fontSize) : null,
          buttonHeight: btn ? btn.getBoundingClientRect().height : null,
          inputWidth: input ? input.getBoundingClientRect().width : null,
          clipped,
        };
      })()`)) as { overflow: boolean; methodRows: number; methodFont: number; formUnified: boolean | null; inputFont: number | null; buttonHeight: number | null; inputWidth: number | null; clipped: number };
      if (m.overflow) findings.push({ width, page: name, problem: 'horizontal overflow' });
      if (m.clipped) findings.push({ width, page: name, problem: `${m.clipped} element(s) outside the viewport` });
      if (name === 'home') {
        if (m.formUnified === false) findings.push({ width, page: name, problem: 'email input and button are not inside one frame' });
        if ((m.inputFont ?? 16) < 16) findings.push({ width, page: name, problem: `input font ${m.inputFont}px < 16px (iOS zoom)` });
        if ((m.buttonHeight ?? 44) < 44) findings.push({ width, page: name, problem: `button ${m.buttonHeight}px < 44px tap target` });
        if ((m.inputWidth ?? 200) < 150) findings.push({ width, page: name, problem: `input only ${m.inputWidth}px wide` });
        if (width >= 390 && m.methodRows > 1) findings.push({ width, page: name, problem: `00/01/02 wraps onto ${m.methodRows} rows` });
        if (m.methodFont < 11) findings.push({ width, page: name, problem: `method row font ${m.methodFont}px too small` });
      }
      await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });
    }
    if (width === 390 || width === 1440) {
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      await page.fill('.access-input', 'reader@example.com');
      await page.keyboard.press('Enter');
      await page.waitForSelector('dialog[open]');
      await page.screenshot({ path: `${OUT}/apply-${width}.png` });
      if (width === 390) {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' });
        await page.click('.nav-mobile summary');
        await page.screenshot({ path: `${OUT}/menu-${width}.png` });
      }
    }
    await page.close();
  }
  await browser.close();
  console.log(findings.length ? findings.map((f) => `✗ ${f.width}px ${f.page}: ${f.problem}`).join('\n') : `✓ ${WIDTHS.join(', ')} px: no overflow, unified access form, 16px inputs, ≥44px targets, 00/01/02 on one row from 390px`);
  if (findings.length) process.exitCode = 1;
}

main();
