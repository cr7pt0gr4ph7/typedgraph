import { expect, it } from 'vitest';
import { editorDiagnostics } from '../src/edge-diagnostics';

// @tg: verifies:: [[tests/edge-parsing#Editor underlines edge problems]] {since: "2026-11-26", level: unit}
// @lat: [[tests/edge-parsing#Editor underlines edge problems]]
// @tg: verifies:: [[openspec:edge-parsing#Malformed property blocks#Underlined in the editor]]
it('turns edge-syntax diagnostics into document ranges for underlines', () => {
  const text = '# A\r\n\r\nknows:: [[Bob]] {since: 2020\r\nknows:: [[Eve]] {since: "a" b}\r\n';
  const ranges = editorDiagnostics(text);
  expect(ranges.map((r) => [r.code, text.slice(r.from, r.to)])).toEqual([
    ['edge-syntax', '0'],
    ['edge-syntax', 'b}'],
  ]);
  expect(ranges[0]!.message).toContain('Malformed edge property block');
  expect(editorDiagnostics('knows:: [[Bob]] {since: 2020}')).toEqual([]);
});
