// The look plan, in one place. Dusk over an industrial yard: a deep indigo sky,
// one low amber sun, cool steel and concrete, and two team colours that read at
// a glance — cobalt for the player's team, ember for the other. The same names
// are the CSS custom properties in index.html; no other colour appears in code.
export const PALETTE = {
  canvas: '#0e1420', // dusk sky / fog
  surface: '#1b2436', // concrete and steel
  hairline: '#2c3a52', // crates, trims, dark metal
  ink: '#e9e6df', // light faces, markings
  muted: '#8b98ab', // dim metal, distant faces
  accent: '#f0a830', // amber sun, site lamps, UI accent
  cobalt: '#5b9dff', // player team (Cobalt)
  ember: '#ff6a3d', // enemy team (Ember)
  gold: '#ffd166', // money, buy menu highlights
  danger: '#ff4d4d', // damage, bomb, round lost
  good: '#7ddc8a', // round won, healing
};

export function shade(name) {
  return PALETTE[name];
}
