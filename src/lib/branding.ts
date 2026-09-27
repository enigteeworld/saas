import { supabase } from './supabase';
import { errorMessage } from './errors';

export type BrandingSettings = {
  id: string;
  logo_url: string | null;
  favicon_url: string | null;
  updated_at: string;
};

export const BRANDING_BUCKET = 'branding';
export const MAX_BRANDING_IMAGE_SIZE = 3 * 1024 * 1024;
export const ALLOWED_BRANDING_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;

let brandingCache: BrandingSettings | null | undefined;
let brandingPromise: Promise<BrandingSettings | null> | null = null;

export function validateBrandingImage(file: File) {
  if (!ALLOWED_BRANDING_TYPES.includes(file.type as (typeof ALLOWED_BRANDING_TYPES)[number])) {
    return 'Please upload a PNG, JPG, WEBP or SVG image.';
  }
  if (file.size > MAX_BRANDING_IMAGE_SIZE) {
    return 'Image is too large. Please use an image under 3 MB.';
  }
  return null;
}

export async function loadBranding(force = false) {
  if (!force && brandingCache !== undefined) return brandingCache;
  if (!force && brandingPromise) return brandingPromise;

  brandingPromise = supabase
    .from('branding')
    .select('id, logo_url, favicon_url, updated_at')
    .eq('id', 'default')
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) throw error;
      brandingCache = (data as BrandingSettings | null) ?? null;
      return brandingCache;
    })
    .finally(() => {
      brandingPromise = null;
    });

  return brandingPromise;
}

export function setBrandingCache(value: BrandingSettings | null) {
  brandingCache = value;
  brandingPromise = null;
  window.dispatchEvent(new CustomEvent('enigtee:branding-updated'));
}

export function applyFavicon(url?: string | null) {
  const source = url?.trim() || (import.meta.env.VITE_FAVICON_URL as string | undefined)?.trim() || '/favicon.png';
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = source;
}

export async function uploadBrandingAsset(kind: 'logo' | 'favicon', file: File) {
  const validationError = validateBrandingImage(file);
  if (validationError) return { url: null, error: new Error(validationError) };

  const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `default/${kind}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(BRANDING_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: '3600',
  });
  if (error) return { url: null, error };

  const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function saveBranding(input: { logoUrl?: string | null; faviconUrl?: string | null }) {
  const { data, error } = await supabase.rpc('admin_set_branding', {
    p_logo_url: input.logoUrl ?? null,
    p_favicon_url: input.faviconUrl ?? null,
  });
  if (error) return { data: null, error: errorMessage(error, 'Unable to save platform branding.') };
  const branding = data as BrandingSettings;
  setBrandingCache(branding);
  applyFavicon(branding.favicon_url || branding.logo_url);
  return { data: branding, error: null };
}
