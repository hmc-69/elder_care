const { z } = require('zod')

const passwordText = z.string()
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be 72 UTF-8 bytes or fewer.')
const newPassword = passwordText.min(8, 'Password must be at least 8 characters.')
const email = z.string().trim().email('Enter a valid email address.').max(254).transform((value) => value.toLowerCase())
const phone = z.string().trim().regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid phone number.').or(z.literal('')).nullable().optional()

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
  email,
  phone,
  password: newPassword,
  role: z.enum(['ELDER', 'FAMILY'], { message: 'Role must be ELDER or FAMILY.' }),
}).strict()

const loginSchema = z.object({ email, password: passwordText.min(1, 'Password is required.') }).strict()

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone,
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide a name or phone number to update.')

const changePasswordSchema = z.object({
  currentPassword: passwordText.min(1, 'Current password is required.'),
  newPassword,
}).strict()

const connectionRequestSchema = z.object({
  elderId: z.string().trim().min(1).max(191),
  relationship: z.enum(['Son', 'Daughter', 'Spouse', 'Parent', 'Sibling', 'Guardian', 'Relative', 'Caregiver', 'Other']),
}).strict()

const searchEldersSchema = z.string().trim().min(2, 'Search query must contain at least 2 characters.').max(80)
const connectionIdSchema = z.string().trim().min(1).max(191)
const medicationIdSchema = z.string().trim().min(1).max(191)
const medicationFrequency = z.enum(['ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'CUSTOM'])
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.').refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Enter a valid date.')
const medicationTimes = z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, such as 08:00.'))
  .min(1, 'Add at least one scheduled time.').max(8, 'A medication can have at most 8 daily times.')
  .refine((times) => new Set(times).size === times.length, 'Scheduled times must be unique.')
const medicationCreateSchema = z.object({
  name: z.string().trim().min(1, 'Medicine name is required.').max(120),
  dosage: z.string().trim().min(1, 'Dosage is required.').max(80),
  instructions: z.string().trim().max(500).nullable().optional(),
  frequency: medicationFrequency,
  times: medicationTimes,
  startDate: dateOnly,
  endDate: dateOnly.nullable().optional(),
}).strict().refine((value) => !value.endDate || value.endDate >= value.startDate, {
  message: 'End date cannot be before start date.', path: ['endDate'],
})
const medicationUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  dosage: z.string().trim().min(1).max(80).optional(),
  instructions: z.string().trim().max(500).nullable().optional(),
  frequency: medicationFrequency.optional(),
  times: medicationTimes.optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.nullable().optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.')
  .refine((value) => !value.endDate || !value.startDate || value.endDate >= value.startDate, {
    message: 'End date cannot be before start date.', path: ['endDate'],
  })
const checkInHistorySchema = z.object({ from: dateOnly.optional(), to: dateOnly.optional() }).strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'The start date must not be after the end date.', path: ['from'],
  })
const checkInCompletionSchema = z.object({ period: z.enum(['MORNING', 'NIGHT']) }).strict()

const sosIdSchema = z.string().trim().min(1).max(191)
const sosTriggerSchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
}).strict().optional().default({})
const sosCancelSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
}).strict().optional().default({})
const sosResolveSchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
}).strict().optional().default({})
const sosHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
}).strict()

const conversationIdSchema = z.string().trim().min(1).max(191)
const chatMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty.').max(2000, 'Message cannot exceed 2000 characters.'),
  conversationId: z.string().trim().min(1).max(191).optional().nullable(),
}).strict()
const conversationUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty.').max(150, 'Title cannot exceed 150 characters.'),
}).strict()
const conversationHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
}).strict()

module.exports = {
  registerSchema,
  loginSchema,
  profileSchema,
  changePasswordSchema,
  connectionRequestSchema,
  searchEldersSchema,
  connectionIdSchema,
  medicationIdSchema,
  medicationCreateSchema,
  medicationUpdateSchema,
  checkInHistorySchema,
  checkInCompletionSchema,
  sosIdSchema,
  sosTriggerSchema,
  sosCancelSchema,
  sosResolveSchema,
  sosHistoryQuerySchema,
  conversationIdSchema,
  chatMessageSchema,
  conversationUpdateSchema,
  conversationHistoryQuerySchema,
}

