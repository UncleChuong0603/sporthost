"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BookOpen, CircleCheck, Circle, Pause, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { missions, missionById, nextSetup, setupComplete, type MissionId, type TourSnapshot } from "./registry";
import { Spotlight } from "./spotlight";

type Command = { action: "welcome" | "start" | "resume" | "pause" | "dismiss" | "restart" | "select" | "skip" | "refresh" | "share"; missionId?: MissionId; sessionId?: number; clubId?: number | null };
type Context = { snapshot: TourSnapshot | null; error: string; busy: boolean; open: () => void; run: (command: Command) => Promise<TourSnapshot | null> };
const TourContext = createContext<Context | null>(null);
function useTour() { const value = useContext(TourContext); if (!value) throw Error("OnboardingProvider missing"); return value; }
export const tourMutationEvent = "sporthost:mutation-success";
export const tourShareEvent = "sporthost:share-success";

export function OnboardingProvider({ csrf, children }: { csrf: string; children: ReactNode }) {
  const path = usePathname(), search = useSearchParams(), router = useRouter();
  const [snapshot, setSnapshot] = useState<TourSnapshot | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [opened, setOpened] = useState(false);
  const [locallyPaused, setLocallyPaused] = useState(false);
  const [shareReceipt, setShareReceipt] = useState<{ sessionId: number; clubId: number } | null>(null);
  const state = useRef(snapshot), inFlight = useRef(false), getGeneration = useRef(0), dialog = useRef<HTMLDialogElement>(null), returnFocus = useRef<HTMLElement | null>(null);
  const activeBefore = useRef<{ clubId: number | null; missionId: MissionId | null; done: boolean } | null>(null);
  const commit = useCallback((value: TourSnapshot) => { state.current = value; setSnapshot(value); }, []);
  const load = useCallback(async () => {
    const generation = ++getGeneration.current;
    try {
      const club = path.match(/^\/clubs\/([1-9]\d*)(?:\/|$)/)?.[1] || search.get("club_id"), session = path.match(/^\/games\/([1-9]\d*)(?:\/|$)/)?.[1];
      const query = session ? `?session_id=${encodeURIComponent(session)}` : club ? `?club_id=${encodeURIComponent(club)}` : "";
      const response = await fetch("/api/onboarding" + query, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (generation !== getGeneration.current || inFlight.current) return null;
      if (!response.ok) throw Error(result.error || "Chưa tải được hướng dẫn.");
      commit(result); setError(""); return result as TourSnapshot;
    } catch (error) { if (generation === getGeneration.current) setError(error instanceof Error ? error.message : "Chưa tải được hướng dẫn."); return null; }
  }, [commit, path, search]);
  const run = useCallback(async (command: Command) => {
    if (inFlight.current) return null;
    const current = state.current;
    if (!current) { await load(); return null; }
    inFlight.current = true; ++getGeneration.current; setBusy(true); setError("");
    try {
      const response = await fetch("/api/onboarding", { method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ ...command, revision: current.revision, clubId: command.clubId === undefined ? current.context.clubId : command.clubId }) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409 || response.status === 403 || response.status === 404) { inFlight.current = false; await load(); } throw Error(result.error || "Chưa lưu được hướng dẫn."); }
      if (["start", "resume", "restart", "select"].includes(command.action)) setLocallyPaused(false);
      commit(result); return result as TourSnapshot;
    } catch (error) { setError(error instanceof Error ? error.message : "Mất kết nối. Tiến độ đã lưu vẫn được giữ; hãy thử lại."); return null; }
    finally { inFlight.current = false; setBusy(false); }
  }, [commit, csrf, load]);
  useEffect(() => { void load(); }, [load, path, search]);
  useEffect(() => {
    const refresh = () => { if (!inFlight.current) void load(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const share = (event: Event) => { const { sessionId, clubId } = (event as CustomEvent<{ sessionId: number; clubId: number }>).detail ?? {}; if (Number.isSafeInteger(sessionId) && Number.isSafeInteger(clubId)) setShareReceipt({ sessionId, clubId }); };
    window.addEventListener(tourMutationEvent, refresh); window.addEventListener(tourShareEvent, share); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener(tourMutationEvent, refresh); window.removeEventListener(tourShareEvent, share); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [load, run]);
  useEffect(() => {
    if (shareReceipt && snapshot && !busy && !inFlight.current) {
      setShareReceipt(null); void run({ action: "share", ...shareReceipt });
    }
  }, [shareReceipt, snapshot, busy, run]);
  // Advance only after the selected real action changes from incomplete to proven.
  // Selecting a completed mission is replay and must stay visible.
  useEffect(() => {
    if (!snapshot) return;
    const missionId = snapshot.missionId, done = !!snapshot.progress.find(p => p.id === missionId)?.done;
    const previous = activeBefore.current;
    activeBefore.current = { clubId: snapshot.context.clubId, missionId, done };
    if (snapshot.status === "active" && previous?.missionId === missionId && !previous.done && done && (previous.clubId === snapshot.context.clubId || missionId === "club")) {
      const next = nextSetup(snapshot);
      if (missionById(missionId ?? "")?.group === "setup" && next) void run({ action: "select", missionId: next.id });
      else void run({ action: "refresh" });
    }
  }, [snapshot, run]);
  useEffect(() => { if (opened) dialog.current?.showModal(); else dialog.current?.close(); }, [opened]);
  function open() { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setOpened(true); if (!state.current) void load(); }
  function close() { setOpened(false); (returnFocus.current?.isConnected ? returnFocus.current : document.getElementById("host-tour-help"))?.focus(); }
  async function select(command: Command) {
    const value = await run(command);
    if (value) { close(); const mission = missionById(value.missionId ?? ""); if (mission) router.push(mission.route(value.context)); }
  }
  const selected = snapshot && missionById(snapshot.missionId ?? ""), progress = snapshot?.progress.find(p => p.id === selected?.id);
  const pause = () => { setLocallyPaused(true); setOpened(false); void run({ action: "pause" }); document.getElementById("host-tour-help")?.focus(); };
  return <TourContext value={{ snapshot, busy, error, open, run }}>
    {children}
    <dialog ref={dialog} aria-labelledby="tour-help-title" onCancel={event => { event.preventDefault(); close(); }} onClose={() => { if (opened) close(); }} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],select:not(:disabled)")).filter(node => node.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="flex items-start justify-between gap-3"><h2 id="tour-help-title" className="text-xl font-bold">Hướng dẫn cho host</h2><Button autoFocus type="button" variant="ghost" size="icon" aria-label="Đóng hướng dẫn" onClick={close}><X aria-hidden="true" /></Button></div>
      {error && <p role="alert" className="my-3 text-sm text-destructive">{error}</p>}
      {!snapshot ? <Button type="button" variant="outline" onClick={() => void load()}>Tải hướng dẫn</Button> : <QuestPanel snapshot={snapshot} busy={busy} onSelect={missionId => void select({ action: "select", missionId })} onStart={() => void select({ action: snapshot.status === "paused" && snapshot.missionId ? "resume" : "start" })} onRestart={() => void select({ action: "restart" })} onPause={pause} onClub={clubId => void run({ action: "start", clubId })} />}
    </dialog>
    {!opened && !locallyPaused && snapshot?.status === "active" && selected && <Spotlight target={selected.target} identity={`${snapshot.context.clubId}:${path}:${search}:${selected.id}`} onPause={pause}>
      <Tooltip snapshot={snapshot} missionId={selected.id} busy={busy} onPause={pause} onSkip={() => void run({ action: "skip", missionId: selected.id })} onHelp={open} />
      {!progress?.available && <p className="mt-3 text-sm text-muted-foreground">{progress?.reason}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </Spotlight>}
  </TourContext>;
}

export function OnboardingHelp() { const { open } = useTour(); return <div className="mb-4 flex flex-wrap items-center gap-2"><Button id="host-tour-help" data-tour-help type="button" variant="ghost" className="relative z-[70] bg-white" onClick={open}><BookOpen aria-hidden="true" className="size-4" />Hướng dẫn</Button><Link href="/guide" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-primary underline">Tất cả hướng dẫn</Link></div>; }
export function OnboardingHome() {
  const { snapshot, run, open, busy, error } = useTour();
  const observed = useRef(false);
  useEffect(() => {
    if (!observed.current && snapshot?.status === "new" && !snapshot.clubs.length) { observed.current = true; void run({ action: "welcome" }); }
  }, [snapshot, run]);
  if (!snapshot) return null;
  if (snapshot.status === "new" && !snapshot.clubs.length) return <><Welcome busy={busy} onStart={() => void run({ action: "start" })} onLater={() => void run({ action: "dismiss" })} />{error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}</>;
  if (snapshot.status === "active" && setupComplete(snapshot)) return <Completion onHelp={open} onPause={() => void run({ action: "pause" })} busy={busy} />;
  if (snapshot.status === "active" && !snapshot.missionId) return <section className="mb-6 rounded-2xl border bg-white p-5"><p>Bạn đã đi qua các nhiệm vụ hiện tại. Mục đã bỏ qua vẫn chưa được tính hoàn tất.</p><Button type="button" variant="outline" onClick={open}>Chọn nhiệm vụ khác</Button></section>;
  return null;
}
export function Welcome({ busy, onStart, onLater }: { busy: boolean; onStart: () => void; onLater: () => void }) {
  return <section aria-labelledby="tour-welcome-title" className="mb-6 rounded-2xl border border-teal-200 bg-white p-5 sm:p-6"><p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">Bắt đầu cùng SportHost</p><h2 id="tour-welcome-title" className="text-xl font-bold">CLB đầu tiên, từng bước dễ làm</h2><p className="mt-3 max-w-2xl text-sm text-muted-foreground">Tạo CLB, lên buổi chơi và chuẩn bị lời mời. Tiến độ được lưu theo tài khoản; bạn có thể dừng bất cứ lúc nào và mở lại ở Hướng dẫn.</p><div className="mt-4 flex flex-wrap gap-3"><Button type="button" disabled={busy} onClick={onStart}>Bắt đầu hướng dẫn</Button><Button type="button" variant="outline" disabled={busy} onClick={onLater}>Khám phá sau</Button></div></section>;
}
export function Progress({ snapshot }: { snapshot: TourSnapshot }) {
  const core = snapshot.progress.filter(p => missions.find(m => m.id === p.id)?.group === "setup"), count = core.filter(p => p.done).length;
  return <div className="my-4"><p className="mb-2 text-sm font-semibold">Thiết lập CLB · {count}/{core.length} nhiệm vụ hoàn tất</p><progress aria-label="Tiến độ thiết lập CLB" value={count} max={core.length} className="h-2 w-full accent-primary" /></div>;
}
export function QuestPanel({ snapshot, busy, onSelect, onStart, onRestart, onPause, onClub }: { snapshot: TourSnapshot; busy: boolean; onSelect: (id: MissionId) => void; onStart: () => void; onRestart: () => void; onPause: () => void; onClub: (id: number) => void }) {
  return <><p className="mt-3 text-sm text-muted-foreground">Làm với dữ liệu thật khi cần. Nhiệm vụ tùy chọn có thể để lại; không cần phát sinh tiền để học cách dùng.</p>
    {!!snapshot.clubs.length && <label className="mt-4 block text-sm font-semibold">CLB đang học<select aria-label="CLB đang học" className="mt-2 h-12 w-full rounded-lg border bg-white px-3" value={snapshot.context.clubId ?? ""} disabled={busy} onChange={e => onClub(Number(e.target.value))}>{snapshot.clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    <Progress snapshot={snapshot} /><div className="mb-5 flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={onStart}>{snapshot.status === "paused" && snapshot.missionId ? "Tiếp tục hướng dẫn" : "Tiếp tục thiết lập"}</Button><Button type="button" disabled={busy} variant="outline" onClick={onRestart}>Bắt đầu lại</Button>{snapshot.status === "active" && <Button type="button" disabled={busy} variant="ghost" onClick={onPause}>Tạm dừng</Button>}</div>
    {(["setup", "advanced"] as const).map(group => <section key={group} className="mt-5"><h3 className="font-bold">{group === "setup" ? "CLB đầu tiên" : "Trở thành host chuyên nghiệp"}</h3>{group === "advanced" && <p className="my-2 text-xs text-muted-foreground">Tùy chọn · Chỉ các mục ghi Pro cần gói Pro hoặc dùng thử.</p>}<ol className="divide-y">{missions.filter(m => m.group === group).map(m => {
      const p = snapshot.progress.find(p => p.id === m.id)!;
      return <li key={m.id} className="py-3"><div className="flex items-start gap-2">{p.done ? <CircleCheck aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" /> : <Circle aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />}<div className="min-w-0 flex-1"><p className="text-sm font-semibold">{m.title}{"pro" in m && m.pro ? " · Pro" : ""}</p><p className="mt-1 text-xs text-muted-foreground">{p.done ? "Đã hoàn tất từ dữ liệu thật" : p.skipped ? "Đã bỏ qua · chưa hoàn tất" : p.reason || "Chưa hoàn tất"}</p><Button type="button" variant="ghost" disabled={busy || !p.available} onClick={() => onSelect(m.id)}>{p.done ? "Xem lại hướng dẫn" : "Hướng dẫn thao tác"}</Button></div></div></li>;
    })}</ol></section>)}
    <p className="mt-4 text-xs text-muted-foreground">Lịch cá nhân và CSV có tại trang buổi chơi / Thu chi. Đổi mật khẩu ở Tài khoản. Gói Pro chỉ mua từ trang CLB khi bạn có nhu cầu.</p>
  </>;
}
export function Tooltip({ snapshot, missionId, busy, onPause, onSkip, onHelp }: { snapshot: TourSnapshot; missionId: MissionId; busy: boolean; onPause: () => void; onSkip: () => void; onHelp: () => void }) {
  const m = missionById(missionId)!, p = snapshot.progress.find(p => p.id === missionId)!;
  const group = missions.filter(item => item.group === m.group), step = group.findIndex(item => item.id === missionId) + 1;
  return <><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-primary">{m.group === "setup" ? "CLB đầu tiên" : "Host chuyên nghiệp"} · {step}/{group.length}</p><Button type="button" variant="ghost" size="icon" aria-label="Tạm dừng hướng dẫn" onClick={onPause} disabled={busy}><Pause aria-hidden="true" className="size-4" /></Button></div><h2 className="text-lg font-bold">{m.title}</h2><p className="mt-2 text-sm text-muted-foreground">{m.copy}</p>{p.done && <p className="mt-2 text-sm font-semibold text-primary" aria-live="polite">Đã hoàn tất · Bạn đang xem lại hướng dẫn.</p>}<div className="mt-3 flex flex-wrap gap-2">{p.available && <Button asChild variant="outline"><Link href={m.route(snapshot.context)}>Đi tới thao tác</Link></Button>}<Button type="button" variant="ghost" onClick={onHelp}>Nhiệm vụ</Button>{!p.done && <Button type="button" variant="ghost" disabled={busy || !p.available} onClick={onSkip}>Bỏ qua bước này</Button>}</div><p className="mt-2 text-xs text-muted-foreground">Esc để tạm dừng. Tiến độ được lưu; bạn vẫn dùng trang bình thường.</p></>;
}
export function Completion({ onHelp, onPause, busy }: { onHelp: () => void; onPause: () => void; busy: boolean }) {
  return <section aria-labelledby="tour-complete-title" className="mb-6 rounded-2xl border border-teal-200 bg-teal-50 p-5"><h2 id="tour-complete-title" className="text-xl font-bold">CLB đã sẵn sàng đón người chơi!</h2><p className="my-3 text-sm">Bạn đã có CLB, buổi chơi và lời mời. Gửi lời mời đến nhóm của bạn; các nhiệm vụ tiếp theo hoàn toàn tùy chọn.</p><div className="flex flex-wrap gap-3"><Button type="button" onClick={onHelp}>Khám phá kỹ năng host</Button><Button type="button" disabled={busy} variant="outline" onClick={onPause}>Hoàn tất hướng dẫn</Button></div></section>;
}
