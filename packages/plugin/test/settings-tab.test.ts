import { describe, expect, it, vi } from 'vitest';

/** What a rendered setting shows: a heading, or a name, description and the controls it holds. */
type Rendered = { heading: string } | { name: string; desc: string; controls: string[] };

const rendered = vi.hoisted(() => [] as { heading: boolean; name: string; desc: string; controls: string[]; changes: ((v: unknown) => unknown)[] }[]);

vi.mock('obsidian', () => {
  const component = () => {
    const c = {
      inputEl: { type: 'text', rows: 0, min: '', max: '', addClass() {} },
      change: undefined as ((v: unknown) => unknown) | undefined,
      setValue: () => c,
      setPlaceholder: () => c,
      onChange: (cb: (v: unknown) => unknown) => {
        c.change = cb;
        return c;
      },
      addOptions: () => c,
    };
    return c;
  };
  class Setting {
    heading = false;
    name = '';
    desc = '';
    controls: string[] = [];
    changes: ((v: unknown) => unknown)[] = [];
    descEl = { createDiv: () => ({ setText() {} }) };
    constructor() {
      rendered.push(this);
    }
    setName(n: string) {
      this.name = n;
      return this;
    }
    setDesc(d: string) {
      this.desc = d;
      return this;
    }
    setHeading() {
      this.heading = true;
      return this;
    }
    private add(kind: string, cb: (c: ReturnType<typeof component>) => unknown) {
      const c = component();
      cb(c);
      // A text box typed as number or password is the legacy stand-in for those controls.
      this.controls.push(kind === 'text' && c.inputEl.type !== 'text' ? c.inputEl.type : kind);
      if (c.change) this.changes.push(c.change);
      return this;
    }
    addText(cb: (c: unknown) => unknown) {
      return this.add('text', cb);
    }
    addTextArea(cb: (c: unknown) => unknown) {
      return this.add('textarea', cb);
    }
    addToggle(cb: (c: unknown) => unknown) {
      return this.add('toggle', cb);
    }
    addDropdown(cb: (c: unknown) => unknown) {
      return this.add('dropdown', cb);
    }
    addSearch(cb: (c: unknown) => unknown) {
      return this.add('folder', cb);
    }
  }
  class AbstractInputSuggest {
    onSelect() {
      return this;
    }
  }
  return { App: class App {}, PluginSettingTab: class PluginSettingTab {}, Setting, AbstractInputSuggest };
});

const { ObsigraphSettingTab, DEFAULT_SETTINGS } = await import('../src/settings');

function tab() {
  const reindex = vi.fn(async () => {});
  const refresh = vi.fn(async () => {});
  const plugin = {
    settings: { ...DEFAULT_SETTINGS },
    saveSettings: vi.fn(async () => {}),
    setCodeMode: vi.fn(async () => {}),
    requestReindex: vi.fn(),
    hasScope: vi.fn(() => false),
    index: { reindex, invalidate: vi.fn(), code: { refresh } },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { t: new ObsigraphSettingTab({} as any, plugin as any), plugin, reindex, refresh };
}

describe('settings tab', () => {
  // @tg: verifies:: [[tests/edge-settings#Toggles in the settings tab]] {since: "2026-10-13", level: unit}
  // @lat: [[tests/edge-settings#Toggles in the settings tab]]
  // @tg: verifies:: [[openspec:graph-model#Edge options as plugin settings#Defaults]]
  it('offers the edge options as toggles, off by default, and the AsciiDoc option, in the declarative settings', () => {
    const { t, plugin } = tab();
    const items = t.getSettingDefinitions().flatMap((g) => ('items' in g ? g.items : [g]));
    const toggle = (name: string) => items.find((i) => i !== undefined && 'name' in i && i.name === name);
    expect(toggle('Frontmatter links as edges')).toMatchObject({ control: { type: 'toggle', key: 'frontmatterEdges' } });
    expect(toggle('Plain links as links_to edges')).toMatchObject({ control: { type: 'toggle', key: 'linkEdges' } });
    expect(toggle('AsciiDoc notes')).toMatchObject({ control: { type: 'toggle', key: 'asciidoc' } });
    expect(plugin.settings.frontmatterEdges).toBe(false);
    expect(plugin.settings.linkEdges).toBe(false);
  });

  // @tg: verifies:: [[tests/edge-settings#Changing a toggle re-indexes]] {since: "2026-10-13", level: unit}
  // @lat: [[tests/edge-settings#Changing a toggle re-indexes]]
  // @tg: verifies:: [[openspec:graph-model#Edge options as plugin settings]]
  it('re-indexes the vault when an edge or AsciiDoc option changes, and only then', async () => {
    const { t, plugin, reindex } = tab();
    await t.setControlValue('linkEdges', true);
    expect(plugin.settings.linkEdges).toBe(true);
    await t.setControlValue('frontmatterEdges', true);
    expect(reindex).toHaveBeenCalledTimes(2);
    await t.setControlValue('asciidoc', false);
    expect(reindex).toHaveBeenCalledTimes(3);
    await t.setControlValue('showDiagnostics', false);
    expect(reindex).toHaveBeenCalledTimes(3);
  });

  // @tg: verifies:: [[tests/edge-settings#Declarative settings match the legacy tab]] {since: "2026-10-13", level: unit}
  // @lat: [[tests/edge-settings#Declarative settings match the legacy tab]]
  it('lists every legacy setting in the declarative settings', () => {
    const { t } = tab();
    const keys = t
      .getSettingDefinitions()
      .flatMap((g) => ('items' in g ? (g.items ?? []) : [g]))
      .flatMap((i) => (i && 'control' in i && i.control ? [i.control.key] : []));
    expect(keys).toEqual(
      expect.arrayContaining(['defaultBackend', 'maxElements', 'maxPathDepth', 'refreshDebounceMs', 'codeMode', 'codeRoot', 'sidecarUrl', 'schemaFolder', 'schemaBaseIri', 'frontmatterEdges', 'linkEdges', 'asciidoc', 'showDiagnostics']),
    );
  });

  it('applies the legacy side effects: code mode, code folder and base IRI', async () => {
    const { t, plugin, refresh } = tab();
    await t.setControlValue('codeMode', 'all');
    await t.setControlValue('codeMode', 'bogus');
    expect(plugin.setCodeMode.mock.calls).toEqual([['all'], ['off']]);
    await t.setControlValue('codeRoot', '  src/app ');
    expect(plugin.settings.codeRoot).toBe('src/app');
    expect(refresh).toHaveBeenCalledTimes(1);
    await t.setControlValue('schemaBaseIri', '   ');
    expect(plugin.settings.schemaBaseIri).toBe(DEFAULT_SETTINGS.schemaBaseIri);
    await t.setControlValue('schemaBaseIri', ' urn:x: ');
    expect(plugin.settings.schemaBaseIri).toBe('urn:x:');
  });

  // @tg: verifies:: [[openspec:graph-model#Legacy settings match the declarative settings#Names and order]] {since: "2026-11-27", level: unit}
  // @tg: verifies:: [[openspec:graph-model#Legacy settings match the declarative settings#Descriptions]] {since: "2026-11-27", level: unit}
  // @tg: verifies:: [[openspec:graph-model#Legacy settings match the declarative settings#Control types]] {since: "2026-11-27", level: unit}
  // @lat: [[tests/edge-settings#Legacy tab matches the declarative settings]]
  it('renders the legacy tab with the headings, names, descriptions, order and controls of the declarative settings', async () => {
    const { t } = tab();
    const { Setting } = await import('obsidian');
    const modern: Rendered[] = [];
    for (const group of t.getSettingDefinitions()) {
      if (!('items' in group)) continue;
      if ('heading' in group && group.heading) modern.push({ heading: group.heading });
      for (const item of group.items ?? []) {
        if (!('name' in item) || item.name === undefined) continue;
        let controls: string[] = [];
        if ('control' in item && item.control) controls = [item.control.type];
        else if ('render' in item && item.render) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const probe = new (Setting as any)();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          item.render(probe, {} as any);
          controls = probe.controls;
        }
        modern.push({ name: item.name, desc: String(item.desc), controls });
      }
    }
    rendered.length = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t as any).containerEl = { empty() {}, createDiv: () => ({ setText() {} }) };
    t.display();
    const legacy: Rendered[] = rendered.map((s) => (s.heading ? { heading: s.name } : { name: s.name, desc: s.desc, controls: s.controls }));
    expect(legacy).toEqual(modern);
  });

  it('saves a legacy number box only for a number within the declared range, with the declarative side effects', async () => {
    const { t, plugin, refresh } = tab();
    rendered.length = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t as any).containerEl = { empty() {}, createDiv: () => ({ setText() {} }) };
    t.display();
    const change = (name: string) => rendered.find((s) => s.name === name)!.changes[0]!;
    for (const v of ['', 'x', '0', '51', '2.5']) await change('Maximum path depth')(v);
    expect(plugin.settings.maxPathDepth).toBe(DEFAULT_SETTINGS.maxPathDepth);
    await change('Maximum path depth')('7');
    expect(plugin.settings.maxPathDepth).toBe(7);
    await change('Code folder')(' src ');
    expect(plugin.settings.codeRoot).toBe('src');
    expect(refresh).toHaveBeenCalledTimes(1);
    await change('Schema folder')('  ');
    expect(plugin.settings.schemaFolder).toBe(DEFAULT_SETTINGS.schemaFolder);
  });
});
