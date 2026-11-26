import { BRAND, esc } from '../publishing/render';
import { FOUNDING } from './policy';

interface Frame {
  publisherIdentity: string;
  siteUrl: string;
}

function shell(f: Frame, title: string, bodyHtml: string, footerHtml: string): string {
  const font = `font-family:${BRAND.font};`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.black};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.black};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 14px;border-bottom:1px solid ${BRAND.rule};">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="${font}color:${BRAND.white};font-size:34px;font-weight:700;letter-spacing:-1px;line-height:1;padding-right:12px;">012</td>
    <td style="border-left:1px solid ${BRAND.white};padding-left:12px;${font}color:${BRAND.white};font-size:9px;letter-spacing:2.6px;line-height:1.3;font-weight:600;">ZERO<br>ONE<br>TWO<br>MEDIA</td>
  </tr></table>
</td></tr>
<tr><td style="padding:22px 4px 0;${font}color:${BRAND.white};font-size:16px;line-height:1.6;">${bodyHtml}</td></tr>
<tr><td style="padding:28px 4px 0;${font}font-size:12px;line-height:1.6;color:${BRAND.dim};">
  <div style="border-top:1px solid ${BRAND.rule};padding-top:14px;">${footerHtml}<p style="margin:0;">${esc(f.publisherIdentity)} · <a href="${esc(f.siteUrl)}" style="color:${BRAND.dim};">${esc(f.siteUrl.replace(/^https?:\/\//, ''))}</a></p></div>
</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;"><tr><td style="background:${BRAND.white};border-radius:2px;"><a href="${esc(href)}" style="display:inline-block;padding:13px 22px;font-family:${BRAND.font};font-size:13px;letter-spacing:1.6px;font-weight:700;color:${BRAND.black};text-decoration:none;">${label}</a></td></tr></table>`;

/** Ownership check only. Not a marketing message; sent once per request (rate-limited). */
export function verificationEmail(f: Frame & { verifyUrl: string; fullName: string }) {
  const subject = 'Confirm your email — 012 MEDIA';
  const html = shell(
    f,
    subject,
    `<p style="margin:0 0 14px;">${esc(f.fullName)},</p>
<p style="margin:0 0 14px;">We received your request to read the 01 / AI Economy brief. Please confirm that this address is yours. Requests are reviewed individually; confirming does not guarantee approval.</p>
${button(f.verifyUrl, 'CONFIRM EMAIL')}
<p style="margin:0;font-size:13px;color:${BRAND.gray};">The link expires in 48 hours. If you did not make this request, ignore this message and nothing further will be sent.</p>`,
    `<p style="margin:0 0 6px;">You receive this single message because this address was entered in the access form at ${esc(f.siteUrl.replace(/^https?:\/\//, ''))}.</p>`,
  );
  const text = `${f.fullName},

We received your request to read the 01 / AI Economy brief. Please confirm that this address is yours:
${f.verifyUrl}

Requests are reviewed individually; confirming does not guarantee approval. The link expires in 48 hours. If you did not make this request, ignore this message and nothing further will be sent.

${f.publisherIdentity} · ${f.siteUrl}`;
  return { subject, html, text };
}

export function welcomeEmail(f: Frame & { fullName: string; unsubscribeUrl: string; specimenUrl: string }) {
  const subject = 'Welcome to 01 / AI Economy — 012 MEDIA';
  const html = shell(
    f,
    subject,
    `<p style="margin:0 0 14px;">${esc(f.fullName)},</p>
<p style="margin:0 0 14px;">Your request has been approved. You are a founding reader of <strong>01 / AI ECONOMY</strong>, the daily brief of 012 MEDIA.</p>
<p style="margin:0 0 14px;">Each weekday, around 9:00 AM Toronto time, you will receive a short edition in three parts — <span style="color:${BRAND.magenta};">00</span> / Signal, <span style="color:${BRAND.magenta};">01</span> / Consequence, <span style="color:${BRAND.magenta};">02</span> / Position — with a link to the full brief and its sources. Earlier positions are revisited in dated updates when new evidence warrants.</p>
<p style="margin:0 0 14px;font-size:14px;color:${BRAND.gray};">${esc(FOUNDING.entitlementDescription)}</p>
${button(f.specimenUrl, 'SEE THE BRIEF')}`,
    `<p style="margin:0 0 6px;"><a href="${esc(f.unsubscribeUrl)}" style="color:${BRAND.gray};">Unsubscribe</a> at any time — it takes effect immediately.</p>`,
  );
  const text = `${f.fullName},

Your request has been approved. You are a founding reader of 01 / AI ECONOMY, the daily brief of 012 MEDIA.

Each weekday, around 9:00 AM Toronto time, you will receive a short edition in three parts — 00 / Signal, 01 / Consequence, 02 / Position — with a link to the full brief and its sources. Earlier positions are revisited in dated updates when new evidence warrants.

${FOUNDING.entitlementDescription}

The brief: ${f.specimenUrl}
Unsubscribe: ${f.unsubscribeUrl}

${f.publisherIdentity} · ${f.siteUrl}`;
  return { subject, html, text };
}
