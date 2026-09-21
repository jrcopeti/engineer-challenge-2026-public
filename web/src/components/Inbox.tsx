import { useCallback, useEffect, useState } from 'react'
import { downloadExport, errorMessage, fetchInbox, fetchMetrics, setStatus } from '../api'
import { FeedbackItem, Metrics } from '../types'
import ItemDetail from './ItemDetail'
import { useClickCooldown } from '../hooks/useClickCooldown'

const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 300
const POLL_INTERVAL_MS = 45000

export default function Inbox({ token }: { token: string }) {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const allowStatusClick = useClickCooldown()

  // Search: wait for typing to pause, then fetch. Resets to page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  // Load on every change of page/filter/search, and poll on the *current* view.
  // The AbortController drops responses that arrive after the inputs changed.
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const data = await fetchInbox(page, filter, debouncedSearch, token, controller.signal)
        setItems(data.items)
        setTotal(data.total)
        setError('')
      } catch (err) {
        if (controller.signal.aborted) return
        setError(errorMessage(err))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [page, filter, debouncedSearch, token])

  const loadMetrics = useCallback(() => {
    fetchMetrics(token)
      .then(setMetrics)
      .catch(() => setMetrics(null))
  }, [token])

  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  const onToggleStatus = async (item: FeedbackItem) => {
    if (!allowStatusClick(item.id)) return
    const nextStatus = item.status === 'open' ? 'resolved' : 'open'
    // Optimistic update, rolled back if the server disagrees.
    setItems((current) =>
      current.map((it) => (it.id === item.id ? { ...it, status: nextStatus } : it))
    )
    try {
      const updated = await setStatus(item.id, nextStatus, token)
      setItems((current) => current.map((it) => (it.id === item.id ? updated : it)))
      loadMetrics()
    } catch (err) {
      setItems((current) => current.map((it) => (it.id === item.id ? item : it)))
      setError(errorMessage(err))
    }
  }

  const onExport = async () => {
    try {
      const blob = await downloadExport(filter, debouncedSearch, token)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'pulse-feedback-export.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (selectedId !== null) {
    return (
      // Keyed on the id so navigating between items (via customer history) remounts the
      // view: summary, note draft and error state must never carry over to another item.
      <ItemDetail
        key={selectedId}
        id={selectedId}
        token={token}
        onBack={() => {
          setSelectedId(null)
          loadMetrics()
        }}
        onSelect={setSelectedId}
      />
    )
  }

  return (
    <div className="inbox">
      {metrics && (
        <div className="metrics-strip">
          <div className="metric-open">
            <strong>{metrics.open}</strong>
            <span>Open</span>
          </div>
          <div className="metric-resolved">
            <strong>{metrics.resolved}</strong>
            <span>Resolved</span>
          </div>
          <div className="metric-urgent">
            <strong>{metrics.urgent}</strong>
            <span>Urgent</span>
          </div>
          <div className="metric-overdue">
            <strong>{metrics.overdue}</strong>
            <span>Overdue</span>
          </div>
        </div>
      )}
      <div className="toolbar">
        <div className="filters">
          {['all', 'open', 'resolved'].map((f) => (
            <button
              key={f}
              className={'chip' + (filter === f ? ' active' : '')}
              onClick={() => {
                setFilter(f)
                setPage(1)
              }}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search feedback"
          aria-label="Search feedback"
        />
        <button className="export-button" onClick={onExport}>
          Export CSV
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="table-wrap">
        <table className="feedback-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Channel</th>
              <th>Priority</th>
              <th>Message</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="row" onClick={() => setSelectedId(item.id)}>
                <td>{item.customer_name}</td>
                <td>
                  <span className="channel">{item.channel}</span>
                </td>
                <td>
                  <span className={'pill priority ' + item.priority}>{item.priority}</span>
                </td>
                <td className="preview">
                  {item.message.slice(0, 70)}
                  {item.message.length > 70 ? '…' : ''}
                </td>
                <td>{item.assignee_name || <span className="muted">Unassigned</span>}</td>
                <td>
                  <span className={'pill badge ' + item.status}>{item.status}</span>
                </td>
                <td>
                  {item.due_at ? (
                    new Date(item.due_at).toLocaleDateString()
                  ) : (
                    <span className="muted">No due date</span>
                  )}
                </td>
                <td>
                  <button
                    className="row-action"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleStatus(item)
                    }}
                  >
                    {item.status === 'open' ? 'Resolve' : 'Reopen'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && items.length === 0 && !error && (
        <div className="empty">
          {debouncedSearch || filter !== 'all'
            ? 'No feedback matches this search or filter.'
            : 'No feedback yet.'}
        </div>
      )}

      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  )
}
