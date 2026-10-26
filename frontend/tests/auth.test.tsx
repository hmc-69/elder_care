import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

const elder = {
  id: 'elder-1',
  name: 'Elder Example',
  email: 'elder@example.com',
  phone: null,
  role: 'ELDER' as const,
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    if (path.endsWith('/auth/login')) return jsonResponse({ message: 'Login successful', token: 'signed.jwt.token', user: elder })
    if (path.endsWith('/auth/register')) return jsonResponse({ message: 'Registration successful.', user: elder }, 201)
    if (path.endsWith('/auth/me')) return jsonResponse({ user: elder })
    if (path.endsWith('/auth/logout')) return jsonResponse({ message: 'Logout successful.' })
    return jsonResponse({ message: 'Not found.' }, 404)
  })
  globalThis.fetch = fetchMock as typeof fetch
})

afterEach(() => cleanup())

function renderAt(path: string) {
  window.history.replaceState({}, '', path)
  return render(<App />)
}

describe('authentication pages and state', () => {
  it('logs in and opens the role-aware dashboard', async () => {
    const user = userEvent.setup()
    renderAt('/login')

    await user.type(screen.getByLabelText('Email address'), 'elder@example.com')
    await user.type(screen.getByLabelText('Password'), 'elderpass123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: /Good (morning|afternoon|evening), Elder/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Daily check-in' })).toBeInTheDocument()
    expect(window.localStorage.getItem('eldercare_access_token')).toBe('signed.jwt.token')
  })

  it('shows a generic error for invalid login credentials', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (new URL(String(input)).pathname.endsWith('/auth/login')) {
        return jsonResponse({ message: 'Invalid email or password.' }, 401)
      }
      return jsonResponse({ message: 'Unexpected request.' }, 404)
    })
    renderAt('/login')

    await user.type(screen.getByLabelText('Email address'), 'unknown@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrongpass123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
    expect(window.localStorage.getItem('eldercare_access_token')).toBeNull()
  })

  it('offers only elder and family registration and rejects mismatched passwords', async () => {
    const user = userEvent.setup()
    renderAt('/register')

    expect(screen.getByRole('radio', { name: 'Older adult' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Family member' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /admin/i })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Full name'), 'Elder Example')
    await user.type(screen.getByLabelText('Email address'), 'elder@example.com')
    await user.type(screen.getByLabelText('Password'), 'elderpass123')
    await user.type(screen.getByLabelText('Confirm password'), 'differentpass123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('registers an account and authenticates it centrally', async () => {
    const user = userEvent.setup()
    renderAt('/register')

    await user.type(screen.getByLabelText('Full name'), 'Elder Example')
    await user.type(screen.getByLabelText('Email address'), 'elder@example.com')
    await user.type(screen.getByLabelText('Password'), 'elderpass123')
    await user.type(screen.getByLabelText('Confirm password'), 'elderpass123')
    await user.click(screen.getByRole('radio', { name: 'Family member' }))
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: /Good (morning|afternoon|evening), Elder/ })).toBeInTheDocument()
    const registerRequest = fetchMock.mock.calls.find(([input]) => new URL(String(input)).pathname.endsWith('/auth/register'))
    expect(registerRequest).toBeDefined()
    expect(JSON.parse(String(registerRequest?.[1]?.body)).role).toBe('FAMILY')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.objectContaining({ method: 'POST' }))
  })

  it('redirects anonymous profile visits to login', async () => {
    renderAt('/profile')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
  })

  it('removes the stored token and returns home on logout', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('eldercare_access_token', 'signed.jwt.token')
    renderAt('/profile')

    await screen.findByRole('heading', { name: 'Your profile' })
    await user.click(screen.getByLabelText("Open Elder Example's profile menu"))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(window.localStorage.getItem('eldercare_access_token')).toBeNull()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/logout'), expect.objectContaining({ method: 'POST' })))
  })
})
