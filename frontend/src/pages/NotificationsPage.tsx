import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, CheckCheck, Shield, Pill, Heart, Activity, Trash2, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/ui'
import { notificationService } from '../services/notificationService'
import type { Notification, NotificationType } from '../types/notifications'

function notifIcon(type: NotificationType) {
  if (type.startsWith('SOS')) return <Shield size={16} />
  if (type.startsWith('MEDICATION')) return <Pill size={16} />
  if (type.startsWith('CHECKIN')) return <Heart size={16} />
  if (type.startsWith('CONNECTION')) return <Activity size={16} />
  return <Bell size={16} />
}

function notifIconClass(type: NotificationType) {
  if (type.startsWith('SOS')) return 'notif-icon-sos'
  if (type.startsWith('MEDICATION')) return 'notif-icon-med'
  if (type.startsWith('CHECKIN')) return 'notif-icon-checkin'
  return 'notif-icon-default'
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

type FilterType = 'all' | 'unread'

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [markingAll, setMarkingAll] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const LIMIT = 20

  const load = useCallback(async (pageNum: number, filterType: FilterType) => {
    setLoading(true)
    setError(null)
    try {
      const res = await notificationService.getNotifications(pageNum, LIMIT, filterType === 'unread')
      setNotifications(res.notifications)
      setTotalPages(res.pagination.totalPages)
      setTotal(res.pagination.total)
      setUnreadCount(res.unreadCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notifications.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(page, filter)
  }, [load, page, filter])

  function handleFilterChange(newFilter: FilterType) {
    setFilter(newFilter)
    setPage(1)
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
      setTotal((t) => Math.max(0, t - 1))
      if (isUnread) setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // non-critical
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true)
    try {
      const res = await notificationService.markAllAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() })))
      setUnreadCount(0)
      setFeedback(`${res.count} notification${res.count === 1 ? '' : 's'} marked as read.`)
      setTimeout(() => setFeedback(null), 3000)
      if (filter === 'unread') {
        setNotifications([])
        setTotal(0)
      }
    } catch {
      setFeedback('Could not mark all as read.')
      setTimeout(() => setFeedback(null), 3000)
    } finally {
      setMarkingAll(false)
    }
  }

  const displayedNotifications =
    filter === 'unread' ? notifications.filter((n) => !n.read) : notifications

  return (
    <div className="notifications-page">
      <PageHeader
        eyebrow="YOUR UPDATES"
        title="Notifications"
        description="Stay informed about your connected elders, medications, check-ins, and emergency alerts."
      />

      <div className="notifications-toolbar">
        <div className="notif-filter-tabs" role="tablist" aria-label="Filter notifications">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`notif-filter-tab${filter === 'all' ? ' active' : ''}`}
            onClick={() => handleFilterChange('all')}
            id="tab-all"
          >
            All
            {total > 0 && (
              <span className="notif-tab-count">{total}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            className={`notif-filter-tab${filter === 'unread' ? ' active' : ''}`}
            onClick={() => handleFilterChange('unread')}
            id="tab-unread"
          >
            Unread
            {unreadCount > 0 && (
              <span className="notif-tab-count unread">{unreadCount}</span>
            )}
          </button>
        </div>

        <div className="notif-toolbar-actions">
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => void load(page, filter)}
            title="Refresh"
            aria-label="Refresh notifications"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => void handleMarkAllRead()}
              disabled={markingAll}
              aria-label="Mark all notifications as read"
            >
              <CheckCheck size={14} />
              <span>{markingAll ? 'Marking…' : 'Mark all read'}</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="notif-feedback" role="status">
          <Check size={15} />
          <span>{feedback}</span>
        </div>
      )}

      <div className="notifications-content">
        {loading ? (
          <div className="notifications-panel">
            <div className="skeleton-list">
              {[0, 1, 2, 3].map((i) => (
                <div className="skeleton-row" key={i}>
                  <i style={{ borderRadius: '50%' }} />
                  <span>
                    <i />
                    <i />
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="app-error-state">
            <Bell size={18} />
            <span>{error}</span>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => void load(page, filter)}
            >
              Retry
            </button>
          </div>
        ) : displayedNotifications.length === 0 ? (
          <div className="notifications-panel">
            <div className="app-empty-state notif-full-empty">
              <div className="empty-icon">
                <Bell size={22} />
              </div>
              <h3>{filter === 'unread' ? "You're all caught up!" : 'No notifications yet'}</h3>
              <p>
                {filter === 'unread'
                  ? 'All notifications have been read.'
                  : 'Notifications about your connected elders, medications, check-ins, and emergency alerts will appear here.'}
              </p>
              {filter === 'unread' && (
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => handleFilterChange('all')}
                >
                  View all notifications
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="notifications-panel">
            <ul className="notif-full-list" role="list" aria-label="Notifications">
              {displayedNotifications.map((n) => (
                <li
                  key={n.id}
                  className={`notif-full-item${n.read ? '' : ' unread'}`}
                >
                  <span
                    className={`notif-type-icon notif-type-icon-lg ${notifIconClass(n.type)}`}
                    aria-hidden="true"
                  >
                    {notifIcon(n.type)}
                  </span>

                  <div className="notif-full-item-body">
                    <div className="notif-full-item-top">
                      <h3 className="notif-full-title">{n.title}</h3>
                      {!n.read && (
                        <button
                          type="button"
                          className="notif-mark-read-btn"
                          onClick={() => void markRead(n.id)}
                          aria-label={`Mark as read: ${n.title}`}
                          title="Mark as read"
                        >
                          <Check size={13} />
                        </button>
                      )}
                    </div>
                    <p className="notif-full-message">{n.message}</p>
                    <div className="notif-full-meta">
                      <span className="notif-time">{formatDate(n.createdAt)}</span>
                      {n.actor && (
                        <span className="notif-actor">from {n.actor.name}</span>
                      )}
                      <span className={`notif-status-badge${n.read ? '' : ' unread'}`}>
                        {n.read ? 'Read' : 'Unread'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="notif-delete-btn notif-delete-btn-lg"
                    onClick={() => void remove(n.id, !n.read)}
                    aria-label={`Delete notification: ${n.title}`}
                    title="Delete notification"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <div className="notif-pagination">
                <button
                  type="button"
                  className="button button-secondary button-small"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Previous
                </button>
                <span className="notif-page-info">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
