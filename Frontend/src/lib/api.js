export class ApiError extends Error {
  constructor(message, status) {super(message);this.name='ApiError';this.status=status;}
}
export function makeApi(config, getAccessToken, onUnauthorized = () => {}, fetcher = fetch) {
  const base = config.apiBaseUrl.replace(/\/$/, '');
  async function request(path, {method='GET', body, signal, idempotencyKey} = {}) {
    const token = await getAccessToken();
    if (!token) {onUnauthorized();throw new ApiError('Please sign in to continue.', 401);}
    let response;
    try {
      response = await fetcher(base + path, {
        method, signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? {'Content-Type':'application/json'} : {}),
          ...(idempotencyKey ? {'Idempotency-Key': idempotencyKey} : {}),
        },
        ...(body ? {body:JSON.stringify(body)} : {}),
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new ApiError('Unable to contact the API. Check your backend URL, deployment status, and CORS settings.', 0);
    }
    if (response.status === 401) onUnauthorized();
    if (response.status === 204) return null;
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(json.error || `Request failed (HTTP ${response.status})`,response.status);
    return json;
  }
  return {
    list: (page = 0, size = 20, signal) => request(`/api/v1/links?page=${page}&size=${size}`,{signal}),
    create: (body, idempotencyKey) => request('/api/v1/links',{method:'POST',body,idempotencyKey}),
    analytics: (code, signal) => request(`/api/v1/links/${encodeURIComponent(code)}/analytics`,{signal}),
    revoke: code => request(`/api/v1/links/${encodeURIComponent(code)}`,{method:'DELETE'}),
    readiness: async () => {
      const res = await fetcher(`${base}/ready`, {cache:'no-store'});
      if (!res.ok) throw new ApiError(`Backend readiness: HTTP ${res.status}`, res.status);
      return res.json();
    }
  };
}
