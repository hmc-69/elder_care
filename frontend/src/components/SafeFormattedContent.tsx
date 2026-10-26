import React from 'react'

interface SafeFormattedContentProps {
  content: string
}

function renderFormattedInline(text: string): React.ReactNode[] {
  // Parse **bold** formatting safely without HTML
  const parts: React.ReactNode[] = []
  const boldRegex = /\*\*(.*?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

export function SafeFormattedContent({ content }: SafeFormattedContentProps) {
  if (!content) return null

  // Split into lines
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null

  function flushList() {
    if (!currentList) return
    if (currentList.type === 'ul') {
      blocks.push(
        <ul key={`list-${blocks.length}`} className="assistant-bullet-list">
          {currentList.items.map((item, idx) => (
            <li key={idx}>{renderFormattedInline(item)}</li>
          ))}
        </ul>
      )
    } else {
      blocks.push(
        <ol key={`list-${blocks.length}`} className="assistant-ordered-list">
          {currentList.items.map((item, idx) => (
            <li key={idx}>{renderFormattedInline(item)}</li>
          ))}
        </ol>
      )
    }
    currentList = null
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    if (!trimmed) {
      flushList()
      continue
    }

    // Unordered list item: "- " or "* "
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.slice(2).trim()
      if (currentList && currentList.type === 'ul') {
        currentList.items.push(itemText)
      } else {
        flushList()
        currentList = { type: 'ul', items: [itemText] }
      }
      continue
    }

    // Ordered list item: "1. ", "2. ", etc.
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
    if (orderedMatch) {
      const itemText = orderedMatch[2].trim()
      if (currentList && currentList.type === 'ol') {
        currentList.items.push(itemText)
      } else {
        flushList()
        currentList = { type: 'ol', items: [itemText] }
      }
      continue
    }

    // Normal paragraph line
    flushList()
    blocks.push(
      <p key={`p-${i}`} className="assistant-paragraph">
        {renderFormattedInline(trimmed)}
      </p>
    )
  }

  flushList()

  return <div className="assistant-formatted-text">{blocks}</div>
}
