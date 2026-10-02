// Compléments à jsdom pour les scènes de cinématique (rendu absent en test).
if (typeof SVGElement !== 'undefined' && !SVGElement.prototype.getTotalLength) {
  SVGElement.prototype.getTotalLength = () => 100
}
