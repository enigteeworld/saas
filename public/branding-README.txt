EnigteeWorld production branding

Preferred production method:

1. Sign in as an EnigteeWorld administrator.
2. Open Admin -> Settings -> Platform branding.
3. Upload the production logo and favicon.
4. The images are stored in the Supabase `branding` bucket and their URLs are
   saved in the Supabase `branding` settings row.
5. The logo is rendered across the public site and workspaces. The favicon is
   applied dynamically by the application on load.

Supported uploads: PNG, JPG, WEBP or SVG, up to 3 MB each.

Fallbacks are still supported for local development:
  public/logo.png
  public/favicon.png

You can also use VITE_LOGO_URL and VITE_FAVICON_URL in .env as static fallback
URLs. The database branding setting takes precedence when it is configured.
