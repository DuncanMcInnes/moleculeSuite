import { useEffect, useState } from 'react';
import { Job } from '../types';

const MODULES = ['biosar', 'rfdiffusion_aa', 'partial_diffusion', 'lanmodulin'];

function calcDuration(job: Job): string {
  if (!job.started_at) return '—';
  const start = new Date(job.started_at + 'Z').getTime();
  const end = job.completed_at
    ? new Date(job.completed_at + 'Z').getTime()
    : Date.now();
  const secs = Math.floor((end - start) / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function StatusBadge({ status }: { status: Job['status'] }) {
  return (
    <span className={`job-badge job-badge--${status}`}>{status}</span>
  );
}

export default function JobsPanel() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // form state
  const [module, setModule] = useState('biosar');
  const [params, setParams] = useState('{}');
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // detail state
  const [outputs, setOutputs] = useState<string[]>([]);

  async function fetchJobs() {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      if (res.ok) setJobs(data.data);
    } catch (_) {}
  }

  // fetch on mount
  useEffect(() => { fetchJobs(); }, []);

  // poll while any job is active
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'pending' || j.status === 'running');
    if (!hasActive) return;
    const id = setInterval(fetchJobs, 3000);
    return () => clearInterval(id);
  }, [jobs]);

  // fetch outputs when entering detail view for a complete job
  useEffect(() => {
    if (!selectedJobId) { setOutputs([]); return; }
    const job = jobs.find(j => j.id === selectedJobId);
    if (!job || job.status !== 'complete') { setOutputs([]); return; }
    fetch(`/api/jobs/${selectedJobId}/outputs`)
      .then(r => r.json())
      .then(d => setOutputs(d.data ?? []))
      .catch(() => setOutputs([]));
  }, [selectedJobId, jobs]);

  async function handleSubmit() {
    let parsed: unknown;
    try { parsed = JSON.parse(params); } catch (_) {
      setParamsError('Invalid JSON'); return;
    }
    setParamsError(null);
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module, parameters: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'Submit failed');
      setJobs(prev => [data.data, ...prev]);
      setParams('{}');
      setShowForm(false);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleCancel(jobId: string) {
    try {
      await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      await fetchJobs();
    } catch (_) {}
  }

  const selectedJob = jobs.find(j => j.id === selectedJobId) ?? null;

  return (
    <div className="jobs-panel">
      <div className="jobs-panel__header">
        <span className="jobs-panel__title">Jobs</span>
        {!selectedJobId && (
          <button className="repr-btn" onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : '+ New Job'}
          </button>
        )}
      </div>

      <div className="jobs-panel__body">
        {/* ── Detail view ── */}
        {selectedJob ? (
          <div className="job-detail">
            <button className="job-detail__back" onClick={() => setSelectedJobId(null)}>
              ← Back to list
            </button>

            <div className="job-detail__section">
              {[
                ['ID',         selectedJob.id],
                ['Module',     selectedJob.module],
                ['Status',     null],
                ['Created',    selectedJob.created_at],
                ['Started',    selectedJob.started_at ?? '—'],
                ['Completed',  selectedJob.completed_at ?? '—'],
                ['Duration',   calcDuration(selectedJob)],
                ['Output dir', selectedJob.output_dir ?? '—'],
                ['Error',      selectedJob.error ?? '—'],
              ].map(([key, val]) => (
                <div className="job-detail__field" key={key as string}>
                  <span className="job-detail__key">{key}</span>
                  <span className="job-detail__val">
                    {key === 'Status'
                      ? <StatusBadge status={selectedJob.status} />
                      : val as string}
                  </span>
                </div>
              ))}
            </div>

            <div className="job-detail__section">
              <div className="job-detail__field">
                <span className="job-detail__key">Parameters</span>
              </div>
              <pre className="job-detail__val">
                {JSON.stringify(selectedJob.parameters, null, 2)}
              </pre>
            </div>

            {selectedJob.status === 'complete' && (
              <div className="job-detail__section">
                <div className="job-detail__field">
                  <span className="job-detail__key">Output files</span>
                </div>
                <div className="job-detail__outputs">
                  {outputs.length === 0
                    ? <span className="job-detail__val">No files yet</span>
                    : outputs.map(f => (
                        <span className="job-detail__output-file" key={f}>{f}</span>
                      ))}
                </div>
              </div>
            )}

            {(selectedJob.status === 'pending' || selectedJob.status === 'running') && (
              <button
                className="btn-primary"
                style={{ maxWidth: 160 }}
                onClick={() => handleCancel(selectedJob.id)}
              >
                Cancel job
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ── Submit form ── */}
            {showForm && (
              <div className="job-form">
                <div className="job-form__row">
                  <label className="job-form__label">Module</label>
                  <select
                    className="job-form__select"
                    value={module}
                    onChange={e => setModule(e.target.value)}
                  >
                    {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="job-form__row">
                  <label className="job-form__label">Parameters (JSON)</label>
                  <textarea
                    className="job-form__textarea"
                    value={params}
                    onChange={e => { setParams(e.target.value); setParamsError(null); }}
                  />
                  {paramsError && <span className="job-form__error">{paramsError}</span>}
                </div>
                {submitError && <span className="job-form__error">{submitError}</span>}
                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={submitLoading}
                >
                  {submitLoading ? 'Submitting…' : 'Submit job'}
                </button>
              </div>
            )}

            {/* ── Job list ── */}
            {jobs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                No jobs yet. Submit one above.
              </p>
            ) : (
              <table className="job-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Module</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => (
                    <tr
                      key={job.id}
                      className="job-row"
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <td style={{ fontFamily: 'monospace' }}>{job.id.slice(0, 8)}…</td>
                      <td>{job.module}</td>
                      <td><StatusBadge status={job.status} /></td>
                      <td>{job.created_at.replace('T', ' ')}</td>
                      <td>{calcDuration(job)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
