# Supabase PostgREST Egress

Supabase egress includes outgoing Database, Storage, Auth, API, Edge Function, Pooler, and Log Drain traffic. Plantie's June 2026 spike was dominated by PostgREST egress, not Storage, so large image downloads were not the primary cause.

Operational notes:

- Supabase URL and anon key are public by design. Treat RLS, scoped grants, and server-side authorization as the security boundary.
- Table Editor browsing in the Supabase dashboard can count as API/PostgREST egress.
- Local scripts that use the anon/auth/service Supabase client can count as API/PostgREST egress.
- Repeated manual refreshes, mobile reinstall testing, and dev StrictMode can amplify startup reads.
- Denied `401`/`403` requests still create response traffic, so avoid exposing broad anon table grants.

App-side controls:

- Household startup data is loaded through `loadSupabaseReadThroughState`, which has short-lived cache and in-flight request deduping.
- Route changes should reuse the cached household snapshot unless a mutation invalidates it.
- Mutations that change household data should call `refreshSupabaseReadState`, which invalidates and reloads the snapshot once.
- Development read logging is opt-in. In dev tools, run:

```js
localStorage.setItem("plantie-debug-supabase-reads", "true")
```

Reload the app and watch `[plantie:supabase-read]` console entries. Disable it with:

```js
localStorage.removeItem("plantie-debug-supabase-reads")
```
