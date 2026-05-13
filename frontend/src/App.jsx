import React, { useState, useEffect } from 'react'
import JobFitEvaluator from './components/JobFitEvaluator'
import RoleDiscovery from './components/RoleDiscovery'
import Dashboard from './components/Dashboard'
import Login from './components/Login'
import { getToken } from './api'

export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken())
  const [activeTab, setActiveTab] = useState('discovery')
  const [evaluatorKey, setEvaluatorKey] = useState(0)
  const [evalInit, setEvalInit] = useState({ jd: '', company: '', role: '', url: '', source: '', jobId: '', jdIncomplete: false })
  const [savedJobIds, setSavedJobIds] = useState(new Set())

  useEffect(() => {
    const onLogout = () => setAuthed(false)
    window.addEventListener('auth:logout', onLogout)
    return () => window.removeEventListener('auth:logout', onLogout)
  }, [])

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />
  }

  function handleEvaluateJob({ jd, company = '', role = '', url = '', source = '', jobId = '', jdIncomplete = false }) {
    setEvalInit({ jd, company, role, url, source, jobId, jdIncomplete })
    setEvaluatorKey(k => k + 1)
    setActiveTab('evaluator')
  }

  function handleJobSaved(jobId) {
    if (jobId) setSavedJobIds(prev => new Set([...prev, jobId]))
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
          <RoleDiscovery onEvaluate={handleEvaluateJob} savedJobIds={savedJobIds} />
        </div>
        <div style={{ display: activeTab === 'evaluator' ? 'block' : 'none' }}>
          <JobFitEvaluator
            key={evaluatorKey}
            initialJD={evalInit.jd}
            initialCompany={evalInit.company}
            initialRole={evalInit.role}
            initialUrl={evalInit.url}
            initialSource={evalInit.source}
            initialJobId={evalInit.jobId}
            initialJDIncomplete={evalInit.jdIncomplete}
            onSaveSuccess={handleJobSaved}
          />
        </div>
        <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
          <Dashboard active={activeTab === 'dashboard'} />
        </div>
      </main>
    </div>
  )
}
