import { esc } from '../../../packages/publishing/render';

export interface SiteConfig {
  siteUrl: string; // https://012.media
  contactEmail?: string;
  publisherIdentity: string;
  formSecret: string;
  unsubscribeSecret: string;
  production: boolean;
}

export const COPY = {
  headline: 'Intelligence beyond information.',
  subline: 'From emerging signals to consequential decisions.',
  method: [
    ['00', 'SIGNAL'],
    ['01', 'CONSEQUENCE'],
    ['02', 'POSITION'],
  ] as const,
  caption: 'Complimentary lifetime access to the core AI Economy Brief for the first 500 approved founding readers.',
  publicationsHeading: 'PUBLICATIONS',
  publicationsDeck: 'Distinct fields of intelligence. One rigorous method.',
  publications: [
    { n: '01', name: 'AI ECONOMY', status: 'DAILY BRIEF', active: true, description: 'Models, agents, enterprise adoption, computing infrastructure, industry and capital.' },
    { n: '02', name: 'ENERGY SYSTEMS', status: 'COMING SOON', active: false, description: 'Power, infrastructure, energy markets and resources.' },
    { n: '03', name: 'GEOECONOMICS', status: 'COMING SOON', active: false, description: 'Trade, capital, industrial policy and global power.' },
  ],
};

export const lockup = (cls = '') => `<a class="lockup ${cls}" href="/" aria-label="012 MEDIA — home"><span class="lockup-num" aria-hidden="true">012</span><span class="lockup-rule" aria-hidden="true"></span><span class="lockup-word" aria-hidden="true">ZERO<br>ONE<br>TWO<br>MEDIA</span></a>`;

const NAV = [
  ['/brief', 'BRIEF'],
  ['/method', 'METHOD'],
  ['/about', 'ABOUT'],
] as const;

function nav(path: string): string {
  const items = NAV.map(([href, label]) => `<li><a href="${href}"${path === href ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  return `<nav class="nav-desktop" aria-label="Primary"><ul>${items}</ul></nav>
<details class="nav-mobile">
  <summary aria-label="Menu"><span class="burger" aria-hidden="true"><span></span><span></span></span></summary>
  <nav aria-label="Primary (mobile)"><ul>${items}</ul></nav>
</details>`;
}

export function layout(o: { cfg: SiteConfig; path: string; title: string; description: string; body: string; bodyClass?: string; noindex?: boolean }): string {
  const url = `${o.cfg.siteUrl.replace(/\/$/, '')}${o.path === '/' ? '' : o.path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#0A0A0A">
<meta name="color-scheme" content="dark">
${o.noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:site_name" content="012 MEDIA">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/manrope.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/site.js" defer></script>
</head>
<body class="${o.bodyClass ?? ''}">
<a class="skip" href="#main">Skip to content</a>
<header class="masthead wrap">
  ${lockup()}
  ${nav(o.path)}
</header>
<main id="main">
${o.body}
</main>
<footer class="site-footer wrap">
  <p class="foot-brand">012 MEDIA</p>
  <ul class="foot-links">
    <li><a href="/brief">Brief</a></li>
    <li><a href="/method">Method</a></li>
    <li><a href="/about">About</a></li>
    <li><a href="/privacy">Privacy</a></li>
  </ul>
  <p class="foot-legal">${esc(o.cfg.publisherIdentity)}</p>
</footer>
</body>
</html>`;
}

/** Plain content page with a consistent editorial header. */
export function article(o: { kicker: string; title: string; lead?: string; body: string }): string {
  return `<article class="doc wrap">
  <header class="doc-head">
    <p class="kicker">${o.kicker}</p>
    <h1>${o.title}</h1>
    ${o.lead ? `<p class="doc-lead">${o.lead}</p>` : ''}
  </header>
  <div class="doc-body">
${o.body}
  </div>
</article>`;
}
