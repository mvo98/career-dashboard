const SECRET = import.meta.env.VITE_APP_SECRET || ''

export function apiFetch(url, options = {}) {
  const headers = {
    'x-api-key': SECRET,
    ...(options.headers || {}),
  }
  return fetch(url, { ...options, headers })
}
