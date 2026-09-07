create index if not exists secret_mission_history_prompt_id_idx
  on public.secret_mission_history(prompt_id);

create index if not exists secret_mission_players_current_prompt_id_idx
  on public.secret_mission_players(current_prompt_id);
