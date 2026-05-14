import React, { useState } from 'react'
import { apiFetch } from '../api'

const FLAG_STYLES = {
  'US citizen required':         { bg: '#fef2f2', color: '#dc2626' },
  'Security clearance required': { bg: '#fef2f2', color: '#dc2626' },
  'Series A/B startup':          { bg: '#fef3c7', color: '#b45309' },
  'Fast-paced startup':          { bg: '#fef3c7', color: '#b45309' },
  '30%+ travel':                 { bg: '#fef3c7', color: '#b45309' },
  '50%+ travel':                 { bg: '#fef2f2', color: '#dc2626' },
}

export function dedupKey(title, company) {
  return (title + company).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function buildJDText(job) {
  const lines = [`${job.title}`, `Company: ${job.company}`, `Location: ${job.location}`]
  if (job.salary_display && job.salary_display !== 'Not listed')
    lines.push(`Salary: ${job.salary_display}`)
  lines.push('', job.description)
  return lines.join('\n')
}

function scoreColor(score) {
  return score >= 70 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626'
}

function daysAgo(postedAt) {
  if (!postedAt) return null
  const d = new Date(postedAt)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

// Returns a formatted salary string if an explicit range/amount is mentioned
// in the description text, otherwise null.
function scanDescriptionForSalary(text) {
  if (!text) return null

  // $90k–$120k  /  $90k - $120k  /  $90k to $120k
  let m = text.match(/\$(\d+(?:\.\d+)?)\s*k\s*(?:[-–—]|to)\s*\$(\d+(?:\.\d+)?)\s*k/i)
  if (m) {
    const lo = Math.round(parseFloat(m[1]) * 1000)
    const hi = Math.round(parseFloat(m[2]) * 1000)
    if (lo >= 40_000 && hi <= 600_000)
      return `$${Math.round(lo / 1000)}k–$${Math.round(hi / 1000)}k`
  }

  // $90,000 – $120,000  /  $90,000 - $120,000
  m = text.match(/\$(\d{1,3}(?:,\d{3})+)\s*[-–—]\s*\$(\d{1,3}(?:,\d{3})+)/)
  if (m) {
    const lo = parseInt(m[1].replace(/,/g, ''), 10)
    const hi = parseInt(m[2].replace(/,/g, ''), 10)
    if (lo >= 40_000 && hi <= 600_000)
      return `$${Math.round(lo / 1000)}k–$${Math.round(hi / 1000)}k`
  }

  // "base salary of $90k" / "salary: $90,000" / "compensation of $X"
  m = text.match(/(?:salary|compensation|pay)[^$]{0,40}\$(\d+(?:\.\d+)?)\s*k/i)
  if (m) {
    const val = Math.round(parseFloat(m[1]) * 1000)
    if (val >= 40_000 && val <= 600_000) return `$${Math.round(val / 1000)}k`
  }

  m = text.match(/(?:salary|compensation|pay)[^$]{0,40}\$(\d{1,3}(?:,\d{3})+)/i)
  if (m) {
    const val = parseInt(m[1].replace(/,/g, ''), 10)
    if (val >= 40_000 && val <= 600_000) return `$${Math.round(val / 1000)}k`
  }

  return null
}

export default function JobCard({ job, onEvaluate, onDismiss, airtableData }) {
  const isSkip = airtableData?.status === 'Skip'
  const alreadyEvaluated = !!airtableData
  const [fetching, setFetching] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  const preview = job.description.length > 200
    ? job.description.slice(0, 200).trimEnd() + '…'
    : job.description

  const days = daysAgo(job.posted_at)
  const isStale = days !== null && days > 30
  const salaryFromText = scanDescriptionForSalary(job.description)

  async function handleEvaluate() {
    if (job.source !== 'Adzuna') {
      onEvaluate({ jd: buildJDText(job), company: job.company, role: job.title, url: job.url, source: 'Search', jobId: job.id })
      return
    }
    setFetching(true)
    let description = job.description
    let incomplete = false
    try {
      const res = await apiFetch('/api/jobs/fetch-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: job.url }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.description) {
          description = data.description
          incomplete = !data.full
        } else {
          incomplete = true
        }
      } else {
        incomplete = true
      }
    } catch {
      incomplete = true
    } finally {
      setFetching(false)
    }
    onEvaluate({
      jd: buildJDText({ ...job, description }),
      company: job.company,
      role: job.title,
      url: job.url,
      source: 'Search',
      jobId: job.id,
      jdIncomplete: incomplete,
    })
  }

  async function handleDismiss() {
    setDismissing(true)
    try {
      await apiFetch('/api/airtable/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: job.company, role: job.title, url: job.url, source: 'Search' }),
      })
      onDismiss(job.id)
    } catch {
      // non-critical — local state already updated
      onDismiss(job.id)
    } finally {
      setDismissing(false)
    }
  }

  return (
    <div className={[
      'job-card',
      job.flags.length ? 'job-card-flagged' : '',
      isSkip ? 'job-card-skip' : '',
    ].filter(Boolean).join(' ')}>

      <div className="job-card-header">
        <div className="job-card-title-block">
          <h3 className="job-title">{job.title}</h3>
          <p className="job-company">{job.company}</p>
        </div>
        <div className="job-card-badges">
          {alreadyEvaluated && (
            <span
              className="already-badge"
              style={{ color: airtableData.fit_score != null ? scoreColor(airtableData.fit_score) : '#6b7280' }}
            >
              {airtableData.fit_score != null ? `${airtableData.fit_score}/100` : '—'}
              {' · '}{airtableData.status || 'Evaluated'}
            </span>
          )}
          <span className={`source-badge source-${job.source.toLowerCase()}`}>{job.source}</span>
        </div>
      </div>

      <div className="job-meta">
        {salaryFromText ? (
          <span className="job-salary-posted">Posted: {salaryFromText}</span>
        ) : job.salary_display && job.salary_display !== 'Not listed' ? (
          job.source === 'Adzuna'
            ? <span className="job-salary-est">~{job.salary_display} (est.)</span>
            : <span className="job-salary">{job.salary_display}</span>
        ) : null}
        {job.location && <span className="job-location">{job.location}</span>}
        {days !== null && (
          <span className={`job-posted${isStale ? ' job-posted-stale' : ''}`}>
            {days === 0 ? 'Today' : days === 1 ? '1 day ago' : `${days} days ago`}
          </span>
        )}
      </div>

      {job.flags.length > 0 && (
        <div className="job-flags">
          {job.flags.map(flag => {
            const s = FLAG_STYLES[flag] || { bg: '#fef3c7', color: '#b45309' }
            return <span key={flag} className="flag-chip" style={s}>⚠ {flag}</span>
          })}
        </div>
      )}

      <p className="job-preview">{preview}</p>

      <div className="job-card-footer">
        <a href={job.url} target="_blank" rel="noreferrer" className="view-link">
          View posting →
        </a>
        <div className="job-card-actions">
          <button
            className="btn-dismiss-sm"
            onClick={handleDismiss}
            disabled={dismissing || fetching}
          >
            {dismissing ? '…' : 'Dismiss'}
          </button>
          <button
            className={`btn-evaluate-sm${isSkip ? ' btn-evaluate-muted' : ''}`}
            onClick={handleEvaluate}
            disabled={fetching || dismissing}
          >
            {fetching
              ? <><span className="spinner" />Fetching JD…</>
              : alreadyEvaluated ? 'Re-evaluate' : 'Evaluate Fit'}
          </button>
        </div>
      </div>
    </div>
  )
}
