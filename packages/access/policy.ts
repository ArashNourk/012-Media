import { z } from 'zod';
import { sha256 } from '../contracts';

/** Consent language shown next to the (initially unchecked) checkbox. Versioned and hashed on every application. */
export const CONSENT = {
  version: 'consent-2026-11-v1',
  text: 'I agree that 012 MEDIA may use these details to review my request and, if it is approved, send me the 01 / AI Economy brief and related service emails by email. I can unsubscribe at any time.',
};
export const CONSENT_SHA256 = sha256(CONSENT.text);

export const INDUSTRIES = [
  'AI and machine learning',
  'Venture capital and investment',
  'Enterprise technology',
  'Financial services',
  'Semiconductors and infrastructure',
  'Energy',
  'Public sector and policy',
  'Research and academia',
  'Consulting and professional services',
  'Other',
] as const;

export const FOUNDING = {
  maxSeats: 500,
  entitlement: 'core-01-ai-economy-brief:complimentary-for-life',
  entitlementDescription:
    'Complimentary lifetime access to the core 01 / AI Economy Brief. It does not include future specialised publications, premium dossiers, software or data products.',
};

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const text = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min, `${label} is required.`).max(max, `${label} is too long.`));

/** Server-side validation of the application form (the client validates the same rules for convenience only). */
export const ApplicationInput = z.object({
  email: z
    .string({ error: 'Email is required.' })
    .transform((s) => s.trim())
    .pipe(z.string().max(254, 'Email is too long.').regex(EMAIL_RE, 'Enter a valid email address.')),
  fullName: text(2, 120, 'Full name'),
  roleTitle: text(2, 120, 'Role or title'),
  industry: z.enum(INDUSTRIES, { error: 'Select an industry.' }),
  linkedinUrl: z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim())
    .pipe(
      z.union([
        z.literal(''),
        z
          .string()
          .max(200, 'LinkedIn URL is too long.')
          .regex(/^https:\/\/([a-z]{2,3}\.)?(www\.)?linkedin\.com\/(in|pub)\/[A-Za-z0-9_\-%.]+\/?$/, 'Enter a LinkedIn profile URL (https://www.linkedin.com/in/…) or leave it blank.'),
      ]),
    ),
  consent: z.literal(true, { error: 'Consent is required to submit a request.' }),
  consentVersion: z.literal(CONSENT.version, { error: 'The consent text has changed; reload the page.' }),
});
export type ApplicationInput = z.infer<typeof ApplicationInput>;
