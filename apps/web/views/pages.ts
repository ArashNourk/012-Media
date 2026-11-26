import type { IssueContent } from '../../../packages/contracts';
import { esc } from '../../../packages/publishing/render';
import { formatLocalDate } from '../../../packages/publishing/schedule';
import { applicationFields, methodRow } from './home';
import { article, layout, type SiteConfig } from './layout';

// ------------------------------------------------------------ /method

/**
 * Sources cited for principles only. Each URL must be checked before launch
 * (`npm run 012 -- site:check-links`). Items the PRD lists conditionally — the
 * OECD 2026 horizon-scanning guide (unconfirmed) and Brier (1950, relevant only
 * once probabilistic scoring exists) — are deliberately not cited.
 */
export const METHOD_REFERENCES = [
  {
    cite: 'OECD, <em>Strategic Foresight</em> (programme).',
    url: 'https://www.oecd.org/en/about/programmes/strategic-foresight.html',
    principle: 'Structured exploration of alternative futures to inform present decisions.',
  },
  {
    cite: 'UK Government Office for Science, <em>The Futures Toolkit</em>.',
    url: 'https://www.gov.uk/government/publications/futures-toolkit-for-policy-makers-and-analysts/the-futures-toolkit-html',
    principle: 'Horizon scanning: systematic search for early signs of change.',
  },
  {
    cite: 'Richards J. Heuer Jr., <em>Psychology of Intelligence Analysis</em>, CIA Center for the Study of Intelligence.',
    url: 'https://www.cia.gov/resources/csi/books-monographs/psychology-of-intelligence-analysis-2/',
    principle: 'Structured analysis: weighing competing hypotheses and guarding against cognitive bias.',
  },
  {
    cite: 'Cochrane Handbook for Systematic Reviews of Interventions, <em>Chapter 21: Living systematic reviews</em>.',
    url: 'https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-21',
    principle: 'Living evidence: conclusions that are kept current as new evidence appears.',
  },
];

export function methodPage(cfg: SiteConfig): string {
  const body = article({
    kicker: 'METHOD',
    title: 'The 012 Intelligence Method.',
    lead: 'An evidence-first process for interpreting change, forming positions, and revisiting judgments as new information emerges.',
    body: `
${methodRow('method method-inline')}

<section class="stage">
  <h2><span class="k">00</span> / Signal</h2>
  <p>We look for developments that change what decision-makers should expect — not for volume. Each candidate development is traced to the document that reports it, preferably the original announcement, filing, paper or rule, and broken into individual factual claims.</p>
  <p>Every claim is checked against the text of its source. A link that merely exists is not evidence; the source has to say what we say it says. We distinguish what was <em>announced</em>, <em>approved</em>, <em>purchased</em>, <em>shipped</em>, <em>installed</em> and <em>operating</em>, and we label forecasts, estimates and figures a company reports about itself. Several rewrites of one report count as one source. A claim we cannot support is either qualified or left out.</p>
  <p>Some editions include a <em>weak signal</em>: a low-visibility development we think may precede larger change. The label describes why we are watching it, not a prediction that it will matter.</p>
</section>

<section class="stage">
  <h2><span class="k">01</span> / Consequence</h2>
  <p>For the few developments that matter, we set out how change is likely to propagate: the mechanism, who is affected and why, what would have happened otherwise, and the constraints on timing — technology, regulation, capital, compute, power, adoption.</p>
  <p>Every implication states the assumption it depends on, a realistic competing explanation, and what we would expect to observe if it were wrong. A separate critical review challenges each consequence before it is published. If competing explanations cannot be separated, we say so.</p>
</section>

<section class="stage">
  <h2><span class="k">02</span> / Position</h2>
  <p>Each edition carries one position: a judgement about what deserves action or attention — <em>pursue</em>, <em>monitor</em>, <em>dismiss</em>, or an explicit decision that no action is warranted. A position is not always a business idea; it can be a risk, an operational implication or a reason to wait.</p>
  <p>Every position names who it is for, the decision it informs, the evidence for it, the strongest argument against it, the biggest obstacle, and a small first test that could show it to be wrong. We do not describe demand or market space as validated without customer evidence.</p>
</section>

<section class="stage">
  <h2>Living intelligence</h2>
  <p>Positions are kept, not forgotten. Each receives a permanent identifier — for example <span class="mono">POS-000042</span> — with the date it was first published and its original wording, which is never edited.</p>
  <p>When new evidence materially changes a position — its thesis, recommended action, key conditions, confidence or timing — we publish a short, dated update that names the new evidence and the change: for example <em>emerging</em>, <em>strengthening</em>, <em>weakening</em>, <em>validated</em> or <em>invalidated</em>. A position is called validated or invalidated only against conditions we stated in advance, never because of generally good or bad news. Earlier versions remain available. There is no composite score.</p>
</section>

<section class="stage">
  <h2>Safeguards before release</h2>
  <ul>
    <li>Every factual statement links to the accessible source that supports it. Missing support blocks release.</li>
    <li>Automated checks confirm that links resolve to the intended articles, that dates and figures match their sources, and that every update is attributable to new evidence.</li>
    <li>A named editor reviews the evidence and approves each edition before it is sent. Approval is an editorial decision about release, not a guarantee of truth.</li>
    <li>Limitations — a narrow source base, figures reported by the companies concerned, a quiet news day — are stated in the edition.</li>
    <li>On a quiet day we publish less, or not at all. We do not fill space.</li>
  </ul>
</section>

<section class="stage">
  <h2>Uncertainty and corrections</h2>
  <p>Our language separates what was observed from what we infer. Where we state confidence, it is an editorial judgement explained in words, not a probability.</p>
  <p>Corrections are dated and explained in the edition record. Material corrections are disclosed to the readers who received the edition.</p>
</section>

<section class="stage">
  <h2>Lineage and limitations</h2>
  <p>012 adapts and operationalises principles associated with horizon scanning, strategic foresight, structured analytical reasoning, falsifiable hypotheses and living evidence surveillance. It is not itself a published, experimentally validated scientific instrument. The method is research-informed and is being evaluated as editions accumulate; it has not been independently validated.</p>
  <p>AI systems assist our research — finding and extracting evidence, drafting analysis and challenging it — under fixed rules and human editorial control.</p>
  <p>The works below informed these principles. They are cited as background, not as endorsements of 012.</p>
  <ol class="refs">
    ${METHOD_REFERENCES.map((r) => `<li>${r.cite} <span class="ref-note">${esc(r.principle)}</span><br><a href="${esc(r.url)}" rel="noopener">${esc(r.url.replace(/^https:\/\//, ''))}</a></li>`).join('\n    ')}
  </ol>
</section>`,
  });
  return layout({ cfg, path: '/method', title: 'The 012 Intelligence Method — 012 MEDIA', description: 'An evidence-first process for interpreting change, forming positions, and revisiting judgments as new information emerges.', body });
}

// ------------------------------------------------------------ /brief

export interface SpecimenLink {
  content: IssueContent;
  htmlUrl: string;
  pdfUrl: string;
}

export function briefPage(cfg: SiteConfig, specimen: SpecimenLink | null): string {
  const structure = `
<section class="stage">
  <h2>Each weekday edition</h2>
  <dl class="anatomy">
    <div><dt><span class="k">00</span> / Signal</dt><dd>Three to five verified developments, each with its source, event date and any qualifications. Fewer on quiet days.</dd></div>
    <div><dt><span class="k">01</span> / Consequence</dt><dd>Two or three implications: the mechanism of change, who is affected, competing explanations and what would show them wrong.</dd></div>
    <div><dt><span class="k">02</span> / Position</dt><dd>One judgement — pursue, monitor, dismiss or no action — with its strongest counterargument, biggest obstacle and a first falsifiable test.</dd></div>
    <div><dt>Continuity</dt><dd>A short, dated update when new evidence changes an earlier position.</dd></div>
    <div><dt>Sources</dt><dd>Links to the original articles and documents, and any corrections.</dd></div>
  </dl>
  <p>Delivered Monday to Friday around 9:00 AM Toronto time as a short email, with a link to the full brief and a downloadable PDF. Reading time is about four to six minutes.</p>
</section>`;
  const sample = specimen
    ? `<section class="stage specimen">
  <h2>Specimen — ${esc(formatLocalDate(specimen.content.localIssueDate))}</h2>
  <p class="spec-headline">${esc(specimen.content.headline)}</p>
  <p>${esc(specimen.content.lead)}</p>
  <ul class="spec-list">
    ${specimen.content.signals.map((s) => `<li><span class="k">00</span> ${esc(s.headline)}</li>`).join('')}
    ${specimen.content.consequences.map((s) => `<li><span class="k">01</span> ${esc(s.statement)}</li>`).join('')}
    ${specimen.content.position ? `<li><span class="k">02</span> ${esc(specimen.content.position.decision)} — ${esc(specimen.content.position.thesis)}</li>` : ''}
  </ul>
  <p class="actions"><a class="btn-primary" href="${esc(specimen.htmlUrl)}">Read the specimen</a> <a class="btn-text" href="${esc(specimen.pdfUrl)}">Download the PDF</a></p>
</section>`
    : `<section class="stage specimen">
  <h2>Specimen</h2>
  <p>A complete, source-checked edition will be published here as the specimen once it has passed editorial release. We do not show illustrative or invented news in its place.</p>
</section>`;
  const body = article({
    kicker: '01 / AI ECONOMY — DAILY BRIEF',
    title: 'The brief.',
    lead: 'What changed, why it matters, and the one position that deserves attention — with earlier judgements revisited as evidence arrives.',
    body: structure + sample + `<p class="back"><a href="/#hero-title">Request access</a></p>`,
  });
  return layout({ cfg, path: '/brief', title: 'The brief — 01 / AI Economy — 012 MEDIA', description: 'The weekday 01 / AI Economy brief: 00 / Signal, 01 / Consequence, 02 / Position, and continuity.', body });
}

// ------------------------------------------------------------ /about

export function aboutPage(cfg: SiteConfig): string {
  const body = article({
    kicker: 'ABOUT',
    title: '012 MEDIA.',
    lead: 'A publisher of living intelligence. Pronounced “zero one two”.',
    body: `
<section class="stage">
  <p>012 MEDIA publishes concise intelligence for people whose decisions depend on how technology, markets and policy are changing: founders, investors, product and strategy leaders, researchers and operators.</p>
  <p>Each publication applies one method — <a href="/method">00 / Signal, 01 / Consequence, 02 / Position</a> — to a distinct field. The first, <strong>01 / AI Economy</strong>, is a weekday brief on models, agents, enterprise adoption, computing infrastructure, industry and capital. Energy systems and geoeconomics are planned as later publications.</p>
  <p>The brief keeps its earlier judgements on the record and revisits them in dated updates when evidence changes, so that past positions remain accountable.</p>
  <p>Readership is by invitation: requests are reviewed for professional relevance. The core AI Economy Brief is complimentary for life for the first 500 approved founding readers.</p>
</section>
<section class="stage">
  <h2>Contact</h2>
  ${cfg.contactEmail ? `<p><a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a></p>` : '<p>Contact details will be listed here before launch.</p>'}
  <p class="muted">${esc(cfg.publisherIdentity)}</p>
</section>`,
  });
  return layout({ cfg, path: '/about', title: 'About — 012 MEDIA', description: '012 MEDIA publishes living intelligence. Its first publication is 01 / AI Economy, a weekday brief.', body });
}

// ------------------------------------------------------------ /privacy

export function privacyPage(cfg: SiteConfig): string {
  const contact = cfg.contactEmail ? `<a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a>` : 'the contact address on our About page';
  const body = article({
    kicker: 'PRIVACY',
    title: 'Privacy notice.',
    lead: 'What we collect, why, and how to have it removed.',
    body: `
<section class="stage">
  <h2>What we collect</h2>
  <ul>
    <li><strong>Your request:</strong> email address, full name, professional role or title, industry and, if you provide it, a LinkedIn profile URL.</li>
    <li><strong>Your consent:</strong> the exact consent wording you accepted, its version and the time you accepted it.</li>
    <li><strong>Email confirmation:</strong> when you confirmed your address. We store only a one-way hash of the confirmation link.</li>
    <li><strong>Review:</strong> the decision on your request, when it was made and by whom.</li>
    <li><strong>Delivery:</strong> which editions were sent to you and whether delivery succeeded, plus unsubscribe and bounce events.</li>
  </ul>
  <p>Typing an email address into the form on our home page does not store it. Nothing is saved until you submit the full request with consent.</p>
</section>
<section class="stage">
  <h2>Why</h2>
  <p>To review your request, confirm that the address is yours and, if your request is approved, send you the brief and related service emails. We do not sell or share your information for marketing, and we do not add you to any other list.</p>
</section>
<section class="stage">
  <h2>What we do not do</h2>
  <p>This website sets no cookies and uses no third-party analytics or advertising scripts. Fonts are served from our own domain.</p>
</section>
<section class="stage">
  <h2>Service providers</h2>
  <p>We use a hosting provider to run this site and store its data, and an email delivery provider to send confirmation messages and editions. They process data only to provide those services to us.</p>
</section>
<section class="stage">
  <h2>Retention</h2>
  <ul>
    <li>Requests whose email address is never confirmed are deleted after 30 days.</li>
    <li>Declined requests are deleted 12 months after the decision.</li>
    <li>When you unsubscribe, we stop sending immediately and keep only what is needed to make sure we do not email you again.</li>
  </ul>
</section>
<section class="stage">
  <h2>Your choices</h2>
  <p>Every email has an unsubscribe link that takes effect immediately. To see the information we hold about you, or to have it deleted, write to ${contact}.</p>
</section>
<section class="stage">
  <h2>Publisher</h2>
  <p>${esc(cfg.publisherIdentity)}</p>
</section>`,
  });
  return layout({ cfg, path: '/privacy', title: 'Privacy notice — 012 MEDIA', description: 'How 012 MEDIA handles the information in access requests and reader delivery.', body });
}

// ------------------------------------------------------------ /request (no-JavaScript application page and its outcome)

export function requestPage(cfg: SiteConfig, o: { formToken: string; email?: string; values?: Record<string, string>; errors?: Record<string, string> }): string {
  const body = article({
    kicker: '01 / AI ECONOMY — DAILY BRIEF',
    title: 'Request access.',
    lead: 'Requests are reviewed individually for professional relevance.',
    body: `<form class="apply-form page-form" method="post" action="/request" novalidate>
  ${applicationFields(o)}
  <div class="sheet-actions"><button class="btn-primary" type="submit">Submit request</button><a class="btn-text" href="/">Close</a></div>
</form>`,
  });
  return layout({ cfg, path: '/request', title: 'Request access — 012 MEDIA', description: 'Request access to the 01 / AI Economy brief.', body, noindex: true });
}

export function messagePage(cfg: SiteConfig, o: { path: string; kicker: string; title: string; message: string; form?: string; noindex?: boolean }): string {
  const body = article({ kicker: o.kicker, title: o.title, body: `<section class="stage"><p class="status-message" role="status">${esc(o.message)}</p>${o.form ?? ''}<p class="back"><a href="/">Return to 012.media</a></p></section>` });
  return layout({ cfg, path: o.path, title: `${o.title.replace(/\.$/, '')} — 012 MEDIA`, description: o.message, body, noindex: o.noindex ?? true });
}

export function notFoundPage(cfg: SiteConfig): string {
  return messagePage(cfg, { path: '/404', kicker: '404', title: 'Not found.', message: 'This page does not exist.' });
}
