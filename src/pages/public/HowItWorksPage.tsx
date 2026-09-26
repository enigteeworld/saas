import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const employerSteps = [
  { title: 'Send your staffing request', text: 'Share the roles, skills, headcount and location you need covered.' },
  { title: 'Review shortlisted candidates', text: 'We screen applicants and present only those who fit the brief.' },
  { title: 'Interview and confirm', text: 'Interviews are scheduled, tracked and confirmed inside your workspace.' },
  { title: 'Deployment and support', text: 'Onboarding, documents, attendance and monthly invoicing are handled for you.' },
];

const seekerSteps = [
  { title: 'Create your account', text: 'Register in a few minutes and complete your onboarding profile.' },
  { title: 'Apply to open roles', text: 'Submit applications and follow their status at every stage.' },
  { title: 'Attend your interview', text: 'Receive invitations, schedules and outcomes without chasing anyone.' },
  { title: 'Start work', text: 'Complete documentation, get deployed and manage attendance and payslips.' },
];

export default function HowItWorksPage() {
  return (
    <main className="page">
      <div className="container">
        <div className="page-hero">
          <span className="eyebrow">The process</span>
          <h1>From vacancy to first day.</h1>
          <p>One structured path that keeps employers, candidates and HR administration aligned.</p>
        </div>

        <section>
          <div className="section-heading">
            <div>
              <span className="eyebrow">For employers</span>
              <h2>Hiring through EnigteeWorld</h2>
            </div>
          </div>
          <div className="steps">
            {employerSteps.map((step, index) => (
              <div className="step content-card" key={step.title}>
                <div className="step-number">0{index + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 55 }}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">For job seekers</span>
              <h2>Getting hired through EnigteeWorld</h2>
            </div>
          </div>
          <div className="steps">
            {seekerSteps.map((step, index) => (
              <div className="step content-card" key={step.title}>
                <div className="step-number">0{index + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="hero-actions" style={{ marginTop: 40 }}>
          <Link className="btn btn-primary" to="/register">
            Create an account <ArrowRight size={16} />
          </Link>
          <Link className="btn btn-secondary" to="/employers">
            Talk to us about hiring
          </Link>
        </div>
      </div>
    </main>
  );
}
