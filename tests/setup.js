// Compléments à jsdom pour les scènes de cinématique (rendu absent en test).
if (typeof SVGElement !== 'undefined' && !SVGElement.prototype.getTotalLength) {
  SVGElement.prototype.getTotalLength = () => 100
}
if (typeof SVGElement !== 'undefined' && !SVGElement.prototype.getPointAtLength) {
  SVGElement.prototype.getPointAtLength = () => ({ x: 0, y: 0 })
}
// Contexte 2D minimal : assez pour que les textures en canvas se dessinent « à vide » sous jsdom.
if (typeof HTMLCanvasElement !== 'undefined') {
  const noop = () => {}
  const gradient = () => ({ addColorStop: noop })
  const ctx2d = canvas => new Proxy({ canvas, measureText: () => ({ width: 10 }), createLinearGradient: gradient, createRadialGradient: gradient,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), createPattern: () => null }, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: (t, k, v) => { t[k] = v; return true },
  })
  HTMLCanvasElement.prototype.getContext = function (type) { return type === '2d' ? (this.__ctx2d ||= ctx2d(this)) : null }
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,'
}
