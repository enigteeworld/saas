import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !paystackSecretKey) {
      return new Response(JSON.stringify({ error: 'Missing required environment configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';

    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: userError?.message || 'Invalid JWT' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const reference = String(body?.reference || '').trim();

    if (!reference) {
      return new Response(JSON.stringify({ error: 'Missing payment reference' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
      },
    });

    const paystackData = await paystackRes.json();

    if (!paystackRes.ok || !paystackData?.status) {
      return new Response(
        JSON.stringify({
          error: paystackData?.message || 'Failed to verify payment',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const payment = paystackData.data;

    if (payment.status !== 'success') {
      return new Response(JSON.stringify({ error: 'Payment was not successful' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profileId = payment.metadata?.profile_id;

    if (!profileId || profileId !== user.id) {
      return new Response(JSON.stringify({ error: 'Payment does not belong to this user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('*')
      .eq('profile_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ error: 'Wallet not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingTx, error: existingTxError } = await supabaseAdmin
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
      const { data: latestWallet } = await supabaseAdmin
        .from('wallets')
        .select('*')
        .eq('id', wallet.id)
        .single();

      return new Response(
        JSON.stringify({
          ok: true,
          already_processed: true,
          reference,
          wallet: latestWallet,
          message: 'Payment already verified',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const amount = Number(payment.amount || 0) / 100;

    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid verified payment amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const balanceBefore = Number(wallet.available_balance || 0);
    const balanceAfter = balanceBefore + amount;

    const { error: txError } = await supabaseAdmin.from('wallet_transactions').insert({
      wallet_id: wallet.id,
      transaction_type: 'deposit',
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: 'Wallet funding via Paystack',
      reference_type: 'paystack',
      reference_id: reference,
      created_by: user.id,
      metadata: {
        paystack_reference: reference,
        channel: payment.channel,
        paid_at: payment.paid_at,
        gateway_response: payment.gateway_response,
      },
    });

    if (txError) {
      return new Response(JSON.stringify({ error: txError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: updatedWallet, error: walletUpdateError } = await supabaseAdmin
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
        message: 'Wallet funded successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('paystack-verify-wallet-funding error:', error);

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