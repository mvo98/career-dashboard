import React, { useState } from 'react'
import FitResult from './FitResult'

function extractCompFromJD(jd) {
  const m = jd.match(/^Salary:\s*(.+)$/m)
  return m ? m[1].trim() : ''
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
    const apiSalary = extractCompFromJD(jobDescription)
    const compValue = mode === 'manual'
      ? manualComp
      : (evalResult.extracted_comp || apiSalary || '')
    try {
      const res = await fetch('/api/airtable/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          role,
          fit_score: evalResult.overall_score,
          comp: compValue,
          action: evalResult.action,
          rationale: evalResult.action_justification,
          dimensions: evalResult.dimensions,
          full_jd: jobDescription,
          url: initialUrl,
          source: initialSource,
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
            Company, Role, and Comp are optional — they'll be saved to Airtable along with the evaluation.
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

      {error && <div className="error-message">{error}</div>}
      {result && <FitResult result={result} apiSalary={extractCompFromJD(jobDescription)} />}
    </div>
  )
}
