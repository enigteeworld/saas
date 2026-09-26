import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

import PageHeader from '@/components/shared/PageHeader';
import { supabase } from '@/lib/supabase';

interface EmployerFormData {
  business_name: string;
  business_type: string;
  business_email: string;
  business_phone: string;
  business_address: string;
  website: string;
  password: string;
}

export default function AdminCreateEmployerPage() {
  const navigate = useNavigate();

  const [formData, setFormData] =
    useState<EmployerFormData>({
      business_name: '',
      business_type: '',
      business_email: '',
      business_phone: '',
      business_address: '',
      website: '',
      password: '',
    });

  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [createdEmail, setCreatedEmail] = useState('');
  const [error, setError] = useState('');

  function updateField(
    field: keyof EmployerFormData,
    value: string
  ) {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));

    if (error) {
      setError('');
    }

    if (created) {
      setCreated(false);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setCreated(false);
    setError('');

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.access_token) {
        throw new Error(
          'Your admin session has expired. Please log in again.'
        );
      }

      const businessName =
        formData.business_name.trim();

      const businessEmail =
        formData.business_email.trim();

      const businessPhone =
        formData.business_phone.trim();

      const businessType =
        formData.business_type.trim();

      const businessAddress =
        formData.business_address.trim();

      const website =
        formData.website.trim();

      const password = formData.password;

      if (!businessName) {
        throw new Error(
          'Business name is required.'
        );
      }

      if (!businessEmail) {
        throw new Error(
          'Business email is required.'
        );
      }

      if (!password || password.length < 8) {
        throw new Error(
          'The temporary password must be at least 8 characters.'
        );
      }

      const {
        data,
        error: functionError,
      } = await supabase.functions.invoke(
        'admin-create-employer',
        {
          body: {
            business_name: businessName,
            business_type: businessType || null,
            business_email: businessEmail,
            business_phone: businessPhone || null,
            business_address:
              businessAddress || null,
            website: website || null,
            password,
          },
        }
      );

      if (functionError) {
        throw functionError;
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            'Unable to create the employer account.'
        );
      }

      setCreatedEmail(businessEmail);
      setCreated(true);

      setTimeout(() => {
        navigate('/admin/employers');
      }, 1500);
    } catch (err) {
      console.error(
        'Error creating employer:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create employer account.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <Link
        to="/admin/employers"
        className="back-link"
      >
        <ArrowLeft size={15} />
        All employers
      </Link>

      <PageHeader
        eyebrow="Clients"
        title="Create an employer"
        description="Create a business account that can access EnigteeWorld and manage its workforce."
      />

      {error ? (
        <div className="error-message">
          {error}
        </div>
      ) : null}

      {created ? (
        <div className="success-message">
          <CheckCircle2 size={15} />

          Employer account created successfully for{' '}
          {createdEmail}.
        </div>
      ) : null}

      <form
        className="dashboard-grid two-col"
        onSubmit={handleSubmit}
      >
        <div className="content-card">
          <h2>Business details</h2>

          <div className="form">
            <label>
              Business name

              <input
                required
                type="text"
                value={formData.business_name}
                onChange={(event) =>
                  updateField(
                    'business_name',
                    event.target.value
                  )
                }
                placeholder="Ridgeway Group"
              />
            </label>

            <label>
              Business type

              <input
                type="text"
                value={formData.business_type}
                onChange={(event) =>
                  updateField(
                    'business_type',
                    event.target.value
                  )
                }
                placeholder="Hotel, Restaurant, Lounge, Retail..."
              />
            </label>

            <label>
              Business email

              <input
                required
                type="email"
                value={formData.business_email}
                onChange={(event) =>
                  updateField(
                    'business_email',
                    event.target.value
                  )
                }
                placeholder="hr@company.com"
              />
            </label>

            <label>
              Business phone

              <input
                type="tel"
                value={formData.business_phone}
                onChange={(event) =>
                  updateField(
                    'business_phone',
                    event.target.value
                  )
                }
                placeholder="08012345678"
              />
            </label>
          </div>
        </div>

        <div className="content-card">
          <h2>Business location</h2>

          <div className="form">
            <label>
              Business address

              <textarea
                rows={4}
                value={formData.business_address}
                onChange={(event) =>
                  updateField(
                    'business_address',
                    event.target.value
                  )
                }
                placeholder="Full business address"
              />
            </label>

            <label>
              Website

              <input
                type="url"
                value={formData.website}
                onChange={(event) =>
                  updateField(
                    'website',
                    event.target.value
                  )
                }
                placeholder="https://example.com"
              />
            </label>
          </div>
        </div>

        <div className="content-card span-2">
          <h2>Employer login</h2>

          <div className="form">
            <label>
              Temporary password

              <input
                required
                type="password"
                minLength={8}
                value={formData.password}
                onChange={(event) =>
                  updateField(
                    'password',
                    event.target.value
                  )
                }
                placeholder="Minimum 8 characters"
              />

              <small>
                Give this temporary password to the
                employer. They can change their password
                after logging in.
              </small>
            </label>
          </div>
        </div>

        <div className="content-card span-2">
          <div className="hero-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2
                    size={15}
                    className="animate-spin"
                  />
                  Creating employer...
                </>
              ) : (
                'Create employer account'
              )}
            </button>

            <Link
              to="/admin/employers"
              className="btn btn-secondary"
            >
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </section>
  );
}
