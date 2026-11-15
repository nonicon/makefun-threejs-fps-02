// Small shared helpers: a seeded RNG so screenshot setups are deterministic,
// and the few math helpers the simulation uses. Nothing here allocates per call
// except where noted; hot paths reuse the caller's vectors.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent exponential approach: `rate` is per second.
export function damp(current, target, rate, dt) {
  return lerp(target, current, Math.exp(-rate * dt));
}

// Breadth-first search over a waypoint graph: `nodes` is an array of { x, z,
// links: [index, ...] }. Returns the list of node indices from `from` to `to`
// (inclusive), or null when unreachable. Reuses one scratch queue per call.
export function findPath(nodes, from, to) {
  if (from === to) return [from];
  const prev = new Int16Array(nodes.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    for (const next of nodes[node].links) {
      if (prev[next] !== -1) continue;
      prev[next] = node;
      if (next === to) {
        const path = [to];
        let at = to;
        while (at !== from) {
          at = prev[at];
          path.push(at);
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

// Nearest waypoint index to a world position.
export function nearestNode(nodes, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    const dx = nodes[i].x - x;
    const dz = nodes[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
