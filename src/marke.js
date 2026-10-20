// Zwei Marken, eine Codebasis. Vorgabe ist Hasi. Sickinger nur bei MARKE=sickinger (Vite setzt VITE_MARKE).
const ALLE = {
  hasi: {
    id: 'hasi',
    produkt: 'Hasi 3D',
    publisher: 'Hasi Elektronic',
    akzent: '#33AFE2',
    akzentRgb: [51, 175, 226],
    primaer: '#33AFE2',
    primaerRgb: [51, 175, 226],
    logo: null,
    vermerk: null,
  },
  sickinger: {
    id: 'sickinger',
    produkt: 'MS3D',
    publisher: 'Manfred Sickinger Apparatebau',
    akzent: '#009EDF',
    akzentRgb: [0, 158, 223],
    primaer: '#004B85',
    primaerRgb: [0, 75, 133],
    logo: './marken/sickinger.png',
    vermerk: 'Entwickelt von Hasi Elektronic',
  },
};

function gewaehlt() {
  let id = 'hasi';
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MARKE) id = import.meta.env.VITE_MARKE;
  else if (typeof process !== 'undefined' && process.env && process.env.MARKE) id = process.env.MARKE;
  if (!ALLE[id]) throw new Error('Unbekannte Marke: ' + id + ' (erlaubt: hasi, sickinger)');
  return ALLE[id];
}

export const MARKEN = ALLE;
export const MARKE = gewaehlt();
