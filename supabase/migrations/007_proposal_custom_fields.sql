-- Per-proposal PDF customization overrides.
-- Fields (all optional):
--   price_suffix      text  e.g. "/ trip"
--   custom_conditions text  free-form extra clause appended to the PDF body
--   override_services text  newline-separated service list; replaces global setting when set
alter table proposals
  add column if not exists custom_fields jsonb default null;
