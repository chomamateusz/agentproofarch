const SELF_HOST_AUTH_PROXY_IP = '10.247.0.3';
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
