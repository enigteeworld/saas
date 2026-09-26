import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, MapPin, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type FeaturedJob = {
  id: string;
  title: string;
  location: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  created_at: string;
};

const steps = [
  { title: 'Tell us what you need', text: 'Employers share the roles, skills and number of people required.' },
  { title: 'We source and screen', text: 'Applications are reviewed, shortlisted and prepared for interview.' },
  { title: 'Interview and select', text: 'Interviews are scheduled and outcomes recorded in one place.' },
  { title: 'Onboard and deploy', text: 'Documents, onboarding and deployment are handled end to end.' },
];

function salary(job: FeaturedJob) {
  const formatter = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });
  if (job.salary_min !== null && job.salary_max !== null) {
    return `${job.salary_currency === 'USD' ? '$' : '₦'}${formatter.format(job.salary_min)} - ${job.salary_currency === 'USD' ? '$' : '₦'}${formatter.format(job.salary_max)}`;
  }
  if (job.salary_min !== null) return `From ${job.salary_currency === 'USD' ? '$' : '₦'}${formatter.format(job.salary_min)}`;
  if (job.salary_max !== null) return `Up to ${job.salary_currency === 'USD' ? '$' : '₦'}${formatter.format(job.salary_max)}`;
  return 'Salary not specified';
}

export default function HomePage() {
  const [jobs, setJobs] = useState<FeaturedJob[]>([]);
  const [jobCount, setJobCount] = useState(0);
  const [applicationCount, setApplicationCount] = useState(0);
  const [interviewCount, setInterviewCount] = useState(0);

  useEffect(() => {
    async function load() {
      const [jobsResult, jobCountResult, applicationsResult, interviewsResult] = await Promise.all([
        supabase
          .from('job_openings')
          .select('id, title, location, employment_type, salary_min, salary_max, salary_currency, created_at')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(3),
        supabase
          .from('job_openings')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'published'),
        supabase.from('job_applications').select('id', { count: 'exact', head: true }),
        supabase.from('interviews').select('id', { count: 'exact', head: true }),
      ]);

      if (jobsResult.error) console.error(jobsResult.error);
      else setJobs(jobsResult.data ?? []);

      if (jobCountResult.error) console.error(jobCountResult.error);
      setJobCount(jobCountResult.count ?? 0);
      setApplicationCount(applicationsResult.count ?? 0);
      setInterviewCount(interviewsResult.count ?? 0);
    }

    void load();
  }, []);

  return (
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">Workforce recruitment, made clearer</span>
            <h1>The right people.<br /><span>The right opportunities.</span></h1>
            <p className="hero-copy">EnigteeWorld connects businesses with dependable talent and gives job seekers a clear path from application to employment.</p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to="/jobs">Find a job <ArrowRight size={18} /></Link>
              <Link className="btn btn-secondary" to="/employers">Hire through us</Link>
            </div>
            <div className="trust-row">
              <span><CheckCircle2 size={15} /> Verified employers</span>
              <span><CheckCircle2 size={15} /> Structured onboarding</span>
              <span><CheckCircle2 size={15} /> Attendance and payroll support</span>
            </div>
          </div>

          <div className="hero-panel">
            <div className="panel-top"><span className="status-dot" /> Live platform activity</div>
            <div className="candidate-card">
              <div className="avatar">EW</div>
              <div>
                <strong>EnigteeWorld workspace</strong>
                <p>Recruitment, onboarding and workforce management</p>
              </div>
              <CheckCircle2 className="success" size={18} />
            </div>
            <div className="progress-line"><span style={{ width: jobCount ? '68%' : '20%' }} /></div>
            <div className="mini-stats">
              <div><strong>{jobCount}</strong><span>Open roles</span></div>
              <div><strong>{applicationCount}</strong><span>Applications</span></div>
              <div><strong>{interviewCount}</strong><span>Interviews</span></div>
            </div>
            <div className="workspace-note">
              <div className="avatar">HR</div>
              <div>
                <strong>One organized workspace</strong>
                <p>Applications, interviews, onboarding, attendance and payroll.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div><span className="eyebrow">Who we serve</span><h2>Built for every side of work.</h2></div>
            <p>Each role gets a workspace designed around the decisions they actually make.</p>
          </div>
          <div className="feature-grid">
            <Link to="/register" className="feature-card"><div className="icon-box"><Users /></div><h3>Job seekers</h3><p>Apply, prepare for interviews and track your employment journey.</p><span className="text-link">Explore <ArrowRight size={15} /></span></Link>
            <Link to="/employers" className="feature-card"><div className="icon-box"><Building2 /></div><h3>Employers</h3><p>Manage establishments, candidates and deployed employees.</p><span className="text-link">Explore <ArrowRight size={15} /></span></Link>
            <Link to="/how-it-works" className="feature-card"><div className="icon-box"><ShieldCheck /></div><h3>HR administrators</h3><p>Control recruitment, onboarding, documents and workforce operations.</p><span className="text-link">Explore <ArrowRight size={15} /></span></Link>
          </div>
        </div>
      </section>

      <section className="section soft">
        <div className="container">
          <div className="section-heading"><div><span className="eyebrow">How it works</span><h2>From vacancy to first day.</h2></div><Link className="text-link" to="/how-it-works">See the full process <ArrowRight size={15} /></Link></div>
          <div className="steps">
            {steps.map((step, index) => <div className="step content-card" key={step.title}><div className="step-number">0{index + 1}</div><h3>{step.title}</h3><p>{step.text}</p></div>)}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading"><div><span className="eyebrow">Open positions</span><h2>Featured opportunities.</h2></div><Link className="text-link" to="/jobs">View all roles <ArrowRight size={15} /></Link></div>
          <div className="job-grid">
            {jobs.length === 0 ? (
              <div className="content-card"><p className="muted">No published roles are available right now.</p></div>
            ) : jobs.map((job) => (
              <div className="job-card" key={job.id}>
                <div className="job-icon"><BriefcaseBusiness /></div>
                <div className="job-main">
                  <div className="job-title-row"><h3>{job.title}</h3><span className="tag">{job.employment_type}</span></div>
                  <div className="job-meta"><span><MapPin size={14} /> {job.location}</span><span>{salary(job)}</span></div>
                  <div className="job-card-bottom"><span className="muted">Posted {new Date(job.created_at).toLocaleDateString('en-NG')}</span><Link className="btn btn-ghost" to={`/jobs/${job.id}`}>View role <ArrowRight size={15} /></Link></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="container cta-inner">
          <div><span className="eyebrow">Ready when you are</span><h2>Build a workforce you can rely on.</h2><p>Tell us your staffing needs and manage your people in one place.</p></div>
          <Link className="btn btn-secondary" to="/register?type=employer">Register as employer <ArrowRight size={16} /></Link>
        </div>
      </section>
    </main>
  );
}
