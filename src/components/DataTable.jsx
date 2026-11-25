import { Search } from 'lucide-react'

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' && value.includes('T') && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  }
  return String(value).replaceAll('_', ' ')
}

export default function DataTable({
  columns, rows, loading, search, onSearch, filters = [], filterValues = {}, onFilterChange,
  actions, emptyTitle = 'No records found', emptyText = 'Try adjusting your search or filters.',
}) {
  return (
    <div className="table-card">
      <div className="table-toolbar">
        {onSearch && (
          <label className="search-field">
            <Search size={17} />
            <input aria-label="Search records" placeholder="Search records..." value={search} onChange={(event) => onSearch(event.target.value)} />
          </label>
        )}
        {filters.map((filter) => (
          <select key={filter.key} aria-label={`Filter by ${filter.label}`} value={filterValues[filter.key] || ''} onChange={(event) => onFilterChange(filter.key, event.target.value)}>
            <option value="">{`All ${filter.label}`}</option>
            {filter.options.map((option) => <option key={option} value={option}>{displayValue(option)}</option>)}
          </select>
        ))}
      </div>
      {loading ? <div className="table-loading"><span className="spinner" /> Loading records…</div> : rows.length === 0 ? (
        <div className="empty-state"><div className="empty-mark">✦</div><h3>{emptyTitle}</h3><p>{emptyText}</p></div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}{actions && <th className="actions-heading">Actions</th>}</tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.render ? column.render(row[column.key], row) : column.status ? <span className={`status-pill status-${String(row[column.key] || '').toLowerCase().replaceAll(' ', '-')}`}>{displayValue(row[column.key])}</span> : displayValue(row[column.key])}
                  </td>
                ))}
                {actions && <td className="row-actions">{actions(row)}</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
