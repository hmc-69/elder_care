require('dotenv').config()

const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const app = require('../src/index')
const prisma = require('../src/lib/prisma')

async function main() {
  const suffix = randomUUID()
  const password = 'ConnectionSmokePass123'
  const testUsers = []
  let server

  try {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const baseUrl = `http://127.0.0.1:${server.address().port}`

    async function api(path, { method = 'GET', body, token } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      return { response, data: await response.json() }
    }

    async function register(role, label) {
      const email = `${label}.${suffix}@example.test`
      const result = await api('/api/auth/register', {
        method: 'POST',
        body: { name: `Smoke ${label}`, email, password, role },
      })
      assert.equal(result.response.status, 201)
      testUsers.push(result.data.user.id)
      const login = await api('/api/auth/login', { method: 'POST', body: { email, password } })
      assert.equal(login.response.status, 200)
      return { user: result.data.user, token: login.data.token }
    }

    const family = await register('FAMILY', 'family')
    const elder = await register('ELDER', 'elder')
    const otherFamily = await register('FAMILY', 'other-family')
    const otherElder = await register('ELDER', 'other-elder')

    const search = await api(`/api/family/elders/search?query=${encodeURIComponent('Smoke elder')}`, { token: family.token })
    assert.equal(search.response.status, 200)
    assert.ok(search.data.users.some((user) => user.id === elder.user.id))
    assert.ok(search.data.users.every((user) => !('email' in user) && !('passwordHash' in user)))

    const sent = await api('/api/connections', {
      method: 'POST', token: family.token, body: { elderId: elder.user.id, relationship: 'Daughter' },
    })
    assert.equal(sent.response.status, 201)
    assert.equal(sent.data.connection.status, 'PENDING')
    const connectionId = sent.data.connection.id
    assert.equal((await api('/api/connections', { method: 'POST', token: family.token, body: { elderId: elder.user.id, relationship: 'Daughter' } })).response.status, 409)
    assert.equal((await api('/api/connections', { method: 'POST', token: elder.token, body: { elderId: otherElder.user.id, relationship: 'Parent' } })).response.status, 403)
    assert.equal((await api(`/api/family/elders/${elder.user.id}`, { token: otherFamily.token })).response.status, 404)

    const requests = await api('/api/connections/requests', { token: elder.token })
    assert.equal(requests.response.status, 200)
    assert.equal(requests.data[0].family.id, family.user.id)
    assert.equal((await api(`/api/connections/${connectionId}/accept`, { method: 'PUT', token: otherElder.token })).response.status, 404)
    assert.equal((await api(`/api/connections/${connectionId}`, { token: otherFamily.token })).response.status, 404)

    const accepted = await api(`/api/connections/${connectionId}/accept`, { method: 'PUT', token: elder.token })
    assert.equal(accepted.response.status, 200)
    assert.equal(accepted.data.connection.status, 'ACCEPTED')
    const familyProfile = await api(`/api/family/elders/${elder.user.id}`, { token: family.token })
    assert.equal(familyProfile.response.status, 200)
    assert.equal(familyProfile.data.elder.name, elder.user.name)
    assert.equal('passwordHash' in familyProfile.data.elder, false)
    assert.equal((await api(`/api/family/elders/${elder.user.id}`, { token: otherFamily.token })).response.status, 404)
    assert.equal((await api('/api/connections/family', { token: family.token })).data[0].status, 'ACCEPTED')
    assert.equal((await api('/api/connections/elder', { token: elder.token })).data[0].status, 'ACCEPTED')

    const todayCheckIn = await api('/api/checkins/today', { token: elder.token })
    assert.equal(todayCheckIn.response.status, 200, JSON.stringify(todayCheckIn.data))
    assert.equal(todayCheckIn.data.checkIns.length, 2)
    assert.ok(todayCheckIn.data.checkIns.every((item) => ['MORNING', 'NIGHT'].includes(item.period)))
    const familyCheckIns = await api(`/api/family/elders/${elder.user.id}/checkins`, { token: family.token })
    assert.equal(familyCheckIns.response.status, 200)
    assert.equal(familyCheckIns.data.elder.name, elder.user.name)
    assert.equal(familyCheckIns.data.today.length, 2)
    assert.equal((await api(`/api/family/elders/${elder.user.id}/checkins`, { token: otherFamily.token })).response.status, 404)
    assert.equal((await api('/api/checkins/today', { method: 'POST', token: family.token })).response.status, 403)
    const completedCheckIn = await api('/api/checkins/today', { method: 'POST', token: elder.token, body: { period: 'MORNING' } })
    assert.equal(completedCheckIn.response.status, 200)
    assert.equal(completedCheckIn.data.checkIn.status, 'COMPLETED')
    assert.ok(completedCheckIn.data.checkIn.checkedInAt)
    assert.equal((await api('/api/checkins/today', { method: 'POST', token: elder.token, body: { period: 'MORNING' } })).response.status, 409)
    const completedNight = await api('/api/checkins/today', { method: 'POST', token: elder.token, body: { period: 'NIGHT' } })
    assert.equal(completedNight.response.status, 200)
    assert.equal(completedNight.data.checkIn.period, 'NIGHT')
    assert.equal(completedNight.data.checkIn.status, 'COMPLETED')
    assert.equal((await api('/api/checkins/today', { method: 'POST', token: elder.token, body: { period: 'NIGHT' } })).response.status, 409)
    assert.equal((await api(`/api/checkins/${completedCheckIn.data.checkIn.id}`, { token: otherElder.token })).response.status, 404)
    const checkInHistory = await api(`/api/checkins/history?from=${todayCheckIn.data.checkIns[0].date}&to=${todayCheckIn.data.checkIns[0].date}`, { token: elder.token })
    assert.equal(checkInHistory.response.status, 200)
    assert.equal(checkInHistory.data.history.length, 2)
    assert.ok(checkInHistory.data.history.every((item) => item.status === 'COMPLETED'))
    assert.equal(await prisma.checkIn.count({ where: { elderId: elder.user.id, checkinDate: new Date(`${todayCheckIn.data.checkIns[0].date}T00:00:00.000Z`) } }), 2)

    // Module 6 live MySQL SOS tests
    assert.equal((await api('/api/sos', { method: 'POST', token: family.token })).response.status, 403)
    const elderSos = await api('/api/sos', { method: 'POST', token: elder.token, body: { notes: 'Live test emergency' } })
    assert.equal(elderSos.response.status, 201)
    assert.equal(elderSos.data.event.status, 'ACTIVE')
    const sosId = elderSos.data.event.id
    assert.equal((await api('/api/sos', { method: 'POST', token: elder.token })).response.status, 409)
    assert.equal((await api('/api/sos/active', { token: elder.token })).data.event.id, sosId)
    assert.equal((await api(`/api/family/elders/${elder.user.id}/sos`, { token: otherFamily.token })).response.status, 404)
    const familySosView = await api(`/api/family/elders/${elder.user.id}/sos`, { token: family.token })
    assert.equal(familySosView.response.status, 200)
    assert.equal(familySosView.data.activeEvent.id, sosId)
    const acknowledgedSos = await api(`/api/sos/${sosId}/acknowledge`, { method: 'POST', token: family.token })
    assert.equal(acknowledgedSos.response.status, 200)
    assert.equal(acknowledgedSos.data.event.status, 'ACKNOWLEDGED')
    const resolvedSos = await api(`/api/sos/${sosId}/resolve`, { method: 'POST', token: family.token, body: { notes: 'All resolved in live check' } })
    assert.equal(resolvedSos.response.status, 200)
    assert.equal(resolvedSos.data.event.status, 'RESOLVED')

    const elderSos2 = await api('/api/sos', { method: 'POST', token: elder.token })
    assert.equal(elderSos2.response.status, 201)
    const cancelledSos = await api(`/api/sos/${elderSos2.data.event.id}/cancel`, { method: 'POST', token: elder.token, body: { reason: 'False alarm test' } })
    assert.equal(cancelledSos.response.status, 200)
    assert.equal(cancelledSos.data.event.status, 'CANCELLED')

    const timezone = process.env.APP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const dateParts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
    const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
    const nowMinute = Number(dateValues.hour) * 60 + Number(dateValues.minute)
    const scheduledMinute = Math.max(0, nowMinute - 2)
    const dueTime = `${String(Math.floor(scheduledMinute / 60)).padStart(2, '0')}:${String(scheduledMinute % 60).padStart(2, '0')}`
    const today = `${dateValues.year}-${dateValues.month}-${dateValues.day}`
    assert.equal((await api('/api/medications', { method: 'POST', token: family.token, body: {} })).response.status, 403)
    const invalidMedication = await api('/api/medications', { method: 'POST', token: elder.token, body: {
      name: 'Smoke Medicine', dosage: '1 tablet', frequency: 'TWICE_DAILY', times: [dueTime], startDate: today,
    } })
    assert.equal(invalidMedication.response.status, 400)
    const medicationResult = await api('/api/medications', { method: 'POST', token: elder.token, body: {
      name: 'Smoke Medicine', dosage: '1 tablet', instructions: 'After food', frequency: 'ONCE_DAILY', times: [dueTime], startDate: today,
    } })
    assert.equal(medicationResult.response.status, 201)
    const medicationId = medicationResult.data.medication.id
    assert.equal((await api('/api/medications', { token: elder.token })).data.medications.length, 1)
    assert.equal((await api('/api/medications', { token: otherElder.token })).data.medications.length, 0)
    const todaysMedication = await api('/api/medications/today', { token: elder.token })
    assert.equal(todaysMedication.response.status, 200)
    assert.equal(todaysMedication.data.medications[0].status, 'DUE')
    const familyMedicationView = await api(`/api/family/elders/${elder.user.id}/medications`, { token: family.token })
    assert.equal(familyMedicationView.response.status, 200)
    assert.equal(familyMedicationView.data.today[0].status, 'DUE')
    assert.equal((await api(`/api/family/elders/${elder.user.id}/medications`, { token: otherFamily.token })).response.status, 404)
    assert.equal((await api(`/api/medications/${medicationId}`, { token: otherFamily.token })).response.status, 404)
    assert.equal((await api(`/api/medications/${medicationId}`, { method: 'PUT', token: family.token, body: { dosage: '2 tablets' } })).response.status, 403)
    assert.equal((await api(`/api/medications/${medicationId}/taken`, { method: 'POST', token: family.token })).response.status, 403)
    const taken = await api(`/api/medications/${medicationId}/taken`, { method: 'POST', token: elder.token })
    assert.equal(taken.response.status, 200)
    assert.equal(taken.data.event.status, 'TAKEN')
    assert.equal((await api(`/api/medications/${medicationId}/taken`, { method: 'POST', token: elder.token })).response.status, 409)
    assert.equal((await api(`/api/medications/${medicationId}/logs`, { token: family.token })).data.logs[0].status, 'TAKEN')
    const changedMedication = await api(`/api/medications/${medicationId}`, { method: 'PUT', token: elder.token, body: { dosage: '2 tablets' } })
    assert.equal(changedMedication.data.medication.dosage, '2 tablets')
    assert.equal((await api(`/api/medications/${medicationId}`, { method: 'DELETE', token: elder.token })).data.medication.active, false)
    assert.equal((await api(`/api/medications/${medicationId}/logs`, { token: elder.token })).data.logs.length, 1)
    assert.equal((await api('/api/medications/today', { token: elder.token })).data.medications.length, 0)

    const removed = await api(`/api/connections/${connectionId}`, { method: 'DELETE', token: elder.token })
    assert.equal(removed.response.status, 200)
    assert.equal(removed.data.connection.status, 'BLOCKED')
    assert.equal((await api(`/api/family/elders/${elder.user.id}`, { token: family.token })).response.status, 404)
    assert.equal((await api(`/api/family/elders/${elder.user.id}/checkins`, { token: family.token })).response.status, 404)

    const rejectedRequest = await api('/api/connections', {
      method: 'POST', token: otherFamily.token, body: { elderId: otherElder.user.id, relationship: 'Caregiver' },
    })
    assert.equal(rejectedRequest.response.status, 201)
    const rejected = await api(`/api/connections/${rejectedRequest.data.connection.id}/reject`, { method: 'PUT', token: otherElder.token })
    assert.equal(rejected.response.status, 200)
    assert.equal(rejected.data.connection.status, 'REJECTED')
    assert.equal((await api(`/api/family/elders/${otherElder.user.id}`, { token: otherFamily.token })).response.status, 404)

    assert.equal((await api(`/api/family/elders/${elder.user.id}/medications`, { token: family.token })).response.status, 404)

    // Module 7 live MySQL AI Assistant tests
    const chat1 = await api('/api/assistant/chat', {
      method: 'POST',
      token: elder.token,
      body: { message: 'Hello assistant, what daily check-ins do I have?' },
    })
    assert.equal(chat1.response.status, 200)
    assert.ok(chat1.data.conversationId)
    assert.ok(chat1.data.message.content)
    const convId = chat1.data.conversationId

    // Conversation lists
    const convList = await api('/api/assistant/conversations', { token: elder.token })
    assert.equal(convList.response.status, 200)
    assert.equal(convList.data.conversations.length, 1)

    // Single conversation view
    const convView = await api(`/api/assistant/conversations/${convId}`, { token: elder.token })
    assert.equal(convView.response.status, 200)
    assert.equal(convView.data.conversation.messages.length, 2)

    // Other user cannot view it
    assert.equal((await api(`/api/assistant/conversations/${convId}`, { token: family.token })).response.status, 404)

    // Update title
    const patchedConv = await api(`/api/assistant/conversations/${convId}`, {
      method: 'PATCH',
      token: elder.token,
      body: { title: 'Smoke Test Chat' },
    })
    assert.equal(patchedConv.response.status, 200)
    assert.equal(patchedConv.data.conversation.title, 'Smoke Test Chat')

    // Delete conversation
    const deletedConv = await api(`/api/assistant/conversations/${convId}`, {
      method: 'DELETE',
      token: elder.token,
    })
    assert.equal(deletedConv.response.status, 200)
    assert.equal((await api(`/api/assistant/conversations/${convId}`, { token: elder.token })).response.status, 404)

    console.log('Live MySQL Module 3-7 flow passed: connections, medication access/logs, daily check-in, duplicate prevention, family read-only access, SOS emergency, and AI assistant.')
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (testUsers.length > 0) {
      await prisma.chatMessage.deleteMany({ where: { conversation: { userId: { in: testUsers } } } })
      await prisma.conversation.deleteMany({ where: { userId: { in: testUsers } } })
      await prisma.emergencyEvent.deleteMany({ where: { elderId: { in: testUsers } } })
      await prisma.checkIn.deleteMany({ where: { elderId: { in: testUsers } } })
      await prisma.medicationLog.deleteMany({ where: { medication: { elderId: { in: testUsers } } } })
      await prisma.medication.deleteMany({ where: { elderId: { in: testUsers } } })
      await prisma.familyConnection.deleteMany({ where: { OR: [{ familyId: { in: testUsers } }, { elderId: { in: testUsers } }] } })
      await prisma.user.deleteMany({ where: { id: { in: testUsers } } })
    }
    await prisma.$disconnect()
  }

}

main().catch((error) => {
  console.error('Live MySQL connection flow failed:', error.message)
  process.exitCode = 1
})
