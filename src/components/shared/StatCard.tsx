import type { LucideIcon } from 'lucide-react';

export interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
}

export function StatCard({ label, value, hint, icon: Icon }: StatCardProps) {
  return (
    <div className="stat-card">
      {Icon ? <Icon size={20} /> : null}
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

export default StatCard;
