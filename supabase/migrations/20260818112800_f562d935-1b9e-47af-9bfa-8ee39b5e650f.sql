REVOKE EXECUTE ON FUNCTION public.singles_side_scores(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refresh_singles_impl(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refresh_singles(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.refresh_singles(uuid) TO authenticated;