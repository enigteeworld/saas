import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyFavicon, loadBranding } from '@/lib/branding';

const fallbackFavicon =
  (import.meta.env.VITE_FAVICON_URL as string | undefined)?.trim() || '/favicon.png';

applyFavicon(fallbackFavicon);
void loadBranding()
  .then((branding) => {
    applyFavicon(branding?.favicon_url || branding?.logo_url || fallbackFavicon);
  })
  .catch(() => {
    applyFavicon(fallbackFavicon);
  });

createRoot(document.getElementById('root')!).render(<App />);
