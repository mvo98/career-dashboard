import JobFitEvaluator from './components/JobFitEvaluator'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Career Intelligence Dashboard</h1>
        <p className="subtitle">Mauricio Velazquez Ocampo — Job Fit Evaluator</p>
      </header>
      <main className="app-main">
        <JobFitEvaluator />
      </main>
    </div>
  )
}
