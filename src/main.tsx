import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

const faviconSource =
  (import.meta.env.VITE_FAVICON_URL as string | undefined)?.trim() || '/favicon.png';

const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (favicon) {
  favicon.href = faviconSource;
} else {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = faviconSource;
  document.head.appendChild(link);
}

createRoot(document.getElementById('root')!).render(<App />);
