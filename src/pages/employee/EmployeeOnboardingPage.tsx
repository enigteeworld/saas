import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import PageHeader from '@/components/shared/PageHeader';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type FormState = {
  phone: string;
  dateOfBirth: string;
  address: string;
  state: string;
  lga: string;
  country: string;
  highestQualification: string;
  fieldOfStudy: string;
  yearsExperience: string;
  preferredLocation: string;
  experienceAndSkills: string;
};

const initialForm: FormState = {
  phone: '',
  dateOfBirth: '',
  address: '',
  state: '',
  lga: '',
  country: 'Nigeria',
  highestQualification: '',
  fieldOfStudy: '',
  yearsExperience: '0-1',
  preferredLocation: '',
  experienceAndSkills: '',
};

function getYearsExperience(value: string): number {
  switch (value) {
    case '1-3':
      return 2;

    case '3-5':
      return 4;

    case '5+':
      return 5;

    default:
      return 0;
  }
}

export default function EmployeeOnboardingPage() {
  const user = useAuthStore((state) => state.user);

  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    loadProfile();
  }, [user?.id]);

  async function loadProfile() {
    if (!user?.id) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      setMessage('');

      const [{ data: profile, error: profileError }, { data: staff, error: staffError }] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('phone')
            .eq('id', user.id)
            .maybeSingle(),

          supabase
            .from('staff_profiles')
            .select(
              `
                date_of_birth,
                address,
                state,
                lga,
                country,
                highest_qualification,
                field_of_study,
                years_experience,
                preferred_location,
                professional_summary,
                skills
              `,
            )
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

      if (profileError) {
        throw profileError;
      }

      if (staffError) {
        throw staffError;
      }

      const yearsExperience = Number(staff?.years_experience ?? 0);

      let experienceRange = '0-1';

      if (yearsExperience >= 5) {
        experienceRange = '5+';
      } else if (yearsExperience >= 3) {
        experienceRange = '3-5';
      } else if (yearsExperience >= 1) {
        experienceRange = '1-3';
      }

      const skills = Array.isArray(staff?.skills)
        ? staff.skills.join(', ')
        : '';

      setForm({
        phone: profile?.phone ?? '',
        dateOfBirth: staff?.date_of_birth ?? '',
        address: staff?.address ?? '',
        state: staff?.state ?? '',
        lga: staff?.lga ?? '',
        country: staff?.country ?? 'Nigeria',
        highestQualification: staff?.highest_qualification ?? '',
        fieldOfStudy: staff?.field_of_study ?? '',
        yearsExperience: experienceRange,
        preferredLocation: staff?.preferred_location ?? '',
        experienceAndSkills:
          skills || staff?.professional_summary || '',
      });
    } catch (err) {
      console.error('Unable to load employee onboarding profile:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load your profile.',
      );
    } finally {
      setLoading(false);
    }
  }

  function handleChange(
    field: keyof FormState,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setMessage('');
    setError('');
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!user?.id) {
      setError('Your session has expired. Please log in again.');
      return;
    }

    try {
      setSaving(true);
      setMessage('');
      setError('');

      const skills = form.experienceAndSkills
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean);

      if (
        !form.phone.trim() ||
        !form.address.trim() ||
        !form.lga.trim() ||
        !form.country.trim() ||
        !form.fieldOfStudy.trim() ||
        !form.preferredLocation.trim() ||
        !form.experienceAndSkills.trim()
      ) {
        setError('Please complete all required onboarding fields before saving.');
        setSaving(false);
        return;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          phone: form.phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) {
        throw profileError;
      }

      const { error: staffError } = await supabase
        .from('staff_profiles')
        .upsert(
          {
            user_id: user.id,
            date_of_birth: form.dateOfBirth || null,
            address: form.address.trim() || null,
            state: form.state.trim() || null,
            lga: form.lga.trim() || null,
            country: form.country.trim() || null,
            highest_qualification:
              form.highestQualification.trim() || null,
            field_of_study:
              form.fieldOfStudy.trim() || null,
            years_experience: getYearsExperience(
              form.yearsExperience,
            ),
            preferred_location:
              form.preferredLocation.trim() || null,
            professional_summary:
              form.experienceAndSkills.trim() || null,
            skills,
            profile_completed: true,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          },
        );

      if (staffError) {
        throw staffError;
      }

      setMessage('Your onboarding information has been saved successfully.');

      await loadProfile();
    } catch (err) {
      console.error('Unable to save employee onboarding profile:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save your onboarding information.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section>
        <PageHeader
          eyebrow="Applicant onboarding"
          title="Complete your professional profile"
          description="Add the information EnigteeWorld needs to review your applications and prepare you for employment."
        />

        <div className="content-card">
          <div className="loading-state">
            <Loader2
              size={20}
              className="spin"
            />
            <span>Loading your profile...</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        eyebrow="Applicant onboarding"
        title="Complete your professional profile"
        description="Add the information EnigteeWorld needs to review your applications and prepare you for employment."
      />

      {error && (
        <div className="content-card form-message error-message">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form
        className="dashboard-grid two-col"
        onSubmit={handleSubmit}
      >
        <div className="content-card">
          <h2>Personal details</h2>

          <div className="form">
            <label>
              Phone number
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(event) =>
                  handleChange(
                    'phone',
                    event.target.value,
                  )
                }
                placeholder="080 0000 0000"
              />
            </label>

            <label>
              Date of birth
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(event) =>
                  handleChange(
                    'dateOfBirth',
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              Residential address
              <input
                type="text"
                required
                value={form.address}
                onChange={(event) =>
                  handleChange(
                    'address',
                    event.target.value,
                  )
                }
                placeholder="Street, city, state"
              />
            </label>

            <label>
              State of origin
              <input
                type="text"
                value={form.state}
                onChange={(event) =>
                  handleChange(
                    'state',
                    event.target.value,
                  )
                }
                placeholder="Edo"
              />
            </label>

            <label>
              LGA
              <input
                type="text"
                required
                value={form.lga}
                onChange={(event) =>
                  handleChange(
                    'lga',
                    event.target.value,
                  )
                }
                placeholder="Oredo"
              />
            </label>

            <label>
              Country
              <input
                type="text"
                required
                value={form.country}
                onChange={(event) =>
                  handleChange('country', event.target.value)
                }
                placeholder="Nigeria"
              />
            </label>
          </div>
        </div>

        <div className="content-card">
          <h2>Professional information</h2>

          <div className="form">
            <label>
              Highest qualification
              <input
                type="text"
                value={form.highestQualification}
                onChange={(event) =>
                  handleChange(
                    'highestQualification',
                    event.target.value,
                  )
                }
                placeholder="B.Sc. Business Administration"
              />
            </label>

            <label>
              Field of study
              <input
                type="text"
                required
                value={form.fieldOfStudy}
                onChange={(event) =>
                  handleChange('fieldOfStudy', event.target.value)
                }
                placeholder="Business Administration"
              />
            </label>

            <label>
              Years of experience
              <select
                value={form.yearsExperience}
                onChange={(event) =>
                  handleChange(
                    'yearsExperience',
                    event.target.value,
                  )
                }
              >
                <option value="0-1">
                  Less than 1 year
                </option>

                <option value="1-3">
                  1 – 3 years
                </option>

                <option value="3-5">
                  3 – 5 years
                </option>

                <option value="5+">
                  More than 5 years
                </option>
              </select>
            </label>

            <label>
              Preferred work location
              <input
                type="text"
                required
                value={form.preferredLocation}
                onChange={(event) =>
                  handleChange('preferredLocation', event.target.value)
                }
                placeholder="Benin City, Edo"
              />
            </label>

            <label>
              Experience and skills
              <textarea
                rows={5}
                value={form.experienceAndSkills}
                onChange={(event) =>
                  handleChange(
                    'experienceAndSkills',
                    event.target.value,
                  )
                }
                placeholder="Tell us about your experience, skills and certifications. Separate individual skills with commas."
              />
            </label>
          </div>
        </div>

        <div className="content-card span-2">
          <h2>Documents</h2>

          <p className="muted">
            CVs and application letters are uploaded when you apply for a
            specific job. This keeps each document tied to the exact
            application you submitted it with.
          </p>

          {message && (
            <p className="success-message">
              <CheckCircle2 size={15} />
              {message}
            </p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="spin" />
                Saving...
              </>
            ) : (
              'Save profile'
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
