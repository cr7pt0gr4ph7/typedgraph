import { parseEdges } from '@obsigraph/core';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/** A problem in the note being edited, as document offsets for an underline. */
export interface EditorDiagnostic {
  from: number;
  to: number;
  message: string;
  code: string;
}

/**
 * The edge-syntax problems in a note's text, such as malformed property blocks, as document
 * offsets. A range runs from where the problem starts to the end of its line, and one at the end
 * of a line covers the character before it, so every range is at least one character long.
 */
// @lat: [[edge-syntax#Problems in the editor]]
// @tg: implements:: [[openspec:edge-parsing#Malformed property blocks]]
export function editorDiagnostics(text: string): EditorDiagnostic[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  const out: EditorDiagnostic[] = [];
  for (const d of parseEdges(text).diagnostics) {
    const lineStart = starts[d.line];
    if (lineStart === undefined) continue;
    const lineEnd = d.line + 1 < starts.length ? starts[d.line + 1]! - 1 : text.length;
    const lineEndNoCr = text[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd;
    let from = Math.min(lineStart + d.column, lineEndNoCr);
    let to = lineEndNoCr;
    if (to <= from) {
      if (from > lineStart) from = to - 1;
      else continue;
      to = from + 1;
    }
    out.push({ from, to, message: d.message, code: d.code ?? 'edge-syntax' });
  }
  return out.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * Underlines the edge-syntax problems of the open note with a wavy line, in source mode and live
 * preview, with the finding as the hover title. Recomputed from the editor text on every change, so
 * it never waits for the vault index.
 */
// @lat: [[edge-syntax#Problems in the editor]]
// @tg: implements:: [[openspec:edge-parsing#Malformed property blocks]]
export function edgeDiagnosticsEditorExtension(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate): void {
        if (u.docChanged) this.decorations = this.build(u.view);
      }
      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        for (const d of editorDiagnostics(view.state.doc.toString())) {
          builder.add(d.from, d.to, Decoration.mark({ class: `obsigraph-edge-diagnostic obsigraph-${d.code}`, attributes: { title: d.message } }));
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations },
  );
}
