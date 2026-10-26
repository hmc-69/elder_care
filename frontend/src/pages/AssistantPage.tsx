import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Edit2,
  MessageSquare,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { SafeFormattedContent } from '../components/SafeFormattedContent'
import { useAuth } from '../context/AuthContext'
import { assistantService } from '../services/assistantService'
import type { ChatMessage, ConversationSummary } from '../types/assistant'

const ELDER_EXAMPLE_QUESTIONS = [
  'What are my scheduled medicines today?',
  'How do I complete my daily check-in?',
  'Can you suggest safe morning stretches for older adults?',
  'What are some simple ways to stay well hydrated?',
  'How does the SOS emergency button work?',
]

const FAMILY_EXAMPLE_QUESTIONS = [
  'How can I help my elder stay consistent with daily check-ins?',
  'What should I do if an SOS alert is triggered?',
  'Can you give me tips for staying connected with aging parents?',
  'How do family connections work in ElderCare Connect?',
]

export function AssistantPage() {
  const { user } = useAuth()
  const isElder = user?.role === 'ELDER'
  const exampleQuestions = isElder ? ELDER_EXAMPLE_QUESTIONS : FAMILY_EXAMPLE_QUESTIONS

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editTitleText, setEditTitleText] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // Load conversation list
  const loadConversations = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await assistantService.getConversations(1, 30)
      setConversations(response.conversations)
    } catch {
      // Non-critical, user can still chat
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  // Load selected conversation
  const loadConversationMessages = useCallback(async (convId: string) => {
    setLoading(true)
    setErrorMessage(null)
    setLastFailedMessage(null)
    try {
      const response = await assistantService.getConversation(convId)
      setActiveConversationId(response.conversation.id)
      setMessages(response.conversation.messages)
      setTimeout(() => scrollToBottom(false), 50)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load conversation messages.')
    } finally {
      setLoading(false)
    }
  }, [scrollToBottom])

  // Scroll on messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, scrollToBottom])

  // New conversation
  function handleNewConversation() {
    setActiveConversationId(null)
    setMessages([])
    setErrorMessage(null)
    setLastFailedMessage(null)
    setInputMessage('')
    if (textareaRef.current) textareaRef.current.focus()
  }

  // Send message
  async function handleSend(textToSend?: string) {
    const text = (textToSend ?? inputMessage).trim()
    if (!text || loading) return

    setErrorMessage(null)
    setLastFailedMessage(null)
    setInputMessage('')

    // Optimistically show user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'USER',
      content: text,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])
    setLoading(true)

    try {
      const result = await assistantService.sendMessage(text, activeConversationId)

      // Update with server persisted messages
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        result.userMessage,
        result.message,
      ])

      // If this was a new conversation, record its ID and refresh sidebar
      if (!activeConversationId) {
        setActiveConversationId(result.conversationId)
        void loadConversations()
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not generate a response. Please try again.')
      setLastFailedMessage(text)
      // Keep the user message in view so they don't lose context
    } finally {
      setLoading(false)
    }
  }

  // Retry sending failed message
  function handleRetry() {
    if (lastFailedMessage) {
      // Remove the last unresponded user message from state so it's not duplicated
      setMessages((prev) => prev.slice(0, -1))
      void handleSend(lastFailedMessage)
    }
  }

  // Copy assistant response
  async function handleCopy(text: string, msgId: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(msgId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch {
      // Clipboard write failed
    }
  }

  // Keydown handler: Enter to send, Shift+Enter for newline
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  // Rename conversation
  async function saveRename(convId: string) {
    if (!editTitleText.trim()) {
      setEditingTitleId(null)
      return
    }
    try {
      await assistantService.updateConversation(convId, editTitleText.trim())
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: editTitleText.trim() } : c))
      )
      setEditingTitleId(null)
    } catch {
      // Keep editing
    }
  }

  // Delete conversation
  async function handleDelete(convId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to delete this conversation?')) return

    try {
      await assistantService.deleteConversation(convId)
      setConversations((prev) => prev.filter((c) => c.id !== convId))
      if (activeConversationId === convId) {
        handleNewConversation()
      }
    } catch {
      // Delete failure
    }
  }

  return (
    <div className="assistant-page-container">
      {/* Medical & Emergency Disclaimer Banner */}
      <div className="assistant-disclaimer-banner" role="note" aria-label="Medical and Emergency Notice">
        <ShieldAlert size={20} className="disclaimer-icon" aria-hidden="true" />
        <div className="disclaimer-text">
          <strong>Medical & Emergency Safety Notice</strong>
          <p>
            ElderCare Assistant provides everyday organization and healthy aging suggestions. It does
            not provide medical diagnoses, prescriptions, or replace a doctor. In a medical
            emergency, call your local emergency service (such as 911 or 112) or press the{' '}
            <strong className="text-danger">SOS Emergency button</strong> immediately.
          </p>
        </div>
      </div>

      <div className={`assistant-workspace ${sidebarOpen ? 'sidebar-visible' : 'sidebar-collapsed'}`}>
        {/* Conversation History Sidebar */}
        <aside className="assistant-history-pane" aria-label="Conversation History">
          <div className="history-header">
            <button
              type="button"
              className="button button-primary new-chat-button"
              onClick={handleNewConversation}
            >
              <MessageSquarePlus size={17} aria-hidden="true" />
              <span>New conversation</span>
            </button>
            <button
              type="button"
              className="icon-button close-pane-button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Hide conversations sidebar"
              title="Hide sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>

          <div className="history-list-wrapper">
            <p className="history-section-title">PAST CONVERSATIONS</p>
            {historyLoading && conversations.length === 0 ? (
              <div className="history-loading">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="history-empty">No previous conversations yet.</div>
            ) : (
              <ul className="history-list" role="list">
                {conversations.map((conv) => {
                  const isActive = conv.id === activeConversationId
                  const isEditing = conv.id === editingTitleId

                  return (
                    <li
                      key={conv.id}
                      className={`history-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        if (!isEditing && conv.id !== activeConversationId) {
                          void loadConversationMessages(conv.id)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          void loadConversationMessages(conv.id)
                        }
                      }}
                    >
                      <MessageSquare size={16} className="history-item-icon" aria-hidden="true" />
                      <div className="history-item-copy">
                        {isEditing ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault()
                              void saveRename(conv.id)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="rename-form"
                          >
                            <input
                              type="text"
                              value={editTitleText}
                              onChange={(e) => setEditTitleText(e.target.value)}
                              autoFocus
                              maxLength={100}
                              className="rename-input"
                            />
                            <button type="submit" className="rename-save-button" aria-label="Save title">
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              className="rename-cancel-button"
                              onClick={() => setEditingTitleId(null)}
                              aria-label="Cancel title edit"
                            >
                              <X size={14} />
                            </button>
                          </form>
                        ) : (
                          <>
                            <span className="history-item-title" title={conv.title}>
                              {conv.title}
                            </span>
                            <span className="history-item-date">
                              {new Date(conv.updatedAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="history-item-actions">
                          <button
                            type="button"
                            className="item-action-button"
                            title="Rename"
                            aria-label={`Rename ${conv.title}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingTitleId(conv.id)
                              setEditTitleText(conv.title)
                            }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            className="item-action-button delete-action"
                            title="Delete"
                            aria-label={`Delete ${conv.title}`}
                            onClick={(e) => void handleDelete(conv.id, e)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Main Chat Area */}
        <section className="assistant-chat-pane" aria-label="Chat conversation">
          <header className="chat-top-header">
            {!sidebarOpen && (
              <button
                type="button"
                className="button button-secondary button-small open-pane-button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Show conversations sidebar"
              >
                <PanelLeftOpen size={16} />
                <span>Conversations</span>
              </button>
            )}
            <div className="chat-header-info">
              <span className="assistant-status-pill">
                <Sparkles size={14} className="sparkle-icon" aria-hidden="true" />
                <span>ElderCare Assistant</span>
              </span>
              <h2>
                {activeConversationId
                  ? conversations.find((c) => c.id === activeConversationId)?.title || 'Current Conversation'
                  : 'New Conversation'}
              </h2>
            </div>
            {activeConversationId && (
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={handleNewConversation}
              >
                <MessageSquarePlus size={15} />
                <span>New chat</span>
              </button>
            )}
          </header>

          {/* Messages list */}
          <div className="chat-messages-container" role="log" aria-live="polite">
            {messages.length === 0 ? (
              <div className="assistant-empty-prompt-state">
                <div className="welcome-avatar-orb">
                  <Bot size={34} aria-hidden="true" />
                </div>
                <h3>Hello, {user?.name.split(' ')[0]}! How can I help today?</h3>
                <p className="welcome-subtitle">
                  I can assist with medication schedules, daily check-in habits, routine guidance, and
                  everyday wellness questions.
                </p>

                <div className="example-prompts-grid">
                  <p className="example-prompts-label">TRY ASKING ABOUT:</p>
                  <div className="prompts-list">
                    {exampleQuestions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        className="example-prompt-chip"
                        onClick={() => void handleSend(q)}
                      >
                        <Sparkles size={14} className="chip-icon" aria-hidden="true" />
                        <span>{q}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="chat-bubbles-stack">
                {messages.map((msg) => {
                  const isUser = msg.role === 'USER'
                  return (
                    <div
                      key={msg.id}
                      className={`chat-message-row ${isUser ? 'user-row' : 'assistant-row'}`}
                    >
                      <div className="message-avatar" aria-hidden="true">
                        {isUser ? (
                          <User size={16} />
                        ) : (
                          <Bot size={16} />
                        )}
                      </div>

                      <div className="message-bubble-wrapper">
                        <div className="message-meta-header">
                          <span className="sender-name">
                            {isUser ? 'You' : 'ElderCare Assistant'}
                          </span>
                          <span className="message-timestamp">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
                          {isUser ? (
                            <p className="user-message-text">{msg.content}</p>
                          ) : (
                            <SafeFormattedContent content={msg.content} />
                          )}
                        </div>

                        {!isUser && (
                          <div className="message-footer-actions">
                            <button
                              type="button"
                              className="copy-response-button"
                              onClick={() => void handleCopy(msg.content, msg.id)}
                              aria-label="Copy assistant answer to clipboard"
                            >
                              {copiedMessageId === msg.id ? (
                                <>
                                  <Check size={13} className="text-success" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={13} />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Loading indicator */}
                {loading && (
                  <div className="chat-message-row assistant-row loading-row">
                    <div className="message-avatar" aria-hidden="true">
                      <Bot size={16} />
                    </div>
                    <div className="message-bubble-wrapper">
                      <div className="message-bubble assistant-bubble loading-bubble">
                        <div className="typing-indicator" aria-label="Assistant is thinking">
                          <span className="dot" />
                          <span className="dot" />
                          <span className="dot" />
                        </div>
                        <span className="loading-label">Assistant is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recoverable Error Banner */}
                {errorMessage && (
                  <div className="assistant-error-box" role="alert">
                    <AlertTriangle size={18} className="error-icon" aria-hidden="true" />
                    <div className="error-content">
                      <p>{errorMessage}</p>
                      {lastFailedMessage && (
                        <button
                          type="button"
                          className="button button-secondary button-small retry-button"
                          onClick={handleRetry}
                        >
                          Retry message
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <footer className="chat-input-bar">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSend()
              }}
              className="chat-input-form"
            >
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your question or routine query... (Shift + Enter for new line)"
                rows={1}
                maxLength={2000}
                className="chat-textarea"
                aria-label="Ask the ElderCare Assistant a question"
                disabled={loading}
              />
              <button
                type="submit"
                className="button button-primary send-button"
                disabled={!inputMessage.trim() || loading}
                aria-label="Send message"
              >
                <Send size={16} />
                <span className="send-button-text">Send</span>
              </button>
            </form>
            <div className="chat-input-hints">
              <span>Press <strong>Enter</strong> to send &bull; <strong>Shift + Enter</strong> for newline</span>
              <span>{inputMessage.length}/2000</span>
            </div>
          </footer>
        </section>
      </div>
    </div>
  )
}
