import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { supabase } from '@/lib/supabase';
import { getApplicationDocumentUrl } from '@/lib/applicationDocuments';
import { replaceApplicationDocument } from '@/lib/applicationDocuments';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

type DocumentRow = {
  id: string;
  application_id: string;
  document_kind: string;
  file_path: string;
  original_name: string | null;
  mime_type: string | null;
  created_at: string;
};

type AssignmentRow = {
  id: string;
  application_id: string | null;
  note: string | null;
  created_at: string;
  viewed_at: string | null;
  downloaded_at: string | null;
  document_resources: {
    id: string;
    title: string;
    description: string | null;
    document_kind: string;
    file_path: string;
  } | null;
};

function label(kind: string) {
  return kind.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function EmployeeDocumentsPage() {
  const user = useAuthStore((state) => state.user);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadDocuments() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [{ data: documentData, error: documentError }, { data: assignmentData, error: assignmentError }] =
        await Promise.all([
          supabase
            .from('application_documents')
            .select('id, application_id, document_kind, file_path, original_name, mime_type, created_at')
            .eq('uploaded_by', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('document_assignments')
            .select(`
              id,
              application_id,
              note,
              created_at,
              viewed_at,
              downloaded_at,
              document_resources (
                id,
                title,
                description,
                document_kind,
                file_path
              )
            `)
            .eq('profile_id', user.id)
            .order('created_at', { ascending: false }),
        ]);

      if (documentError) throw documentError;
      if (assignmentError) throw assignmentError;

      setDocuments((documentData ?? []) as DocumentRow[]);
      const assigned = (assignmentData ?? []) as unknown as AssignmentRow[];
      setAssignments(assigned);

      // Opening the page counts as viewing anything newly assigned.
      const unseen = assigned.filter((item) => !item.viewed_at).map((item) => item.id);
      if (unseen.length > 0) {
        void supabase
          .from('document_assignments')
          .update({ viewed_at: new Date().toISOString() })
          .in('id', unseen)
          .eq('profile_id', user.id);
      }
    } catch (err) {
      console.error('Unable to load documents:', err);
      setError(errorMessage(err, 'Unable to load your documents.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, [user?.id]);

  async function downloadApplicationDocument(document: DocumentRow) {
    setBusyId(document.id);
    setError('');

    try {
      const { data, error: signedUrlError } = await getApplicationDocumentUrl(
        document.file_path,
      );

      if (signedUrlError || !data?.signedUrl) {
        throw signedUrlError ?? new Error('Unable to create a secure download link.');
      }

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to download document.',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function downloadAssignedDocument(assignment: AssignmentRow) {
    const resource = assignment.document_resources;
    if (!resource) return;

    setBusyId(assignment.id);
    setError('');

    try {
      const { data, error: signedUrlError } = await getApplicationDocumentUrl(
        resource.file_path,
      );

      if (signedUrlError || !data?.signedUrl) {
        throw signedUrlError ?? new Error('Unable to create a secure download link.');
      }

      await supabase
        .from('document_assignments')
        .update({
          downloaded_at: new Date().toISOString(),
        })
        .eq('id', assignment.id)
        .eq('profile_id', user?.id);

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to download document.',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function uploadCompleted(assignment: AssignmentRow, file: File | null) {
    if (!file || !user?.id || !assignment.application_id) return;
    setBusyId(assignment.id);
    setError('');
    setNotice('');
    try {
      const kind = assignment.document_resources?.document_kind === 'onboarding_form' ? 'onboarding_form' : 'recruitment_form';
      const result = await replaceApplicationDocument(user.id, assignment.application_id, kind, file);
      if (result.error) throw result.error;
      setNotice('Completed form uploaded. HR can now see it on your application.');
      await loadDocuments();
    } catch (err) {
      setError(errorMessage(err, 'Unable to upload the completed form.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="My documents"
        title="Documents"
        description="Application documents you submitted and documents assigned to you by EnigteeWorld."
      />

      {error ? (
        <div className="error-message">
          {error}
        </div>
      ) : null}
      {notice ? <p className="success-message" style={{ marginBottom: 16 }}>{notice}</p> : null}

      <div className="content-card">
        <div className="card-heading">
          <h2>Assigned documents</h2>
          <span className="muted small">Private EnigteeWorld documents</span>
        </div>

        {assignments.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nothing assigned yet"
            description="Recruitment forms and other documents sent by HR will appear here. You will also get a notification and an email."
          />
        ) : (
          assignments.map((assignment) => {
            const resource = assignment.document_resources;
            if (!resource) return null;
            const isNew = !assignment.downloaded_at;

            return (
              <div className="list-row" key={assignment.id} style={{ alignItems: 'flex-start' }}>
                <FileText size={18} />
                <div>
                  <strong>
                    {resource.title}{' '}
                    {isNew ? <span className="tag">New</span> : null}
                  </strong>
                  <p>
                    {label(resource.document_kind)}
                    {resource.description ? ` · ${resource.description}` : ''}
                    {` · sent ${new Date(assignment.created_at).toLocaleDateString('en-NG')}`}
                  </p>
                  {assignment.note ? (
                    <p style={{ color: 'var(--ink)' }}>Note from HR: {assignment.note}</p>
                  ) : null}
                  {assignment.application_id ? (
                    <label className="small" style={{ display: 'block', marginTop: 8 }}>
                      Upload completed copy:{' '}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        disabled={busyId === assignment.id}
                        onChange={(event) => {
                          void uploadCompleted(assignment, event.target.files?.[0] ?? null);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  ) : null}
                </div>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={busyId === assignment.id}
                  onClick={() => void downloadAssignedDocument(assignment)}
                >
                  {busyId === assignment.id ? (
                    <Loader2 size={15} className="spin" />
                  ) : (
                    <Download size={15} />
                  )}
                  Download
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="content-card" style={{ marginTop: 20 }}>
        <div className="card-heading">
          <h2>Submitted application documents</h2>
          <span className="muted small">
            Uploads are attached to their specific applications.
          </span>
        </div>

        {loading ? (
          <div className="empty-state">
            <Loader2 size={20} className="spin" />
            <p>Loading documents...</p>
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No application documents"
            description="CVs and application letters will appear here after you apply for a job."
          />
        ) : (
          documents.map((document) => (
            <div className="list-row" key={document.id}>
              <FileText size={18} />
              <div>
                <strong>{document.original_name || label(document.document_kind)}</strong>
                <p>
                  {label(document.document_kind)} · Application {document.application_id}
                </p>
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={busyId === document.id}
                onClick={() => void downloadApplicationDocument(document)}
              >
                {busyId === document.id ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  <Download size={15} />
                )}
                Download
              </button>
            </div>
          ))
        )}
      </div>

    </section>
  );
}
