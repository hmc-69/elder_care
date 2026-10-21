import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import type { User } from '../types/auth'

const elderUser: User = {
  id: 'elder-test-1',
  name: 'Eleanor Vance',
  email: 'eleanor@test.com',
  role: 'ELDER',
}

const mockNotifications = [
  {
    id: 'notif-1',
    recipientUserId: 'elder-test-1',
    actorUserId: 'family-test-1',
    type: 'CONNECTION_REQUEST',
    title: 'New Connection Request',
    message: 'Sarah Vance sent you a family connection request.',
    read: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'notif-2',
    recipientUserId: 'elder-test-1',
    actorUserId: null,
    type: 'MEDICATION_DUE',
    title: 'Medication Due',
    message: 'Time for your Aspirin dose.',
    read: true,
    readAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
]

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('eldercare_access_token', 'test-token')
  window.history.replaceState({}, '', '/')
})

afterEach(() => cleanup())

describe('Module 8 Notifications frontend workflows', () => {
  it('renders notification list, badges, and filters', async () => {
    const user = userEvent.setup()

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method || 'GET'

      if (url.pathname.endsWith('/auth/me')) return response({ user: elderUser })
      if (url.pathname.includes('/notifications/unread-count')) return response({ unreadCount: 1 })

      if (url.pathname.endsWith('/notifications')) {
        const unreadOnly = url.searchParams.get('unreadOnly') === 'true'
        const list = unreadOnly ? mockNotifications.filter((n) => !n.read) : mockNotifications
        return response({
          notifications: list,
          unreadCount: 1,
          pagination: { page: 1, limit: 20, total: list.length, totalPages: 1 },
        })
      }

      if (url.pathname.includes('/notifications/notif-1/read') && method === 'PATCH') {
        return response({ notification: { ...mockNotifications[0], read: true, readAt: new Date().toISOString() } })
      }

      return response({ message: 'Not found' }, 404)
    })

    globalThis.fetch = fetchMock as typeof fetch
    window.history.replaceState({}, '', '/notifications')

    render(<App />)

    // Verify page headings exist
    const headings = await screen.findAllByRole('heading', { name: 'Notifications' })
    expect(headings.length).toBeGreaterThanOrEqual(1)

    // Verify notifications loaded
    expect(await screen.findByText('New Connection Request')).toBeInTheDocument()
    expect(screen.getByText('Medication Due')).toBeInTheDocument()

    // Filter to unread only
    const unreadTab = screen.getByRole('tab', { name: /Unread/i })
    await user.click(unreadTab)

    await waitFor(() => {
      expect(screen.getByText('New Connection Request')).toBeInTheDocument()
    })

    // Mark as read
    const markReadBtn = screen.getByRole('button', { name: /Mark as read/i })
    await user.click(markReadBtn)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/notifications/notif-1/read'),
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
  })

  it('handles empty state and mark all as read', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method || 'GET'

      if (url.pathname.endsWith('/auth/me')) return response({ user: elderUser })
      if (url.pathname.includes('/notifications/unread-count')) return response({ unreadCount: 0 })

      if (url.pathname.endsWith('/notifications/mark-all-read') && method === 'PATCH') {
        return response({ count: 2, message: 'All notifications marked as read.' })
      }

      if (url.pathname.endsWith('/notifications')) {
        return response({
          notifications: [],
          unreadCount: 0,
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        })
      }

      return response({ message: 'Not found' }, 404)
    })

    globalThis.fetch = fetchMock as typeof fetch
    window.history.replaceState({}, '', '/notifications')

    render(<App />)

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
  })
})
