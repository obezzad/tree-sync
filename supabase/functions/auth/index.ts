// @ts-ignore: Deno module
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore: Deno module
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore: Deno module
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
// @ts-ignore: Deno module
import { generate as generateV5 } from "https://deno.land/std@0.224.0/uuid/v5.ts";

const signin = async (supabaseClient: SupabaseClient, local_id: string, email: string) => {
  await supabaseClient
    .from('nodes')
    .upsert({
      id: await generateV5(local_id, new TextEncoder().encode("ROOT_NODE")),
      user_id: local_id,
      payload: { name: "ROOT" },
      parent_id: null,
    }, { onConflict: 'id', ignoreDuplicates: true });

  return await supabaseClient.auth.signInWithPassword({
    email,
    password: STATIC_PASSWORD,
  })
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STATIC_PASSWORD = 'emSync24!'

interface RequestBody {
  username: string
}

interface ResponseBody {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  user?: {
    id: string
    email?: string
    user_metadata?: {
      username: string
    }
  }
  error?: string
}

// FIXME: store both seed and userId
function usernameToEmail(username: string): string {
  // Convert username to UTF-8 bytes
  const encoder = new TextEncoder()
  const usernameBytes = encoder.encode(username)

  // Base64 encode the bytes
  const base64 = encodeBase64(usernameBytes)

  // Make the Base64 URL-safe by replacing unsafe characters
  const urlSafe = base64
    .replace(/\//g, '_')  // Replace / with _
    .replace(/\+/g, '-')  // Replace + with -
    .replace(/=/g, '')    // Remove padding =

  return `${urlSafe}@obezzad.me`
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { username } = (await req.json()) as RequestBody

    if (!username) {
      return new Response(
        JSON.stringify({ error: 'Username is required' } as ResponseBody),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Convert username to a unique identifiers
    const email = usernameToEmail(username)
    const local_id = await generateV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", new TextEncoder().encode(username));

    // Initialize Supabase client
    const supabaseClient: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Try to sign in first
    let { data, error } = await signin(supabaseClient, local_id, email);

    // If user doesn't exist, create them and sign in
    if (error?.message?.includes('Invalid login credentials')) {
      // Create user
      const { error: signUpError } = await supabaseClient.auth.signUp({
        email,
        password: STATIC_PASSWORD,
        options: {
          data: {
            username,
            version: "0.0.1.0005-alpha",
            local_id,
          }
        }
      })

      if (signUpError) {
        throw signUpError
      }

      // Sign in with newly created user
      const { data: newData, error: signInError } = await signin(supabaseClient, local_id, email);

      if (signInError) {
        throw signInError
      }

      data = newData
    } else if (error) {
      throw error
    }

    const responseBody: ResponseBody = {
      ...data.session,
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      expires_at: data.session?.expires_at,
      user: data.session?.user,
    }

    return new Response(
      JSON.stringify(responseBody),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    const errorBody: ResponseBody = {
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }

    return new Response(
      JSON.stringify(errorBody),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
