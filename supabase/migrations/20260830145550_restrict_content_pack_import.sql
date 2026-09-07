revoke execute on function public.admin_import_content_pack(jsonb, text, text[]) from anon;
revoke execute on function public.admin_import_content_pack(jsonb, text, text[]) from public;
grant execute on function public.admin_import_content_pack(jsonb, text, text[]) to authenticated;
