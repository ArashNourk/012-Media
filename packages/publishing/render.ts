import type { IssueContent } from '../contracts';
import { formatLocalDate, formatShortDate } from './schedule';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const BRAND = {
  black: '#0B0B0B',
  white: '#F7F7F5',
  gray: '#A6A6A6',
  dim: '#8A8A8A',
  magenta: '#FF36D1',
  rule: '#3B3B3B',
  font: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
};

export interface RenderMeta {
  mode: 'preview' | 'approved';
  approvedSha256?: string;
  approvedAt?: string;
  publisherIdentity: string;
  siteUrl: string;
}

const DECISION_LABEL: Record<string, string> = {
  PURSUE: 'PURSUE',
  MONITOR: 'MONITOR',
  DISMISS: 'DISMISS',
  NO_MATERIAL_POSITION: 'NO MATERIAL POSITION',
};

function sourceIndex(c: IssueContent): Map<string, number> {
  return new Map(c.sources.map((s, i) => [s.sourceId, i + 1]));
}

function cite(c: IssueContent, idx: Map<string, number>, ids: string[]): string {
  return ids
    .map((id) => {
      const n = idx.get(id);
      const s = c.sources.find((x) => x.sourceId === id);
      return n && s ? `<a class="cite" href="${esc(s.url)}" title="${esc(s.publisher)}: ${esc(s.title)}">[${n}]</a>` : '';
    })
    .join('');
}

/** The complete brief: used for the hosted HTML edition and the PDF. One structured record → every channel. */
export function renderIssueHtml(c: IssueContent, meta: RenderMeta): string {
  const idx = sourceIndex(c);
  const p = c.position;
  const preview = meta.mode === 'preview';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>012 MEDIA — ${esc(c.publicationLabel)} — ${esc(formatLocalDate(c.localIssueDate))}</title>
<meta name="author" content="012 MEDIA">
<meta name="description" content="${esc(c.headline)}">
<style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  html { background: ${BRAND.black}; }
  body { margin: 0; background: ${BRAND.black}; color: ${BRAND.white}; font-family: ${BRAND.font}; font-size: 10.5pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 7.2in; margin: 0 auto; padding: 0.6in 0.55in 0.5in; }
  a { color: ${BRAND.white}; text-decoration: underline; text-decoration-color: ${BRAND.rule}; text-underline-offset: 2px; }
  .masthead { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${BRAND.rule}; padding-bottom: 14pt; }
  .lockup { display: flex; align-items: center; gap: 12pt; }
  .lockup .num { font-size: 34pt; font-weight: 700; letter-spacing: -1pt; line-height: 1; }
  .lockup .rule { width: 1px; height: 38pt; background: ${BRAND.white}; opacity: .7; }
  .lockup .word { font-size: 7pt; letter-spacing: 2.4pt; line-height: 1.25; font-weight: 600; }
  .edition { text-align: right; font-size: 7.5pt; letter-spacing: 1.4pt; color: ${BRAND.gray}; text-transform: uppercase; line-height: 1.6; }
  .edition .pub { color: ${BRAND.magenta}; font-weight: 700; }
  .preview { margin-top: 12pt; border: 1px solid ${BRAND.magenta}; color: ${BRAND.magenta}; padding: 6pt 9pt; font-size: 7.5pt; letter-spacing: 1.2pt; text-transform: uppercase; }
  h1 { font-size: 22pt; line-height: 1.18; font-weight: 600; letter-spacing: -0.3pt; margin: 22pt 0 10pt; }
  .lead { font-size: 11.5pt; color: #DADAD7; margin: 0 0 12pt; }
  .notes { border-left: 2px solid ${BRAND.rule}; padding: 2pt 0 2pt 10pt; color: ${BRAND.gray}; font-size: 8.5pt; margin: 10pt 0 4pt; }
  .notes p { margin: 2pt 0; }
  h2 { font-size: 8pt; letter-spacing: 2.6pt; font-weight: 700; margin: 24pt 0 8pt; padding-top: 10pt; border-top: 1px solid ${BRAND.rule}; text-transform: uppercase; break-after: avoid; }
  h2 .k { color: ${BRAND.magenta}; }
  h3 { font-size: 12pt; line-height: 1.3; font-weight: 600; margin: 12pt 0 3pt; break-after: avoid; }
  .item { break-inside: avoid; margin-bottom: 10pt; }
  .meta { font-size: 7.8pt; letter-spacing: .6pt; color: ${BRAND.gray}; text-transform: uppercase; margin-bottom: 4pt; }
  .meta .weak { color: ${BRAND.magenta}; }
  p { margin: 4pt 0; }
  .label { color: ${BRAND.gray}; font-size: 8pt; letter-spacing: 1.2pt; text-transform: uppercase; display: block; margin-top: 6pt; }
  ul { margin: 2pt 0 4pt; padding-left: 14pt; }
  li { margin: 1.5pt 0; }
  .qual { color: ${BRAND.gray}; font-size: 8.5pt; }
  .cite { font-size: 7.5pt; color: ${BRAND.magenta}; text-decoration: none; margin-left: 1.5pt; vertical-align: super; }
  .verdict { display: inline-block; border: 1px solid ${BRAND.magenta}; color: ${BRAND.magenta}; font-size: 8pt; letter-spacing: 2pt; padding: 2pt 7pt; font-weight: 700; margin-right: 8pt; }
  .pid { font-size: 8pt; letter-spacing: 1.4pt; color: ${BRAND.gray}; }
  .grid { display: grid; grid-template-columns: 1.6in 1fr; gap: 3pt 12pt; margin-top: 8pt; }
  .grid dt { color: ${BRAND.gray}; font-size: 8pt; letter-spacing: 1pt; text-transform: uppercase; padding-top: 1.5pt; }
  .grid dd { margin: 0; }
  .continuity { border: 1px solid ${BRAND.rule}; padding: 9pt 11pt; break-inside: avoid; margin-bottom: 8pt; }
  .continuity .head { font-size: 8pt; letter-spacing: 1.6pt; font-weight: 700; }
  .continuity .head .st { color: ${BRAND.magenta}; }
  ol.sources { padding-left: 16pt; font-size: 8.5pt; }
  ol.sources li { margin: 3pt 0; break-inside: avoid; }
  ol.sources .u { color: ${BRAND.gray}; word-break: break-all; }
  .foot { margin-top: 22pt; padding-top: 10pt; border-top: 1px solid ${BRAND.rule}; font-size: 7.5pt; color: ${BRAND.dim}; line-height: 1.5; }
  @media screen and (max-width: 600px) { .page { padding: 28px 16px; } h1 { font-size: 24px; } .grid { grid-template-columns: 1fr; } .grid dt { padding-top: 6px; } }
</style>
</head>
<body>
<main class="page">
<header class="masthead">
  <div class="lockup" aria-label="012 MEDIA"><span class="num">012</span><span class="rule" aria-hidden="true"></span><span class="word">ZERO<br>ONE<br>TWO<br>MEDIA</span></div>
  <div class="edition"><span class="pub">${esc(c.publicationLabel)}</span> · DAILY BRIEF<br>${esc(formatLocalDate(c.localIssueDate))}<br>Edition ${c.editionNumber} · ${esc(c.issueId)} · v${c.version}</div>
</header>
${preview ? `<div class="preview" role="note">Editorial preview — not approved for distribution</div>` : ''}
<h1>${esc(c.headline)}</h1>
<p class="lead">${esc(c.lead)}</p>
${c.editorialNotes.length ? `<div class="notes" role="note">${c.editorialNotes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : ''}

<section aria-labelledby="s00">
<h2 id="s00"><span class="k">00</span> / Signal</h2>
${c.signals
  .map(
    (s, i) => `<article class="item">
  <h3>${i + 1}. ${esc(s.headline)}</h3>
  <div class="meta">Event ${esc(formatShortDate(s.eventAt))} · ${s.sourceIds
    .map((id) => {
      const src = c.sources.find((x) => x.sourceId === id);
      return src ? `${esc(src.publisher)}, published ${esc(formatShortDate(src.publishedAt))}` : '';
    })
    .filter(Boolean)
    .join(' · ')}${s.weakSignal ? ' · <span class="weak">Weak signal</span>' : ''}</div>
  <p>${esc(s.summary)}${cite(c, idx, s.sourceIds)}</p>
  <span class="label">Why it matters</span>
  <p>${esc(s.relevance)}</p>
  ${s.qualifications.length ? `<ul class="qual">${s.qualifications.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
</article>`,
  )
  .join('\n')}
</section>

<section aria-labelledby="s01">
<h2 id="s01"><span class="k">01</span> / Consequence</h2>
${
  c.consequences.length
    ? c.consequences
        .map(
          (k, i) => `<article class="item">
  <h3>${i + 1}. ${esc(k.statement)}</h3>
  <div class="meta">Horizon: ${esc(k.horizon)} · Affects: ${esc(k.stakeholders.join(', '))}</div>
  <span class="label">Mechanism</span><p>${esc(k.mechanism)}</p>
  <span class="label">Competing explanation</span><ul>${k.alternatives.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
  <span class="label">This would be wrong if</span><ul>${k.disconfirmingIndicators.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
  <p class="qual">${esc(k.uncertainty)}</p>
</article>`,
        )
        .join('\n')
    : '<p>No consequence cleared the evidence bar for this edition.</p>'
}
</section>

<section aria-labelledby="s02">
<h2 id="s02"><span class="k">02</span> / Position</h2>
${
  p
    ? `<article class="item">
  <div><span class="verdict">${esc(DECISION_LABEL[p.decision] ?? p.decision)}</span><span class="pid">${esc(p.positionId)}${p.isNew ? ' · NEW' : ''}</span></div>
  <h3>${esc(p.thesis)}</h3>
  <dl class="grid">
    <dt>Who</dt><dd>${esc(p.targetActor)}</dd>
    <dt>Decision</dt><dd>${esc(p.decisionToConsider)}</dd>
    <dt>Why now</dt><dd>${esc(p.whyNow)}</dd>
    <dt>Evidence</dt><dd>${esc(p.evidence)}</dd>
    <dt>Strongest counterargument</dt><dd>${esc(p.counterargument)}</dd>
    ${p.competitors.length ? `<dt>Named alternatives</dt><dd>${esc(p.competitors.join(', '))}</dd>` : ''}
    <dt>Biggest blocker</dt><dd>${esc(p.blocker)}</dd>
    <dt>First test</dt><dd>${esc(p.firstTest)}</dd>
    <dt>Would change if</dt><dd><ul>${p.changeConditions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></dd>
    <dt>Confidence</dt><dd>${esc(p.evidenceConfidence)} — editorial judgement, not a probability${p.reviewDate ? `; next review ${esc(formatShortDate(p.reviewDate))}` : ''}</dd>
  </dl>
</article>`
    : `<p>${esc(c.noPositionStatement ?? 'No position cleared the bar for this edition. Monitor; no action.')}</p>`
}
</section>

${
  c.continuity.length
    ? `<section aria-labelledby="sc">
<h2 id="sc">Continuity</h2>
${c.continuity
  .map(
    (k) => `<div class="continuity">
  <div class="head">CONTINUITY / ${esc(k.positionId)} — <span class="st">${esc(k.newStatus)}</span></div>
  <p class="qual">First identified ${esc(formatShortDate(k.firstIdentifiedOn))} · previously ${esc(k.previousStatus)}</p>
  <p>${esc(k.line)}${cite(c, idx, k.newSourceIds)}</p>
  <p class="qual">${esc(k.originalReference)}</p>
</div>`,
  )
  .join('\n')}
</section>`
    : ''
}

<section aria-labelledby="ss">
<h2 id="ss">Sources and corrections</h2>
<ol class="sources">
${c.sources
  .map(
    (s) => `<li id="src-${esc(s.sourceId)}">${esc(s.publisher)}, “${esc(s.title)}”, published ${esc(formatShortDate(s.publishedAt))}, retrieved ${esc(formatShortDate(s.retrievedAt))}.<br><a class="u" href="${esc(s.url)}">${esc(s.url)}</a></li>`,
  )
  .join('\n')}
</ol>
<p class="qual">Corrections: ${c.corrections.length ? c.corrections.map((k) => `${esc(formatShortDate(k.date))} — ${esc(k.text)}`).join('; ') : 'none'}. Revision state: version ${c.version}${meta.approvedSha256 ? `, editor-approved record ${esc(meta.approvedSha256.slice(0, 16))}` : ', not yet approved'}.</p>
</section>

<footer class="foot">
  <p>${esc(c.methodNote)}</p>
  <p>${esc(meta.publisherIdentity)} · <a href="${esc(meta.siteUrl)}">${esc(meta.siteUrl.replace(/^https?:\/\//, ''))}</a> · ${esc(c.engineVersion)} · run ${esc(c.runId)}</p>
</footer>
</main>
</body>
</html>`;
}

export interface EmailRender {
  subject: string;
  html: string;
  text: string;
}

/** Short, accessible HTML summary + plain-text alternative. Useful without the PDF. */
export function renderEmail(c: IssueContent, o: { briefUrl: string; pdfUrl: string; unsubscribeUrl: string; publisherIdentity: string; siteUrl: string }): EmailRender {
  const p = c.position;
  const k = c.consequences[0];
  const cont = c.continuity[0];
  const date = formatLocalDate(c.localIssueDate);
  const subject = `${c.publicationLabel} — ${c.headline}`;
  const td = `font-family:${BRAND.font};color:${BRAND.white};`;
  const label = (t: string) => `<p style="margin:22px 0 6px;font-size:11px;letter-spacing:2.4px;font-weight:700;color:${BRAND.white};font-family:${BRAND.font};"><span style="color:${BRAND.magenta};">${t.slice(0, 2)}</span>${esc(t.slice(2))}</p>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.black};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.black};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="${td}padding:0 4px 14px;border-bottom:1px solid ${BRAND.rule};">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="${td}font-size:34px;font-weight:700;letter-spacing:-1px;line-height:1;padding-right:12px;">012</td>
    <td style="border-left:1px solid ${BRAND.white};padding-left:12px;${td}font-size:9px;letter-spacing:2.6px;line-height:1.3;font-weight:600;">ZERO<br>ONE<br>TWO<br>MEDIA</td>
  </tr></table>
  <p style="margin:12px 0 0;font-family:${BRAND.font};font-size:11px;letter-spacing:1.6px;color:${BRAND.gray};"><span style="color:${BRAND.magenta};font-weight:700;">${esc(c.publicationLabel)}</span> · ${esc(date.toUpperCase())}</p>
</td></tr>
<tr><td style="${td}padding:20px 4px 0;">
  <h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;font-weight:600;font-family:${BRAND.font};color:${BRAND.white};">${esc(c.headline)}</h1>
  <p style="margin:0;font-size:16px;line-height:1.55;color:#DADAD7;font-family:${BRAND.font};">${esc(c.lead)}</p>
  ${label('00 / SIGNAL')}
  <ul style="margin:0;padding-left:18px;font-size:15px;line-height:1.5;font-family:${BRAND.font};color:${BRAND.white};">${c.signals.map((s) => `<li style="margin:0 0 6px;">${esc(s.headline)}</li>`).join('')}</ul>
  ${k ? `${label('01 / CONSEQUENCE')}<p style="margin:0;font-size:15px;line-height:1.55;font-family:${BRAND.font};color:${BRAND.white};">${esc(k.statement)}</p>` : ''}
  ${label('02 / POSITION')}
  ${
    p
      ? `<p style="margin:0;font-size:15px;line-height:1.55;font-family:${BRAND.font};color:${BRAND.white};"><strong style="color:${BRAND.magenta};letter-spacing:1.5px;font-size:12px;">${esc(DECISION_LABEL[p.decision] ?? p.decision)}</strong> <span style="color:${BRAND.gray};font-size:12px;">${esc(p.positionId)}</span><br>${esc(p.thesis)}</p>
  <p style="margin:6px 0 0;font-size:14px;line-height:1.5;color:${BRAND.gray};font-family:${BRAND.font};">First test: ${esc(p.firstTest)}</p>`
      : `<p style="margin:0;font-size:15px;line-height:1.55;font-family:${BRAND.font};color:${BRAND.white};">${esc(c.noPositionStatement ?? 'Monitor; no action.')}</p>`
  }
  ${
    cont
      ? `<p style="margin:22px 0 0;padding:10px 12px;border:1px solid ${BRAND.rule};font-size:14px;line-height:1.5;font-family:${BRAND.font};color:${BRAND.white};"><span style="font-size:11px;letter-spacing:1.6px;font-weight:700;">CONTINUITY / ${esc(cont.positionId)} — <span style="color:${BRAND.magenta};">${esc(cont.newStatus)}</span></span><br>First identified ${esc(formatShortDate(cont.firstIdentifiedOn))}. ${esc(cont.line)}</p>`
      : ''
  }
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;"><tr><td style="background:${BRAND.white};border-radius:2px;">
    <a href="${esc(o.briefUrl)}" style="display:inline-block;padding:13px 22px;font-family:${BRAND.font};font-size:13px;letter-spacing:1.6px;font-weight:700;color:${BRAND.black};text-decoration:none;">READ THE FULL BRIEF</a>
  </td></tr></table>
  <p style="margin:0;font-size:13px;font-family:${BRAND.font};color:${BRAND.gray};"><a href="${esc(o.pdfUrl)}" style="color:${BRAND.gray};">Download the PDF</a> · ${c.sources.length} cited source${c.sources.length === 1 ? '' : 's'} in the full brief</p>
</td></tr>
<tr><td style="padding:28px 4px 0;font-family:${BRAND.font};font-size:12px;line-height:1.6;color:${BRAND.dim};border-top:1px solid ${BRAND.rule};">
  <p style="margin:14px 0 6px;">You receive this because your request to read the ${esc(c.publicationLabel)} brief was approved and you consented to receive it.</p>
  <p style="margin:0 0 6px;">${esc(o.publisherIdentity)} · <a href="${esc(o.siteUrl)}" style="color:${BRAND.dim};">${esc(o.siteUrl.replace(/^https?:\/\//, ''))}</a></p>
  <p style="margin:0;"><a href="${esc(o.unsubscribeUrl)}" style="color:${BRAND.gray};">Unsubscribe</a> — takes effect immediately.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
  const text = [
    `012 MEDIA — ${c.publicationLabel} — ${date}`,
    '',
    c.headline,
    '',
    c.lead,
    '',
    '00 / SIGNAL',
    ...c.signals.map((s) => `- ${s.headline}`),
    ...(k ? ['', '01 / CONSEQUENCE', k.statement] : []),
    '',
    '02 / POSITION',
    p ? `${DECISION_LABEL[p.decision] ?? p.decision} (${p.positionId}): ${p.thesis}\nFirst test: ${p.firstTest}` : c.noPositionStatement ?? 'Monitor; no action.',
    ...(cont ? ['', `CONTINUITY / ${cont.positionId} — ${cont.newStatus}`, `First identified ${formatShortDate(cont.firstIdentifiedOn)}. ${cont.line}`] : []),
    '',
    `Read the full brief: ${o.briefUrl}`,
    `PDF: ${o.pdfUrl}`,
    '',
    `${o.publisherIdentity} · ${o.siteUrl}`,
    `Unsubscribe: ${o.unsubscribeUrl}`,
  ].join('\n');
  return { subject, html, text };
}
