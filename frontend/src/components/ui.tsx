import { AlertTriangle, Check, CircleHelp, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <p className="section-kicker">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</header>
}

export function StatusBadge({ status, children }: { status: 'success' | 'pending' | 'warning' | 'neutral' | 'danger'; children: ReactNode }) {
  const Icon = status === 'success' ? Check : (status === 'warning' || status === 'danger') ? AlertTriangle : status === 'pending' ? CircleHelp : Info
  return <span className={`app-status ${status}`}><Icon size={15} aria-hidden="true" />{children}</span>
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="app-empty-state">{icon && <span className="empty-icon" aria-hidden="true">{icon}</span>}<h3>{title}</h3>{description && <p>{description}</p>}{action}</div>
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return <div className="skeleton-list" aria-label="Loading content" role="status">{Array.from({ length: rows }, (_, index) => <div className="skeleton-row" key={index}><i /><span><i /><i /></span></div>)}<span className="sr-only">Loading content</span></div>
}

export function ErrorState({ title = "We couldn't load this information.", onRetry }: { title?: string; onRetry?: () => void }) {
  return <div className="app-error-state" role="alert"><AlertTriangle size={20} aria-hidden="true" /><span>{title}</span>{onRetry && <button className="button button-secondary button-small" onClick={onRetry}>Try again</button>}</div>
}

export function FeedbackMessages({ message, error, onDismiss }: { message?: string; error?: string; onDismiss?: () => void }) {
  if (!message && !error) return null
  return <div className="feedback-stack" aria-live="polite">{message && <div className="feedback-toast success" role="status"><Check size={18} aria-hidden="true"/><span>{message}</span>{onDismiss && <button type="button" aria-label="Dismiss message" onClick={onDismiss}><X size={17}/></button>}</div>}{error && <div className="feedback-toast error" role="alert"><AlertTriangle size={18} aria-hidden="true"/><span>{error}</span>{onDismiss && <button type="button" aria-label="Dismiss error" onClick={onDismiss}><X size={17}/></button>}</div>}</div>
}
