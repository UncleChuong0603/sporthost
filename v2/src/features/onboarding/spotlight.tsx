"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Rect = { top: number; left: number; width: number; height: number };
export function tooltipPosition(target: Rect | null, width: number, height: number, tooltipHeight: number, offsetTop = 0) {
  const cardWidth = Math.min(352, width - 24), safeTop = offsetTop + 12, safeBottom = offsetTop + height - 92;
  const available = Math.max(48, safeBottom - safeTop), cardHeight = Math.min(tooltipHeight, available);
  const left = Math.max(12, Math.min(target?.left ?? width - cardWidth - 12, width - cardWidth - 12));
  if (!target) return { left, top: safeTop, width: cardWidth, maxHeight: available, placement: "below" };
  const below = target.top + target.height + 16, belowSpace = safeBottom - below, aboveSpace = target.top - 16 - safeTop;
  if (belowSpace >= cardHeight) return { left, top: below, width: cardWidth, maxHeight: belowSpace, placement: "below" };
  if (aboveSpace >= cardHeight) return { left, top: Math.min(safeBottom - cardHeight, target.top - cardHeight - 16), width: cardWidth, maxHeight: aboveSpace, placement: "above" };
  const top = Math.max(safeTop, Math.min(target.top, safeBottom - cardHeight));
  if (target.left + target.width + 16 + cardWidth <= width - 12) return { left: target.left + target.width + 16, top, width: cardWidth, maxHeight: available, placement: "right" };
  if (target.left - 16 - cardWidth >= 12) return { left: target.left - 16 - cardWidth, top, width: cardWidth, maxHeight: available, placement: "left" };
  // On narrow screens, make the card scroll in the larger free space rather
  // than covering the real input it is asking the host to use.
  if (Math.max(belowSpace, aboveSpace) >= 96) {
    return belowSpace >= aboveSpace
      ? { left, top: below, width: cardWidth, maxHeight: belowSpace, placement: "below" }
      : { left, top: safeTop, width: cardWidth, maxHeight: aboveSpace, placement: "above" };
  }
  return { left, top: safeTop, width: cardWidth, maxHeight: available, placement: "floating" };
}

export function Spotlight({ target, identity, children, onPause }: { target: string; identity: string; children: ReactNode; onPause: () => void }) {
  const [rect, setRect] = useState<Rect | null>(null), [missing, setMissing] = useState(false);
  const [compact, setCompact] = useState(false);
  const [focusedRect, setFocusedRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 375, height: 812, top: 0 }), [cardHeight, setCardHeight] = useState(300);
  const card = useRef<HTMLElement>(null), pause = useRef(onPause);
  useEffect(() => { pause.current = onPause; }, [onPause]);
  useEffect(() => {
    let frame = 0, current: HTMLElement | null = null, scrolled = false;
    setRect(null); setMissing(false); setCompact(false);
    const started = Date.now();
    function measure() {
      frame = 0;
      const visual = window.visualViewport;
      const nextViewport = { width: visual?.width ?? innerWidth, height: visual?.height ?? innerHeight, top: visual?.offsetTop ?? 0 };
      setViewport(previous => JSON.stringify(previous) === JSON.stringify(nextViewport) ? previous : nextViewport);
      // Only registry-controlled IDs reach this selector; hidden responsive copies are ignored.
      const element = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)).find(node => {
        const r = node.getBoundingClientRect(), style = getComputedStyle(node);
        const closed = node.closest("details:not([open])");
        return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && !node.closest("[hidden], [inert]") && (!closed || closed.querySelector(":scope > summary")?.contains(node));
      });
      if (element && !scrolled) {
        element.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" }); scrolled = true;
      }
      if (element !== current) { if (current) resize.unobserve(current); current = element ?? null; if (current) resize.observe(current); }
      const box = element?.getBoundingClientRect();
      const visible = box && box.bottom > nextViewport.top && box.top < nextViewport.top + nextViewport.height - 80;
      const next = visible ? { top: Math.max(nextViewport.top + 4, box.top - 5), left: Math.max(4, box.left - 5), width: Math.min(box.width + 10, nextViewport.width - 8), height: Math.min(box.height + 10, nextViewport.height - 88) } : null;
      setRect(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setMissing(!element && Date.now() - started >= 1800);
      if (card.current) setCardHeight(card.current.getBoundingClientRect().height);
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && !card.current?.contains(focused)) {
        const box = focused.getBoundingClientRect();
        const next = { top: box.top, left: box.left, width: box.width, height: box.height };
        setFocusedRect(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      }
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
    const resize = new ResizeObserver(schedule);
    if (card.current) resize.observe(card.current);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.getElementById("main") ?? document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "hidden", "class", "aria-busy"] });
    const timer = window.setTimeout(schedule, 1900);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) { event.preventDefault(); pause.current(); } };
    // Collapse as soon as the user works in the product, leaving the form and
    // subsequent controls unobscured. Learning stays active across the save.
    const focus = (event: FocusEvent) => {
      if (card.current && event.target instanceof HTMLElement && !card.current.contains(event.target) && event.target.id !== "host-tour-help" && event.target.matches("input,select,textarea,button,a,summary") && event.target.closest("#main")) { setCompact(true); schedule(); }
    };
    window.addEventListener("scroll", schedule, true); window.addEventListener("resize", schedule);
    visualViewport?.addEventListener("resize", schedule); visualViewport?.addEventListener("scroll", schedule);
    document.addEventListener("keydown", escape); document.addEventListener("focusin", focus);
    card.current?.focus({ preventScroll: true });
    schedule();
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); resize.disconnect(); mutations.disconnect(); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); visualViewport?.removeEventListener("resize", schedule); visualViewport?.removeEventListener("scroll", schedule); document.removeEventListener("keydown", escape); document.removeEventListener("focusin", focus); };
  }, [target, identity]);
  const position = tooltipPosition(compact ? focusedRect : rect, viewport.width, viewport.height, cardHeight, viewport.top);
  return <div data-tour-overlay="true">
    {rect && !compact && <div aria-hidden="true" className="pointer-events-none fixed z-50 rounded-xl border-2 border-white ring-2 ring-primary" style={{ ...rect, boxShadow: "0 0 0 9999px rgb(20 45 53 / .42)" }} />}
    <aside ref={card} tabIndex={-1} aria-label="Hướng dẫn thao tác" className="fixed z-[60] max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border bg-white p-4 shadow-xl" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
      {compact && <div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="ghost" onClick={() => setCompact(false)}>Hiện hướng dẫn</Button><Button type="button" variant="ghost" onClick={() => pause.current()}>Tạm dừng</Button></div>}
      <div hidden={compact}>{rect && position.placement !== "floating" && <p aria-hidden="true" className="text-lg font-bold text-primary">{{ above: "↓", below: "↑", right: "←", left: "→" }[position.placement]}</p>}{children}
      {missing && <p className="mt-3 text-xs text-muted-foreground">Mục này chưa hiện ở trang hiện tại. Dùng nút Đi tới thao tác, mở mục đang thu gọn hoặc quay lại hướng dẫn sau.</p>}</div>
    </aside>
  </div>;
}
