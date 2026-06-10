import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

export const createUserClient = (authorization: string) => {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error("Supabase user client is not configured.");
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
};

export const createServiceClient = () => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service client is not configured.");
  }

  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
};

export const requireUser = async (authorization: string) => {
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const client = createUserClient(authorization);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return { client, user: data.user };
};

