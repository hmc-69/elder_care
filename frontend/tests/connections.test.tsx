import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

const familyUser = {
  id: 'family-1', name: 'Jane Family', email: 'jane@example.test', phone: null,
  role: 'FAMILY' as const, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
}
const elderUser = {
  id: 'elder-1', name: 'John Elder', email: 'john@example.test', phone: '9876543210',
  role: 'ELDER' as const, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
}
const familySummary = { id: familyUser.id, name: familyUser.name }
const elderSummary = { id: elderUser.id, name: elderUser.name }

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('eldercare_access_token', 'test-token')
  window.history.replaceState({}, '', '/')
})

afterEach(() => cleanup())

describe('family and elder connection pages', () => {
  it('searches for an elder and sends a family connection request', async () => {
    const user = userEvent.setup()
    let sent = false
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/auth/me')) return response({ user: familyUser })
      if (url.pathname.endsWith('/connections/family')) {
        return response(sent ? [{ connectionId: 'connection-1', elder: elderSummary, relationship: 'Daughter', status: 'PENDING', createdAt: '', updatedAt: '' }] : [])
      }
      if (url.pathname.endsWith('/family/elders/search')) return response({ users: [elderSummary] })
      if (url.pathname.endsWith('/connections') && init?.method === 'POST') {
        sent = true
        expect(JSON.parse(String(init.body))).toEqual({ elderId: elderUser.id, relationship: 'Daughter' })
        return response({ message: 'Connection request sent' }, 201)
      }
      return response({ message: 'Not found.' }, 404)
    })
    globalThis.fetch = fetchMock as typeof fetch
    window.history.replaceState({}, '', '/family/connections')
    render(<App />)

    await screen.findByRole('heading', { name: 'Find an Elder' })
    await user.type(screen.getByRole('searchbox', { name: 'Search by name or email' }), 'John')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('John Elder')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Relationship to John Elder'), 'Daughter')
    await user.click(screen.getByRole('button', { name: 'Send Connection Request' }))

    expect(await screen.findByText('Connection request sent.')).toBeInTheDocument()
    expect(await screen.findByText('Pending requests')).toBeInTheDocument()
    expect(screen.getByText('Request Pending')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send Connection Request' })).not.toBeInTheDocument()
  })

  it('lets an elder accept a pending request and shows the connected family member', async () => {
    const user = userEvent.setup()
    let accepted = false
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/auth/me')) return response({ user: elderUser })
      if (url.pathname.endsWith('/connections/requests')) {
        return response(accepted ? [] : [{ id: 'connection-1', family: familySummary, relationship: 'Daughter', status: 'PENDING', createdAt: '' }])
      }
      if (url.pathname.endsWith('/connections/elder')) {
        return response(accepted ? [{ connectionId: 'connection-1', family: familySummary, relationship: 'Daughter', status: 'ACCEPTED', createdAt: '', updatedAt: '' }] : [])
      }
      if (url.pathname.endsWith('/connections/connection-1/accept') && init?.method === 'PUT') {
        accepted = true
        return response({ message: 'Connection request accepted.' })
      }
      return response({ message: 'Not found.' }, 404)
    })
    globalThis.fetch = fetchMock as typeof fetch
    window.history.replaceState({}, '', '/elder/connections')
    render(<App />)

    await screen.findByText('Jane Family')
    await user.click(screen.getByRole('button', { name: 'Accept' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Connection accepted.')
    expect(await screen.findByText('Connected family members')).toBeInTheDocument()
    expect(screen.getByText('Jane Family')).toBeInTheDocument()
    expect(screen.getByText('ACCEPTED')).toBeInTheDocument()
  })

  it('lets an elder reject a request and displays it in connection history', async () => {
    const user = userEvent.setup()
    let rejected = false
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/auth/me')) return response({ user: elderUser })
      if (url.pathname.endsWith('/connections/requests')) {
        return response(rejected ? [] : [{ id: 'connection-2', family: familySummary, relationship: 'Relative', status: 'PENDING', createdAt: '' }])
      }
      if (url.pathname.endsWith('/connections/elder')) {
        return response(rejected ? [{ connectionId: 'connection-2', family: familySummary, relationship: 'Relative', status: 'REJECTED', createdAt: '', updatedAt: '' }] : [])
      }
      if (url.pathname.endsWith('/connections/connection-2/reject') && init?.method === 'PUT') {
        rejected = true
        return response({ message: 'Connection request rejected.' })
      }
      return response({ message: 'Not found.' }, 404)
    })
    globalThis.fetch = fetchMock as typeof fetch
    window.history.replaceState({}, '', '/elder/connections')
    render(<App />)

    await screen.findByText('Jane Family')
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Connection request rejected.')
    expect(await screen.findByText('Connection history')).toBeInTheDocument()
    expect(screen.getByText('REJECTED')).toBeInTheDocument()
  })
})
