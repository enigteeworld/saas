import type { ReactNode } from 'react';
import EmptyState from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId?: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
}

function cellValue<T>(row: T, key: string): ReactNode {
  const value = (row as Record<string, unknown>)[key];
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number') return value;
  return String(value);
}

function defaultRowKey<T>(row: T, index: number): string {
  const id = (row as Record<string, unknown>).id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : String(index);
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'Records will appear here once they exist.',
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === 'right' ? 'align-right' : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={getRowId ? getRowId(row, index) : defaultRowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key} className={column.align === 'right' ? 'align-right' : undefined}>
                  {column.render ? column.render(row) : cellValue(row, column.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
