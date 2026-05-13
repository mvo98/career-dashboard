const TOKEN_KEY = 'auth_token'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function apiFetch(url, options = {}) {
  const token = getToken()
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }
  return fetch(API_URL + url, { ...options, headers }).then(res => {
    if (res.status === 401) {
      removeToken()
      window.dispatchEvent(new Event('auth:logout'))
    }
    return res
  })
}
