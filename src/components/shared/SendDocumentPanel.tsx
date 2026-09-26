import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { assignDocument, createDocumentResource, type ResourceRow } from '@/lib/documentResources';
import { flushEmailOutbox } from '@/lib/notifications';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

type Person = { id: string; full_name: string; email: string };

/** Admin tool: push a document (recruitment form, onboarding pack...) to one or many employees. */
export default function SendDocumentPanel({ onSent }: { onSent?: () => void }) {
  const admin = useAuthStore((state) => state.user);
  const [people, setPeople] = useState<Person[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'upload' | 'existing'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('recruitment_form');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadLists() {
    const [peopleRes, resourceRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').eq('role', 'employee').order('full_name'),
      supabase
        .from('document_resources')
        .select('id, title, description, document_kind, file_path, created_at')
        .order('created_at', { ascending: false }),
    ]);
    setPeople((peopleRes.data ?? []) as Person[]);
    setResources((resourceRes.data ?? []) as ResourceRow[]);
  }

  useEffect(() => {
    void loadLists();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return people;
    return people.filter((person) => `${person.full_name} ${person.email}`.toLowerCase().includes(term));
  }, [people, search]);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!admin?.id) return;
    setError('');
    setMessage('');

    if (selected.length === 0) return setError('Select at least one employee.');
    if (source === 'upload' && (!file || !title.trim())) return setError('Choose a file and give it a title.');
    if (source === 'existing' && !resourceId) return setError('Choose a document to send.');

    setBusy(true);
    try {
      let id = resourceId;
      if (source === 'upload' && file) {
        const created = await createDocumentResource({ adminId: admin.id, file, title, description, kind: kind as never });
        if (created.error || !created.resource) throw new Error(created.error ?? 'Upload failed.');
        id = created.resource.id;
      }

      const assigned = await assignDocument({ resourceId: id, profileIds: selected, note, adminId: admin.id });
      if (assigned.error) throw new Error(assigned.error);

      setMessage(`Document sent to ${selected.length} employee${selected.length === 1 ? '' : 's'}. They were notified in their dashboard and by email.`);
      setSelected([]);
      setFile(null);
      setTitle('');
      setDescription('');
      setNote('');
      setResourceId('');
      flushEmailOutbox();
      await loadLists();
      onSent?.();
    } catch (err) {
      setError(errorMessage(err, 'Unable to send the document.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-card" style={{ marginBottom: 20 }}>
      <h2>
        <Send size={19} style={{ verticalAlign: '-3px' }} /> Push a document to employees
      </h2>
      <p className="hint">
        Upload a recruitment form or any file and send it to employees. It appears on their Documents page for download.
        To send to a single candidate, you can also do it from that candidate’s application page.
      </p>

      {error ? <div className="error-message" style={{ marginTop: 14 }}>{error}</div> : null}
      {message ? <p className="success-message" style={{ marginTop: 14 }}>{message}</p> : null}

      <form className="form" onSubmit={submit}>
        <div className="row-2">
          <label>
            Source
            <select value={source} onChange={(event) => setSource(event.target.value as 'upload' | 'existing')}>
              <option value="upload">Upload a new file</option>
              <option value="existing" disabled={resources.length === 0}>
                Reuse an uploaded document
              </option>
            </select>
          </label>
          {source === 'upload' ? (
            <label>
              Type
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="recruitment_form">Recruitment form</option>
                <option value="onboarding_form">Onboarding form</option>
                <option value="other">Other</option>
              </select>
            </label>
          ) : (
            <label>
              Document
              <select value={resourceId} onChange={(event) => setResourceId(event.target.value)}>
                <option value="">Select a document</option>
                {resources.map((resource) => (
                  <option value={resource.id} key={resource.id}>
                    {resource.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {source === 'upload' ? (
          <>
            <div className="row-2">
              <label>
                File (PDF, DOC, DOCX, JPG, PNG - max 5 MB)
                <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              </label>
              <label>
                Title
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Recruitment form" />
              </label>
            </div>
            <label>
              Description (optional)
              <input value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
          </>
        ) : null}

        <label>
          Note to employees (optional)
          <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        <div>
          <strong style={{ fontSize: 13 }}>Recipients ({selected.length} selected)</strong>
          <input
            style={{ marginTop: 8, width: '100%' }}
            placeholder="Search employees by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 12, marginTop: 8, padding: '6px 12px' }}>
            {filtered.length === 0 ? (
              <p className="muted small">No employees found.</p>
            ) : (
              filtered.map((person) => (
                <label className="check" key={person.id} style={{ padding: '6px 0' }}>
                  <input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} />
                  <span>
                    {person.full_name} <span className="muted small">{person.email}</span>
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="inline-actions" style={{ marginTop: 8 }}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSelected(filtered.map((person) => person.id))}>
              Select all shown
            </button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSelected([])}>
              Clear
            </button>
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Sending...' : 'Send document'}
        </button>
      </form>
    </div>
  );
}
