revoke all on table public.live_vote_questions from anon;
revoke all on table public.live_vote_players from anon;
revoke all on table public.live_vote_rounds from anon;
revoke all on table public.live_vote_votes from anon;
revoke all on table public.live_vote_control from anon;

revoke all on table public.live_vote_questions from public;
revoke all on table public.live_vote_players from public;
revoke all on table public.live_vote_rounds from public;
revoke all on table public.live_vote_votes from public;
revoke all on table public.live_vote_control from public;

grant select on table public.live_vote_public_state to anon, authenticated;
