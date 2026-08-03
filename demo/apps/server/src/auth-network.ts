const SELF_HOST_AUTH_PROXY_IP = '10.247.0.3';

/**
 * A non-empty list is what makes the provider read the forwarded chain from the
 * right — the hop the nearest proxy wrote — instead of trusting a whole header a
 * client may have supplied. Self-host's pinned Caddy address is the one hop that
 * may be skipped; on a platform deployment no address of ours appears in the
 * chain, and the same right-to-left rule keeps the edge-written hop.
 */
export const AUTH_TRUSTED_PROXIES = [SELF_HOST_AUTH_PROXY_IP];

export const trustedAuthHeaders = (source: Headers, remoteAddress: string | undefined): Headers => {
  const headers = new Headers(source);
  const normalizedRemoteAddress = remoteAddress?.startsWith('::ffff:')
    ? remoteAddress.slice('::ffff:'.length)
    : remoteAddress;
  if (normalizedRemoteAddress === undefined) {
    headers.delete('x-forwarded-for');
  } else if (normalizedRemoteAddress !== SELF_HOST_AUTH_PROXY_IP) {
    headers.set('x-forwarded-for', normalizedRemoteAddress);
  }
  return headers;
};
