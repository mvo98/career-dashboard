import React, { useState } from 'react'
import FitResult from './FitResult'
import { apiFetch } from '../api'

const RETRY_DELAYS = [2000, 4000, 8000]
const sleep = ms => new Promise(r => setTimeout(r, ms))

function extractCompFromJD(jd) {
  const m = jd.match(/^Salary:\s*(.+)$/m)
  return m ? m[1].trim() : ''
}

function friendlyError(status, detail) {
  if (status === 503) {
    return 'Gemini is still experiencing high demand after 3 retries. Please try again in a moment.'
  }
  if (status === 429) {
    return 'Rate limit still active after 3 retries. Please wait a minute before trying again.'
  }
  const msg = typeof detail === 'string' ? detail : JSON.stringify(detail)
  const brief = msg.split('\n')[0].split('. ')[0].slice(0, 120)
  return `Evaluation failed: ${brief}. Please try again.`
}

export default function JobFitEvaluator({
  initialJD = '',
  initialCompany = '',
  initialRole = '',
  initialUrl = '',
  initialSource = '',
  initialJobId = '',
  initialJDIncomplete = false,
  onSaveSuccess,
}) {
  const [mode, setMode] = useState(initialCompany || initialRole ? 'search' : 'manual')
  const [jobDescription, setJobDescription] = useState(initialJD)
  const [company, setCompany] = useState(initialCompany)
  const [role, setRole] = useState(initialRole)
  const [manualComp, setManualComp] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [saveStatus, setSaveStatus] = useState(null)
  // null | { attempt: 1|2|3, type: 'overloaded'|'rate_limit' }
  const [retryState, setRetryState] = useState(null)

  async function handleEvaluate() {
    if (!jobDescription.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    setSaveStatus(null)
    setRetryState(null)

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await apiFetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_description: jobDescription }),
        })

        if (res.ok) {
          const data = await res.json()
          setRetryState(null)
          setResult(data)
          setLoading(false)
          autoSave(data)
          return
        }

        const errData = await res.json().catch(() => ({}))
        const status = res.status

        if ((status === 503 || status === 429) && attempt < 3) {
          const type = status === 503 ? 'overloaded' : 'rate_limit'
          setRetryState({ attempt: attempt + 1, type })
          await sleep(RETRY_DELAYS[attempt])
          setRetryState(null)
          continue
        }

        setError(friendlyError(status, errData.detail))
        break
      } catch (err) {
        setError(`Evaluation failed: ${err.message}. Please try again.`)
        break
      }
    }

    setLoading(false)
    setRetryState(null)
  }

  async function autoSave(evalResult) {
    setSaveStatus('saving')
    const apiSalary = extractCompFromJD(jobDescription)

    // For manual entries, back-fill empty fields from Gemini extraction
    const effectiveCompany = company || (mode === 'manual' ? (evalResult.extracted_company || '') : '')
    const effectiveRole = role || (mode === 'manual' ? (evalResult.extracted_role || '') : '')
    const effectiveComp = mode === 'manual'
      ? (manualComp || evalResult.extracted_comp || apiSalary || '')
      : (evalResult.extracted_comp || apiSalary || '')

    if (mode === 'manual') {
      if (!company && evalResult.extracted_company) setCompany(evalResult.extracted_company)
      if (!role && evalResult.extracted_role) setRole(evalResult.extracted_role)
      if (!manualComp && evalResult.extracted_comp) setManualComp(evalResult.extracted_comp)
    }

    try {
      const res = await apiFetch('/api/airtable/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: effectiveCompany,
          role: effectiveRole,
          fit_score: evalResult.overall_score,
          comp: effectiveComp,
          action: evalResult.action,
          rationale: evalResult.action_justification,
          dimensions: evalResult.dimensions,
          full_jd: jobDescription,
          url: initialUrl,
          source: mode === 'manual' ? 'Manual' : (initialSource || 'Search'),
        }),
      })
      if (!res.ok) throw new Error()
      setSaveStatus('saved')
      onSaveSuccess?.(initialJobId)
    } catch {
      setSaveStatus('error')
    }
  }

  return (
    <div className="evaluator">
      <div className="input-section">
        <div className="mode-toggle">
          <button
            className={`mode-btn${mode === 'search' ? ' mode-btn-active' : ''}`}
            onClick={() => setMode('search')}
          >
            From Search
          </button>
          <button
            className={`mode-btn${mode === 'manual' ? ' mode-btn-active' : ''}`}
            onClick={() => setMode('manual')}
          >
            Manual Entry
          </button>
        </div>

        <div className="eval-meta-row">
          <div className="eval-meta-field">
            <label className="input-label">
              Company{mode === 'manual' && <span className="optional-hint"> (optional)</span>}
            </label>
            <input
              className="search-input"
              placeholder="e.g. Acme Corp"
              value={company}
              onChange={e => setCompany(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="eval-meta-field">
            <label className="input-label">
              Role{mode === 'manual' && <span className="optional-hint"> (optional)</span>}
            </label>
            <input
              className="search-input"
              placeholder="e.g. Solutions Engineer"
              value={role}
              onChange={e => setRole(e.target.value)}
              disabled={loading}
            />
          </div>
          {mode === 'manual' && (
            <div className="eval-meta-field">
              <label className="input-label">
                Comp<span className="optional-hint"> (optional)</span>
              </label>
              <input
                className="search-input"
                placeholder="e.g. $90k–$120k"
                value={manualComp}
                onChange={e => setManualComp(e.target.value)}
                disabled={loading}
              />
            </div>
          )}
        </div>

        {mode === 'manual' && (
          <p className="eval-manual-note">
            Leave blank to auto-extract from the JD — they'll be filled in and saved to Airtable automatically.
          </p>
        )}

        {initialJDIncomplete && (
          <div className="jd-incomplete-warning">
            Adzuna description may be incomplete — the job site blocked automated fetching. Review the JD before evaluating, or paste the full text from the posting.
          </div>
        )}
        <label htmlFor="job-desc" className="input-label">Job Description</label>
        <textarea
          id="job-desc"
          className="job-textarea"
          placeholder="Paste the full job description here..."
          value={jobDescription}
          onChange={e => setJobDescription(e.target.value)}
          disabled={loading}
        />

        <div className="eval-footer-row">
          <button
            className="evaluate-btn"
            onClick={handleEvaluate}
            disabled={loading || !jobDescription.trim()}
          >
            {loading ? <><span className="spinner" />Analyzing…</> : 'Evaluate Fit'}
          </button>
          {saveStatus === 'saving' && <span className="save-status save-saving">Saving…</span>}
          {saveStatus === 'saved'  && <span className="save-status save-saved">✓ Saved to Airtable</span>}
          {saveStatus === 'error'  && <span className="save-status save-error">Save failed</span>}
        </div>
      </div>

      {retryState && (
        <div className="retry-status-box">
          <span className="spinner" style={{ borderColor: 'rgba(217,119,6,0.25)', borderTopColor: '#d97706' }} />
          {retryState.type === 'overloaded'
            ? `Gemini is experiencing high demand. Retrying automatically… (attempt ${retryState.attempt} of 3)`
            : `Rate limit reached. Waiting before retrying… (attempt ${retryState.attempt} of 3)`
          }
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
      {result && <FitResult result={result} apiSalary={extractCompFromJD(jobDescription)} />}
    </div>
  )
}
