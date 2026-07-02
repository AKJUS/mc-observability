import axios from 'axios';

let _token = null;

export function setApiToken(token) {
  _token = token;
}

const client = axios.create({
  baseURL: '',
  // Without a timeout a slow/stalled backend call (e.g. a metric query for a node
  // whose agent isn't installed) stays "pending" forever. Dashboards fan out one
  // request per node×metric, so those hung requests pile up in the browser. Cap them.
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  if (_token && _token !== 'bypass') {
    config.headers.Authorization = `Bearer ${_token}`;
  }
  return config;
});

// cb-tumblebug rate-limits bursts (HTTP 429); retry a few times with backoff so list/status
// lookups don't fail just because several panels loaded at once.
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const cfg = error.config;
    if (error.response?.status === 429 && cfg) {
      cfg._retry429 = (cfg._retry429 || 0) + 1;
      if (cfg._retry429 <= 4) {
        await new Promise((r) => setTimeout(r, 400 * cfg._retry429));
        return client(cfg);
      }
    }
    return Promise.reject(error);
  }
);

export default client;
