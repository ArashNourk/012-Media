import { esc } from '../../../packages/publishing/render';
import { CONSENT, INDUSTRIES } from '../../../packages/access/policy';
import { COPY, layout, type SiteConfig } from './layout';

export function methodRow(cls = 'method'): string {
  return `<p class="${cls}" aria-label="00 Signal, 01 Consequence, 02 Position">${COPY.method
    .map(([n, label]) => `<span class="m-item"><span class="m-n">${n}</span><span class="m-sep"> / </span><span class="m-l">${label}</span></span>`)
    .join('')}</p>`;
}

/**
 * The application fields, shared by the modal and the no-JavaScript /request page.
 */
export function applicationFields(o: { email?: string; formToken: string; values?: Record<string, string>; errors?: Record<string, string> }): string {
  const v = o.values ?? {};
  const e = o.errors ?? {};
  const err = (k: string) => (e[k] ? `<p class="field-error" id="err-${k}">${esc(e[k])}</p>` : `<p class="field-error" id="err-${k}" hidden></p>`);
  const inv = (k: string) => (e[k] ? ' aria-invalid="true"' : '');
  return `<input type="hidden" name="formToken" value="${esc(o.formToken)}">
<input type="hidden" name="consentVersion" value="${esc(CONSENT.version)}">
<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="field">
  <label for="f-email">Email</label>
  <input id="f-email" name="email" type="email" inputmode="email" autocomplete="email" required maxlength="254" value="${esc(v.email ?? o.email ?? '')}" aria-describedby="err-email"${inv('email')}>
  ${err('email')}
</div>
<div class="field">
  <label for="f-name">Full name</label>
  <input id="f-name" name="fullName" type="text" autocomplete="name" required maxlength="120" value="${esc(v.fullName ?? '')}" aria-describedby="err-fullName"${inv('fullName')}>
  ${err('fullName')}
</div>
<div class="field">
  <label for="f-role">Professional role or title</label>
  <input id="f-role" name="roleTitle" type="text" autocomplete="organization-title" required maxlength="120" value="${esc(v.roleTitle ?? '')}" aria-describedby="err-roleTitle"${inv('roleTitle')}>
  ${err('roleTitle')}
</div>
<div class="field">
  <label for="f-industry">Industry</label>
  <div class="select"><select id="f-industry" name="industry" required aria-describedby="err-industry"${inv('industry')}>
    <option value="">Select</option>
    ${INDUSTRIES.map((i) => `<option${v.industry === i ? ' selected' : ''}>${esc(i)}</option>`).join('')}
  </select></div>
  ${err('industry')}
</div>
<div class="field">
  <label for="f-linkedin">LinkedIn profile URL <span class="opt">optional</span></label>
  <input id="f-linkedin" name="linkedinUrl" type="url" inputmode="url" autocomplete="url" maxlength="200" placeholder="https://www.linkedin.com/in/…" value="${esc(v.linkedinUrl ?? '')}" aria-describedby="err-linkedinUrl"${inv('linkedinUrl')}>
  ${err('linkedinUrl')}
</div>
<div class="field check">
  <input id="f-consent" name="consent" type="checkbox" value="true" required aria-describedby="err-consent"${inv('consent')}>
  <label for="f-consent">${esc(CONSENT.text)} <a href="/privacy" target="_blank" rel="noopener">Privacy notice</a>.</label>
  ${err('consent')}
</div>
${e.form ? `<p class="form-error" role="alert">${esc(e.form)}</p>` : '<p class="form-error" role="alert" hidden></p>'}`;
}

export function homePage(cfg: SiteConfig, formToken: string): string {
  const body = `
<section class="hero" aria-labelledby="hero-title">
  <div class="arc" aria-hidden="true"></div>
  <div class="hero-inner wrap">
    <h1 id="hero-title" class="hero-title">${COPY.headline}</h1>
    <p class="hero-sub">${COPY.subline}</p>
    ${methodRow()}
    <form class="access" action="/request" method="get" novalidate data-access-form>
      <label class="sr-only" for="hero-email">Email address</label>
      <input id="hero-email" class="access-input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="Email address" required maxlength="254" aria-describedby="hero-caption hero-error">
      <button class="access-button" type="submit">REQUEST ACCESS</button>
    </form>
    <p class="hero-error" id="hero-error" role="alert" hidden></p>
    <p class="caption" id="hero-caption">${COPY.caption}</p>
  </div>
</section>

<section class="publications wrap" aria-labelledby="pub-title">
  <header class="pub-head">
    <h2 id="pub-title" class="section-label">${COPY.publicationsHeading}</h2>
    <p class="pub-deck">${COPY.publicationsDeck}</p>
  </header>
  <ul class="pub-list">
    ${COPY.publications
      .map(
        (p) => `<li class="pub${p.active ? ' is-active' : ''}">
      <p class="pub-name"><span class="pub-n">${p.n}</span> / ${p.name}</p>
      <p class="pub-status">${p.status}</p>
      <p class="pub-desc">${p.description}</p>
    </li>`,
      )
      .join('')}
  </ul>
</section>

<dialog class="sheet" id="apply" aria-labelledby="apply-title" aria-describedby="apply-intro">
  <form class="apply-form" method="post" action="/request" novalidate data-apply-form>
    <header class="sheet-head">
      <h2 id="apply-title">Request access</h2>
      <button class="sheet-close" type="button" data-close aria-label="Close">Close</button>
    </header>
    <p id="apply-intro" class="sheet-intro"><span class="accent">01 / AI ECONOMY</span> — daily brief. Requests are reviewed individually for professional relevance.</p>
    <div class="apply-fields">
      ${applicationFields({ formToken })}
    </div>
    <div class="sheet-actions">
      <button class="btn-primary" type="submit">Submit request</button>
      <button class="btn-text" type="button" data-close>Close</button>
    </div>
  </form>
  <div class="apply-done" hidden tabindex="-1">
    <h2>Request received</h2>
    <p data-done-message></p>
    <div class="sheet-actions"><button class="btn-primary" type="button" data-close>Close</button></div>
  </div>
</dialog>`;
  return layout({
    cfg,
    path: '/',
    title: '012 MEDIA — Intelligence beyond information.',
    description: 'From emerging signals to consequential decisions. 012 MEDIA publishes living intelligence: 00 / Signal, 01 / Consequence, 02 / Position.',
    body,
    bodyClass: 'home',
  });
}
