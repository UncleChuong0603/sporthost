import { describe, expect, it } from "vitest";
import { isVietnamProvince, searchProvinces, vietnamProvinces } from "@/domain/vietnam-provinces";

describe("Vietnam province selection", () => {
  it("finds Vietnamese names with accents, without accents and with normalized whitespace", () => {
    expect(searchProvinces("đắk")).toEqual(["Đắk Lắk"]);
    expect(searchProvinces("DAK LAK")).toEqual(["Đắk Lắk"]);
    expect(searchProvinces("  da   nang  ")).toEqual(["Đà Nẵng"]);
    expect(searchProvinces("ho chi minh")).toEqual(["Hồ Chí Minh"]);
    expect(searchProvinces("không tồn tại")).toEqual([]);
  });

  it("offers the current 34 unique names and excludes former province names", () => {
    expect(searchProvinces(" ")).toHaveLength(34);
    expect(new Set(vietnamProvinces).size).toBe(34);
    expect(isVietnamProvince("Huế")).toBe(true);
    expect(isVietnamProvince("Bình Dương")).toBe(false);
    expect(isVietnamProvince("Quận 8")).toBe(false);
  });
});
