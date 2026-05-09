import React, { useState } from 'react'
import FitResult from './FitResult'

function extractComp(jd) {
  const m = jd.match(/^Salary:\s*(.+)$/m)
  return m ? m[1].trim() : ''
}

export default function JobFitEvaluator({ initialJD = '', initialCompany = '', initialRole = '', initialJDIncomplete = false }) {
  const [jobDescription, setJobDescription] = useState(initialJD)
  const [company, setCompany] = useState(initialCompany)
  const [role, setRole] = useState(initialRole)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [saveStatus, setSaveStatus] = useState(null) // null | 'saving' | 'saved' | 'error'

  async function handleEvaluate() {
    if (!jobDescription.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    setSaveStatus(null)

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_description: jobDescription }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Evaluation failed')
      }
      const data = await res.json()
      setResult(data)
      autoSave(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function autoSave(evalResult) {
    setSaveStatus('saving')
    try {
      const res = await fetch('/api/airtable/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          role,
          fit_score: evalResult.overall_score,
          comp: extractComp(jobDescription),
          action: evalResult.action,
          rationale: evalResult.action_justification,
          dimensions: evalResult.dimensions,
          full_jd: jobDescription,
        }),
      })
      if (!res.ok) throw new Error()
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  return (
    <div className="evaluator">
      <div className="input-section">
        <div className="eval-meta-row">
          <div className="eval-meta-field">
            <label className="input-label">Company</label>
            <input
              className="search-input"
              placeholder="e.g. Acme Corp"
              value={company}
              onChange={e => setCompany(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="eval-meta-field">
            <label className="input-label">Role</label>
            <input
              className="search-input"
              placeholder="e.g. Solutions Engineer"
              value={role}
              onChange={e => setRole(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

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

      {error && <div className="error-message">{error}</div>}
      {result && <FitResult result={result} />}
    </div>
  )
}
