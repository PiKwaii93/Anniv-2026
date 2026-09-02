-- Guest submissions now need only a title. Existing quotas, identities and RLS
-- remain unchanged; the action already defaults an omitted artist to ''.
alter table party_extras.songs drop constraint songs_artist_check;
alter table party_extras.songs add constraint songs_artist_check
  check (length(btrim(artist)) <= 100);
