// Delivers queued emails from public.email_outbox through Resend.
//
// Secrets to set (Supabase Dashboard -> Edge Functions -> Secrets, or CLI):
//   RESEND_API_KEY   your Resend API key            (required)
//   EMAIL_FROM       e.g. "EnigteeWorld <no-reply@yourdomain.com>"
//                    (defaults to Resend's sandbox sender - which can only email
//                    the address that owns the Resend account)
//   APP_URL          e.g. https://enigteeworld.vercel.app  (used for email buttons)
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Turn plain-text bodies into HTML: escape, auto-link URLs, keep line breaks.
function bodyToHtml(text: string) {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#16734b">$1</a>')
    .replace(/\n/g, '<br/>');
}

function renderEmail(row: { heading: string; body: string; link_path: string | null; link_label: string | null }, appUrl: string) {
  const link = row.link_path && appUrl ? `${appUrl.replace(/\/$/, '')}${row.link_path}` : null;
  const button = link
    ? `<p style="margin:28px 0 0"><a href="${link}" style="background:#16734b;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;display:inline-block">${escapeHtml(row.link_label || 'Open your dashboard')}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#fbfaf6;font-family:Inter,Arial,sans-serif;color:#17251f">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-size:22px;font-weight:800;letter-spacing:-.5px;margin-bottom:20px"><span style="color:#16734b">Enigtee</span>World</div>
    <div style="background:#ffffff;border:1px solid #e1e8e3;border-radius:16px;padding:28px">
      <h1 style="font-size:20px;margin:0 0 14px">${escapeHtml(row.heading)}</h1>
      <div style="font-size:15px;line-height:1.6;color:#2b3a33">${bodyToHtml(row.body)}</div>
      ${button}
    </div>
    <p style="font-size:12px;color:#68756f;margin-top:18px">You are receiving this because you have an EnigteeWorld account. Please do not reply to this automated message.</p>
  </div></body></html>`;
  const text = `${row.heading}\n\n${row.body}${link ? `\n\n${row.link_label || 'Open'}: ${link}` : ''}`;
  return { html, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('EMAIL_FROM') || 'EnigteeWorld <onboarding@resend.dev>';
    const appUrl = Deno.env.get('APP_URL') || '';

    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase server configuration is missing.');
    if (!resendKey) {
      return json({
        success: false,
        skipped: true,
        error: 'RESEND_API_KEY is not set. Emails stay queued in email_outbox until it is configured.',
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Only signed-in users (or the service role, used by cron) may trigger a send.
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) return json({ success: false, error: 'Authorization required.' }, 401);
    if (token !== serviceRoleKey) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return json({ success: false, error: 'Invalid session.' }, 401);
    }

    // Claim a batch of pending emails.
    const { data: pending, error: pendingError } = await admin
      .from('email_outbox')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(25);
    if (pendingError) throw pendingError;
    if (!pending || pending.length === 0) return json({ success: true, sent: 0, failed: 0 });

    const { data: claimed, error: claimError } = await admin
      .from('email_outbox')
      .update({ status: 'sending' })
      .in('id', pending.map((row) => row.id))
      .eq('status', 'pending')
      .select('id, to_email, subject, heading, body, link_path, link_label, attempts');
    if (claimError) throw claimError;

    let sent = 0;
    let failed = 0;

    for (const row of claimed ?? []) {
      try {
        const { html, text } = renderEmail(row, appUrl);
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [row.to_email], subject: row.subject, html, text }),
        });

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`Resend ${response.status}: ${detail}`.slice(0, 500));
        }

        await admin
          .from('email_outbox')
          .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null })
          .eq('id', row.id);
        sent += 1;
      } catch (err) {
        const attempts = row.attempts + 1;
        await admin
          .from('email_outbox')
          .update({
            status: attempts >= 3 ? 'failed' : 'pending',
            attempts,
            last_error: err instanceof Error ? err.message : String(err),
          })
          .eq('id', row.id);
        failed += 1;
      }
    }

    return json({ success: true, sent, failed });
  } catch (error) {
    console.error('send-notification-emails error:', error);
    return json({ success: false, error: error instanceof Error ? error.message : 'Unable to send emails.' }, 400);
  }
});
