import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { authPaths, homeForRole, publicPaths } from '@/routes/routeConfig';
import { applyFavicon, loadBranding } from '@/lib/branding';

export function Logo({ to = publicPaths.home }: { to?: string }) {
  const [logoSource, setLogoSource] = useState(
    (import.meta.env.VITE_LOGO_URL as string | undefined)?.trim() || '/logo.png',
  );
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    void loadBranding()
      .then((branding) => {
        if (!mounted) return;
        const source = branding?.logo_url?.trim() || logoSource;
        setLogoSource(source);
        setImageFailed(false);
        applyFavicon(branding?.favicon_url || branding?.logo_url);
      })
      .catch(() => {
        // Keep the static fallback if the branding row cannot be read.
      });

    const refresh = () => {
      void loadBranding(true).then((branding) => {
        if (!mounted) return;
        setLogoSource(branding?.logo_url?.trim() || (import.meta.env.VITE_LOGO_URL as string | undefined)?.trim() || '/logo.png');
        setImageFailed(false);
        applyFavicon(branding?.favicon_url || branding?.logo_url);
      });
    };
    window.addEventListener('enigtee:branding-updated', refresh);
    return () => {
      mounted = false;
      window.removeEventListener('enigtee:branding-updated', refresh);
    };
  }, []);

  return (
    <Link to={to} className="logo" aria-label="EnigteeWorld home">
      {!imageFailed && logoSource ? (
        <img
          src={logoSource}
          alt="EnigteeWorld"
          className="brand-logo-image"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <>
          <span className="logo-mark">E</span>Enigtee
          <span className="logo-accent">World</span>
        </>
      )}
    </Link>
  );
}

function SiteHeader() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((state) => state.user);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Logo />
        <button className="mobile-menu" aria-label="Toggle menu" onClick={() => setOpen(!open)}>
          {open ? <X /> : <Menu />}
        </button>
        <nav className={open ? 'nav open' : 'nav'} onClick={() => setOpen(false)}>
          <NavLink to={publicPaths.jobs}>Find Jobs</NavLink>
          <NavLink to={publicPaths.employers}>For Employers</NavLink>
          <NavLink to={publicPaths.howItWorks}>How It Works</NavLink>
          <NavLink to={publicPaths.about}>About</NavLink>
          <NavLink to={publicPaths.contact}>Contact</NavLink>
          <div className="nav-actions">
            {user ? (
              <Link className="btn btn-primary" to={homeForRole(user.role)}>
                My workspace <ArrowRight size={16} />
              </Link>
            ) : (
              <>
                <Link className="btn btn-ghost" to={authPaths.login}>
                  Login
                </Link>
                <Link className="btn btn-primary" to={authPaths.register}>
                  Create account <ArrowRight size={16} />
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Logo />
          <p>Recruitment and workforce management, organized around people.</p>
        </div>
        <div>
          <h4>Explore</h4>
          <Link to={publicPaths.jobs}>Find jobs</Link>
          <Link to={publicPaths.howItWorks}>How it works</Link>
          <Link to={publicPaths.employers}>For employers</Link>
        </div>
        <div>
          <h4>Company</h4>
          <Link to={publicPaths.about}>About us</Link>
          <Link to={publicPaths.contact}>Contact</Link>
        </div>
        <div>
          <h4>Account</h4>
          <Link to={authPaths.login}>Login</Link>
          <Link to={authPaths.register}>Create account</Link>
        </div>
      </div>
      <div className="container footer-bottom">© {new Date().getFullYear()} EnigteeWorld. All rights reserved.</div>
    </footer>
  );
}

export function PublicLayout() {
  return (
    <>
      <SiteHeader />
      <Outlet />
      <SiteFooter />
    </>
  );
}

export default PublicLayout;
