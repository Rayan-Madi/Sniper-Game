// Compléments à jsdom pour les scènes de cinématique (rendu absent en test).
if (typeof SVGElement !== 'undefined' && !SVGElement.prototype.getTotalLength) {
  SVGElement.prototype.getTotalLength = () => 100
}
if (typeof SVGElement !== 'undefined' && !SVGElement.prototype.getPointAtLength) {
  SVGElement.prototype.getPointAtLength = () => ({ x: 0, y: 0 })
}
