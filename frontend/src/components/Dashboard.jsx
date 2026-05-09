import React, { useState, useEffect } from 'react'

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

export default function Dashboard({ active }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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

  // Load once when tab becomes active
  useEffect(() => {
    if (active && !data && !loading) load()
  }, [active])

  const byStatus = data?.by_status || {}
  const orderedStatuses = [
    ...STATUS_ORDER.filter(s => byStatus[s]),
    ...Object.keys(byStatus).filter(s => !STATUS_ORDER.includes(s)),
  ]

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2 className="dashboard-title">Tracker Overview</h2>
        <button className="btn-refresh" onClick={load} disabled={loading}>
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
                        <a
                          href={r.posting_url}
                          target="_blank"
                          rel="noreferrer"
                          className="followup-apply-link"
                        >
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

      {loading && !data && (
        <div className="dash-loading">
          <span className="spinner" style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: '#2563eb' }} />
          Loading from Airtable…
        </div>
      )}
    </div>
  )
}
