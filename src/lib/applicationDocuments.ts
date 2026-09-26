import { supabase } from './supabase';
import {
  deleteEmployeeDocument,
  downloadEmployeeDocument,
  uploadApplicationDocument,
  type ApplicationDocumentKind,
} from './storage';

export async function replaceApplicationDocument(
  userId: string,
  applicationId: string,
  kind: ApplicationDocumentKind,
  file: File,
) {
  const { data: existing, error: existingError } = await supabase
    .from('application_documents')
    .select('id, file_path')
    .eq('application_id', applicationId)
    .eq('document_kind', kind);

  if (existingError) {
    return { error: existingError };
  }

  for (const document of existing ?? []) {
    await deleteEmployeeDocument(document.file_path);
  }

  if ((existing ?? []).length > 0) {
    const ids = (existing ?? []).map((document) => document.id);
    const { error: deleteError } = await supabase
      .from('application_documents')
      .delete()
      .in('id', ids);

    if (deleteError) {
      return { error: deleteError };
    }
  }

  const upload = await uploadApplicationDocument(
    userId,
    applicationId,
    kind,
    file,
  );

  if (upload.error || !upload.path) {
    return { error: upload.error ?? new Error('Document upload failed.') };
  }

  const { data, error } = await supabase
    .from('application_documents')
    .insert({
      application_id: applicationId,
      document_kind: kind,
      file_path: upload.path,
      original_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by: userId,
    })
    .select('id, application_id, document_kind, file_path, original_name, mime_type, file_size, uploaded_by, created_at')
    .single();

  if (error) {
    await deleteEmployeeDocument(upload.path);
    return { error };
  }

  return { data, error: null };
}

export async function getApplicationDocumentUrl(path: string) {
  return downloadEmployeeDocument(path);
}
