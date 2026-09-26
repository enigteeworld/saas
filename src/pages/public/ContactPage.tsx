import { useState } from 'react';
import { CheckCircle2, Mail, MapPin, Phone } from 'lucide-react';

export default function ContactPage() {
  const [sent, setSent] = useState(false);

  return (
    <main className="page">
      <div className="container">
        <div className="page-hero">
          <span className="eyebrow">Contact</span>
          <h1>Let's talk about your work.</h1>
          <p>Whether you are hiring or looking for a role, our team is happy to help.</p>
        </div>

        <div className="prose-card contact-grid">
          <div>
            <h2>Reach us</h2>
            <p>
              <strong>Office</strong>
              <br />
              <MapPin size={14} /> 21 Akpakpava Street, Benin City, Edo State
            </p>
            <p>
              <strong>Email</strong>
              <br />
              <Mail size={14} /> hello@enigteeworld.com
            </p>
            <p>
              <strong>Phone</strong>
              <br />
              <Phone size={14} /> +234 800 000 0000
            </p>
            <p className="muted small">Office hours: Monday to Friday, 8:00 – 17:00 WAT.</p>
          </div>

          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              setSent(true);
            }}
          >
            <label>
              Full name
              <input required placeholder="Your name" />
            </label>
            <label>
              Email address
              <input type="email" required placeholder="you@email.com" />
            </label>
            <label>
              Message
              <textarea rows={5} required placeholder="How can we help?" />
            </label>
            {sent ? (
              <p className="success-message">
                <CheckCircle2 size={15} /> Thank you. Your message has been recorded.
              </p>
            ) : null}
            <button className="btn btn-primary" type="submit">
              Send message
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
