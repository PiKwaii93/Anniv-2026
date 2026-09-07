create index if not exists photo_hunt_submissions_moderated_by_idx on public.photo_hunt_submissions (moderated_by);
create index if not exists photo_hunt_upload_slots_challenge_id_idx on public.photo_hunt_upload_slots (challenge_id);
