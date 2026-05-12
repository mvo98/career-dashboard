import React, { useState, useEffect } from 'react'
import { apiFetch } from '../api'

const RETRY_DELAYS = [2000, 4000, 8000]
const sleep = ms => new Promise(r => setTimeout(r, ms))

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
  // null | { attempt: 1|2|3, type: 'overloaded'|'rate_limit' }
  const [retryState, setRetryState] = useState(null)

  useEffect(() => {
    generate()
  }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function generate() {
    setLoading(true)
    setError(null)
    setRetryState(null)

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await apiFetch('/api/materials/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company, role }),
        })

        if (res.ok) {
          setData(await res.json())
          setLoading(false)
          setRetryState(null)
          return
        }

        const d = await res.json().catch(() => ({}))
        const status = res.status

        if ((status === 503 || status === 429) && attempt < 3) {
          const type = status === 503 ? 'overloaded' : 'rate_limit'
          setRetryState({ attempt: attempt + 1, type })
          await sleep(RETRY_DELAYS[attempt])
          setRetryState(null)
          continue
        }

        let msg
        if (status === 503) {
          msg = 'Gemini is still experiencing high demand after 3 retries. Please close and try again.'
        } else if (status === 429) {
          msg = 'Rate limit still active after 3 retries. Please wait before trying again.'
        } else {
          const detail = typeof d.detail === 'string' ? d.detail : 'Generation failed'
          msg = detail
        }
        setError(msg)
        break
      } catch (err) {
        setError(err.message)
        break
      }
    }

    setLoading(false)
    setRetryState(null)
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

        {loading && !retryState && (
          <div className="modal-loading">
            <span className="spinner" style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: '#2563eb' }} />
            Generating with Gemini…
          </div>
        )}

        {retryState && (
          <div className="modal-loading" style={{ color: '#92400e' }}>
            <span className="spinner" style={{ borderColor: 'rgba(217,119,6,0.25)', borderTopColor: '#d97706' }} />
            {retryState.type === 'overloaded'
              ? `Gemini is experiencing high demand. Retrying… (attempt ${retryState.attempt} of 3)`
              : `Rate limit reached. Waiting before retrying… (attempt ${retryState.attempt} of 3)`
            }
          </div>
        )}

        {error && (
          <div className="modal-body">
            <div className="error-message" style={{ margin: '20px 24px' }}>{error}</div>
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
