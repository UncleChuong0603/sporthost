import { describe, expect, it } from "vitest";
import { missions, nextSetup, setupComplete, type TourSnapshot } from "@/features/onboarding/registry";
import { tooltipPosition } from "@/features/onboarding/spotlight";

const snapshot = (): TourSnapshot => ({ revision: 0, status: "active", missionId: "club", context: { clubId: null, sessionId: null, shareSessionId: null, billingSessionId: null }, clubs: [], progress: missions.map(m => ({ id: m.id, done: false, skipped: false, available: true, reason: null })) });
describe("declarative host missions", () => {
  it("has stable unique targets, known prerequisites and internal routes", () => {
    expect(new Set(missions.map(m => m.id)).size).toBe(missions.length);
    for (const m of missions) {
      expect(m.target).toMatch(/^[a-z-]+$/);
      for (const p of m.prerequisites) expect(missions.some(m => m.id === p)).toBe(true);
      expect(m.route({ clubId: 12, sessionId: 23, shareSessionId: 24, billingSessionId: 25 })).toMatch(/^\/(clubs|schedule|members|games|finance|payments)\b/);
      expect(["saved-record", "share-success"]).toContain(m.trigger);
    }
  });
  it("never counts skipped or viewed missions as completed", () => {
    const s = snapshot(); s.progress.filter(p => ["club", "session", "share"].includes(p.id)).forEach(p => p.skipped = true);
    expect(nextSetup(s)).toBeUndefined(); expect(setupComplete(s)).toBe(false);
    s.progress.filter(p => ["club", "session", "share"].includes(p.id)).forEach(p => p.done = true);
    expect(setupComplete(s)).toBe(true);
  });
  it("chooses only actionable incomplete setup missions", () => {
    const s = snapshot(); s.progress[0].done = true; s.progress[1].available = false;
    expect(nextSetup(s)?.id).toBe("share"); s.progress[2].skipped = true;
    expect(nextSetup(s)).toBeUndefined();
  });
});
describe("spotlight placement", () => {
  it.each([360, 375, 768, 1440])("keeps tooltip inside a %ipx viewport", width => {
    for (const target of [null, { top: 10, left: -20, width: 100, height: 48 }, { top: 740, left: width - 30, width: 200, height: 48 }]) {
      const p = tooltipPosition(target, width, 812, 300);
      expect(p.left).toBeGreaterThanOrEqual(12); expect(p.left + p.width).toBeLessThanOrEqual(width - 12);
      expect(p.top).toBeGreaterThanOrEqual(12); expect(p.top + 300).toBeLessThanOrEqual(812 - 92);
    }
  });
  it("uses the visual viewport when a keyboard reduces available space", () => {
    const p = tooltipPosition({ top: 180, left: 20, width: 100, height: 48 }, 375, 420, 210, 80);
    expect(p.top).toBeGreaterThanOrEqual(92); expect(p.top + Math.min(210, p.maxHeight)).toBeLessThanOrEqual(80 + 420 - 92);
  });
  it.each([375, 1280])("keeps a centered target exposed at %ipx", width => {
    const target = { top: 325, left: width === 375 ? 40 : 325, width: 300, height: 48 };
    const p = tooltipPosition(target, width, 720, 334), h = Math.min(334, p.maxHeight);
    const overlaps = p.left < target.left + target.width && p.left + p.width > target.left && p.top < target.top + target.height && p.top + h > target.top;
    expect(overlaps).toBe(false);
  });
});
