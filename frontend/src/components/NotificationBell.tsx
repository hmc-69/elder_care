import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Shield, Pill, Heart, Activity, X, Trash2, CheckCheck } from 'lucide-react'
import { notificationService } from '../services/notificationService'
import type { Notification, NotificationType } from '../types/notifications'

function notifIcon(type: NotificationType) {
  if (type.startsWith('SOS')) return <Shield size={14} />
  if (type.startsWith('MEDICATION')) return <Pill size={14} />
  if (type.startsWith('CHECKIN')) return <Heart size={14} />
  if (type.startsWith('CONNECTION')) return <Activity size={14} />
  return <Bell size={14} />
}

function notifIconClass(type: NotificationType) {
  if (type.startsWith('SOS')) return 'notif-icon-sos'
  if (type.startsWith('MEDICATION')) return 'notif-icon-med'
  if (type.startsWith('CHECKIN')) return 'notif-icon-checkin'
  return 'notif-icon-default'
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface NotificationBellProps {
  onViewAll?: () => void
}

export function NotificationBell({ onViewAll }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await notificationService.getUnreadCount()
      setUnreadCount(res.unreadCount)
    } catch {
      // non-critical
    }
  }, [])

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await notificationService.getNotifications(1, 15)
      setNotifications(res.notifications)
      setUnreadCount(res.unreadCount)
    } catch {
      // non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll for unread count every 60 seconds
  useEffect(() => {
    void fetchUnreadCount()
    const interval = setInterval(() => void fetchUnreadCount(), 60000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function togglePanel() {
    if (!open) {
      void fetchNotifications()
    }
    setOpen((prev) => !prev)
  }

  async function markRead(id: string) {
    try {
      await notificationService.markAsRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n)),
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // non-critical
    }
  }

  async function remove(id: string, isUnread: boolean) {
    try {
      await notificationService.deleteNotification(id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      if (isUnread) setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // non-critical
    }
  }

  async function markAllRead() {
    try {
      await notificationService.markAllAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() })))
      setUnreadCount(0)
    } catch {
      // non-critical
    }
  }

  return (
    <div className="notif-bell-wrapper">
      <button
        ref={buttonRef}
        type="button"
        className={`icon-button notification-button${unreadCount > 0 ? ' has-unread' : ''}`}
        aria-label={
          unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
            : 'Notifications'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={togglePanel}
        id="notification-bell-button"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="notif-panel"
          role="dialog"
          aria-label="Notifications"
          aria-modal="false"
        >
          <div className="notif-panel-header">
            <h2>Notifications</h2>
            <div className="notif-panel-header-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notif-mark-all-btn"
                  onClick={() => void markAllRead()}
                  title="Mark all as read"
                  aria-label="Mark all notifications as read"
                >
                  <CheckCheck size={15} />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                className="icon-button notif-close-btn"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="notif-list-container">
            {loading ? (
              <div className="notif-loading">Loading notifications…</div>
            ) : notifications.length === 0 ? (
              <div className="notif-empty">
                <Bell size={28} className="notif-empty-icon" />
                <p>You're all caught up!</p>
                <small>No notifications yet.</small>
              </div>
            ) : (
              <ul className="notif-list" role="list">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`notif-item${n.read ? '' : ' unread'}`}
                    onClick={() => { if (!n.read) void markRead(n.id) }}
                    role={n.read ? undefined : 'button'}
                    tabIndex={n.read ? undefined : 0}
                    onKeyDown={(e) => {
                      if (!n.read && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        void markRead(n.id)
                      }
                    }}
                  >
                    <span className={`notif-type-icon ${notifIconClass(n.type)}`} aria-hidden="true">
                      {notifIcon(n.type)}
                    </span>
                    <div className="notif-item-body">
                      <p className="notif-title">{n.title}</p>
                      <p className="notif-message">{n.message}</p>
                      <span className="notif-time">{timeAgo(n.createdAt)}</span>
                    </div>
                    {!n.read && <span className="notif-unread-dot" aria-label="Unread" />}
                    <button
                      type="button"
                      className="notif-delete-btn"
                      onClick={(e) => { e.stopPropagation(); void remove(n.id, !n.read) }}
                      aria-label={`Delete notification: ${n.title}`}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {onViewAll && (
            <div className="notif-panel-footer">
              <button
                type="button"
                className="notif-view-all-btn"
                onClick={() => { setOpen(false); onViewAll() }}
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
