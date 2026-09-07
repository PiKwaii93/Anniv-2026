create index if not exists live_vote_control_current_round_idx
  on public.live_vote_control(current_round_id);

create index if not exists live_vote_rounds_question_idx
  on public.live_vote_rounds(question_id);

create index if not exists live_vote_votes_player_idx
  on public.live_vote_votes(player_key);
