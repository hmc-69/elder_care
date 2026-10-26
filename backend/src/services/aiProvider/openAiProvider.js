const { AIProviderError } = require('./errors')

class OpenAIProvider {
  constructor(config = {}) {
    this.name = 'openai'
    this.apiKey = config.apiKey || process.env.AI_API_KEY
    this.model = config.model || process.env.AI_MODEL || 'gpt-4o-mini'
    this.timeoutMs = Number(config.timeoutMs || process.env.AI_TIMEOUT_MS || 15000)
  }

  async generateCompletion({ messages, systemInstruction }) {
    if (!this.apiKey) {
      throw new AIProviderError({
        message: 'The AI assistant is not properly configured. Please contact support.',
        status: 503,
        code: 'PROVIDER_MISSING_API_KEY',
      })
    }

    const endpoint = 'https://api.openai.com/v1/chat/completions'

    const chatMessages = []
    if (systemInstruction) {
      chatMessages.push({ role: 'system', content: systemInstruction })
    }
    for (const msg of messages) {
      chatMessages.push({
        role: msg.role === 'ASSISTANT' ? 'assistant' : 'user',
        content: msg.content,
      })
    }

    const payload = {
      model: this.model,
      messages: chatMessages,
      max_tokens: 800,
      temperature: 0.7,
    }

    let controller
    let timeoutId
    try {
      controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 429) {
          throw new AIProviderError({
            message: 'The AI assistant is currently experiencing high demand. Please try again in a few moments.',
            status: 429,
            code: 'PROVIDER_RATE_LIMIT',
          })
        }

        if (response.status === 401 || response.status === 403) {
          throw new AIProviderError({
            message: 'AI assistant service authorization failed. Please contact your administrator.',
            status: 503,
            code: 'PROVIDER_AUTH_ERROR',
          })
        }

        throw new AIProviderError({
          message: 'The AI assistant service encountered an error. Please try again shortly.',
          status: 502,
          code: 'PROVIDER_ERROR',
        })
      }

      const data = await response.json()
      const text = data.choices?.[0]?.message?.content

      if (!text || typeof text !== 'string') {
        throw new AIProviderError({
          message: 'Received an invalid response from the AI assistant service.',
          status: 502,
          code: 'PROVIDER_INVALID_RESPONSE',
        })
      }

      return {
        content: text.trim(),
        model: this.model,
      }
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId)
      if (error instanceof AIProviderError) throw error
      if (error.name === 'AbortError') {
        throw new AIProviderError({
          message: 'The AI assistant timed out while generating a response. Please try asking again.',
          status: 504,
          code: 'PROVIDER_TIMEOUT',
        })
      }
      throw new AIProviderError({
        message: 'Could not reach the AI assistant service. Please check your network connection.',
        status: 503,
        code: 'PROVIDER_NETWORK_ERROR',
      })
    }
  }
}

module.exports = { OpenAIProvider }
