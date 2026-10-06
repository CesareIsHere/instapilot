import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, Plus, Activity, Send, Palette, Settings } from 'lucide-react';
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
          : 'text-slate-400 hover:bg-white/10 hover:text-white',
      )}
    >
      <span className={cn('w-4 h-4', active ? 'text-violet-300' : '')}>{icon}</span>
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
    <aside className="fixed left-0 top-0 bottom-0 w-56 bg-slate-950 text-white flex flex-col z-20">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500">
            <Send className="w-3.5 h-3.5 text-white" />
          </span>
          <span className="font-bold text-[17px] tracking-tight">Instapilot</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-1 ml-[34px]">Content Studio</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        <NavItem to="/" icon={<LayoutGrid size={16} />} label="Library" />
        <NavItem to="/new" icon={<Plus size={16} />} label="New content" />
        <NavItem to="/jobs" icon={<Activity size={16} />} label="Generations" />
        <NavItem to="/brand" icon={<Palette size={16} />} label="Brand kit" />
        <NavItem to="/settings" icon={<Settings size={16} />} label="Settings" />
      </nav>

      {/* Health */}
      <div className="px-5 py-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              health === null ? 'bg-white/30' : health.bundleReady ? 'bg-emerald-400' : 'bg-amber-400',
            )}
          />
          <span className="text-[11px] text-slate-400">
            {health === null ? 'Checking…' : health.bundleReady ? 'Service online' : 'Preparing bundle…'}
          </span>
        </div>
      </div>
    </aside>
  );
}
