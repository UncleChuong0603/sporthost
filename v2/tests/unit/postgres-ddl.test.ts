import { expect, it } from "vitest";
import { normalizePostgresDdl } from "../postgres-ddl";
it("accepts only equivalent array text casts after native restore, retaining meaningful constraint differences", () => {
  const original = "CHECK (((gender)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying])::text[])))";
  const reparsed = "CHECK (((gender)::text = ANY (ARRAY[('male'::character varying)::text, ('female'::character varying)::text])))";
  expect(normalizePostgresDdl(original)).toBe(normalizePostgresDdl(reparsed));
  expect(normalizePostgresDdl(reparsed.replace("female", "other"))).not.toBe(normalizePostgresDdl(original));
  expect(normalizePostgresDdl("CHECK ((amount >= 1))")).not.toBe(normalizePostgresDdl("CHECK ((amount >= 0))"));
});
