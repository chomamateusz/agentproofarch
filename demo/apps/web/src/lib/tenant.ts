/**
 * URL of a sibling tenant on the same base domain (acme.localhost →
 * globex.localhost), or `null` when tenant subdomains do not exist here: on
 * the platform's shared apex (<project>.vercel.app) sibling subdomains belong
 * to OTHER Vercel projects, so linking them would send users to strangers'
 * deployments. Until a wildcard domain is attached (ADR-0003), the web app is
 * single-tenant and tenant switching happens through the CLI (`--tenant`).
 */
export const tenantUrl = (slug: string): string | null => {
  const { protocol, hostname, port } = window.location;
  const parts = hostname.split('.');
  const base = parts.length > 1 ? parts.slice(1).join('.') : hostname;
  if (base === 'vercel.app') return null;
  return `${protocol}//${slug}.${base}${port ? `:${port}` : ''}`;
};

/** Stable accent hue per tenant so each tenant is visibly its own world. */
export const tenantHue = (slug: string): number => {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return Math.round((hash * 137.508) % 360);
};
