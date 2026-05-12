import React, { useState, useEffect } from 'react'
import MaterialsModal from './MaterialsModal'
import { apiFetch } from '../api'

const STATUS_STYLES = {
  Applied:     { bg: '#eff6ff', color: '#2563eb' },
  Responded:   { bg: '#f0fdf4', color: '#16a34a' },
  Scheduled:   { bg: '#f0fdfa', color: '#0d9488' },
  Interviewing:{ bg: '#ecfdf5', color: '#059669' },
  Offer:       { bg: '#fdf4ff', color: '#7c3aed' },
  Rejected:    { bg: '#fef2f2', color: '#dc2626' },
  Explore:     { bg: '#fef3c7', color: '#b45309' },
  Evaluated:   { bg: '#faf5ff', color: '#7c3aed' },
  Saved:       { bg: '#f5f3ff', color: '#6d28d9' },
  Skip:        { bg: '#f9fafb', color: '#6b7280' },
  Unknown:     { bg: '#f9fafb', color: '#9ca3af' },
}

const STATUS_ORDER = ['Applied', 'Responded', 'Scheduled', 'Interviewing', 'Offer', 'Rejected', 'Explore', 'Evaluated', 'Saved', 'Skip']

const STATUS_OPTIONS = [
  'Evaluated', 'Applied', 'Responded', 'Scheduled', 'Interviewing',
  'Offer', 'Rejected', 'Saved', 'Explore', 'Skip', 'Dismissed',
]

const FILTER_OPTIONS = ['Applied', 'Responded', 'Scheduled', 'Interviewing', 'Rejected', 'Explore']
const PENDING_STATUSES = ['Evaluated', 'Explore']

const ACTION_COLORS = {
  Apply:   '#16a34a',
  Explore: '#b45309',
  Skip:    '#dc2626',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function scoreColor(score) {
  return score >= 70 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626'
}

function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.Unknown
}

function fmtStamp() {
  const d = new Date()
  return `[${MONTHS[d.getMonth()]} ${d.getDate()}]`
}

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value ?? '—'}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

function rowKey(r) {
  return `${r.company}||${r.role}`
}

export default function Dashboard({ active }) {
  const [data, setData] = useState(null)
  const [roles, setRoles] = useState(null)
  const [loading, setLoading] = useState(false)
  const [rolesLoading, setRolesLoading] = useState(false)
  const [error, setError] = useState(null)
  const [rolesError, setRolesError] = useState(null)
  const [activeModal, setActiveModal] = useState(null)

  // Per-row local state: status and notes
  const [rowEdits, setRowEdits] = useState({})

  // Filter state: [] = All, otherwise array of status strings
  const [activeFilters, setActiveFilters] = useState(PENDING_STATUSES)

  // Single active inline prompt: { key, type, note, extra }
  const [activePrompt, setActivePrompt] = useState(null)

  // Per-row "Add note" input values
  const [newNoteInputs, setNewNoteInputs] = useState({})

  function getRowEdit(r) {
    const k = rowKey(r)
    return rowEdits[k] || { status: r.status, notes: r.notes || '' }
  }

  function applyRowEdit(k, patch) {
    setRowEdits(prev => {
      const current = prev[k] || {}
      return { ...prev, [k]: { ...current, ...patch } }
    })
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/airtable/dashboard')
      if (!res.ok) throw new Error((await res.json()).detail || 'Load failed')
      setData(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadRoles() {
    setRolesLoading(true)
    setRolesError(null)
    try {
      const res = await apiFetch('/api/airtable/roles')
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || `Error ${res.status}`)
      }
      const d = await res.json()
      setRoles(d.roles || [])
      setRowEdits({})
    } catch (err) {
      setRolesError(err.message)
    } finally {
      setRolesLoading(false)
    }
  }

  useEffect(() => {
    if (active && !data && !loading) {
      load()
      loadRoles()
    }
  }, [active])

  async function handleStatusChange(r, newStatus) {
    const k = rowKey(r)
    applyRowEdit(k, { status: newStatus })
    try {
      await apiFetch('/api/airtable/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: r.company, role: r.role, status: newStatus }),
      })
    } catch {
      // best-effort
    }
  }

  function toggleFilter(f) {
    setActiveFilters(prev => {
      if (prev.length === 0) return [f]
      if (prev.includes(f)) return prev.filter(x => x !== f)
      return [...prev, f]
    })
  }

  function openPrompt(k, type) {
    setActivePrompt(prev =>
      prev?.key === k && prev?.type === type ? null : { key: k, type, note: '', extra: '' }
    )
  }

  async function handleQuickAction(r) {
    if (!activePrompt || activePrompt.key !== rowKey(r)) return
    const { type, note, extra } = activePrompt
    const stamp = fmtStamp()
    const k = rowKey(r)

    let line = ''
    let newStatus = ''
    switch (type) {
      case 'rejected':
        line = `${stamp} Rejected${note ? ` — ${note}` : ''}`
        newStatus = 'Rejected'
        break
      case 'replied':
        line = `${stamp} They replied${note ? ` — ${note}` : ''}`
        newStatus = 'Responded'
        break
      case 'scheduled':
        line = `${stamp} Call scheduled${extra ? ` ${extra}` : ''}${note ? ` — ${note}` : ''}`
        newStatus = 'Scheduled'
        break
      case 'offer':
        line = `${stamp} Offer${extra ? ` — ${extra}` : ''}${note ? `. ${note}` : ''}`
        newStatus = 'Offer'
        break
      default:
        return
    }

    const currentNotes = (rowEdits[k]?.notes) ?? (r.notes || '')
    const newNotes = currentNotes ? `${currentNotes}\n${line}` : line

    applyRowEdit(k, { status: newStatus, notes: newNotes })
    setActivePrompt(null)

    try {
      await apiFetch('/api/airtable/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: r.company, role: r.role, status: newStatus, notes: newNotes }),
      })
    } catch {
      // best-effort
    }
  }

  async function handleMarkApplied(r) {
    const k = rowKey(r)
    const stamp = fmtStamp()
    const today = isoToday()
    const line = `${stamp} Marked as Applied`
    const currentNotes = (rowEdits[k]?.notes) ?? (r.notes || '')
    const newNotes = currentNotes ? `${currentNotes}\n${line}` : line

    applyRowEdit(k, { status: 'Applied', notes: newNotes })
    setActivePrompt(null)

    try {
      await apiFetch('/api/airtable/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: r.company,
          role: r.role,
          status: 'Applied',
          notes: newNotes,
          date_applied: today,
        }),
      })
    } catch {
      // best-effort
    }
  }

  async function handleAddNote(r, text) {
    if (!text.trim()) return
    const k = rowKey(r)
    const stamp = fmtStamp()
    const line = `${stamp} Note — ${text.trim()}`
    const currentNotes = (rowEdits[k]?.notes) ?? (r.notes || '')
    const newNotes = currentNotes ? `${currentNotes}\n${line}` : line

    applyRowEdit(k, { notes: newNotes })
    setNewNoteInputs(prev => ({ ...prev, [k]: '' }))

    try {
      await apiFetch('/api/airtable/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: r.company, role: r.role, notes: newNotes }),
      })
    } catch {
      // best-effort
    }
  }

  const byStatus = data?.by_status || {}
  const orderedStatuses = [
    ...STATUS_ORDER.filter(s => byStatus[s]),
    ...Object.keys(byStatus).filter(s => !STATUS_ORDER.includes(s)),
  ]

  // Use effective status from rowEdits for filtering
  const filteredRoles = roles
    ? (activeFilters.length === 0
        ? roles
        : roles.filter(r => {
            const effectiveStatus = rowEdits[rowKey(r)]?.status ?? r.status ?? ''
            return activeFilters.includes(effectiveStatus)
          }))
    : []

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2 className="dashboard-title">Tracker Overview</h2>
        <button className="btn-refresh" onClick={() => { load(); loadRoles() }} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {data && (
        <>
          <div className="stat-row">
            <StatCard label="Roles tracked" value={data.total} />
            <StatCard
              label="Avg fit (Applied)"
              value={data.avg_fit_applied != null ? `${data.avg_fit_applied}/100` : null}
            />
            <StatCard
              label="Needs follow-up"
              value={data.follow_up_needed.length}
              sub="Applied > 7 days"
            />
          </div>

          <section className="dash-section">
            <h3 className="dash-section-title">By Status</h3>
            <div className="status-grid">
              {orderedStatuses.map(status => {
                const s = statusStyle(status)
                return (
                  <div key={status} className="status-chip-big" style={{ background: s.bg, color: s.color }}>
                    <span className="status-chip-count">{byStatus[status]}</span>
                    <span className="status-chip-label">{status}</span>
                  </div>
                )
              })}
            </div>
          </section>

          {data.follow_up_needed.length > 0 && (
            <section className="dash-section">
              <h3 className="dash-section-title">Needs Follow-Up</h3>
              <div className="followup-list">
                {data.follow_up_needed.map((r, i) => (
                  <div key={i} className="followup-row">
                    <div className="followup-info">
                      <span className="followup-company">{r.company}</span>
                      <span className="followup-role">{r.role}</span>
                    </div>
                    <div className="followup-meta">
                      {r.fit_score != null && (
                        <span className="followup-fit">Fit {r.fit_score}</span>
                      )}
                      <span className="followup-date">Applied {r.date_applied}</span>
                      {r.posting_url && (
                        <a href={r.posting_url} target="_blank" rel="noreferrer" className="followup-apply-link">
                          Apply →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.follow_up_needed.length === 0 && !loading && (
            <p className="dash-empty">No follow-ups needed yet — all Applied roles are within 7 days.</p>
          )}
        </>
      )}

      {/* Evaluated Roles */}
      <section className="dash-section">
        <h3 className="dash-section-title">Evaluated Roles</h3>

        {rolesLoading && (
          <div className="dash-loading">
            <span className="spinner" style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: '#2563eb' }} />
            Loading…
          </div>
        )}

        {rolesError && <div className="error-message">{rolesError}</div>}

        {roles && roles.length === 0 && (
          <p className="dash-empty">No evaluated roles yet.</p>
        )}

        {roles && roles.length > 0 && (
          <>
            <div className="roles-filter-bar">
              <button
                className={`filter-pill${activeFilters.length === 0 ? ' filter-pill-active' : ''}`}
                onClick={() => setActiveFilters([])}
              >
                All
              </button>
              <button
                className={`filter-pill${PENDING_STATUSES.every(s => activeFilters.includes(s)) && activeFilters.length === PENDING_STATUSES.length ? ' filter-pill-active' : ''}`}
                onClick={() => setActiveFilters(
                  PENDING_STATUSES.every(s => activeFilters.includes(s)) && activeFilters.length === PENDING_STATUSES.length
                    ? []
                    : PENDING_STATUSES
                )}
              >
                Pending
              </button>
              {FILTER_OPTIONS.map(f => (
                <button
                  key={f}
                  className={`filter-pill${activeFilters.includes(f) ? ' filter-pill-active' : ''}`}
                  onClick={() => toggleFilter(f)}
                >
                  {f}
                </button>
              ))}
              {activeFilters.length > 0 && (
                <span className="roles-filter-count">{filteredRoles.length} of {roles.length}</span>
              )}
            </div>

            {filteredRoles.length === 0 ? (
              <p className="dash-empty">No roles match the current filter.</p>
            ) : (
              <div className="roles-list">
                {filteredRoles.map(r => {
                  const edit = getRowEdit(r)
                  const k = rowKey(r)
                  const promptActive = activePrompt?.key === k

                  return (
                    <div key={k} className="role-row">
                      {/* Top row */}
                      <div className="role-row-top">
                        <div className="role-row-info">
                          <span className="role-row-company">{r.company}</span>
                          <span className="role-row-title">{r.role}</span>
                        </div>
                        <div className="role-row-meta">
                          {r.fit_score != null && (
                            <span className="role-row-fit" style={{ color: scoreColor(r.fit_score) }}>
                              {r.fit_score}/100
                            </span>
                          )}
                          {r.action && (
                            <span className="role-row-action" style={{ color: ACTION_COLORS[r.action] || '#6b7280' }}>
                              {r.action}
                            </span>
                          )}
                          <select
                            className="role-row-status-select"
                            value={edit.status || ''}
                            onChange={e => handleStatusChange(r, e.target.value)}
                            style={{
                              background: statusStyle(edit.status).bg,
                              color: statusStyle(edit.status).color,
                            }}
                          >
                            {!edit.status && <option value="">—</option>}
                            {STATUS_OPTIONS.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <button
                            className={`btn-materials${r.materials_generated ? ' btn-materials-done' : ''}`}
                            onClick={() => setActiveModal({ company: r.company, role: r.role })}
                          >
                            {r.materials_generated ? '✓ Regenerate' : 'Generate Materials'}
                          </button>
                        </div>
                      </div>

                      {/* Quick action buttons */}
                      <div className="role-quick-actions">
                        <button
                          className="btn-quick applied"
                          onClick={() => handleMarkApplied(r)}
                        >
                          Mark Applied
                        </button>
                        {[
                          { type: 'rejected',  label: 'Rejected',      cls: 'rejected'  },
                          { type: 'replied',   label: 'They Replied',  cls: 'replied'   },
                          { type: 'scheduled', label: 'Call Scheduled',cls: 'scheduled' },
                          { type: 'offer',     label: 'Offer',         cls: 'offer'     },
                        ].map(({ type, label, cls }) => (
                          <button
                            key={type}
                            className={`btn-quick ${cls}${promptActive && activePrompt.type === type ? ' btn-quick-open' : ''}`}
                            onClick={() => openPrompt(k, type)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* Inline prompt */}
                      {promptActive && (
                        <div className="inline-prompt">
                          {(activePrompt.type === 'scheduled' || activePrompt.type === 'offer') && (
                            <input
                              className="inline-prompt-input"
                              placeholder={
                                activePrompt.type === 'scheduled'
                                  ? 'Date/time (e.g. May 12 at 2pm)'
                                  : 'Comp details (e.g. $120k base + equity)'
                              }
                              value={activePrompt.extra}
                              onChange={e => setActivePrompt(p => ({ ...p, extra: e.target.value }))}
                              autoFocus
                            />
                          )}
                          <input
                            className="inline-prompt-input"
                            placeholder="Optional note…"
                            value={activePrompt.note}
                            onChange={e => setActivePrompt(p => ({ ...p, note: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleQuickAction(r) }}
                            autoFocus={activePrompt.type !== 'scheduled' && activePrompt.type !== 'offer'}
                          />
                          <div className="inline-prompt-actions">
                            <button className="btn-prompt-confirm" onClick={() => handleQuickAction(r)}>Confirm</button>
                            <button className="btn-prompt-cancel" onClick={() => setActivePrompt(null)}>Cancel</button>
                          </div>
                        </div>
                      )}

                      {/* Notes history + add note */}
                      <div className="role-row-notes">
                        {edit.notes && (
                          <div className="notes-history">{edit.notes}</div>
                        )}
                        <div className="notes-add-row">
                          <input
                            className="notes-add-input"
                            placeholder="Add note…"
                            value={newNoteInputs[k] || ''}
                            onChange={e => setNewNoteInputs(prev => ({ ...prev, [k]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && newNoteInputs[k]?.trim()) {
                                handleAddNote(r, newNoteInputs[k])
                              }
                            }}
                          />
                          {newNoteInputs[k]?.trim() && (
                            <button
                              className="btn-add-note"
                              onClick={() => handleAddNote(r, newNoteInputs[k])}
                            >
                              Add
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </section>

      {loading && !data && (
        <div className="dash-loading">
          <span className="spinner" style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: '#2563eb' }} />
          Loading from Airtable…
        </div>
      )}

      {activeModal && (
        <MaterialsModal
          company={activeModal.company}
          role={activeModal.role}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  )
}
