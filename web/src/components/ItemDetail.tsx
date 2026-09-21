import { useEffect, useState } from 'react'
import {
  addNote,
  errorMessage,
  fetchCustomer,
  fetchItem,
  fetchNotes,
  fetchUsers,
  setStatus,
  summarize,
  updateAssignment,
} from '../api'
import { CustomerProfile, FeedbackItem, InternalNote, User } from '../types'
import { useClickCooldown } from '../hooks/useClickCooldown'

export default function ItemDetail({
  id,
  token,
  onBack,
}: {
  id: number
  token: string
  onBack: () => void
}) {
  const [item, setItem] = useState<FeedbackItem | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [customer, setCustomer] = useState<CustomerProfile | null>(null)
  const [notes, setNotes] = useState<InternalNote[]>([])
  const [summary, setSummary] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [priority, setPriority] = useState('normal')
  const [dueAt, setDueAt] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [privateNote, setPrivateNote] = useState(true)
  const [error, setError] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const allowStatusClick = useClickCooldown()

  useEffect(() => {
    let cancelled = false

    async function load() {
      const data = await fetchItem(id, token)
      if (cancelled) return

      setItem(data)
      setAssigneeId(data.assignee_id ? String(data.assignee_id) : '')
      setPriority(data.priority)
      setDueAt(data.due_at ? data.due_at.slice(0, 10) : '')

      fetchUsers(token).then((userData) => {
        if (!cancelled) setUsers(userData.users)
      })
      fetchCustomer(data.customer_id, token).then((profile) => {
        if (!cancelled) setCustomer(profile)
      })
      fetchNotes(id, token).then((noteData) => {
        if (!cancelled) setNotes(noteData.notes)
      })
    }

    load()

    return () => {
      cancelled = true
    }
  }, [id, token])

  const onToggleStatus = async () => {
    if (!item || !allowStatusClick(item.id)) return
    try {
      setItem(await setStatus(item.id, item.status === 'open' ? 'resolved' : 'open', token))
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const onSummarize = async () => {
    setSummarizing(true)
    setError('')
    try {
      const data = await summarize(id, token)
      setSummary(data.summary)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSummarizing(false)
    }
  }

  const onSaveAssignment = async () => {
    if (!item) return
    try {
      const updated = await updateAssignment(
        item.id,
        {
          assignee_id: assigneeId ? Number(assigneeId) : null,
          priority,
          due_at: dueAt,
        },
        token
      )
      setItem(updated)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const onAddNote = async () => {
    if (!noteBody.trim()) return
    try {
      const note = await addNote(id, { body: noteBody, is_private: privateNote }, token)
      setNotes([note, ...notes])
      setNoteBody('')
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!item) {
    return (
      <div className="detail">
        <button className="link-button" onClick={onBack}>
          ← Back to inbox
        </button>
      </div>
    )
  }

  return (
    <div className="detail">
      <button className="link-button" onClick={onBack}>
        ← Back to inbox
      </button>
      <div className="detail-grid">
        <div className="detail-card">
          <div className="detail-head">
            <div>
              <h2>{item.customer_name}</h2>
              <div className="muted">{item.customer_email}</div>
            </div>
            <span className={'badge ' + item.status}>{item.status}</span>
          </div>
          <div className="detail-meta">
            <span className="channel">{item.channel}</span>
            <span className={'priority ' + item.priority}>{item.priority}</span>
            <span className="muted">{new Date(item.created_at).toLocaleString()}</span>
          </div>
          {/* Customer text is untrusted: render as text, keep line breaks. */}
          <div className="message user-text">{item.message}</div>
          <div className="assignment-panel">
            <label>
              Owner
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Nobody</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {['low', 'normal', 'high', 'urgent'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </label>
            <button onClick={onSaveAssignment}>Save routing</button>
          </div>
          <div className="detail-actions">
            <button onClick={onToggleStatus}>
              {item.status === 'open' ? 'Mark resolved' : 'Reopen'}
            </button>
            <button className="secondary" onClick={onSummarize} disabled={summarizing}>
              {summarizing ? 'Summarizing…' : 'Summarize'}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
          {summary && (
            <div className="summary">
              <h3>Summary</h3>
              <div className="user-text">{summary}</div>
            </div>
          )}
        </div>

        <aside className="side-panels">
          {customer && (
            <section className="mini-panel customer-panel">
              <h3>Customer Profile</h3>
              <div className="profile-row">
                <span>Plan</span>
                <strong>{customer.plan}</strong>
              </div>
              <div className="profile-row">
                <span>Health</span>
                <strong>{customer.health_score}</strong>
              </div>
              <h4>Recent history</h4>
              <ul className="history-list">
                {customer.history.map((historyItem) => (
                  <li key={historyItem.id}>
                    <span className={'badge ' + historyItem.status}>{historyItem.status}</span>
                    <span>{historyItem.message.slice(0, 48)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mini-panel notes-panel">
            <h3>Internal Notes</h3>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Paste context, snippets, reminders..."
            />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={privateNote}
                onChange={(e) => setPrivateNote(e.target.checked)}
              />
              Private note
            </label>
            <button onClick={onAddNote}>Add note</button>
            <div className="notes-list">
              {notes.map((note) => (
                <article key={note.id} className="note">
                  <div className="note-meta">
                    <strong>{note.author_name}</strong>
                    <span>{note.is_private ? 'Private' : 'Shared'}</span>
                  </div>
                  <div className="user-text">{note.body}</div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
