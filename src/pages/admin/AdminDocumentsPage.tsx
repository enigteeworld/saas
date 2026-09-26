import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import type { Column } from '@/components/shared/DataTable';
import StatCard from '@/components/shared/StatCard';
import EmptyState from '@/components/shared/EmptyState';
import SendDocumentPanel from '@/components/shared/SendDocumentPanel';
import { supabase } from '@/lib/supabase';
import { getApplicationDocumentUrl } from '@/lib/applicationDocuments';

type DocumentRow = {
  id: string;
  application_id: string;
  document_kind: string;
  file_path: string;
  original_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  candidate: string;
  application_number: string;
  job_title: string;
};

function formatKind(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export default function AdminDocumentsPage() {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadDocuments() {
    setLoading(true);
    setError('');

    try {
      const { data, error: documentError } = await supabase
        .from('application_documents')
        .select(`
          id,
          application_id,
          document_kind,
          file_path,
          original_name,
          mime_type,
          file_size,
          created_at,
          job_applications (
            application_number,
            applicant_id,
            job_id,
            profiles:applicant_id (
              full_name
            ),
            job_openings:job_id (
              title
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (documentError) throw documentError;

      const mapped = (data ?? []).map((item) => {
        const application = Array.isArray(item.job_applications)
          ? item.job_applications[0]
          : item.job_applications;

        const profile = application?.profiles
          ? Array.isArray(application.profiles)
            ? application.profiles[0]
            : application.profiles
          : null;

        const job = application?.job_openings
          ? Array.isArray(application.job_openings)
            ? application.job_openings[0]
            : application.job_openings
          : null;

        return {
          id: item.id,
          application_id: item.application_id,
          document_kind: item.document_kind,
          file_path: item.file_path,
          original_name: item.original_name,
          mime_type: item.mime_type,
          file_size: item.file_size,
          created_at: item.created_at,
          candidate: profile?.full_name ?? 'Unknown candidate',
          application_number: application?.application_number ?? item.application_id,
          job_title: job?.title ?? 'Unknown role',
        };
      });

      setRows(mapped);
    } catch (err) {
      console.error('Unable to load admin documents:', err);
      setError(
        err instanceof Error ? err.message : 'Unable to load documents.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function download(row: DocumentRow) {
    setBusyId(row.id);
    setError('');

    try {
      const { data, error: signedUrlError } = await getApplicationDocumentUrl(
        row.file_path,
      );

      if (signedUrlError || !data?.signedUrl) {
        throw signedUrlError ?? new Error('Unable to create secure download link.');
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

  const columns: Column<DocumentRow>[] = [
    {
      key: 'original_name',
      header: 'Document',
      render: (row) => row.original_name || formatKind(row.document_kind),
    },
    { key: 'candidate', header: 'Candidate' },
    { key: 'job_title', header: 'Role' },
    {
      key: 'document_kind',
      header: 'Type',
      render: (row) => formatKind(row.document_kind),
    },
    {
      key: 'created_at',
      header: 'Uploaded',
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <button
          className="btn btn-secondary"
          type="button"
          disabled={busyId === row.id}
          onClick={() => void download(row)}
        >
          {busyId === row.id ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <Download size={15} />
          )}
          Download
        </button>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        eyebrow="Records"
        title="Documents"
        description="Push forms to employees, and review application documents uploaded by candidates."
      />

      {error ? <div className="error-message">{error}</div> : null}

      <SendDocumentPanel />

      <div className="stat-grid">
        <StatCard label="Documents" value={loading ? '—' : rows.length} hint="Application files" />
        <StatCard
          label="CVs"
          value={loading ? '—' : rows.filter((row) => row.document_kind === 'cv').length}
          hint="Submitted CVs"
        />
        <StatCard
          label="Letters"
          value={loading ? '—' : rows.filter((row) => row.document_kind === 'application_letter').length}
          hint="Application letters"
        />
      </div>

      <div className="content-card">
        {loading ? (
          <div className="empty-state">
            <Loader2 size={20} className="spin" />
            <p>Loading documents...</p>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No application documents"
            description="Candidate CVs and application letters will appear here after applications are submitted."
          />
        ) : (
          <DataTable columns={columns} rows={rows} />
        )}
      </div>
    </section>
  );
}
