class AIProviderError extends Error {
  constructor({ message, status = 503, code = 'AI_PROVIDER_ERROR', details = null }) {
    super(message || 'The AI assistant is temporarily unavailable. Please try again shortly.')
    this.name = 'AIProviderError'
    this.status = status
    this.code = code
    this.details = details
  }
}

module.exports = { AIProviderError }
