import { useEffect } from "react";
import { Platform } from "react-native";
import type { ViewProps } from "react-native";
import { isReducedMotion, subscribeReducedMotion } from "./motion";
import { installShared } from "./shared-install";

const STYLE_ELEMENT_ID = "beautiful-chat-glow";
const ATTRIBUTE = "data-bcglow";
const ACTIVE_ATTRIBUTE = "data-bcglow-on";
const OFF_ATTRIBUTE = "data-bcglow-off";

/**
 * A light that follows the pointer across a card.
 *
 * React Native has no gradient primitive and no hover position, so this is a
 * real CSS rule matched by attribute — the technique the frosted surface and
 * the shimmer already use.
 *
 * The light lives in the card's own background layer, not in an overlay. An
 * overlay lit the whole card including the shell output and file blocks inside
 * it, which read as a wash over the content. A background paints beneath every
 * child, so an inner block with its own surface occludes it: the light shows
 * on the card's chrome — its header and padding — and stops at the blocks.
 *
 * `background-image` cannot be transitioned, so the fade rides on a registered
 * custom property instead: `--bcga` animates as a number and the gradient
 * reads it through `calc`.
 *
 * The tint is chosen per theme rather than per token, because a single white
 * wash reads as haze on a light surface. Dark surfaces take light, light
 * surfaces take a cool shade.
 *
 * Off web there is no pointer to follow and the attribute is inert, so the
 * card renders exactly as before.
 */
const GLOW_RULE = `@property --bcga {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}
[${ATTRIBUTE}] {
  --bcga: 0;
  background-repeat: no-repeat;
  transition: --bcga 200ms ease-out;
}
[${ATTRIBUTE}="dark"] {
  background-image: radial-gradient(
    120px circle at var(--bcgx, 50%) var(--bcgy, 50%),
    rgba(255, 255, 255, calc(var(--bcga) * 0.05)),
    transparent 70%
  );
}
[${ATTRIBUTE}="light"] {
  background-image: radial-gradient(
    120px circle at var(--bcgx, 50%) var(--bcgy, 50%),
    rgba(74, 104, 156, calc(var(--bcga) * 0.075)),
    transparent 70%
  );
}
[${ATTRIBUTE}][${ACTIVE_ATTRIBUTE}] {
  --bcga: 1;
}
/* A card that is not hovered keeps the gradient at zero alpha, which is what
   lets the light fade out rather than vanish. Only the setting removes it. */
[${OFF_ATTRIBUTE}] [${ATTRIBUTE}] {
  background-image: none;
}
@media (prefers-reduced-motion: reduce) {
  [${ATTRIBUTE}] { background-image: none; }
}`;

/**
 * Installs the rule and the single pointer listener that drives every card.
 *
 * One document listener, not one per card: a chat holds hundreds of surfaces,
 * and hover handlers on each would cost a React render per pixel of travel.
 * Position is written straight to the node as custom properties, so the glow
 * moves on the compositor and React never re-renders.
 */
export function installPointerGlow(): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  return installShared("glow", installListener);
}

function installListener(): () => void {
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = GLOW_RULE;
  document.head.appendChild(style);

  let active: HTMLElement | null = null;
  let pending: { target: HTMLElement; x: number; y: number } | null = null;
  let frame = 0;

  const paint = (): void => {
    frame = 0;
    const next = pending;
    pending = null;
    if (!next) return;
    if (active && active !== next.target) active.removeAttribute(ACTIVE_ATTRIBUTE);
    active = next.target;
    active.style.setProperty("--bcgx", `${next.x}px`);
    active.style.setProperty("--bcgy", `${next.y}px`);
    active.setAttribute(ACTIVE_ATTRIBUTE, "");
  };

  const clear = (): void => {
    if (!active) return;
    active.removeAttribute(ACTIVE_ATTRIBUTE);
    active = null;
  };

  const root = document.documentElement;
  const onMove = (event: PointerEvent): void => {
    // Off or reduced, the light is never drawn, so skip the layout read.
    if (root.hasAttribute(OFF_ATTRIBUTE) || isReducedMotion()) {
      clear();
      return;
    }
    const node = event.target instanceof Element ? event.target.closest(`[${ATTRIBUTE}]`) : null;
    if (!(node instanceof HTMLElement)) {
      clear();
      return;
    }
    const box = node.getBoundingClientRect();
    pending = { target: node, x: event.clientX - box.left, y: event.clientY - box.top };
    if (frame === 0) frame = requestAnimationFrame(paint);
  };

  document.addEventListener("pointermove", onMove, { passive: true });
  // A pointer leaving the window stops reporting moves, so the last card would
  // keep its light on until the pointer returned.
  document.addEventListener("pointerleave", clear);
  window.addEventListener("blur", clear);
  const stopWatchingMotion = subscribeReducedMotion(() => {
    if (isReducedMotion()) clear();
  });

  return () => {
    stopWatchingMotion();
    if (frame !== 0) cancelAnimationFrame(frame);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", clear);
    window.removeEventListener("blur", clear);
    clear();
    style.remove();
  };
}

const DARK = { dataSet: { bcglow: "dark" } } as unknown as ViewProps;
const LIGHT = { dataSet: { bcglow: "light" } } as unknown as ViewProps;

/**
 * Marks a card as lit. Spread onto the same `View` that carries the surface,
 * so the light shares its rounded corners through `border-radius: inherit`.
 */
export function glowing(isDark: boolean): ViewProps {
  return isDark ? DARK : LIGHT;
}

/**
 * Honours the setting without a reload, and without re-rendering a card.
 *
 * The switch is one attribute on the document root, so turning the light off
 * costs a single style recalculation rather than a render of every surface in
 * the timeline.
 */
export function usePointerGlow(enabled: boolean): void {
  useEffect(() => {
    if (enabled || Platform.OS !== "web" || typeof document === "undefined") return;
    // Counted, so the attribute leaves with the last surface that set it.
    return installShared("glow-off", () => {
      const root = document.documentElement;
      root.setAttribute(OFF_ATTRIBUTE, "");
      return () => root.removeAttribute(OFF_ATTRIBUTE);
    });
  }, [enabled]);
}
