import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha512Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-512', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceRoleKey || !paystackSecretKey) {
      return new Response(JSON.stringify({ error: 'Missing required environment configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-paystack-signature') ?? '';

    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing Paystack signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const computedSignature = await sha512Hex(rawBody + paystackSecretKey);

    if (computedSignature !== signature) {
      return new Response(JSON.stringify({ error: 'Invalid Paystack signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(rawBody);
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (event.event !== 'charge.success') {
      return new Response(
        JSON.stringify({
          ok: true,
          message: `Ignored event: ${event.event}`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const payment = event.data;
    const reference = String(payment?.reference || '').trim();
    const profileId = String(payment?.metadata?.profile_id || '').trim();
    const amount = Number(payment?.amount || 0) / 100;

    if (!reference || !profileId || !amount || Number.isNaN(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid webhook payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('profile_id', profileId)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ error: 'Wallet not found for this payment' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingTx, error: existingTxError } = await supabase
      .from('wallet_transactions')
      .select('id')
      .eq('wallet_id', wallet.id)
      .eq('transaction_type', 'deposit')
      .eq('reference_type', 'paystack')
      .eq('reference_id', reference)
      .maybeSingle();

    if (existingTxError) {
      return new Response(JSON.stringify({ error: existingTxError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (existingTx) {
      return new Response(
        JSON.stringify({
          ok: true,
          already_processed: true,
          message: 'Payment already processed',
          reference,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const balanceBefore = Number(wallet.available_balance || 0);
    const balanceAfter = balanceBefore + amount;

    const { error: txError } = await supabase.from('wallet_transactions').insert({
      wallet_id: wallet.id,
      transaction_type: 'deposit',
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: 'Wallet funding via Paystack webhook',
      reference_type: 'paystack',
      reference_id: reference,
      created_by: profileId,
      metadata: {
        paystack_reference: reference,
        channel: payment?.channel ?? null,
        paid_at: payment?.paid_at ?? null,
        gateway_response: payment?.gateway_response ?? null,
        source: 'webhook',
      },
    });

    if (txError) {
      return new Response(JSON.stringify({ error: txError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: updatedWallet, error: walletUpdateError } = await supabase
      .from('wallets')
      .update({
        available_balance: balanceAfter,
        total_deposited: Number(wallet.total_deposited || 0) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', wallet.id)
      .select()
      .single();

    if (walletUpdateError) {
      return new Response(JSON.stringify({ error: walletUpdateError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        reference,
        amount,
        wallet: updatedWallet,
        message: 'Webhook processed successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('paystack-webhook error:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});