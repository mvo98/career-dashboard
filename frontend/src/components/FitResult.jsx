function ScoreCircle({ score }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score >= 75 ? '#16a34a' : score >= 55 ? '#d97706' : '#dc2626'

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

function Section({ title, items, className }) {
  return (
    <div className={`result-section ${className}`}>
      <h3 className="section-title">{title}</h3>
      <ul className="section-list">
        {items.map((item, i) => (
          <li key={i} className="section-item">{item}</li>
        ))}
      </ul>
    </div>
  )
}

export default function FitResult({ result }) {
  const { fit_score, strengths, gaps, talking_points } = result
  const label = fit_score >= 75 ? 'Strong Fit' : fit_score >= 55 ? 'Moderate Fit' : 'Weak Fit'
  const labelClass = fit_score >= 75 ? 'label-strong' : fit_score >= 55 ? 'label-moderate' : 'label-weak'

  return (
    <div className="fit-result">
      <div className="score-section">
        <ScoreCircle score={fit_score} />
        <div className="score-meta">
          <span className={`fit-label ${labelClass}`}>{label}</span>
        </div>
      </div>
      <div className="result-grid">
        <Section title="Top 3 Strengths" items={strengths} className="section-strengths" />
        <Section title="Top 3 Gaps" items={gaps} className="section-gaps" />
        <Section title="Talking Points" items={talking_points} className="section-talking" />
      </div>
    </div>
  )
}
