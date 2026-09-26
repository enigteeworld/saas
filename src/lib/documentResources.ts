import { supabase } from './supabase';
import { DOCUMENT_BUCKET, validateDocument, type ApplicationDocumentKind } from './storage';
import { errorMessage } from './errors';

function safeFileName(name: string) {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}

export type ResourceRow = {
  id: string;
  title: string;
  description: string | null;
  document_kind: string;
  file_path: string;
  created_at: string;
};

/** Upload a file to the private bucket and register it as a reusable HR document resource. */
export async function createDocumentResource(input: {
  adminId: string;
  file: File;
  title: string;
  description?: string;
  kind: ApplicationDocumentKind;
}): Promise<{ resource?: ResourceRow; error?: string }> {
  const validation = validateDocument(input.file);
  if (validation) return { error: validation };

  const path = `resources/${crypto.randomUUID()}/${safeFileName(input.file.name)}`;
  const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, input.file, {
    upsert: false,
    contentType: input.file.type,
    cacheControl: '3600',
  });
  if (uploadError) return { error: errorMessage(uploadError, 'File upload failed.') };

  const { data, error } = await supabase
    .from('document_resources')
    .insert({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      document_kind: input.kind,
      file_path: path,
      is_public: false,
      created_by: input.adminId,
    })
    .select('id, title, description, document_kind, file_path, created_at')
    .single();

  if (error) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
    return { error: errorMessage(error) };
  }
  return { resource: data as ResourceRow };
}

/** Push an existing resource to one or more employees (creates dashboard entry + notification + email via trigger). */
export async function assignDocument(input: {
  resourceId: string;
  profileIds: string[];
  applicationId?: string | null;
  note?: string;
  adminId: string;
}): Promise<{ error?: string }> {
  const rows = input.profileIds.map((profileId) => ({
    resource_id: input.resourceId,
    profile_id: profileId,
    application_id: input.applicationId ?? null,
    note: input.note?.trim() || null,
    assigned_by: input.adminId,
  }));
  const { error } = await supabase.from('document_assignments').insert(rows);
  if (error) {
    if (error.code === '23505') return { error: 'This document has already been sent to that employee for this application.' };
    return { error: errorMessage(error) };
  }
  return {};
}
