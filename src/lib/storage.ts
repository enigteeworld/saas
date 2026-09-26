import { supabase } from './supabase';

export const DOCUMENT_BUCKET = 'employee-documents';
export const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;

export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
] as const;

export type ApplicationDocumentKind =
  | 'cv'
  | 'application_letter'
  | 'certificate'
  | 'identity'
  | 'recruitment_form'
  | 'onboarding_form'
  | 'other';

export function validateDocument(file: File) {
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type as (typeof ALLOWED_DOCUMENT_TYPES)[number])) {
    return 'Unsupported file type. Upload PDF, DOC, DOCX, JPG or PNG files only.';
  }

  if (file.size > MAX_DOCUMENT_SIZE) {
    return 'File is too large. Each document must be 5 MB or smaller.';
  }

  return null;
}

function safeFileName(name: string) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-');
}

export async function uploadApplicationDocument(
  userId: string,
  applicationId: string,
  kind: ApplicationDocumentKind,
  file: File,
) {
  const validationError = validateDocument(file);

  if (validationError) {
    return { path: null, error: new Error(validationError) };
  }

  const path = [
    userId,
    applicationId,
    kind,
    `${crypto.randomUUID()}-${safeFileName(file.name)}`,
  ].join('/');

  const { error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '3600',
    });

  return { path: error ? null : path, error };
}

export async function deleteEmployeeDocument(path: string) {
  return supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
}

export async function downloadEmployeeDocument(path: string) {
  return supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(path, 300);
}

// ---------------------------------------------------------------------------
// Avatars - public bucket, one folder per user (see avatars-storage-patch.sql)
// ---------------------------------------------------------------------------
export const AVATAR_BUCKET = 'avatars';
export const MAX_AVATAR_SIZE = 3 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function validateAvatar(file: File) {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type as (typeof ALLOWED_AVATAR_TYPES)[number])) {
    return 'Please upload a JPG, PNG or WEBP image.';
  }
  if (file.size > MAX_AVATAR_SIZE) {
    return 'Image is too large. Please use a photo under 3 MB.';
  }
  return null;
}

/** Uploads a profile picture to the user's own folder and returns its public URL. */
export async function uploadAvatar(userId: string, file: File) {
  const validationError = validateAvatar(file);
  if (validationError) return { url: null, error: new Error(validationError) };

  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600',
  });
  if (error) return { url: null, error };

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
