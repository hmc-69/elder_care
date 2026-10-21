/**
 * In-memory sliding-window rate limiter for sensitive authentication and user routes.
 * In automated test environments (NODE_ENV === 'test'), rate limits are bypassed
 * unless explicitly enabled with x-test-rate-limit header.
 */
function createRateLimiter({
  windowMs = 60 * 1000,
  max = 10,
  message = 'Too many attempts. Please try again later.',
} = {}) {
  const hits = new Map()

  // Periodic cleanup
  const interval = setInterval(() => {
    const now = Date.now()
    for (const [key, timestamps] of hits.entries()) {
      const valid = timestamps.filter((t) => now - t < windowMs)
      if (valid.length === 0) hits.delete(key)
      else hits.set(key, valid)
    }
  }, windowMs)
  if (interval.unref) interval.unref()

  return function rateLimitMiddleware(req, res, next) {
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next()
    }

    const key = req.auth?.userId || req.ip || req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const timestamps = (hits.get(key) || []).filter((t) => now - t < windowMs)

    if (timestamps.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000))
      return res.status(429).json({ message })
    }

    timestamps.push(now)
    hits.set(key, timestamps)
    next()
  }
}

module.exports = { createRateLimiter }
