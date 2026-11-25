export default function StatCard({ label, value, detail, error, icon: Icon, tone = 'blue' }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon stat-${tone}`}><Icon size={20} strokeWidth={2} /></div>
      <div className="stat-copy">
        <span className="stat-label">{label}</span>
        <strong>{value ?? '—'}</strong>
        <span className={`stat-detail ${error ? 'stat-detail-error' : ''}`}>{error || detail}</span>
      </div>
    </article>
  )
}