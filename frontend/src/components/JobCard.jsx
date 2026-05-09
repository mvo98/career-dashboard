import React, { useState } from 'react'

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

export default function JobCard({ job, onEvaluate, airtableData }) {
  const isSkip = airtableData?.status === 'Skip'
  const alreadyEvaluated = !!airtableData
  const [fetching, setFetching] = useState(false)

  const preview = job.description.length > 200
    ? job.description.slice(0, 200).trimEnd() + '…'
    : job.description

  async function handleEvaluate() {
    if (job.source !== 'Adzuna') {
      onEvaluate({ jd: buildJDText(job), company: job.company, role: job.title })
      return
    }
    setFetching(true)
    let description = job.description
    let incomplete = false
    try {
      const res = await fetch('/api/jobs/fetch-description', {
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
      jdIncomplete: incomplete,
    })
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
        {job.salary_display && job.salary_display !== 'Not listed' && (
          <span className="job-salary">{job.salary_display}</span>
        )}
        {job.location && <span className="job-location">{job.location}</span>}
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
        <button
          className={`btn-evaluate-sm${isSkip ? ' btn-evaluate-muted' : ''}`}
          onClick={handleEvaluate}
          disabled={fetching}
        >
          {fetching
            ? <><span className="spinner" />Fetching JD…</>
            : alreadyEvaluated ? 'Re-evaluate' : 'Evaluate Fit'}
        </button>
      </div>
    </div>
  )
}
