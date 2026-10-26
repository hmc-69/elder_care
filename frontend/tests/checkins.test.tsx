import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import type { CheckIn } from '../src/types/checkins'

const elder = { id: 'elder-1', name: 'John Elder', email: 'john@example.test', phone: null, role: 'ELDER' as const, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' }
const family = { ...elder, id: 'family-1', name: 'Jane Family', email: 'jane@example.test', role: 'FAMILY' as const }
const morning: CheckIn = { id: 'checkin-am', date: '2026-10-02', period: 'MORNING', scheduledTime: '09:00', status: 'PENDING', isDue: true, late: false, checkedInAt: null }
const night: CheckIn = { id: 'checkin-pm', date: '2026-10-02', period: 'NIGHT', scheduledTime: '20:00', status: 'PENDING', isDue: false, late: false, checkedInAt: null }
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }) }
function session(user: typeof elder | typeof family, handler: (url: URL, init?: RequestInit) => Response) {
  window.localStorage.clear()
  window.localStorage.setItem('eldercare_access_token', 'test-token')
  window.history.replaceState({}, '', '/')
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/auth/me')) return response({ user })
    return handler(url, init)
  }) as typeof fetch
}
beforeEach(() => { window.localStorage.clear(); window.history.replaceState({}, '', '/') })
afterEach(() => cleanup())

describe('daily check-in pages', () => {
  it('shows two daily periods and completes only the selected one', async () => {
    const user = userEvent.setup()
    let current: CheckIn[] = [morning, night]
    let posts = 0
    session(elder, (url, init) => {
      if (url.pathname.endsWith('/checkins/today') && init?.method === 'POST') {
        posts += 1
        const period = JSON.parse(String(init.body)).period
        const source = period === 'NIGHT' ? night : morning
        const completed: CheckIn = { ...source, status: 'COMPLETED', checkedInAt: '2026-10-02T09:14:00.000Z' }
        current = current.map((item) => item.period === period ? completed : item)
        return response({ checkIn: completed })
      }
      if (url.pathname.endsWith('/checkins/today')) return response({ checkIns: current })
      if (url.pathname.endsWith('/checkins/history')) return response({ history: current.filter((item) => item.status === 'COMPLETED') })
      return response({ message: 'Not found.' }, 404)
    })
    window.history.replaceState({}, '', '/elder/check-in')
    render(<App />)
    expect(await screen.findByText('Are you okay today?')).toBeInTheDocument()
    expect(screen.getByText('Morning check-in')).toBeInTheDocument()
    expect(screen.getByText('Night check-in')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: "I'M OKAY" })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[0])
    expect(await screen.findByText('Morning check-in saved. Your family can see that you checked in.')).toBeInTheDocument()
    expect(screen.getByText('Night check-in')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /I'M OKAY/i })).toHaveLength(1)
    expect(posts).toBe(1)
  })

  it('allows a missed morning check-in to be completed late', async () => {
    const user = userEvent.setup()
    let current: CheckIn[] = [{ ...morning, status: 'MISSED', isDue: false }, night]
    session(elder, (url, init) => {
      if (url.pathname.endsWith('/checkins/today') && init?.method === 'POST') {
        const completed: CheckIn = { ...current[0], status: 'COMPLETED', late: true, checkedInAt: '2026-10-02T11:00:00.000Z' }
        current = current.map((item) => item.period === 'MORNING' ? completed : item)
        return response({ checkIn: completed })
      }
      if (url.pathname.endsWith('/checkins/today')) return response({ checkIns: current })
      if (url.pathname.endsWith('/checkins/history')) return response({ history: current.filter((item) => item.status === 'COMPLETED') })
      return response({ message: 'Not found.' }, 404)
    })
    window.history.replaceState({}, '', '/elder/check-in')
    render(<App />)
    expect(await screen.findByText(/This check-in was missed/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Check In Now' }))
    expect(await screen.findByText('Morning check-in saved. Your family can see that you checked in.')).toBeInTheDocument()
  })

  it('shows elder loading failures and empty history clearly', async () => {
    session(elder, (url) => url.pathname.endsWith('/checkins/history') ? response({ history: [] }) : response({ message: 'Offline' }, 503))
    window.history.replaceState({}, '', '/elder/check-in')
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your check-in status.')
    expect(await screen.findByText('No check-in history available.')).toBeInTheDocument()
  })

  it('shows the family two-period status as read-only and handles access errors', async () => {
    session(family, (url) => url.pathname.endsWith('/elders/elder-1/checkins') ? response({
      elder: { id: 'elder-1', name: 'John Elder' }, today: [{ ...morning, status: 'COMPLETED', checkedInAt: '2026-10-02T09:14:00.000Z' }, night],
      history: [{ ...morning, status: 'COMPLETED', checkedInAt: '2026-10-02T09:14:00.000Z' }, night],
    }) : response({ message: 'Not found.' }, 404))
    window.history.replaceState({}, '', '/family/elders/elder-1/checkins')
    render(<App />)
    expect(await screen.findByRole('heading', { name: "John Elder's Check-ins" })).toBeInTheDocument()
    expect(screen.getByText(/READ ONLY/)).toBeInTheDocument()
    expect(screen.getByText('Morning')).toBeInTheDocument()
    expect(screen.getByText('Night')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument()
    cleanup()

    session(family, (url) => url.pathname.endsWith('/elders/elder-1/checkins') ? response({ message: 'Not connected' }, 404) : response({}))
    window.history.replaceState({}, '', '/family/elders/elder-1/checkins')
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load check-in information.')
  })

  it('restricts check-in routes to the correct account roles', async () => {
    session(family, () => response({}))
    window.history.replaceState({}, '', '/elder/check-in')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument()
  })
})
