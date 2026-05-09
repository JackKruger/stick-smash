// Cosmetic-only roster. Same baseline stats — only colors + accents differ.
export const ROSTER = [
  { id: 'bolt',   name: 'BOLT',   primary: 0xffcc33, accent: 0x1a1a2e, hat: 'spike' },
  { id: 'rose',   name: 'ROSE',   primary: 0xff4d6d, accent: 0xfff5f5, hat: 'bow' },
  { id: 'mint',   name: 'MINT',   primary: 0x66e2a3, accent: 0x103820, hat: 'cap' },
  { id: 'azure',  name: 'AZURE',  primary: 0x4d9fff, accent: 0xeaf3ff, hat: 'hood' },
  { id: 'vio',    name: 'VIO',    primary: 0xb24dff, accent: 0xfaeaff, hat: 'horn' },
  { id: 'ember', name: 'EMBER',  primary: 0xff7b3a, accent: 0x2a1208, hat: 'crown' },
  { id: 'pearl',  name: 'PEARL',  primary: 0xeeeeee, accent: 0x222244, hat: 'top' },
  { id: 'onyx',   name: 'ONYX',   primary: 0x222233, accent: 0xffcc33, hat: 'mohawk' },
  { id: 'coral',  name: 'CORAL',  primary: 0xff99c8, accent: 0xff4d6d, hat: 'flower' },
  { id: 'lime',   name: 'LIME',   primary: 0xc8ff4d, accent: 0x305020, hat: 'leaf' },
  { id: 'sky',    name: 'SKY',    primary: 0x9be8ff, accent: 0x205070, hat: 'cap' },
  { id: 'rust',   name: 'RUST',   primary: 0x9c4a2c, accent: 0xffcc33, hat: 'helm' },
];

export function rosterById(id) { return ROSTER.find(r => r.id === id) || ROSTER[0]; }
