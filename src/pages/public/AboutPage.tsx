import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function AboutPage() {
  return (
    <main className="page">
      <div className="container">
        <div className="page-hero">
          <span className="eyebrow">About EnigteeWorld</span>
          <h1>People, opportunities and better systems.</h1>
          <p>
            EnigteeWorld organizes the journey from vacancy to employment, so businesses find dependable people and job
            seekers always know where they stand.
          </p>
        </div>

        <article className="prose-card">
          <h2>What we do</h2>
          <p>
            We handle recruitment end to end: sourcing candidates, screening applications, coordinating interviews,
            preparing documentation and deploying employees to the establishments that need them. After deployment we
            keep supporting attendance, records and payroll reporting.
          </p>
          <h2>Why we built it</h2>
          <p>
            Hiring often breaks down in the gaps between stages — a CV that never gets reviewed, an interview no one
            confirmed, a first day nobody prepared for. A single shared workspace removes those gaps for everyone
            involved.
          </p>
          <h2>How we work</h2>
          <ul>
            <li>Every application has a visible status and owner.</li>
            <li>Employers see only what concerns their establishments.</li>
            <li>Employees keep their documents and employment records in one place.</li>
            <li>HR administration has full oversight of the workforce pipeline.</li>
          </ul>
          <Link className="btn btn-primary" to="/how-it-works">
            See how it works <ArrowRight size={16} />
          </Link>
        </article>
      </div>
    </main>
  );
}
