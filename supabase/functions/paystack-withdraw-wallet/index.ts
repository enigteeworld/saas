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
      console.error('Missing required environment configuration', {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasSupabaseAnonKey: Boolean(supabaseAnonKey),
        hasSupabaseServiceRoleKey: Boolean(supabaseServiceRoleKey),
        hasPaystackSecretKey: Boolean(paystackSecretKey),
      });

      throw new Error('Missing required environment configuration');
    }

    const authHeader = req.headers.get('Authorization') ?? '';

    if (!authHeader.startsWith('Bearer ')) {
      console.error('Unauthorized request: missing bearer token');

      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();

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
      console.error('JWT validation failed', {
        userError: userError?.message ?? null,
      });

      return new Response(JSON.stringify({ error: userError?.message || 'Invalid JWT' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    const amount = Number(body?.amount || 0);
    const bankAccountId = String(body?.bank_account_id || '').trim();
    const accountNumber = String(body?.account_number || '').trim();
    const bankCode = String(body?.bank_code || '').trim();
    const accountName = String(body?.account_name || '').trim();

    console.log('Withdrawal request received', {
      userId: user.id,
      amount,
      bankAccountId,
      accountNumber,
      bankCode,
      accountName,
    });

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!bankAccountId || !accountNumber || !bankCode || !accountName) {
      return new Response(JSON.stringify({ error: 'Incomplete bank account details' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: bankAccount, error: bankAccountError } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('id', bankAccountId)
      .eq('profile_id', user.id)
      .single();

    if (bankAccountError || !bankAccount) {
      console.error('Bank account lookup failed', {
        bankAccountError: bankAccountError?.message ?? null,
        bankAccountId,
        userId: user.id,
      });

      return new Response(JSON.stringify({ error: 'Bank account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('profile_id', user.id)
      .single();

    if (walletError || !wallet) {
      console.error('Wallet lookup failed', {
        walletError: walletError?.message ?? null,
        userId: user.id,
      });

      return new Response(JSON.stringify({ error: 'Wallet not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (Number(wallet.available_balance || 0) < amount) {
      return new Response(JSON.stringify({ error: 'Insufficient balance' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingPending, error: existingPendingError } = await supabase
      .from('withdrawal_requests')
      .select('id, status')
      .eq('profile_id', user.id)
      .in('status', ['pending', 'approved', 'processing'])
      .limit(1);

    if (existingPendingError) {
      console.error('Existing pending withdrawal check failed', {
        error: existingPendingError.message,
        userId: user.id,
      });

      return new Response(JSON.stringify({ error: existingPendingError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (existingPending && existingPending.length > 0) {
      return new Response(
        JSON.stringify({ error: 'You already have a withdrawal request in progress' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const recipientPayload = {
      type: 'nuban',
      name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: 'NGN',
    };

    console.log('Creating Paystack transfer recipient', recipientPayload);

    const recipientRes = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recipientPayload),
    });

    const recipientData = await recipientRes.json();

    console.log('Paystack transferrecipient response', {
      ok: recipientRes.ok,
      status: recipientRes.status,
      recipientData,
    });

    if (!recipientRes.ok || !recipientData?.status || !recipientData?.data?.recipient_code) {
      return new Response(
        JSON.stringify({
          error: recipientData?.message || 'Failed to create transfer recipient',
          details: recipientData,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const recipientCode = recipientData.data.recipient_code;
    const transferReference = `wd_${user.id}_${Date.now()}`;

    const { data: createdRequest, error: createRequestError } = await supabase
      .from('withdrawal_requests')
      .insert({
        profile_id: user.id,
        wallet_id: wallet.id,
        bank_account_id: bankAccount.id,
        amount,
        status: 'processing',
        reference_id: transferReference,
      })
      .select()
      .single();

    if (createRequestError || !createdRequest) {
      console.error('Failed to create withdrawal request row', {
        error: createRequestError?.message ?? null,
        transferReference,
        userId: user.id,
      });

      return new Response(
        JSON.stringify({
          error: createRequestError?.message || 'Failed to create withdrawal request',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const transferPayload = {
      source: 'balance',
      amount: Math.round(amount * 100),
      recipient: recipientCode,
      reason: 'Dispatch NG rider wallet withdrawal',
      reference: transferReference,
    };

    console.log('Initiating Paystack transfer', transferPayload);

    const transferRes = await fetch('https://api.paystack.co/transfer', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transferPayload),
    });

    const transferData = await transferRes.json();

    console.log('Paystack transfer response', {
      ok: transferRes.ok,
      status: transferRes.status,
      transferData,
    });

    if (!transferRes.ok || !transferData?.status) {
      await supabase
        .from('withdrawal_requests')
        .update({
          status: 'failed',
          rejection_reason: transferData?.message || 'Transfer failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdRequest.id);

      console.error('Paystack transfer failed', {
        transferReference,
        transferData,
      });

      return new Response(
        JSON.stringify({
          error: transferData?.message || 'Failed to initiate transfer',
          details: transferData,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const transferStatus = String(transferData?.data?.status || '').toLowerCase();

    if (transferStatus === 'otp') {
      await supabase
        .from('withdrawal_requests')
        .update({
          status: 'pending',
          rejection_reason:
            'Transfer requires OTP approval in Paystack dashboard. Disable transfer confirmation for full automation or approve this transfer manually.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdRequest.id);

      console.warn('Paystack transfer requires OTP approval', {
        transferReference,
        transferData,
      });

      return new Response(
        JSON.stringify({
          error:
            'Paystack transfer requires OTP approval. Complete or disable transfer confirmation in your Paystack dashboard before retrying.',
          details: transferData,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const balanceBefore = Number(wallet.available_balance || 0);
    const balanceAfter = balanceBefore - amount;

    const { error: txError } = await supabase.from('wallet_transactions').insert({
      wallet_id: wallet.id,
      transaction_type: 'withdrawal',
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_type: 'paystack_transfer',
      reference_id: transferReference,
      description: `Withdrawal to ${bankAccount.bank_name} - ${bankAccount.account_number}`,
      created_by: user.id,
      metadata: {
        paystack_transfer_code: transferData?.data?.transfer_code || null,
        paystack_recipient_code: recipientCode,
        transfer_status: transferData?.data?.status || null,
        paystack_response: transferData,
      },
    });

    if (txError) {
      console.error('Failed to insert wallet transaction', {
        error: txError.message,
        transferReference,
      });

      return new Response(JSON.stringify({ error: txError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: updatedWallet, error: walletUpdateError } = await supabase
      .from('wallets')
      .update({
        available_balance: balanceAfter,
        updated_at: new Date().toISOString(),
      })
      .eq('id', wallet.id)
      .select()
      .single();

    if (walletUpdateError || !updatedWallet) {
      console.error('Failed to update wallet after withdrawal', {
        error: walletUpdateError?.message ?? null,
        transferReference,
      });

      return new Response(
        JSON.stringify({
          error: walletUpdateError?.message || 'Failed to update wallet',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    await supabase
      .from('withdrawal_requests')
      .update({
        status: transferStatus === 'success' ? 'completed' : 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', createdRequest.id);

    console.log('Withdrawal completed successfully', {
      transferReference,
      transferStatus,
      userId: user.id,
      amount,
      balanceAfter,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        wallet: updatedWallet,
        message:
          transferStatus === 'success'
            ? 'Withdrawal successful'
            : 'Withdrawal initiated successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Withdraw function error', err);

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unexpected error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});