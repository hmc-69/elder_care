const { AIProviderError } = require('./errors')

class MockProvider {
  constructor() {
    this.name = 'mock'
    this.model = 'mock-eldercare-assistant-v1'
    this.injectedError = null
    this.injectedResponse = null
  }

  setMockFailure(error) {
    this.injectedError = error
  }

  setMockResponse(text) {
    this.injectedResponse = text
  }

  reset() {
    this.injectedError = null
    this.injectedResponse = null
  }

  async generateCompletion({ messages, systemInstruction }) {
    if (this.injectedError) {
      if (this.injectedError instanceof AIProviderError) {
        throw this.injectedError
      }
      throw new AIProviderError({
        message: this.injectedError.message || 'Mock provider error',
        status: this.injectedError.status || 503,
        code: this.injectedError.code || 'MOCK_ERROR',
      })
    }

    if (this.injectedResponse) {
      return {
        content: this.injectedResponse,
        model: this.model,
      }
    }

    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || ''

    // 1. Emergency detection
    if (
      lastMessage.includes('emergency') ||
      lastMessage.includes('chest pain') ||
      lastMessage.includes('heart attack') ||
      lastMessage.includes('cannot breathe') ||
      lastMessage.includes('can\'t breathe') ||
      lastMessage.includes('shortness of breath') ||
      lastMessage.includes('fallen') ||
      lastMessage.includes('fell and can\'t get up') ||
      lastMessage.includes('bleeding heavily') ||
      lastMessage.includes('unconscious')
    ) {
      return {
        content:
          'Please stop and seek emergency help immediately. Call your local emergency number (such as 911 or 112) right away, or press the red SOS emergency button in the ElderCare Connect menu. Do not wait for an online response.',
        model: this.model,
      }
    }

    // 2. Medication dosage changes or prescribing (disallowed)
    if (
      lastMessage.includes('prescribe') ||
      lastMessage.includes('change my dose') ||
      lastMessage.includes('increase my dose') ||
      lastMessage.includes('stop taking my medication') ||
      lastMessage.includes('double the dose')
    ) {
      return {
        content:
          'I cannot prescribe medications, modify your dosages, or advise you to stop taking prescribed medicines. Please discuss any changes to your medication regimen directly with your doctor or pharmacist.',
        model: this.model,
      }
    }

    // 3. Medication inquiries with authorized context
    if (
      lastMessage.includes('medication') ||
      lastMessage.includes('medicine') ||
      lastMessage.includes('pills') ||
      lastMessage.includes('schedule')
    ) {
      if (systemInstruction && systemInstruction.includes('Active Medications:')) {
        const medsSection = systemInstruction.split('Active Medications:')[1]?.split('\n\n')[0] || ''
        return {
          content: `Based on your verified schedule in ElderCare Connect, here is your medication overview:\n${medsSection.trim()}\n\nPlease remember to consult your healthcare provider or pharmacist for any medical advice or changes.`,
          model: this.model,
        }
      }
      return {
        content:
          'You can review your scheduled medications anytime in the Medications section of your dashboard. Always follow the directions given by your prescribing physician or pharmacist.',
        model: this.model,
      }
    }

    // 4. Daily check-in guidance
    if (lastMessage.includes('check in') || lastMessage.includes('check-in')) {
      return {
        content:
          'In ElderCare Connect, you have two daily check-in windows: Morning and Night. Simply open the "Daily check-in" page or use the button on your dashboard to let your connected family know you are doing well.',
        model: this.model,
      }
    }

    // 5. SOS and Safety guidance
    if (lastMessage.includes('sos') || lastMessage.includes('help button')) {
      return {
        content:
          'The SOS Emergency button is located in your navigation menu. When triggered, it notifies your connected family members and records the alert time. If you face a severe medical emergency, always call local emergency responders (such as 911 or 112) first.',
        model: this.model,
      }
    }

    // 6. Healthy ageing / wellness suggestions
    if (
      lastMessage.includes('water') ||
      lastMessage.includes('hydrat') ||
      lastMessage.includes('exercise') ||
      lastMessage.includes('stretch') ||
      lastMessage.includes('routine') ||
      lastMessage.includes('sleep')
    ) {
      return {
        content:
          'Here are a few gentle habits for healthy ageing:\n1. Stay well hydrated by keeping a water glass nearby throughout the day.\n2. Engage in gentle light stretching or short walks if cleared by your doctor.\n3. Keep a consistent sleep and wake schedule.\n4. Take short breaks to rest your eyes and relax your posture.',
        model: this.model,
      }
    }

    // 7. General friendly companionship greeting
    return {
      content:
        'Hello! I am your ElderCare Connect assistant. I am here to help you navigate your daily routines, check-in schedules, and healthy living habits. How can I help you today?',
      model: this.model,
    }
  }
}

module.exports = { MockProvider }
