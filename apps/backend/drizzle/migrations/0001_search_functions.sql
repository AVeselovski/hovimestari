-- Food search: the extensions and the normalising functions the generated
-- search columns of `foods` call (migration 0002). Every call to an extension
-- or to these functions inside a body is schema-qualified (public.), so a
-- restore with an empty search_path still computes them. The built-ins lower,
-- btrim, regexp_replace and split_part are not: they resolve through
-- pg_catalog, which Postgres always searches first.
-- Search lowers names, folds accents and counts characters in SQL. On any
-- encoding but UTF-8, char_length counts bytes and [:alnum:] drops non-ASCII
-- letters, so the ranking would quietly differ. Refuse such a database.
DO $$
BEGIN
  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'Hovimestari needs a UTF8 database, and this one is %', current_setting('server_encoding');
  END IF;
END
$$;--> statement-breakpoint
-- Food lists and search sort names with the ICU collation fi-x-icu (Finnish
-- order). A server built without ICU lacks it, and every food read would then
-- fail. Refuse such a server here, so the first deploy fails instead.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'fi-x-icu') THEN
    RAISE EXCEPTION 'Hovimestari needs the ICU collation fi-x-icu, and this server has none. Use a Postgres built with ICU.';
  END IF;
END
$$;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public;--> statement-breakpoint
-- unaccent() is STABLE, so a generated column cannot call it. The usual
-- immutable wrapper, with the dictionary named so the search path cannot
-- change its meaning.
CREATE FUNCTION public.f_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;--> statement-breakpoint
-- Lower case, accents folded (ä -> a, ö -> o), every run of non-alphanumerics
-- one space, trimmed.
CREATE FUNCTION public.food_search_norm(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT btrim(regexp_replace(lower(public.f_unaccent($1)), '[^[:alnum:]]+', ' ', 'g')) $$;--> statement-breakpoint
-- The head of a name: the first word of its first part, with hyphens kept, so
-- "Kananmuna, kuoreton" -> "kananmuna" and "Muna-kinkkuvuoka" -> "muna-kinkkuvuoka".
-- Parts are split on ", " (comma and space), never on a decimal comma such as "<0,5 %".
CREATE FUNCTION public.food_search_head(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT split_part(btrim(regexp_replace(lower(public.f_unaccent(split_part($1, ', ', 1))), '[^[:alnum:]-]+', ' ', 'g')), ' ', 1) $$;
