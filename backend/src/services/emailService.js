const prisma = require('../lib/prisma')

const RESEND_EMAILS_URL = 'https://api.resend.com/emails'
const REQUEST_TIMEOUT_MS = 8000

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildSosEmail({ elderName, triggeredAt, frontendOrigin }) {
  const safeName = escapeHtml(elderName || 'A connected elder')
  const time = new Date(triggeredAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  })
  const safeTime = escapeHtml(time)
  const dashboardUrl = `${(frontendOrigin || 'http://localhost:5173').replace(/\/$/, '')}/`

  return {
    subject: `Emergency SOS alert — ${elderName || 'Connected elder'}`,
    text: [
      'ELDERCARE CONNECT — EMERGENCY SOS ALERT',
      '',
      `${elderName || 'A connected elder'} has triggered an SOS alert.`,
      `Time: ${time}`,
      '',
      'Please check on them immediately and contact local emergency services if needed.',
      'ElderCare Connect does not contact emergency services automatically.',
      `Open ElderCare Connect: ${dashboardUrl}`,
    ].join('\n'),
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f4ece1;font-family:Arial,sans-serif;color:#252525"><main style="max-width:560px;margin:auto;background:#fff;padding:28px;border-radius:12px"><p style="margin-top:0;color:#a12622;font-weight:700;letter-spacing:.08em">EMERGENCY SOS ALERT</p><h1 style="font-size:24px">Please check on your connected elder</h1><p><strong>${safeName}</strong> has triggered an SOS alert.</p><p><strong>Time:</strong> ${safeTime}</p><p>Please check on them immediately and contact local emergency services if needed.</p><p style="font-size:13px;color:#555">ElderCare Connect does not contact emergency services automatically.</p><p style="margin-top:28px"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;background:#4f664c;color:#fff;text-decoration:none;border-radius:6px">Open ElderCare Connect</a></p></main></body></html>`,
  }
}

/**
 * Sends SOS emails to accepted family connections only.
 * Email failures are isolated per recipient and never throw into the SOS workflow.
 * Configure RESEND_API_KEY and RESEND_FROM_EMAIL on the backend to enable delivery.
 */
async function sendSosEmails({ eventId, elderId, elderName, triggeredAt }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    console.info('[email] SOS email delivery skipped: Resend is not configured.')
    return { sent: 0, failed: 0, skipped: true }
  }

  let connections
  try {
    connections = await prisma.familyConnection.findMany({
      where: { elderId, status: 'ACCEPTED' },
      include: {
        family: { select: { id: true, name: true, email: true } },
      },
    })
  } catch (error) {
    console.error('[email] Could not load accepted family connections for SOS event:', eventId, error?.code || error?.name || 'UnknownError')
    return { sent: 0, failed: 1, skipped: false }
  }

  const recipients = connections
    .map((connection) => connection.family)
    .filter((family) => family && family.email)

  if (!recipients.length) return { sent: 0, failed: 0, skipped: false }

  const email = buildSosEmail({
    elderName,
    triggeredAt,
    frontendOrigin: process.env.FRONTEND_ORIGIN,
  })

  const outcomes = await Promise.allSettled(recipients.map(async (family) => {
    const response = await fetch(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Stable per event/recipient so retries do not create duplicate provider requests.
        'Idempotency-Key': `sos-${eventId}-${family.id}`,
      },
      body: JSON.stringify({
        from,
        to: [family.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const error = new Error(`Resend rejected SOS email with HTTP ${response.status}`)
      error.status = response.status
      error.providerMessage = typeof body.message === 'string' ? body.message : undefined
      throw error
    }

    return family.id
  }))

  let sent = 0
  let failed = 0
  outcomes.forEach((outcome) => {
    if (outcome.status === 'fulfilled') {
      sent += 1
    } else {
      failed += 1
      // Do not log email addresses or API credentials.
      console.error('[email] SOS email failed for event:', eventId, outcome.reason?.status || outcome.reason?.name || 'UnknownError')
    }
  })

  console.info(`[email] SOS email requests accepted by Resend: ${sent}; failed: ${failed}; event: ${eventId}`)
  return { sent, failed, skipped: false }
}

module.exports = { buildSosEmail, sendSosEmails }
