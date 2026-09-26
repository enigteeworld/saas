import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const benefits = [
  'Screened candidates matched to the roles you actually need',
  'Interview scheduling and outcomes tracked in one workspace',
  'Onboarding, documentation and deployment handled for you',
  'Attendance records and a single monthly workforce invoice',
];

export default function EmployersPage() {
  const [sent, setSent] = useState(false);

  return (
    <main className="page">
      <div className="container">
        <div className="page-hero">
          <span className="eyebrow">For employers</span>
          <h1>Build a workforce you can rely on.</h1>
          <p>Tell us your staffing needs and manage your people from one workspace.</p>
        </div>

        <div className="detail-layout">
          <article className="detail-card">
            <h2>What you get</h2>
            <ul className="check-list">
              {benefits.map((item) => (
                <li key={item}>
                  <CheckCircle2 size={17} /> {item}
                </li>
              ))}
            </ul>
            <hr />
            <h2>Send a staffing request</h2>
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                setSent(true);
              }}
            >
              <label>
                Business name
                <input required placeholder="Ridgeway Group" />
              </label>
              <label>
                Contact email
                <input type="email" required placeholder="hr@company.com" />
              </label>
              <label>
                Roles needed
                <input required placeholder="2 administrative assistants, 1 accounts officer" />
              </label>
              <label>
                Additional details
                <textarea rows={4} placeholder="Location, start date, working hours and any specific requirements." />
              </label>
              {sent ? (
                <p className="success-message">
                  <CheckCircle2 size={15} /> Request captured. Our team will respond within one working day.
                </p>
              ) : null}
              <button className="btn btn-primary" type="submit">
                Submit request <ArrowRight size={16} />
              </button>
            </form>
          </article>

          <aside className="side-card">
            <h3>Prefer a workspace?</h3>
            <p>Register an employer account to manage establishments, candidates, employees and invoices yourself.</p>
            <Link className="btn btn-primary" to="/register?type=employer">
              Register as employer
            </Link>
            <p className="small muted">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
