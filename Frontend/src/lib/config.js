/** Only PUBLIC browser configuration. These values are visible in built assets. */
export function validateConfig(config) {
  const missing = ['apiBaseUrl','cognitoDomain','clientId','redirectUri'].filter(key => !config[key]);
  if (missing.length) return `Missing configuration: ${missing.join(', ')}`;
  try {
    const api = new URL(config.apiBaseUrl);
    const auth = new URL(config.cognitoDomain);
    const redirect = new URL(config.redirectUri);
    if (api.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(api.hostname)) return 'API must use HTTPS outside localhost.';
    if (auth.protocol !== 'https:') return 'Cognito domain must use HTTPS.';
    if (redirect.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(redirect.hostname)) return 'Redirect URI must use HTTPS outside localhost.';
    if (redirect.search || redirect.hash) return 'Redirect URI cannot include a query or fragment.';
  } catch { return 'One or more configured URLs are invalid.'; }
  return '';
}

export const config = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, ''),
  cognitoDomain: (import.meta.env.VITE_COGNITO_DOMAIN ?? '').replace(/\/$/, ''),
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
  redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI ?? `${window.location.origin}/`,
};
