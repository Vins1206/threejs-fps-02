// Ember Yard's look, in one place: dusk freight-yard amber against slate teal.
// Six values only; lighting and fog make every shade the game needs. The same
// names are the CSS custom properties in index.html, so HUD and 3D agree.
export const PALETTE = {
  canvas: '#171310', // dusk sky / fog
  surface: '#2a2622', // yard floor, concrete
  hairline: '#3d3831', // crates, walls
  ink: '#efe7d8', // warm light, HUD ink
  muted: '#8f8a80', // distant steel
  accent: '#f0a830', // ember amber: the player's team, the spike, tracers
  teal: '#3fae9e', // slate teal: the defending bots
  rust: '#b4552d', // rusted containers
  olive: '#6b7248', // mossy containers
};

export function shade(name) {
  return PALETTE[name];
}
