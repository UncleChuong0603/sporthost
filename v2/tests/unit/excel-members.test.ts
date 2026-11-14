import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseMembersExcel, validateWorkbook } from "@/server/modules/members/xlsx";
import { memberHeaders, memberWorkbook, zipFixture } from "../xlsx-fixture";
describe("bounded real Excel member reader", () => {
  it("accepts the downloadable blank workbook but never imports sample people", async () => {
    const bytes = readFileSync("public/templates/thanh-vien-sporthost.xlsx");
    expect(() => validateWorkbook(bytes)).not.toThrow();
    await expect(parseMembersExcel(bytes)).rejects.toMatchObject({ status: 400 });
  });
  it("reads Vietnamese columns and values, normalized phones and numeric Excel phone cells", async () => {
    const rows = await parseMembersExcel(memberWorkbook([memberHeaders, ["Ngọc Ánh", "+84901122334", "Cố định", "Nữ", "Khá"], ["Bình", 901122335, "Vãng lai", "Nam", ""]]));
    expect(rows[0].values).toEqual({ name: "Ngọc Ánh", phone: "0901122334", kind: "fixed", gender: "female", level: "Khá" });
    expect(rows[1].values?.phone).toBe("0901122335"); expect(rows[1].message).toContain("số 0");
  });
  it("reports bad rows and duplicates, without silently changing optional field errors", async () => {
    const rows = await parseMembersExcel(memberWorkbook([memberHeaders, ["One", "0901122334", "", "", ""], ["Duplicate", "84901122334", "fixed", "", ""], ["Bad phone", "wrong", "", "", ""], ["Bad gender", "0901122336", "", "Other", ""]]));
    expect(rows.map(r => r.status)).toEqual(["ready", "duplicate", "invalid", "invalid"]);
    expect(rows[2].row).toBe(4); expect(rows[3].message).toContain("Giới tính");
  });
  it("requires known headers and supports a simple two-column workbook", async () => {
    await expect(parseMembersExcel(memberWorkbook([["Name", "Email"], ["Test", "test@example.com"]]))).rejects.toMatchObject({ status: 400 });
    const [row] = await parseMembersExcel(memberWorkbook([["Họ và tên", "SĐT"], ["Test", "0901122334"]]));
    expect(row.values?.kind).toBe("fixed"); expect(row.values?.gender).toBe("unspecified");
  });
  it("rejects corrupt, oversized, highly compressed and sparse workbooks before parsing", async () => {
    for (const bytes of [Buffer.from("not an Excel file"), Buffer.alloc(2 * 1024 * 1024 + 1), zipFixture({ bomb: Buffer.alloc(4 * 1024 * 1024 + 1) }), memberWorkbook([], '<worksheet><sheetData><row r="1048576"><c r="A1048576"/></row></sheetData></worksheet>')]) {
      await expect(parseMembersExcel(bytes)).rejects.toMatchObject({ status: expect.any(Number) });
    }
  });
  it("rejects formulas and external data without executing them", async () => {
    for (const sheet of ['<worksheet><sheetData><row r="2"><c r="B2"><f>1+2</f><v>3</v></c></row></sheetData></worksheet>', '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///private">]><worksheet/>', '<worksheet><hyperlink TargetMode="External"/></worksheet>']) {
      await expect(parseMembersExcel(memberWorkbook([], sheet))).rejects.toMatchObject({ status: 400 });
    }
  });
  it("bounds coordinates in relocated XML parts and rejects encoded or noncanonical addresses", () => {
    for (const coordinate of ['A1048576', 'A&#49;048576', 'a1048576', 'A1e9', 'A0']) {
      const bytes = zipFixture({ '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '<workbook/>', 'xl/custom/sheet.xml': `<worksheet><sheetData><row r="1"><c extra=">" r = "${coordinate}"/></row></sheetData></worksheet>` });
      expect(() => validateWorkbook(bytes)).toThrow();
    }
    expect(() => validateWorkbook(zipFixture({ '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>', 'xl/custom/sheet.xml': '<worksheet><sheetData><row r="1"><c r="A1"><is><t> r="A1048576"</t></is></c></row></sheetData></worksheet>' }))).not.toThrow();
  });
});
