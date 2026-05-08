import { useState } from 'react'
import FitResult from './FitResult'

export default function JobFitEvaluator() {
  const [jobDescription, setJobDescription] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleEvaluate() {
    if (!jobDescription.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

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

      setResult(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="evaluator">
      <div className="input-section">
        <label htmlFor="job-desc" className="input-label">Job Description</label>
        <textarea
          id="job-desc"
          className="job-textarea"
          placeholder="Paste the full job description here..."
          value={jobDescription}
          onChange={e => setJobDescription(e.target.value)}
          disabled={loading}
        />
        <button
          className="evaluate-btn"
          onClick={handleEvaluate}
          disabled={loading || !jobDescription.trim()}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Analyzing...
            </>
          ) : (
            'Evaluate Fit'
          )}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {result && <FitResult result={result} />}
    </div>
  )
}
