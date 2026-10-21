const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

export interface HealthResponse {
  status: string
  service: string
}

export async function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health', { authenticated: false })
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const TOKEN_KEY = 'eldercare_access_token'

export function getStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY)
}

export function storeToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(TOKEN_KEY)
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { authenticated?: boolean } = {},
): Promise<T> {
  const { authenticated = true, headers, ...requestOptions } = options
  const requestHeaders = new Headers(headers)
  if (requestOptions.body && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }
  const token = authenticated ? getStoredToken() : null
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { ...requestOptions, headers: requestHeaders })
  const body = await response.json().catch(() => ({})) as { message?: string }
  if (!response.ok) {
    throw new ApiError(body.message ?? `Request failed (${response.status})`, response.status)
  }
  return body as T
}
