import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':
    'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Method not allowed.',
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const supabaseUrl =
      Deno.env.get('SUPABASE_URL');

    const serviceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        'Supabase server configuration is missing.'
      );
    }

    const authHeader =
      req.headers.get('Authorization');

    if (!authHeader) {
      throw new Error(
        'Authorization header is required.'
      );
    }

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const token = authHeader.replace(
      'Bearer ',
      ''
    );

    const {
      data: {
        user: requestingUser,
      },
      error: requestingUserError,
    } = await adminClient.auth.getUser(token);

    if (
      requestingUserError ||
      !requestingUser
    ) {
      throw new Error(
        'Your session is invalid or has expired.'
      );
    }

    const { data: adminProfile, error: profileError } =
      await adminClient
        .from('profiles')
        .select('id, role, is_active')
        .eq('id', requestingUser.id)
        .single();

    if (profileError) {
      throw new Error(
        'Unable to verify your admin account.'
      );
    }

    if (
      adminProfile.role !== 'admin' ||
      !adminProfile.is_active
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Only active administrators can create employer accounts.',
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const body = await req.json();

    const businessName =
      String(body.business_name ?? '').trim();

    const businessEmail =
      String(body.business_email ?? '')
        .trim()
        .toLowerCase();

    const businessPhone =
      body.business_phone
        ? String(body.business_phone).trim()
        : null;

    const businessType =
      body.business_type
        ? String(body.business_type).trim()
        : null;

    const businessAddress =
      body.business_address
        ? String(body.business_address).trim()
        : null;

    const website =
      body.website
        ? String(body.website).trim()
        : null;

    const password =
      String(body.password ?? '');

    if (!businessName) {
      throw new Error(
        'Business name is required.'
      );
    }

    if (!businessEmail) {
      throw new Error(
        'Business email is required.'
      );
    }

    if (password.length < 8) {
      throw new Error(
        'Password must be at least 8 characters.'
      );
    }

    /*
     * Create the Supabase Auth user.
     *
     * The existing database trigger
     * "on_auth_user_created" will automatically
     * create:
     *
     * profiles
     * employer_profiles
     */
    const {
      data: createdUser,
      error: createUserError,
    } =
      await adminClient.auth.admin.createUser({
        email: businessEmail,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'employer',
          full_name: businessName,
          business_name: businessName,
          phone: businessPhone,
        },
      });

    if (createUserError) {
      if (
        createUserError.message
          .toLowerCase()
          .includes('already')
      ) {
        throw new Error(
          'An account with this email already exists.'
        );
      }

      throw createUserError;
    }

    if (!createdUser.user) {
      throw new Error(
        'Employer Auth account was not created.'
      );
    }

    /*
     * The database trigger normally creates the
     * employer_profiles row immediately.
     *
     * Fetch it using the new Auth user's ID.
     */
    const {
      data: employerProfile,
      error:
        employerProfileError,
    } = await adminClient
      .from('employer_profiles')
      .select('id')
      .eq(
        'user_id',
        createdUser.user.id
      )
      .single();

    if (employerProfileError) {
      /*
       * The Auth user exists, but the profile did
       * not appear. This should normally never happen
       * because handle_new_user() is installed.
       */
      throw new Error(
        'Employer account was created, but the employer profile could not be found.'
      );
    }

    /*
     * Complete the employer profile with the
     * business information supplied by Admin.
     */
    const {
      error: updateEmployerError,
    } = await adminClient
      .from('employer_profiles')
      .update({
        business_name: businessName,
        business_type: businessType,
        business_email: businessEmail,
        business_phone: businessPhone,
        business_address: businessAddress,
        website,
        verification_status: 'pending',
      })
      .eq(
        'id',
        employerProfile.id
      );

    if (updateEmployerError) {
      throw updateEmployerError;
    }

    /*
     * Create an audit record.
     */
    await adminClient
      .from('audit_logs')
      .insert({
        actor_id: requestingUser.id,
        action: 'create_employer',
        entity_type: 'employer_profile',
        entity_id: employerProfile.id,
        new_data: {
          business_name: businessName,
          business_email: businessEmail,
          business_phone: businessPhone,
          business_type: businessType,
          business_address: businessAddress,
          website,
        },
      });

    return new Response(
      JSON.stringify({
        success: true,
        employer_id: employerProfile.id,
        user_id: createdUser.user.id,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error(
      'admin-create-employer error:',
      error
    );

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to create employer account.',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});