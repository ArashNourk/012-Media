/**
 * Isolated PDF renderer (Chromium via Playwright). Produces a tagged,
 * text-selectable PDF with active hyperlinks — never an image export.
 * Runs as a Node job in this repository (not inside a Worker runtime).
 */
export async function renderPdf(html: string, meta: { title: string }): Promise<Uint8Array> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      // Header/footer bands are painted in the page colour (absolutely positioned so they never overlap content).
      headerTemplate: `<div style="position:absolute;top:0;left:0;right:0;height:0.45in;background:#0B0B0B;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>`,
      footerTemplate: `<div style="position:absolute;bottom:0;left:0;right:0;height:0.4in;background:#0B0B0B;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:7px;color:#8A8A8A;font-family:Helvetica,Arial,sans-serif;padding:0.14in 0.55in 0;box-sizing:border-box;display:flex;justify-content:space-between;"><span>${meta.title.replace(/</g, '&lt;')}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: '0.45in', bottom: '0.4in', left: '0', right: '0' },
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

/** Structural checks on the produced PDF bytes: real text (fonts), active links, page count. */
export function inspectPdf(bytes: Uint8Array): { pages: number; hasFonts: boolean; linkUris: string[]; isTagged: boolean } {
  const s = Buffer.from(bytes).toString('latin1');
  const pages = (s.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const linkUris = [...s.matchAll(/\/URI\s*\(([^)]*)\)/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1'));
  return { pages, hasFonts: /\/Font/.test(s), linkUris: [...new Set(linkUris)], isTagged: /\/StructTreeRoot/.test(s) || /\/MarkInfo/.test(s) };
}
