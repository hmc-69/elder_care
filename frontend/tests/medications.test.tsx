import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

const elderUser = {
  id: 'elder-1', name: 'John Elder', email: 'john@example.test', phone: null,
  role: 'ELDER' as const, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
}
const familyUser = {
  ...elderUser, id: 'family-1', name: 'Jane Family', email: 'jane@example.test', role: 'FAMILY' as const,
}
const baseMedication = {
  id: 'med-1', name: 'Vitamin D', dosage: '1 tablet', instructions: 'After food', frequency: 'ONCE_DAILY',
  times: ['08:00'], startDate: '2026-10-02', endDate: null, active: true,
  createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function eventFor(medication: typeof baseMedication, status: string) {
  return { id: 'log-1', medication, scheduledDate: medication.startDate, scheduledTime: medication.times[0], status, takenAt: null }
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('eldercare_access_token', 'test-token')
  window.history.replaceState({}, '', '/')
})
afterEach(() => cleanup())

describe('medication pages', () => {
  it('lets an elder add, mark due medicine taken, edit it, and deactivate it', async () => {
    const user = userEvent.setup()
    let medication: typeof baseMedication | null = null
    let status = 'DUE'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/auth/me')) return response({ user: elderUser })
      if (url.pathname.endsWith('/medications/today')) return response({ date: '2026-10-02', medications: medication?.active ? [eventFor(medication, status)] : [] })
      if (url.pathname.endsWith('/medications') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as typeof baseMedication
        medication = { ...baseMedication, ...body, instructions: body.instructions ?? null }
        return response({ message: 'Medication added successfully.', medication }, 201)
      }
      if (url.pathname.endsWith('/medications') && !init?.method) return response({ medications: medication ? [medication] : [] })
      if (url.pathname.endsWith('/med-1/taken') && init?.method === 'POST') {
        status = 'TAKEN'
        return response({ event: eventFor(medication ?? baseMedication, status) })
      }
      if (url.pathname.endsWith('/med-1') && init?.method === 'PUT') {
        medication = { ...medication!, ...JSON.parse(String(init.body)) }
        return response({ message: 'Medication updated successfully.', medication })
      }
      if (url.pathname.endsWith('/med-1') && init?.method === 'DELETE') {
        medication = { ...medication!, active: false }
        return response({ medication })
      }
      if (url.pathname.endsWith('/med-1/logs')) return response({ medication: medication ?? baseMedication, logs: [] })
      return response({ message: 'Not found.' }, 404)
    })
    globalThis.fetch = fetchMock as typeof fetch
    window.history.replaceState({}, '', '/elder/medications')
    render(<App />)

    await screen.findByRole('heading', { name: 'Medication Management' })
    await user.type(await screen.findByLabelText('Medicine name'), 'Vitamin D')
    await user.type(screen.getByLabelText('Dosage'), '1 tablet')
    await user.click(screen.getByRole('button', { name: 'Add medication' }))
    expect(await screen.findByText('Medication added successfully.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Mark as Taken' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mark as Taken' }))
    expect(await screen.findByText('✓ Taken')).toBeInTheDocument()
    expect(await screen.findByText('Medication marked as taken.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const dosage = screen.getByLabelText('Dosage')
    await user.clear(dosage)
    await user.type(dosage, '2 tablets')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Medication updated successfully.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Deactivate' }))
    expect(screen.getByRole('alertdialog', { name: 'Stop Vitamin D' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm deactivation' }))
    expect(await screen.findByText('Medication stopped. Its history has been kept.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Past Medicines' })).toBeInTheDocument()
  })

  it('shows empty and loading-error states', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/auth/me')) return response({ user: elderUser })
      if (url.pathname.endsWith('/medications/today')) return response({ medications: [] })
      if (url.pathname.endsWith('/medications')) return response({ medications: [] })
      return response({ message: 'Not found.' }, 404)
    })
    globalThis.fetch = fetchMock as typeof fetch
    window.history.replaceState({}, '', '/elder/medications')
    render(<App />)
    expect(await screen.findByText('No medications added yet.')).toBeInTheDocument()
    cleanup()

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/auth/me')) return response({ user: elderUser })
      return response({ message: 'Service unavailable.' }, 503)
    }) as typeof fetch
    window.history.replaceState({}, '', '/elder/medications')
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load medications. Please try again.')
  })

  it('requires medicine name, dosage, a time, and a valid schedule before submit', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/auth/me')) return response({ user: elderUser })
      if (url.pathname.endsWith('/medications/today')) return response({ medications: [] })
      if (url.pathname.endsWith('/medications')) return response({ medications: [] })
      return response({ message: 'Not found.' }, 404)
    })
    globalThis.fetch = fetchMock as typeof fetch
    window.history.replaceState({}, '', '/elder/medications')
    render(<App />)
    expect(await screen.findByText('No medications added yet.')).toBeInTheDocument()
    expect(screen.getByLabelText('Medicine name')).toBeRequired()
    expect(screen.getByLabelText('Dosage')).toBeRequired()
    expect(screen.getByLabelText('Time 1')).toBeRequired()
    await user.click(screen.getByRole('button', { name: 'Add medication' }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('announces medication loading until the backend responds', async () => {
    const pending: Array<(value: Response) => void> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/auth/me')) return response({ user: elderUser })
      return new Promise<Response>((resolve) => pending.push(resolve))
    })
    globalThis.fetch = fetchMock as typeof fetch
    window.history.replaceState({}, '', '/elder/medications')
    render(<App />)
    expect(await screen.findByRole('status', { name: 'Loading content' })).toBeInTheDocument()
    await waitFor(() => expect(pending).toHaveLength(2))
    pending.forEach((resolve) => resolve(response({ medications: [] })))
    expect(await screen.findByText('No medications added yet.')).toBeInTheDocument()
  })

  it('shows connected family the elder schedule in read-only mode', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/auth/me')) return response({ user: familyUser })
      if (url.pathname.endsWith('/family/elders/elder-1/medications')) return response({
        elder: { id: 'elder-1', name: 'John Elder' }, medications: [baseMedication], today: [eventFor(baseMedication, 'MISSED')],
      })
      return response({ message: 'Not found.' }, 404)
    })
    globalThis.fetch = fetchMock as typeof fetch
    window.history.replaceState({}, '', '/family/elders/elder-1/medications')
    render(<App />)

    expect(await screen.findByRole('heading', { name: "John Elder's Medicines" })).toBeInTheDocument()
    expect(screen.getByText('! Missed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connections' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit|deactivate|mark as taken/i })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/family/elders/elder-1/medications'), expect.anything())
  })

  it('keeps family members out of the elder medication route', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/auth/me')) return response({ user: familyUser })
      return response({ message: 'Not found.' }, 404)
    })
    globalThis.fetch = fetchMock as typeof fetch
    window.history.replaceState({}, '', '/elder/medications')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Medication Management' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/medications'))).toBe(false)
  })
})
