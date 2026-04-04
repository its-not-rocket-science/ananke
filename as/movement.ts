@inline
export function abs32(v: i32): i32 {
  return v < 0 ? -v : v;
}

@inline
export function approxDist(dx: i32, dy: i32): i32 {
  const adx = abs32(dx);
  const ady = abs32(dy);
  return adx > ady ? adx + (ady >> 1) : ady + (adx >> 1);
}

@inline
export function integrateAxis(pos: i32, vel: i32): i32 {
  return pos + vel;
}

@inline
export function resolvePair(
  xi: i32,
  yi: i32,
  xj: i32,
  yj: i32,
  radius: i32,
): i32 {
  const d = approxDist(xj - xi, yj - yi);
  return radius - d;
}
