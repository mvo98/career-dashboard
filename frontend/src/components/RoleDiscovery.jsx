import React, { useState, useMemo } from 'react'
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

const PAGE_SIZE = 10

export default function RoleDiscovery({ onEvaluate, savedJobIds = new Set() }) {
  const [selectedTitles, setSelectedTitles] = useState(new Set(DEFAULT_TITLES))
  const [location, setLocation] = useState('San Diego, CA')
  const [salaryFloor, setSalaryFloor] = useState(85000)
  const [jobs, setJobs] = useState([])
  const [airtableLookup, setAirtableLookup] = useState({})
  const [filterSummary, setFilterSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

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
      // non-critical
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
    setVisibleCount(PAGE_SIZE)

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

  function handleDismiss(jobId) {
    const job = jobs.find(j => j.id === jobId)
    if (job) {
      const key = dedupKey(job.title, job.company)
      setAirtableLookup(prev => ({
        ...prev,
        [key]: { ...(prev[key] || {}), status: 'Dismissed' },
      }))
    }
  }

  const { hiddenCount, sortedVisible } = useMemo(() => {
    let hidden = 0
    const visible = []
    for (const job of jobs) {
      const data = airtableLookup[dedupKey(job.title, job.company)]
      if (data?.status === 'Dismissed' || data?.status === 'Skip' || savedJobIds.has(job.id)) {
        hidden++
      } else {
        visible.push(job)
      }
    }

    visible.sort((a, b) => {
      const aInAt = !!airtableLookup[dedupKey(a.title, a.company)]
      const bInAt = !!airtableLookup[dedupKey(b.title, b.company)]
      if (aInAt !== bInAt) return aInAt ? 1 : -1
      const aDate = a.posted_at ? new Date(a.posted_at) : new Date(0)
      const bDate = b.posted_at ? new Date(b.posted_at) : new Date(0)
      return bDate - aDate
    })

    return { hiddenCount: hidden, sortedVisible: visible }
  }, [jobs, airtableLookup, savedJobIds])

  const displayedJobs = sortedVisible.slice(0, visibleCount)
  const hasMore = sortedVisible.length > visibleCount

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
              {sortedVisible.length === 0 ? 'No roles found.' : `${sortedVisible.length} role${sortedVisible.length !== 1 ? 's' : ''} shown`}
            </span>
            {filterSummary.filtered_count > 0 && (
              <span className="filter-removed">{filterSummary.filtered_count} filtered out</span>
            )}
            {hiddenCount > 0 && (
              <span className="filter-hidden">{hiddenCount} role{hiddenCount !== 1 ? 's' : ''} hidden (already decided)</span>
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
        {displayedJobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            onEvaluate={onEvaluate}
            onDismiss={handleDismiss}
            airtableData={airtableLookup[dedupKey(job.title, job.company)] || null}
          />
        ))}
      </div>

      {hasMore && (
        <button
          className="btn-load-more"
          onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
        >
          Load Next {Math.min(PAGE_SIZE, sortedVisible.length - visibleCount)} →
        </button>
      )}
    </div>
  )
}
