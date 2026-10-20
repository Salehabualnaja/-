/**
 * Floating-edge geometry: lines attach to the nearest point on each card's
 * border instead of fixed handles, so the graph stays readable when cards move.
 */
import { Position, type InternalNode } from "@xyflow/react";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function box(n: InternalNode): Box {
  return {
    x: n.internals.positionAbsolute.x,
    y: n.internals.positionAbsolute.y,
    w: n.measured.width ?? n.width ?? 200,
    h: n.measured.height ?? n.height ?? 80,
  };
}

/** Point where the segment between both centres leaves `a`'s rectangle. */
function intersection(a: Box, b: Box): { x: number; y: number } {
  const w = a.w / 2;
  const h = a.h / 2;
  const x2 = a.x + w;
  const y2 = a.y + h;
  const x1 = b.x + b.w / 2;
  const y1 = b.y + b.h / 2;
  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a1 = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a1 * xx1;
  const yy3 = a1 * yy1;
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

function side(b: Box, p: { x: number; y: number }): Position {
  const px = Math.round(p.x);
  const py = Math.round(p.y);
  if (px <= Math.round(b.x + 1)) return Position.Left;
  if (px >= Math.round(b.x + b.w - 1)) return Position.Right;
  if (py <= Math.round(b.y + 1)) return Position.Top;
  if (py >= Math.round(b.y + b.h - 1)) return Position.Bottom;
  return Position.Top;
}

export function floatingEdgeParams(source: InternalNode, target: InternalNode) {
  const s = box(source);
  const t = box(target);
  const sp = intersection(s, t);
  const tp = intersection(t, s);
  return { sx: sp.x, sy: sp.y, tx: tp.x, ty: tp.y, sourcePos: side(s, sp), targetPos: side(t, tp) };
}

/** Quadratic curve bowed sideways: used to fan out several relationships between the same two cards. */
export function offsetCurve(sx: number, sy: number, tx: number, ty: number, offset: number) {
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * offset * 2;
  const cy = my + (dx / len) * offset * 2;
  // Label sits at the curve's midpoint (t = 0.5).
  return { path: `M ${sx},${sy} Q ${cx},${cy} ${tx},${ty}`, labelX: (sx + 2 * cx + tx) / 4, labelY: (sy + 2 * cy + ty) / 4 };
}
