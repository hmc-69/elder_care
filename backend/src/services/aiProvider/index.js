const { GeminiProvider } = require('./geminiProvider')
const { OpenAIProvider } = require('./openAiProvider')
const { MockProvider } = require('./mockProvider')
const { AIProviderError } = require('./errors')

let activeProviderInstance = null

function getAIProvider() {
  if (activeProviderInstance) {
    return activeProviderInstance
  }

  const providerName = (process.env.AI_PROVIDER || '').toLowerCase().trim()

  if (providerName === 'mock' || process.env.NODE_ENV === 'test') {
    activeProviderInstance = new MockProvider()
    return activeProviderInstance
  }

  if (providerName === 'openai') {
    activeProviderInstance = new OpenAIProvider()
    return activeProviderInstance
  }

  // Default to Gemini
  if (providerName === 'gemini' || !providerName) {
    activeProviderInstance = new GeminiProvider()
    return activeProviderInstance
  }

  throw new AIProviderError({
    message: `Unsupported AI provider configured: "${providerName}".`,
    status: 500,
    code: 'INVALID_AI_PROVIDER',
  })
}

function setAIProvider(provider) {
  activeProviderInstance = provider
}

function resetAIProvider() {
  activeProviderInstance = null
}

module.exports = {
  getAIProvider,
  setAIProvider,
  resetAIProvider,
  GeminiProvider,
  OpenAIProvider,
  MockProvider,
  AIProviderError,
}
