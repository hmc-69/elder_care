import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

const elder = {
  id: 'elder-1',
  name: 'Alice Elder',
  email: 'alice@example.test',
  phone: null,
  role: 'ELDER' as const,
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

const mockConversations = [
  {
    id: 'conv-1',
    title: 'Hydration & Water Tips',
    messageCount: 2,
    lastMessage: {
      content: 'Make sure to drink 6-8 glasses of water daily.',
      role: 'ASSISTANT',
      createdAt: '2026-10-21T09:00:00.000Z',
    },
    createdAt: '2026-10-21T09:00:00.000Z',
    updatedAt: '2026-10-21T09:01:00.000Z',
  },
]

const mockDetailConv1 = {
  id: 'conv-1',
  title: 'Hydration & Water Tips',
  createdAt: '2026-10-21T09:00:00.000Z',
  updatedAt: '2026-10-21T09:01:00.000Z',
  messages: [
    {
      id: 'msg-1',
      role: 'USER',
      content: 'How much water should I drink?',
      createdAt: '2026-10-21T09:00:00.000Z',
    },
    {
      id: 'msg-2',
      role: 'ASSISTANT',
      content: 'Make sure to drink **6-8 glasses** of water daily.\n- Keep a bottle handy\n- Sip regularly',
      createdAt: '2026-10-21T09:01:00.000Z',
    },
  ],
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function session(user: typeof elder, handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  window.localStorage.clear()
  window.localStorage.setItem('eldercare_access_token', 'test-token')
  window.history.replaceState({}, '', '/elder/assistant')

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/auth/me')) return response({ user })
    return handler(url, init)
  }) as typeof fetch
}

describe('Module 7 AI Eldercare Assistant frontend workflows', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // Mock navigator.clipboard safely in jsdom
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    })
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders safety banner, empty state, and prompt suggestions on fresh conversation', async () => {
    session(elder, (url) => {
      if (url.pathname.endsWith('/assistant/conversations')) {
        return response({
          conversations: [],
          pagination: { page: 1, limit: 30, total: 0, totalPages: 1 },
        })
      }
      return response({ message: 'Not found' }, 404)
    })

    render(<App />)

    // Verify Medical & Emergency safety banner is visible
    expect(await screen.findByText('Medical & Emergency Safety Notice')).toBeInTheDocument()
    expect(screen.getByText(/ElderCare Assistant provides everyday organization/)).toBeInTheDocument()

    // Verify empty prompt state
    expect(screen.getByText(/Hello, Alice! How can I help today\?/)).toBeInTheDocument()
    expect(screen.getByText('What are my scheduled medicines today?')).toBeInTheDocument()
    expect(screen.getByText('How do I complete my daily check-in?')).toBeInTheDocument()
  })

  it('sends a user message and displays the assistant response with safe formatting', async () => {
    session(elder, (url, init) => {
      if (url.pathname.endsWith('/assistant/conversations')) {
        return response({
          conversations: [],
          pagination: { page: 1, limit: 30, total: 0, totalPages: 1 },
        })
      }
      if (url.pathname.endsWith('/assistant/chat') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        return response({
          conversationId: 'conv-new-1',
          title: 'Daily Check-in Query',
          message: {
            id: 'asst-msg-1',
            role: 'ASSISTANT',
            content: 'You can check in twice daily:\n- **Morning**: after waking\n- **Night**: before resting',
            createdAt: new Date().toISOString(),
          },
          userMessage: {
            id: 'user-msg-1',
            role: 'USER',
            content: body.message,
            createdAt: new Date().toISOString(),
          },
          disclaimer: 'General support disclaimer',
        })
      }
      return response({ message: 'Not found' }, 404)
    })

    const user = userEvent.setup()
    render(<App />)

    const textarea = await screen.findByPlaceholderText(/Type your question or routine query/)
    const sendButton = screen.getByRole('button', { name: /Send/ })

    await user.type(textarea, 'How do check-ins work?')
    await user.click(sendButton)

    // User message should appear
    expect(await screen.findByText('How do check-ins work?')).toBeInTheDocument()

    // Assistant response should appear with bold element
    expect(await screen.findByText(/You can check in twice daily:/)).toBeInTheDocument()
    expect(screen.getByText('Morning')).toBeInTheDocument()
    expect(screen.getByText('Night')).toBeInTheDocument()
  })

  it('clicking an example prompt chip automatically sends it', async () => {
    let sentMessage = ''
    session(elder, (url, init) => {
      if (url.pathname.endsWith('/assistant/conversations')) {
        return response({
          conversations: [],
          pagination: { page: 1, limit: 30, total: 0, totalPages: 1 },
        })
      }
      if (url.pathname.endsWith('/assistant/chat') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        sentMessage = body.message
        return response({
          conversationId: 'conv-chip-1',
          title: body.message.slice(0, 30),
          message: {
            id: 'asst-chip-1',
            role: 'ASSISTANT',
            content: 'Here is your medicine overview: Metformin 500mg twice daily.',
            createdAt: new Date().toISOString(),
          },
          userMessage: {
            id: 'user-chip-1',
            role: 'USER',
            content: body.message,
            createdAt: new Date().toISOString(),
          },
          disclaimer: 'General support disclaimer',
        })
      }
      return response({ message: 'Not found' }, 404)
    })

    const user = userEvent.setup()
    render(<App />)

    const chip = await screen.findByRole('button', { name: /What are my scheduled medicines today\?/ })
    await user.click(chip)

    expect(sentMessage).toBe('What are my scheduled medicines today?')
    expect(await screen.findByText(/Here is your medicine overview: Metformin 500mg twice daily\./)).toBeInTheDocument()
  })

  it('handles recoverable error state and allows retrying the message', async () => {
    let callCount = 0
    session(elder, (url, init) => {
      if (url.pathname.endsWith('/assistant/conversations')) {
        return response({
          conversations: [],
          pagination: { page: 1, limit: 30, total: 0, totalPages: 1 },
        })
      }
      if (url.pathname.endsWith('/assistant/chat') && init?.method === 'POST') {
        callCount++
        if (callCount === 1) {
          return response({ message: 'The AI assistant timed out while generating a response.' }, 504)
        }
        return response({
          conversationId: 'conv-retry-1',
          title: 'Morning Stretches',
          message: {
            id: 'asst-retry-1',
            role: 'ASSISTANT',
            content: 'Gentle stretching helps mobility and circulation.',
            createdAt: new Date().toISOString(),
          },
          userMessage: {
            id: 'user-retry-1',
            role: 'USER',
            content: 'Morning stretches please',
            createdAt: new Date().toISOString(),
          },
          disclaimer: 'General support disclaimer',
        })
      }
      return response({ message: 'Not found' }, 404)
    })

    const user = userEvent.setup()
    render(<App />)

    const textarea = await screen.findByPlaceholderText(/Type your question or routine query/)
    await user.type(textarea, 'Morning stretches please')
    await user.click(screen.getByRole('button', { name: /Send/ }))

    // Expect error message and retry button
    expect(await screen.findByText(/The AI assistant timed out while generating a response\./)).toBeInTheDocument()
    const retryButton = screen.getByRole('button', { name: /Retry message/ })
    expect(retryButton).toBeInTheDocument()

    // Click retry
    await user.click(retryButton)

    // Expect successful reply on retry
    expect(await screen.findByText(/Gentle stretching helps mobility and circulation\./)).toBeInTheDocument()
  })

  it('loads conversation history and allows switching between conversations and starting a new chat', async () => {
    session(elder, (url) => {
      if (url.pathname.endsWith('/assistant/conversations')) {
        return response({
          conversations: mockConversations,
          pagination: { page: 1, limit: 30, total: 1, totalPages: 1 },
        })
      }
      if (url.pathname.includes('/assistant/conversations/conv-1')) {
        return response({
          conversation: mockDetailConv1,
          disclaimer: 'General disclaimer',
        })
      }
      return response({ message: 'Not found' }, 404)
    })

    const user = userEvent.setup()
    render(<App />)

    // Past conversation title should appear in sidebar
    expect(await screen.findByText('Hydration & Water Tips')).toBeInTheDocument()

    // Click past conversation
    await user.click(screen.getByText('Hydration & Water Tips'))

    // Expect past messages to load
    expect(await screen.findByText('How much water should I drink?')).toBeInTheDocument()
    expect(screen.getByText(/Make sure to drink/)).toBeInTheDocument()

    // Click New conversation button
    const newChatButton = screen.getByRole('button', { name: /New conversation/ })
    await user.click(newChatButton)

    // Should return to empty state
    await waitFor(() => {
      expect(screen.getByText(/Hello, Alice! How can I help today\?/)).toBeInTheDocument()
    })
  })

  it('allows copying assistant responses to the clipboard', async () => {
    session(elder, (url) => {
      if (url.pathname.endsWith('/assistant/conversations')) {
        return response({
          conversations: mockConversations,
          pagination: { page: 1, limit: 30, total: 1, totalPages: 1 },
        })
      }
      if (url.pathname.includes('/assistant/conversations/conv-1')) {
        return response({
          conversation: mockDetailConv1,
          disclaimer: 'General disclaimer',
        })
      }
      return response({ message: 'Not found' }, 404)
    })

    const writeSpy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeSpy },
      writable: true,
      configurable: true,
    })

    render(<App />)

    // Open conversation
    fireEvent.click(await screen.findByText('Hydration & Water Tips'))
    expect(await screen.findByText('How much water should I drink?')).toBeInTheDocument()

    // Find Copy button
    const copyButton = screen.getByRole('button', { name: /Copy assistant answer to clipboard/ })
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('Make sure to drink')
      )
    })
    expect(await screen.findByText('Copied!')).toBeInTheDocument()
  })
})
