// web/src/components/layout/SetupBanner.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

export function SetupBanner() {
  const [needsSetup, setNeedsSetup] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const check = () =>
      // /health also accounts for keys provided via env (OPENAI_API_KEY / LITELLM_API_KEY).
      api.health()
        .then(h => setNeedsSetup(h.hasApiKey === false))
        .catch(() => setNeedsSetup(false));
    check();
    const t = setInterval(check, 10_000);
    return () => clearInterval(t);
  }, [location.pathname]);

  if (!needsSetup) return null;

  return (
    <div className="sticky top-0 z-30 bg-amber-500 text-white px-6 py-2.5 flex items-center gap-3 text-sm font-medium shadow-sm">
      <AlertTriangle size={16} className="shrink-0" />
      <span className="flex-1">
        API key non configurata — le generazioni non funzioneranno finché non aggiungi la key.
      </span>
      <button
        onClick={() => navigate('/settings')}
        className="underline underline-offset-2 hover:no-underline shrink-0"
      >
        Configura ora →
      </button>
    </div>
  );
}
