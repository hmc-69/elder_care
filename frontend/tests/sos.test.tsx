import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import type { EmergencyEvent } from '../src/types/sos'

const elder = {
  id: 'elder-1',
  name: 'John Elder',
  email: 'john@example.test',
  phone: null,
  role: 'ELDER' as const,
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

const family = {
  ...elder,
  id: 'family-1',
  name: 'Jane Family',
  email: 'jane@example.test',
  role: 'FAMILY' as const,
}

const activeSosEvent: EmergencyEvent = {
  id: 'sos-active-1',
  elderId: 'elder-1',
  elderName: 'John Elder',
  status: 'ACTIVE',
  triggeredAt: '2026-10-21T10:00:00.000Z',
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolvedAt: null,
  resolvedBy: null,
  cancelledAt: null,
  cancellationReason: null,
  notes: 'Need assistance in living room',
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

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

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(() => cleanup())

describe('Module 6 SOS Emergency System frontend workflows', () => {
  it('elder sees disclaimer, requires confirmation to trigger SOS, and prevents duplicates', async () => {
    const user = userEvent.setup()
    let currentActive: EmergencyEvent | null = null
    let postCount = 0

    session(elder, (url, init) => {
      if (url.pathname.endsWith('/sos/active')) {
        return response({ event: currentActive, disclaimer: 'In-app notification only.' })
      }
      if (url.pathname.endsWith('/sos/history')) {
        return response({
          events: currentActive ? [currentActive] : [],
          pagination: { page: 1, limit: 10, total: currentActive ? 1 : 0, totalPages: 1 },
          disclaimer: 'In-app notification only.',
        })
      }
      if (url.pathname.endsWith('/sos') && init?.method === 'POST') {
        postCount++
        currentActive = { ...activeSosEvent }
        return response({
          message: 'SOS emergency alert activated.',
          event: currentActive,
          disclaimer: 'In-app notification only.',
        }, 201)
      }
      return response({ message: 'Not found.' }, 404)
    })

    window.history.replaceState({}, '', '/elder/sos')
    render(<App />)

    // Verify accessible elements and disclaimer
    expect(await screen.findByRole('heading', { name: 'SOS Emergency System' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/does not contact 911/i)

    // Find big SOS button after loading completes
    const sosButton = await screen.findByRole('button', { name: /Send SOS emergency alert to family/i })
    expect(sosButton).toBeInTheDocument()

    // Clicking button opens confirmation modal
    await user.click(sosButton)
    expect(await screen.findByRole('heading', { name: 'Confirm Emergency Alert' })).toBeInTheDocument()

    // Confirm trigger
    const confirmButton = screen.getByRole('button', { name: 'Yes, Send SOS Alert' })
    await user.click(confirmButton)

    // Success feedback and activated state displayed
    expect(await screen.findByText('Emergency alert activated. Your connected family has been alerted.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Emergency Alert Active' })).toBeInTheDocument()
    expect(postCount).toBe(1)
  })

  it('elder can cancel an active emergency alert with a reason', async () => {
    const user = userEvent.setup()
    let currentActive: EmergencyEvent | null = { ...activeSosEvent }
    let cancelled = false

    session(elder, (url, init) => {
      if (url.pathname.endsWith('/sos/active')) {
        return response({ event: currentActive, disclaimer: 'In-app notification only.' })
      }
      if (url.pathname.endsWith('/sos/history')) {
        return response({
          events: currentActive ? [currentActive] : [],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
          disclaimer: 'In-app notification only.',
        })
      }
      if (url.pathname.endsWith(`/sos/${activeSosEvent.id}/cancel`) && init?.method === 'POST') {
        cancelled = true
        currentActive = null
        return response({
          message: 'Emergency alert cancelled.',
          event: { ...activeSosEvent, status: 'CANCELLED', cancellationReason: 'Accidental trigger' },
        })
      }
      return response({ message: 'Not found.' }, 404)
    })

    window.history.replaceState({}, '', '/elder/sos')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Emergency Alert Active' })).toBeInTheDocument()

    // Click cancel button
    const cancelBtn = screen.getByRole('button', { name: /Cancel Alert \(Accidental \/ False Alarm\)/i })
    await user.click(cancelBtn)

    // Confirm cancellation dialog
    expect(await screen.findByRole('heading', { name: 'Cancel Emergency Alert?' })).toBeInTheDocument()
    const confirmCancel = screen.getByRole('button', { name: 'Confirm Cancellation' })
    await user.click(confirmCancel)

    expect(await screen.findByText('Emergency alert cancelled.')).toBeInTheDocument()
    expect(cancelled).toBe(true)
  })

  it('family members can view active alerts and perform acknowledge and resolve actions', async () => {
    const user = userEvent.setup()
    let activeAlert: EmergencyEvent | null = { ...activeSosEvent }

    session(family, (url, init) => {
      if (url.pathname.endsWith('/sos/family/active')) {
        return response({ events: activeAlert ? [activeAlert] : [], disclaimer: 'In-app notification only.' })
      }
      if (url.pathname.endsWith('/connections/family')) {
        return response([{
          connectionId: 'conn-1',
          family: { id: 'family-1', name: 'Jane Family' },
          elder: { id: 'elder-1', name: 'John Elder' },
          relationship: 'Daughter',
          status: 'ACCEPTED',
        }])
      }
      if (url.pathname.endsWith(`/sos/${activeSosEvent.id}/acknowledge`) && init?.method === 'POST') {
        activeAlert = {
          ...activeAlert!,
          status: 'ACKNOWLEDGED',
          acknowledgedAt: '2026-10-21T10:05:00.000Z',
          acknowledgedBy: { id: 'family-1', name: 'Jane Family' },
        }
        return response({
          message: 'Emergency alert acknowledged successfully. Your elder and family can see that you are responding.',
          event: activeAlert,
        })
      }
      if (url.pathname.endsWith(`/sos/${activeSosEvent.id}/resolve`) && init?.method === 'POST') {
        activeAlert = null
        return response({
          message: 'Emergency alert resolved.',
          event: { ...activeSosEvent, status: 'RESOLVED', notes: 'Checked in on elder, confirmed safe.' },
        })
      }
      return response({ message: 'Not found.' }, 404)
    })

    window.history.replaceState({}, '', '/family/emergencies')
    render(<App />)

    // Check heading and active alert card
    expect(await screen.findByRole('heading', { name: 'Emergency Alerts' })).toBeInTheDocument()
    const elderHeaders = await screen.findAllByText('John Elder')
    expect(elderHeaders.length).toBeGreaterThan(0)
    expect(screen.getByText(/Need assistance in living room/i)).toBeInTheDocument()

    // Click Acknowledge Alert button
    const ackBtn = screen.getByRole('button', { name: 'Acknowledge Alert' })
    await user.click(ackBtn)

    expect(await screen.findByText(/Emergency alert acknowledged successfully/i)).toBeInTheDocument()

    // Click Resolve Emergency button
    const resolveBtn = screen.getByRole('button', { name: 'Resolve Emergency' })
    await user.click(resolveBtn)

    // Confirmation modal
    expect(await screen.findByRole('heading', { name: /Resolve Emergency for John Elder/i })).toBeInTheDocument()
    const confirmResolveBtn = screen.getByRole('button', { name: 'Confirm Resolution' })
    await user.click(confirmResolveBtn)

    expect(await screen.findByText('Emergency alert resolved.')).toBeInTheDocument()
    expect(await screen.findByText('All Clear')).toBeInTheDocument()
  })

  it('restricts elder SOS route to ELDER role only', async () => {
    session(family, () => response({}))
    window.history.replaceState({}, '', '/elder/sos')
    render(<App />)

    // Family user redirected away from /elder/sos to their dashboard/profile
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument()
  })
})
