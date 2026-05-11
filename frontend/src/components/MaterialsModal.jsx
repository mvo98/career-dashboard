import React, { useState, useEffect } from 'react'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  async function handle() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable (non-https dev) — ignore
    }
  }

  return (
    <button className={`btn-copy${copied ? ' btn-copy-done' : ''}`} onClick={handle}>
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

export default function MaterialsModal({ company, role, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  useEffect(() => {
    generate()
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function generate() {
    try {
      const res = await fetch('/api/materials/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, role }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || 'Generation failed')
      }
      setData(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <div className="modal-title-block">
            <h2 className="modal-title">Generated Materials</h2>
            <p className="modal-subtitle">{company} — {role}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {loading && (
          <div className="modal-loading">
            <span className="spinner" style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: '#2563eb' }} />
            Generating with Gemini…
          </div>
        )}

        {error && (
          <div className="modal-body">
            <div className="error-message">{error}</div>
          </div>
        )}

        {data && (
          <div className="modal-body">
            <div className="materials-section">
              <div className="materials-section-header">
                <h3 className="materials-section-title">Resume Summary</h3>
                <CopyButton text={data.resume_summary} />
              </div>
              <p className="materials-text materials-summary">{data.resume_summary}</p>
            </div>

            <div className="materials-section">
              <div className="materials-section-header">
                <h3 className="materials-section-title">Cover Letter</h3>
                <CopyButton text={data.cover_letter} />
              </div>
              <pre className="materials-text materials-letter">{data.cover_letter}</pre>
            </div>

            <div className="materials-meta">
              {data.jd_signals.length > 0 && (
                <div className="materials-meta-row">
                  <span className="materials-meta-label">JD Signals Detected</span>
                  <div className="signals-list">
                    {data.jd_signals.map(s => (
                      <span key={s} className="signal-chip">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="materials-meta-row">
                <span className="materials-meta-label">Emphasis Applied</span>
                <p className="materials-meta-value">{data.emphasis_applied}</p>
              </div>
              <div className="materials-meta-row">
                <span className="materials-meta-label">Proof Point Selected</span>
                <p className="materials-meta-value">{data.proof_point_selected}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
