"use client";

// One clock for the home page's turning colour (ui-jobs 499, 507): the live
// example's glow (components/home/live-example-frame.tsx) and "DeFi" in the
// directory heading (components/home/directory-heading.tsx) run the same CSS
// lap (globals.css, `--glow-lap`), pause together and hold one phase.
//
// Pausing: each member is watched by an IntersectionObserver; while none is
// on screen, `html[data-glow-still]` pauses every glow animation, so a member
// never runs while another stands still.
//
// Phase: the glow's layers mount after hydration (from sm only), later than
// the heading, and restart on a theme switch. On every start of a glow
// animation the heading's animation takes the slot-0 layer's current time;
// both carry slot 0's delay, so equal times are equal phases.

const visible = new Map<Element, boolean>();
let io: IntersectionObserver | null = null;

function settle() {
  const still = visible.size > 0 && ![...visible.values()].some(Boolean);
  document.documentElement.toggleAttribute("data-glow-still", still);
}

/** Watch an element that shows the turning colour; returns the cleanup. */
export function joinGlowClock(el: Element): () => void {
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) visible.set(e.target, e.isIntersecting);
    settle();
  });
  visible.set(el, false);
  io.observe(el);
  return () => {
    io?.unobserve(el);
    visible.delete(el);
    settle();
  };
}

const GLOW_ANIMATIONS = new Set(["live-glow-turn", "glow-text-turn"]);

/** Puts every `.glow-text` animation on the slot-0 glow layer's time. */
function syncText() {
  const layer = document.querySelector(".live-glow-layer");
  const lead = layer?.getAnimations().find((a) => (a as CSSAnimation).animationName === "live-glow-turn");
  if (!lead || lead.currentTime == null) return;
  for (const el of document.querySelectorAll(".glow-text")) {
    for (const a of el.getAnimations()) {
      if ((a as CSSAnimation).animationName === "glow-text-turn") a.currentTime = lead.currentTime;
    }
  }
}

/** Keeps the heading's text in phase with the glow; returns the cleanup. */
export function syncGlowText(): () => void {
  const onStart = (e: AnimationEvent) => {
    if (GLOW_ANIMATIONS.has(e.animationName)) requestAnimationFrame(syncText);
  };
  document.addEventListener("animationstart", onStart, true);
  requestAnimationFrame(syncText);
  return () => document.removeEventListener("animationstart", onStart, true);
}
