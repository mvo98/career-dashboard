import React from 'react'

const DIMENSION_ORDER = [
  'skill_fit',
  'compensation_fit',
  'strategic_fit',
  'domain_fit',
  'level_fit',
]

const DIMENSION_LABELS = {
  skill_fit: 'Skill Fit',
  compensation_fit: 'Compensation Fit',
  strategic_fit: 'Strategic Fit',
  domain_fit: 'Domain Fit',
  level_fit: 'Level Fit',
}

function scoreColor(score) {
  return score >= 70 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626'
}

function ScoreCircle({ score }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = scoreColor(score)

  return (
    <div className="score-circle-wrapper">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="score-number" style={{ color }}>
        <span className="score-value">{score}</span>
        <span className="score-denom">/100</span>
      </div>
    </div>
  )
}

function ActionBadge({ action }) {
  const cls = {
    Apply: 'action-apply',
    Explore: 'action-explore',
    Skip: 'action-skip',
  }[action] || 'action-explore'
  return <span className={`action-badge ${cls}`}>{action}</span>
}

function DimensionRow({ label, dimension }) {
  const { score, weight, reason } = dimension
  const color = scoreColor(score)
  return (
    <div className="dimension-row">
      <div className="dimension-top">
        <span className="dimension-name">{label}</span>
        <span className="dimension-weight">{Math.round(weight * 100)}% weight</span>
        <span className="dimension-score" style={{ color }}>{score}</span>
      </div>
      <div className="dimension-bar-track">
        <div
          className="dimension-bar-fill"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <p className="dimension-reason">{reason}</p>
    </div>
  )
}

export default function FitResult({ result }) {
  const {
    overall_score,
    action,
    action_justification,
    hard_skip_triggered,
    hard_skip_reason,
    dimensions,
    talking_points,
  } = result

  return (
    <div className="fit-result">
      <div className="result-header">
        <ScoreCircle score={overall_score} />
        <div className="result-header-right">
          <ActionBadge action={action} />
          <p className="action-justification">{action_justification}</p>
        </div>
      </div>

      {hard_skip_triggered && (
        <div className="hard-skip-banner">
          <strong>Hard Skip Triggered — </strong>{hard_skip_reason}
        </div>
      )}

      <div className="scorecard">
        <h3 className="scorecard-title">Dimension Scorecard</h3>
        <div className="scorecard-rows">
          {DIMENSION_ORDER.filter(k => dimensions[k]).map(key => (
            <DimensionRow key={key} label={DIMENSION_LABELS[key]} dimension={dimensions[key]} />
          ))}
        </div>
      </div>

      <div className="talking-section">
        <h3 className="scorecard-title">Talking Points</h3>
        <ul className="talking-list">
          {talking_points.map((pt, i) => (
            <li key={i} className="talking-item">{pt}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
