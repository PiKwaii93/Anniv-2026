import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const expectedMigrations = new Map(Object.entries({
  '20260828205421_add_bingo_prompts.sql': 'ac74c4d81017fe4cfa3a4c78a1a5adda',
  '20260828211424_optimize_bingo_rls.sql': 'a550c8067e842bd97b917b63d8a7082c',
  '20260829075321_add_party_state.sql': 'e44679995b237fb14c2c4f078efeb0a6',
  '20260829081238_add_secret_missions.sql': '556340779586ea04cc80e6e14db9f944',
  '20260829081317_balance_secret_mission_difficulty.sql': '4fbe3201f56f2c7243904fb6a634eb58',
  '20260829082246_index_secret_mission_foreign_keys.sql': '20c6966e252ffe7e5d93a79fe2d594ce',
  '20260829093812_add_live_vote_room.sql': '004e964132571e605d7e26b4f3adf844',
  '20260829094511_lock_live_vote_admin_rpcs.sql': '2825285408ae0ad2dac3ce4319725e85',
  '20260829094528_index_live_vote_foreign_keys.sql': 'e1446a8e0da5e4dc0f2f7427e3da453d',
  '20260829094613_revoke_anon_live_vote_private_tables.sql': '45d5b1aaecde4fa16efc9a2722be098e',
  '20260830134735_add_live_party_announcements.sql': '30b57e6c5375b6f218fd63a1e112749c',
  '20260830135525_harden_live_party_announcement_grants.sql': '527c5c51e30d1b4312fedac3eafada66',
  '20260830141212_add_global_party_identity.sql': 'd0cbdc692f2dd70ba541093aae88bee1',
  '20260830143439_harden_live_concurrency.sql': '653cec263170695c20c444e3a6361c93',
  '20260830144803_add_content_pack_import.sql': 'ac49625fa2ba54953a3e060233cf9902',
  '20260830145550_restrict_content_pack_import.sql': '364161a91da107d34672b334f41aa625',
  '20260830150524_add_party_hall_of_fame.sql': '50a75c971fe68b33152ad511fa25b513',
  '20260830151219_fix_party_hall_of_fame_aggregates.sql': '8466fe061dfef2fc2af712efb7ce83a8',
  '20260830154341_add_photo_hunt.sql': '006c8e18f6b3627ca73b76f18d3be3af',
  '20260830163429_photo_hunt_covering_indexes.sql': 'b4204857f09084464a6708538f11b3ff',
  '20260830164908_fix_photo_hunt_public_read_policies.sql': '4b347171ebf95fa9d3c0fdc600ceb237',
  '20260830164941_simplify_photo_hunt_public_read_roles.sql': '4fac7d10a1111181c4a57e08f1b8c123',
  '20260831130251_fix_photo_hunt_player_state_ordering.sql': '66e2370ac49b878061e93e6fc978d7a3',
  '20260901205222_extend_content_pack_with_photo_hunt.sql': '56ce8d80df7bf3af810e53081039680e',
  '20260901212105_add_director_party_scenes.sql': 'eb056edce1dcb490b0c8803d70f20844',
  '20260902132957_party_extras_capsule_jukebox_duos_credits.sql': 'df734fdfe9b110e6bea790f91338deb5',
  '20260902224840_spotify_jukebox_bridge.sql': '5b48a6c4617bbe4e8be91ad1afffeaa1',
  '20260902234610_jukebox_optional_artist.sql': 'a078f20dfc4ce947f772cdf61c717ba0',
  '20260903083437_spotify_guest_choice_and_direct_queue.sql': 'd548a6d58fc15a004aaf7940c9e92394',
  '20260903101213_bingo_guest_read_policy.sql': '0cf86a2653298dfefb7ddcfecd15bbfa',
  '20260903193803_party_guest_chat.sql': '92aa2bbb7884e545ef6d05bc7a1adedc',
  '20260903204523_admin_disconnect_guests.sql': '19f73de2cdbeb0350987a43afb29c089',
  '20260903212302_fix_guest_disconnect_safeupdate.sql': 'fe4eaf829eee09091ed2ea2ef6cb3f1d',
  '20260904094459_admin_party_data_reset.sql': '0df81bd31bf38efe629490dfbe60f9ef',
  '20260904102534_mission_peer_validation.sql': '3056fac7ccebe95b77f81a04dc80ba75',
  '20260904103246_mission_state_readonly.sql': '26a26cb8fdfbc42206032119107ac9ec',
  '20260904221319_party_bring_list.sql': 'ac642460ccbf0aca44e80abde455d993',
  '20260904232523_isolated_rehearsal_mode.sql': '00cdf78221460e4c4753d7056ecbe3da',
  '20260906185619_party_event_info.sql': 'c5ce80059544241a78a56d61e6fc591d',
  '20260907191421_harden_rehearsal_boundaries.sql': 'c17dc9dea210319d5e793450c6019c4f',
  '20260908075929_revoke_deleted_guest_sessions.sql': '7036481ac8b8e40765ce731f5ce28ed8',
  '20260908082945_harden_supabase_security_boundaries.sql': 'cf8d11c78bdbdd9937fac1450643178b',
  '20260908160000_reveal_unanimous_likely_vote.sql': '1a1d28a8c8201f65eb4a299e8794970c',
  '20260909171320_add_guest_profile_photos.sql': '1fa9dbcf130442ade8edb74ca7464dbd',
  '20260910143000_fix_guest_status_session_revocation.sql': '86dd641186dca9d448e9514f19cb510a',
  '20260910203000_add_chat_message_avatars.sql': 'a3e5d3fd48533b45e5a920ec152b8fba',
  '20260911110000_add_plus_one_requests_and_auto_approve_photos.sql': '1db0accca1373ad32d10c6b58156c257',
  '20260911213000_add_party_captains.sql': '4480c221c5998e3542a59c2961ca1edb',
}))

const normalizedMd5 = (sql) => createHash('md5')
  .update(sql.replace(/\r\n?/g, '\n').trim())
  .digest('hex')

test('the local migration ledger matches the recovered production ledger plus reviewed changes', async () => {
  const files = (await readdir('supabase/migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  assert.deepEqual(files, [...expectedMigrations.keys()])

  for (const file of files) {
    const sql = await readFile(`supabase/migrations/${file}`, 'utf8')
    assert.equal(normalizedMd5(sql), expectedMigrations.get(file), file)
  }
})

test('the pre-ledger baseline contains structure but no private production data', async () => {
  const sql = await readFile('supabase/baseline/legacy_foundation.sql', 'utf8')
  const requiredTables = [
    'guests',
    'plus_ones',
    'guest_private_notes',
    'app_admins',
    'beer_pong_state',
    'iceberg_entries',
  ]

  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
  }

  assert.doesNotMatch(sql, /insert\s+into\s+public\.(guests|plus_ones|guest_private_notes|app_admins|iceberg_entries)/i)
  assert.doesNotMatch(sql, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  assert.match(sql, /insert into public\.beer_pong_state \(id, state\)/)
})
