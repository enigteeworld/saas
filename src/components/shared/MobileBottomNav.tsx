import type { LucideIcon } from 'lucide-react';
import { Menu } from 'lucide-react';
import { NavLink } from 'react-router-dom';

type Item = {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
};

type Props = {
  items: Item[];
  onMenu: () => void;
};

export default function MobileBottomNav({ items, onMenu }: Props) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {items.slice(0, 4).map(({ label, to, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `mobile-bottom-item${isActive ? ' active' : ''}`
          }
        >
          <Icon size={20} strokeWidth={2.2} />
          <span>{label}</span>
        </NavLink>
      ))}
      
    </nav>
  );
}
