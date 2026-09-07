alter table party_extras.songs drop constraint songs_artist_check;
alter table party_extras.songs add constraint songs_artist_check check (length(btrim(artist)) <= 100);
