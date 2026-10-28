const nodemailer = require('nodemailer')
const prisma = require('../lib/prisma')

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildSosEmail({ elderName, triggeredAt, frontendOrigin }) {
  const displayName = elderName || 'A connected elder'
  const safeName = escapeHtml(displayName)
  const time = new Date(triggeredAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  })
  const safeTime = escapeHtml(time)
  const dashboardUrl = `${(frontendOrigin || 'http://localhost:5173').replace(/\/$/, '')}/`

  return {
    subject: `Emergency SOS alert — ${displayName}`,
    text: [
      'ELDERCARE CONNECT — EMERGENCY SOS ALERT',
      '',
      `${displayName} has triggered an SOS alert.`,
      `Time: ${time}`,
      '',
      'Please check on them immediately and contact local emergency services if needed.',
      'ElderCare Connect does not contact emergency services automatically.',
      `Open ElderCare Connect: ${dashboardUrl}`,
    ].join('\n'),
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f4ece1;font-family:Arial,sans-serif;color:#252525"><main style="max-width:560px;margin:auto;background:#fff;padding:28px;border-radius:12px"><p style="margin-top:0;color:#a12622;font-weight:700;letter-spacing:.08em">ELDERCARE CONNECT · EMERGENCY SOS ALERT</p><h1 style="font-size:24px">Please check on your connected elder</h1><p><strong>${safeName}</strong> has triggered an SOS alert.</p><p><strong>Time:</strong> ${safeTime}</p><p>Please check on them immediately and contact local emergency services if needed.</p><p style="font-size:13px;color:#555">ElderCare Connect does not contact emergency services automatically.</p><p style="margin-top:28px"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;background:#4f664c;color:#fff;text-decoration:none;border-radius:6px">Open ElderCare Connect</a></p></main></body></html>`,
  }
}

function createEmailService({ database = prisma, mailTransport, env = process.env, logger = console } = {}) {
  const configuredTransport = mailTransport || (env.EMAIL_USER && env.EMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: env.EMAIL_USER, pass: env.EMAIL_APP_PASSWORD },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
      })
    : null)

  async function sendSosEmails({ eventId, elderId, elderName, triggeredAt }) {
    if (!configuredTransport || !env.EMAIL_USER) {
      logger.info('[email] SOS email delivery skipped: Gmail SMTP is not configured.')
      return { sent: 0, failed: 0, skipped: true }
    }

    let connections
    try {
      connections = await database.familyConnection.findMany({
        where: { elderId, status: 'ACCEPTED' },
        include: { family: { select: { id: true, name: true, email: true } } },
      })
    } catch (error) {
      logger.error('[email] Could not load accepted family connections for SOS event:', eventId, error?.code || error?.name || 'UnknownError')
      return { sent: 0, failed: 1, skipped: false }
    }

    const recipients = connections
      .map((connection) => connection.family)
      .filter((family) => family && typeof family.email === 'string' && family.email.trim())
    if (!recipients.length) return { sent: 0, failed: 0, skipped: false }

    const email = buildSosEmail({ elderName, triggeredAt, frontendOrigin: env.FRONTEND_ORIGIN })
    const senderName = String(env.EMAIL_FROM_NAME || 'ElderCare Connect').replace(/[\r\n]/g, '').trim()
    const from = { name: senderName || 'ElderCare Connect', address: env.EMAIL_USER }
    const outcomes = await Promise.allSettled(recipients.map((family) => configuredTransport.sendMail({
      from,
      to: family.email.trim(),
      subject: email.subject,
      text: email.text,
      html: email.html,
    })))

    let sent = 0
    let failed = 0
    outcomes.forEach((outcome) => {
      if (outcome.status === 'fulfilled') sent += 1
      else {
        failed += 1
        logger.error('[email] SOS email submission failed for event:', eventId, outcome.reason?.code || outcome.reason?.name || 'UnknownError')
      }
    })
    logger.info(`[email] SOS email submissions accepted by SMTP: ${sent}; failed: ${failed}; event: ${eventId}`)
    return { sent, failed, skipped: false }
  }

  return { sendSosEmails }
}

const defaultService = createEmailService()

module.exports = { buildSosEmail, createEmailService, sendSosEmails: defaultService.sendSosEmails }
