import { apiUrl, origin } from './environment.mjs';
export class ApiClient {
  cookie = '';
  csrf = '';
  async request(path, { method = 'GET', body, expected = 200, csrf = true } = {}) {
    const response = await fetch(apiUrl + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(method === 'GET'
          ? {}
          : {
              Origin: origin,
              'Content-Type': 'application/json',
              ...(csrf ? { 'X-CSRF-Token': this.csrf } : {}),
            }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      if (pair.startsWith('erp.sid=')) this.cookie = pair;
    }
    const result = await response.json();
    if (response.status !== expected)
      throw Error(
        `${method} ${path.split('?')[0]} expected ${expected}, received ${response.status}, code ${result.error?.code ?? 'unknown'}`,
      );
    if (result.data?.csrfToken) this.csrf = result.data.csrfToken;
    return result;
  }
  async login(email, password) {
    await this.request('/auth/session');
    const result = await this.request('/auth/login', { method: 'POST', body: { email, password } });
    return result.data.user;
  }
  async logout() {
    await this.request('/auth/logout', { method: 'POST', body: {} });
  }
}
