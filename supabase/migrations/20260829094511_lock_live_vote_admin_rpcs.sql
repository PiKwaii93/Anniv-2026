revoke all on function public.admin_start_live_vote(uuid, integer) from public, anon;
revoke all on function public.admin_advance_likely_vote() from public, anon;
revoke all on function public.admin_reveal_live_vote() from public, anon;
revoke all on function public.admin_skip_live_vote() from public, anon;
revoke all on function public.admin_clear_live_vote() from public, anon;
revoke all on function public.admin_reset_live_vote_identity(text) from public, anon;

grant execute on function public.admin_start_live_vote(uuid, integer) to authenticated;
grant execute on function public.admin_advance_likely_vote() to authenticated;
grant execute on function public.admin_reveal_live_vote() to authenticated;
grant execute on function public.admin_skip_live_vote() to authenticated;
grant execute on function public.admin_clear_live_vote() to authenticated;
grant execute on function public.admin_reset_live_vote_identity(text) to authenticated;
