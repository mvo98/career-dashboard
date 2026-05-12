import React, { useState, useEffect, useCallback } from 'react'
import MaterialsModal from './MaterialsModal'

const STATUS_STYLES = {
  Applied:   { bg: '#eff6ff', color: '#2563eb' },
  Responded: { bg: '#f0fdf4', color: '#16a34a' },
  Scheduled: { bg: '#f0fdfa', color: '#0d9488' },
  Explore:   { bg: '#fef3c7', color: '#b45309' },
  Evaluated: { bg: '#faf5ff', color: '#7c3aed' },
  Saved:     { bg: '#f5f3ff', color: '#6d28d9' },
  Skip:      { bg: '#f9fafb', color: '#6b7280' },
  Unknown:   { bg: '#f9fafb', color: '#9ca3af' },
}

const STATUS_ORDER = ['Applied', 'Responded', 'Scheduled', 'Explore', 'Evaluated', 'Saved', 'Skip']

const STATUS_OPTIONS = [
  'Evaluated', 'Applied', 'Responded', 'Scheduled', 'Interviewing',
  'Offer', 'Rejected', 'Saved', 'Explore', 'Skip', 'Dismissed',
]

const ACTION_COLORS = {
  Apply:   '#16a34a',
  Explore: '#b45309',
  Skip:    '#dc2626',
}

function scoreColor(score) {
  return score >= 70 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626'
}

function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.Unknown
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
  const [activeModal, setActiveModal] = useState(null) // { company, role }

  // Per-row local state for status/notes edits
  const [rowEdits, setRowEdits] = useState({}) // key -> { status, notes, notesDirty, notesSaving }

  function getRowEdit(r) {
    const k = rowKey(r)
    return rowEdits[k] || { status: r.status, notes: r.notes || '', notesDirty: false, notesSaving: false }
  }

  function setRowField(r, field, value) {
    const k = rowKey(r)
    setRowEdits(prev => ({
      ...prev,
      [k]: { ...getRowEdit(r), ...prev[k], [field]: value },
    }))
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/airtable/dashboard')
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
      const res = await fetch('/api/airtable/roles')
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || `Error ${res.status}`)
      }
      const d = await res.json()
      setRoles(d.roles || [])
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
    setRowField(r, 'status', newStatus)
    try {
      await fetch('/api/airtable/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: r.company, role: r.role, status: newStatus }),
      })
    } catch {
      // best-effort
    }
  }

  async function handleNotesSave(r) {
    const k = rowKey(r)
    const edit = rowEdits[k]
    if (!edit?.notesDirty) return
    setRowField(r, 'notesSaving', true)
    try {
      await fetch('/api/airtable/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: r.company, role: r.role, notes: edit.notes }),
      })
      setRowEdits(prev => ({
        ...prev,
        [k]: { ...prev[k], notesDirty: false, notesSaving: false },
      }))
    } catch {
      setRowEdits(prev => ({
        ...prev,
        [k]: { ...prev[k], notesSaving: false },
      }))
    }
  }

  const byStatus = data?.by_status || {}
  const orderedStatuses = [
    ...STATUS_ORDER.filter(s => byStatus[s]),
    ...Object.keys(byStatus).filter(s => !STATUS_ORDER.includes(s)),
  ]

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

      {/* Evaluated Roles — always visible once loaded */}
      <section className="dash-section">
        <h3 className="dash-section-title">Evaluated Roles</h3>

        {rolesLoading && (
          <div className="dash-loading">
            <span className="spinner" style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: '#2563eb' }} />
            Loading…
          </div>
        )}

        {rolesError && (
          <div className="error-message">{rolesError}</div>
        )}

        {roles && roles.length === 0 && (
          <p className="dash-empty">No evaluated roles yet.</p>
        )}

        {roles && roles.length > 0 && (
          <div className="roles-list">
            {roles.map((r, i) => {
              const edit = getRowEdit(r)
              const k = rowKey(r)
              return (
                <div key={i} className="role-row">
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
                  <div className="role-row-notes">
                    <textarea
                      className="role-notes-input"
                      placeholder="Add notes…"
                      value={edit.notes}
                      onChange={e => {
                        const v = e.target.value
                        setRowEdits(prev => ({
                          ...prev,
                          [k]: { ...getRowEdit(r), ...prev[k], notes: v, notesDirty: true },
                        }))
                      }}
                      onBlur={() => handleNotesSave(r)}
                      rows={edit.notes ? undefined : 1}
                    />
                    {rowEdits[k]?.notesSaving && (
                      <span className="notes-saving">Saving…</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
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
