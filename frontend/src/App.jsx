import React, { useState } from 'react'
import JobFitEvaluator from './components/JobFitEvaluator'
import RoleDiscovery from './components/RoleDiscovery'
import Dashboard from './components/Dashboard'

export default function App() {
  const [activeTab, setActiveTab] = useState('discovery')
  const [evaluatorKey, setEvaluatorKey] = useState(0)
  const [evalInit, setEvalInit] = useState({ jd: '', company: '', role: '', jdIncomplete: false })

  function handleEvaluateJob({ jd, company = '', role = '', jdIncomplete = false }) {
    setEvalInit({ jd, company, role, jdIncomplete })
    setEvaluatorKey(k => k + 1)
    setActiveTab('evaluator')
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Career Intelligence Dashboard</h1>
        <p className="subtitle">Mauricio Velazquez Ocampo</p>
      </header>
      <nav className="tab-nav">
        {[
          ['discovery', 'Role Discovery'],
          ['evaluator', 'Fit Evaluator'],
          ['dashboard', 'Dashboard'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`tab-btn${activeTab === id ? ' tab-active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="app-main">
        <div style={{ display: activeTab === 'discovery' ? 'block' : 'none' }}>
          <RoleDiscovery onEvaluate={handleEvaluateJob} />
        </div>
        <div style={{ display: activeTab === 'evaluator' ? 'block' : 'none' }}>
          <JobFitEvaluator
            key={evaluatorKey}
            initialJD={evalInit.jd}
            initialCompany={evalInit.company}
            initialRole={evalInit.role}
            initialJDIncomplete={evalInit.jdIncomplete}
          />
        </div>
        <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
          <Dashboard active={activeTab === 'dashboard'} />
        </div>
      </main>
    </div>
  )
}
