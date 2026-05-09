import React, { useState } from 'react'
import JobCard, { dedupKey } from './JobCard'

const DEFAULT_TITLES = [
  'Solutions Engineer',
  'Implementation Engineer',
  'Technical Account Manager',
  'Customer Success Engineer',
  'Sales Engineer',
  'Application Support Engineer',
  'Integration Engineer',
  'Technical Implementation Specialist',
]

export default function RoleDiscovery({ onEvaluate }) {
  const [selectedTitles, setSelectedTitles] = useState(new Set(DEFAULT_TITLES))
  const [location, setLocation] = useState('San Diego, CA')
  const [salaryFloor, setSalaryFloor] = useState(85000)
  const [jobs, setJobs] = useState([])
  const [airtableLookup, setAirtableLookup] = useState({})
  const [filterSummary, setFilterSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)

  function toggleTitle(title) {
    setSelectedTitles(prev => {
      const next = new Set(prev)
      next.has(title) ? next.delete(title) : next.add(title)
      return next
    })
  }

  async function fetchLookup(foundJobs) {
    if (!foundJobs.length) return
    try {
      const res = await fetch('/api/airtable/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roles: foundJobs.map(j => ({ company: j.company, title: j.title })),
        }),
      })
      if (!res.ok) return
      const data = await res.json()
      setAirtableLookup(data.matches || {})
    } catch {
      // non-critical — cards just won't show evaluated state
    }
  }

  async function handleSearch() {
    const titles = [...selectedTitles]
    if (!titles.length) return
    setLoading(true)
    setError(null)
    setJobs([])
    setAirtableLookup({})
    setFilterSummary(null)
    setSearched(true)

    try {
      const res = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles, location, salary_floor: salaryFloor }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Search failed')
      }
      const data = await res.json()
      setJobs(data.jobs)
      setFilterSummary({ filtered_count: data.filtered_count, breakdown: data.filter_breakdown })
      fetchLookup(data.jobs) // non-blocking
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="discovery">
      <div className="search-panel">
        <div className="search-section">
          <label className="input-label">Job Titles</label>
          <div className="title-chips">
            {DEFAULT_TITLES.map(t => (
              <button
                key={t}
                className={`chip${selectedTitles.has(t) ? ' chip-active' : ''}`}
                onClick={() => toggleTitle(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="search-row">
          <div className="search-field">
            <label className="input-label">Location</label>
            <input
              className="search-input"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="San Diego, CA or Remote"
            />
          </div>
          <div className="search-field search-field-narrow">
            <label className="input-label">Salary Floor</label>
            <input
              className="search-input"
              type="number"
              value={salaryFloor}
              onChange={e => setSalaryFloor(Number(e.target.value))}
              step={5000}
              min={0}
            />
          </div>
        </div>

        <button
          className="evaluate-btn"
          onClick={handleSearch}
          disabled={loading || selectedTitles.size === 0}
        >
          {loading ? <><span className="spinner" />Searching…</> : 'Search Jobs'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {searched && !loading && !error && filterSummary && (
        <div className="filter-summary">
          <div className="filter-summary-top">
            <span className="results-count">
              {jobs.length === 0 ? 'No roles found.' : `${jobs.length} role${jobs.length !== 1 ? 's' : ''} shown`}
            </span>
            {filterSummary.filtered_count > 0 && (
              <span className="filter-removed">{filterSummary.filtered_count} filtered out</span>
            )}
          </div>
          {filterSummary.breakdown.length > 0 && (
            <div className="filter-breakdown">
              {filterSummary.breakdown.map(r => (
                <span key={r.label} className="filter-tag">
                  {r.label} <strong>{r.count}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="job-grid">
        {jobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            onEvaluate={onEvaluate}
            airtableData={airtableLookup[dedupKey(job.title, job.company)] || null}
          />
        ))}
      </div>
    </div>
  )
}
