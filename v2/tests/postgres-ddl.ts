// pg_dump/reparse can move the exact varchar[] -> text[] coercion to each array literal.
// Normalize only those two equivalent renderings; retain all names, values, order and other SQL.
export function normalizePostgresDdl(value: string) {
  return value.replace(/\('((?:''|[^'])*)'::character varying\)::text/g, "'$1'::character varying")
    .replace(/\(\(ARRAY\[([^\]]+)\]\)::text\[\]\)/g, "(ARRAY[$1])");
}
