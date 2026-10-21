require('dotenv').config()

const bcrypt = require('bcryptjs')
const prisma = require('../src/lib/prisma')

async function main() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE } = process.env
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8 || Buffer.byteLength(ADMIN_PASSWORD, 'utf8') > 72) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and an 8-character minimum ADMIN_PASSWORD of at most 72 UTF-8 bytes.')
  }

  const email = ADMIN_EMAIL.trim().toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new Error('An account already exists for ADMIN_EMAIL.')

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
  await prisma.user.create({
    data: {
      name: ADMIN_NAME.trim(),
      email,
      phone: ADMIN_PHONE || null,
      passwordHash,
      role: 'ADMIN',
    },
  })
  console.log(`Admin account created for ${email}.`)
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
