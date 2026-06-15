import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, Plus, Activity, Diamond, Palette, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const location = useLocation();
  const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
  return (
    <NavLink
      to={to}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
        active
          ? 'bg-white/15 text-white'
          : 'text-blue-200/80 hover:bg-white/10 hover:text-white',
      )}
    >
      <span className={cn('w-4 h-4', active ? 'text-[#00B373]' : '')}>{icon}</span>
      {label}
    </NavLink>
  );
}

export function Sidebar() {
  const [health, setHealth] = useState<{ bundleReady: boolean } | null>(null);

  useEffect(() => {
    const check = () => api.health().then(setHealth).catch(() => setHealth(null));
    check();
    const t = setInterval(check, 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-56 bg-[#012A78] text-white flex flex-col z-20">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <Diamond className="w-5 h-5 text-[#00B373] fill-[#00B373]" />
          <span className="font-bold text-[17px] tracking-tight">Instapilot</span>
        </div>
        <p className="text-[11px] text-blue-200/60 mt-1 ml-[29px]">Content Studio</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        <NavItem to="/" icon={<LayoutGrid size={16} />} label="Libreria" />
        <NavItem to="/new" icon={<Plus size={16} />} label="Nuovo contenuto" />
        <NavItem to="/jobs" icon={<Activity size={16} />} label="Generazioni" />
        <NavItem to="/brand" icon={<Palette size={16} />} label="Brand kit" />
        <NavItem to="/settings" icon={<Settings size={16} />} label="Impostazioni" />
      </nav>

      {/* Health */}
      <div className="px-5 py-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              health === null ? 'bg-white/30' : health.bundleReady ? 'bg-[#00B373]' : 'bg-amber-400',
            )}
          />
          <span className="text-[11px] text-blue-200/70">
            {health === null ? 'Verifica…' : health.bundleReady ? 'Servizio online' : 'Bundle in preparazione…'}
          </span>
        </div>
      </div>
    </aside>
  );
}
