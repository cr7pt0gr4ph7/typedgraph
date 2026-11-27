import { AbstractInputSuggest, App, PluginSettingTab, Setting, type SettingControl, type SettingDefinitionItem, type SettingGroup, type SettingGroupItem, type TFolder } from 'obsidian';
import type ObsigraphPlugin from './main';
import { DEFAULT_BASE_IRI, DEFAULT_MAX_PATH_DEPTH, DEFAULT_SCHEMA_FOLDER, type CodeMode, type EdgeStyle, type NodeStyle } from '@obsigraph/core';
import { parseEdgeStyles, parseTypeStyles } from './render/styles';

export interface ObsigraphSettings {
  /** Above this many nodes plus edges, graph results fall back to a table. */
  maxElements: number;
  /** Delay before visible blocks re-run after a vault change. */
  refreshDebounceMs: number;
  /** Per-type node styles keyed by type label (third in style precedence). */
  typeStyles: Record<string, NodeStyle>;
  /** Per-edge-type styles keyed by edge type (third in style precedence). */
  edgeStyles: Record<string, EdgeStyle>;
  /** Folder whose notes declare type schemas. */
  schemaFolder: string;
  /** Base IRI for schema declarations without a `uri`, used by SHACL export and import. */
  schemaBaseIri: string;
  /** Show the diagnostics count in the status bar. */
  showDiagnostics: boolean;
  /** Depth cap for unbounded variable-length relationships. */
  maxPathDepth: number;
  /** Engine for blocks without a `backend` option. */
  defaultBackend: 'builtin' | 'ladybug';
  /** Typed Graph sidecar base URL, e.g. http://127.0.0.1:8765. */
  sidecarUrl: string;
  sidecarToken: string;
  /** Read links in frontmatter properties as edges typed by the property name. */
  frontmatterEdges: boolean;
  /** Index `.adoc` files as notes beside Markdown. */
  asciidoc: boolean;
  /** Read plain links in prose as untyped `links_to` edges. */
  linkEdges: boolean;
  /** Derived code layer: off, annotated symbols only, or every symbol. */
  codeMode: CodeMode;
  /** Vault folder scanned for source files; empty means the whole vault. */
  codeRoot: string;
  /** Folders whose notes are indexed, one per line; empty means the whole vault. */
  indexFolders: string;
  /** Folders whose notes are never indexed, one per line. */
  excludeFolders: string;
  /** Also leave out what Obsidian's "Excluded files" option hides. */
  obsidianExcluded: boolean;
}

/** Settings that choose which notes are indexed; a change re-indexes the vault. */
export const SCOPE_KEYS = new Set(['indexFolders', 'excludeFolders', 'obsidianExcluded']);

export const DEFAULT_SETTINGS: ObsigraphSettings = {
  maxElements: 500,
  refreshDebounceMs: 300,
  typeStyles: {},
  edgeStyles: {},
  schemaFolder: DEFAULT_SCHEMA_FOLDER,
  schemaBaseIri: DEFAULT_BASE_IRI,
  showDiagnostics: true,
  maxPathDepth: DEFAULT_MAX_PATH_DEPTH,
  defaultBackend: 'builtin',
  sidecarUrl: '',
  sidecarToken: '',
  frontmatterEdges: false,
  asciidoc: true,
  linkEdges: false,
  codeMode: 'off',
  codeRoot: '',
  indexFolders: '',
  excludeFolders: '',
  obsidianExcluded: false,
};

const INDEX_FOLDERS_DESC = 'Only notes in these folders are indexed, one folder per line. Leave empty to index the whole vault. The schema folder is always indexed.';
const EXCLUDE_FOLDERS_DESC = 'Notes in these folders are not indexed, one folder per line. Links into them end at stub nodes, as links to missing notes do. Re-indexes the vault when changed.';
const OBSIDIAN_EXCLUDED_DESC = "Also leave out the files hidden by Obsidian's Files and links › Excluded files option. Re-indexes the vault when changed.";

/** The legacy stand-in for a declarative `folder` control: suggests vault folders as you type. */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(
    private readonly vaultApp: App,
    inputEl: HTMLInputElement,
    private readonly filter?: (folder: TFolder) => boolean,
  ) {
    super(vaultApp, inputEl);
  }

  protected getSuggestions(query: string): TFolder[] {
    const q = query.toLowerCase();
    return this.vaultApp.vault.getAllFolders().filter((f) => f.path.toLowerCase().includes(q) && (this.filter?.(f) ?? true));
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }
}

// @tg: implements:: [[openspec:graph-model#Edge options as plugin settings]] {since: "2026-10-13"}
export class ObsigraphSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: ObsigraphPlugin,
  ) {
    super(app, plugin);
  }

  /** Settings for Obsidian before 1.13, built from getSettingDefinitions() so both list the same settings. */
  // @tg: implements:: [[openspec:graph-model#Legacy settings match the declarative settings]] {since: "2026-11-27"}
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    for (const item of this.getSettingDefinitions()) this.renderItem(containerEl, item);
  }

  /** A group becomes a heading followed by its items. Pages and actions are not used by this plugin. */
  private renderItem(el: HTMLElement, item: SettingDefinitionItem | SettingGroupItem): void {
    if ('type' in item) {
      if (item.type === 'page') return;
      if (item.heading) new Setting(el).setName(item.heading).setHeading();
      for (const child of item.items ?? []) this.renderItem(el, child);
      return;
    }
    if (!('name' in item) || 'action' in item) return;
    const setting = new Setting(el).setName(item.name);
    if (item.desc !== undefined) setting.setDesc(item.desc);
    // Before 1.13 there is no SettingGroup; this plugin's render functions do not use it.
    if ('render' in item && item.render) item.render(setting, undefined as unknown as SettingGroup);
    else if ('control' in item && item.control) this.renderControl(setting, item.control);
  }

  /** The legacy component for each declarative control, saving through setControlValue() like the declarative tab. */
  private renderControl(setting: Setting, control: SettingControl): void {
    const { key } = control;
    const value = this.getControlValue(key);
    const save = async (v: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (control.validate && (await (control.validate as (v: any) => unknown)(v))) return;
      await this.setControlValue(key, v);
    };
    switch (control.type) {
      case 'toggle':
        setting.addToggle((t) => t.setValue(Boolean(value)).onChange(save));
        break;
      case 'dropdown':
        setting.addDropdown((d) => d.addOptions(control.options).setValue(String(value)).onChange(save));
        break;
      case 'text':
        setting.addText((t) => t.setPlaceholder(control.placeholder ?? '').setValue(String(value ?? '')).onChange(save));
        break;
      case 'textarea':
        setting.addTextArea((t) => {
          if (control.rows) t.inputEl.rows = control.rows;
          t.setPlaceholder(control.placeholder ?? '').setValue(String(value ?? '')).onChange(save);
        });
        break;
      case 'number':
        // Older Obsidian has no number control: a text box that takes numbers stands in for it.
        setting.addText((t) => {
          t.inputEl.type = 'number';
          if (control.min !== undefined) t.inputEl.min = String(control.min);
          if (control.max !== undefined) t.inputEl.max = String(control.max);
          t.setPlaceholder(control.placeholder ?? '')
            .setValue(String(value ?? ''))
            .onChange((v) => {
              const n = Number(v);
              if (v.trim() === '' || !Number.isFinite(n)) return;
              if ((control.min !== undefined && n < control.min) || (control.max !== undefined && n > control.max)) return;
              return save(n);
            });
        });
        break;
      case 'folder':
        // Older Obsidian has no folder control: a search box that suggests vault folders stands in for it.
        setting.addSearch((t) => {
          const suggest = new FolderSuggest(this.app, t.inputEl, control.filter);
          suggest.onSelect((folder) => {
            suggest.setValue(folder.path);
            suggest.close();
            void save(folder.path);
          });
          t.setPlaceholder(control.placeholder ?? '').setValue(String(value ?? '')).onChange(save);
        });
        break;
      default:
        // No control of another type is declared in getSettingDefinitions().
        break;
    }
  }

  /**
   * Declarative settings (Obsidian 1.13+), so every option appears in settings
   * search. Older versions keep using display().
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const intIn = (min: number, max: number) => (v: number) =>
      Number.isInteger(v) && v >= min && v <= max ? undefined : `Enter a whole number from ${min} to ${max}.`;
    return [
      {
        type: 'group',
        heading: 'Queries',
        items: [
          {
            name: 'Default query backend',
            desc: 'Where blocks run unless they set a backend line. Built-in runs inside the app; the sidecar option runs full read queries on its graph database.',
            control: { type: 'dropdown', key: 'defaultBackend', options: { builtin: 'Built-in', ladybug: 'Ladybug (sidecar)' } },
          },
          { name: 'Maximum graph elements', desc: 'Graph results with more nodes plus edges than this are shown as a table instead.', control: { type: 'number', key: 'maxElements', min: 1, validate: intIn(1, 100000) } },
          { name: 'Maximum path depth', desc: 'Unbounded variable-length patterns stop at this many hops.', control: { type: 'number', key: 'maxPathDepth', min: 1, max: 50, validate: intIn(1, 50) } },
          { name: 'Refresh delay (ms)', desc: 'How long query blocks wait after a vault change before re-running.', control: { type: 'number', key: 'refreshDebounceMs', min: 0, validate: intIn(0, 60000) } },
        ],
      },
      {
        type: 'group',
        heading: 'Code',
        items: [
          {
            name: 'Code in the graph',
            desc: 'Show source code as derived nodes. Annotated adds symbols carrying @lat or @tg comments and what they point at; all adds every symbol. Files are only read, never changed.',
            control: { type: 'dropdown', key: 'codeMode', options: { off: 'Off', annotated: 'Annotated symbols', all: 'All symbols' } },
          },
          { name: 'Code folder', desc: 'Vault folder to scan for source files. Leave empty to scan the whole vault.', control: { type: 'text', key: 'codeRoot', placeholder: 'src' } },
        ],
      },
      {
        type: 'group',
        heading: 'Sidecar',
        items: [
          { name: 'Sidecar URL', desc: 'Address and port of the sidecar, used by sidecar-backed queries.', control: { type: 'text', key: 'sidecarUrl' } },
          {
            name: 'Sidecar token',
            desc: "Bearer token configured on the sidecar. Stored in this vault's plugin data.",
            render: (setting) => {
              setting.addText((t) => {
                t.inputEl.type = 'password';
                t.setValue(this.plugin.settings.sidecarToken).onChange((v) => this.setControlValue('sidecarToken', v.trim()));
              });
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Indexing',
        items: [
          { name: 'Indexed folders', desc: INDEX_FOLDERS_DESC, control: { type: 'textarea', key: 'indexFolders', placeholder: 'Records', rows: 3 } },
          { name: 'Excluded folders', desc: EXCLUDE_FOLDERS_DESC, aliases: ['ignore', 'exclude'], control: { type: 'textarea', key: 'excludeFolders', placeholder: 'Scratch', rows: 3 } },
          { name: "Follow Obsidian's excluded files", desc: OBSIDIAN_EXCLUDED_DESC, control: { type: 'toggle', key: 'obsidianExcluded' } },
        ],
      },
      {
        type: 'group',
        heading: 'Types and styles',
        items: [
          { name: 'Schema folder', desc: 'Each note directly in this folder declares the schema for the type named by its title.', control: { type: 'folder', key: 'schemaFolder', placeholder: DEFAULT_SCHEMA_FOLDER } },
          { name: 'Schema base IRI', desc: 'Names types, properties and edge types without a `uri` when exporting to or importing from SHACL.', control: { type: 'text', key: 'schemaBaseIri', placeholder: DEFAULT_BASE_IRI } },
          {
            name: 'Frontmatter links as edges',
            desc: 'Read wikilinks in note properties as edges typed by the property name, so `requirement: "[[Login]]"` is the edge `requirement:: [[Login]]`. Tags, aliases, cssclasses and type are skipped. Re-indexes the vault when changed.',
            control: { type: 'toggle', key: 'frontmatterEdges' },
          },
          {
            name: 'AsciiDoc notes',
            desc: 'Index `.adoc` files as notes: properties from a leading `////` comment block and `:tg-*:` attributes, edges from `// @tg:` comments. The files are only read; this plugin does not open or edit them. Re-indexes the vault when changed.',
            control: { type: 'toggle', key: 'asciidoc' },
          },
          {
            name: 'Plain links as links_to edges',
            desc: 'Read ordinary wikilinks and markdown links in note text as untyped `links_to` edges, the way OKF consumers do. Typed edge lines such as `knows:: [[Bob]]` are unaffected. Re-indexes the vault when changed.',
            control: { type: 'toggle', key: 'linkEdges' },
          },
          { name: 'Show diagnostics', desc: 'Show the number of parse and schema issues in the status bar.', control: { type: 'toggle', key: 'showDiagnostics' } },
          {
            name: 'Type styles',
            desc: 'JSON keyed by type label: color, shape, icon (Lucide name) and label (property shown instead of the title). Example: {"Person": {"color": "#59a14f", "shape": "round-rectangle", "icon": "user"}}.',
            aliases: ['colors', 'shapes', 'icons'],
            render: (setting) => this.jsonEditor(setting, 'typeStyles', 8),
          },
          {
            name: 'Edge styles',
            desc: 'JSON keyed by edge type: color and line (solid, dashed, dotted). Negative edges are dashed red unless set here. Example: {"knows": {"color": "orange"}}.',
            render: (setting) => this.jsonEditor(setting, 'edgeStyles', 6),
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof ObsigraphSettings];
  }

  /** Persist through the plugin so caches refresh and open views restyle. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    // Side effects of a change, for both the declarative and the legacy tab.
    if (key === 'codeMode') {
      await this.plugin.setCodeMode(value === 'all' ? 'all' : value === 'annotated' ? 'annotated' : 'off');
      return;
    }
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    const text = typeof value === 'string' ? value.trim() : '';
    if (key === 'schemaFolder') settings[key] = text || DEFAULT_SCHEMA_FOLDER;
    else if (key === 'schemaBaseIri') settings[key] = text || DEFAULT_BASE_IRI;
    else if (key === 'codeRoot' || key === 'sidecarUrl') settings[key] = text;
    else settings[key] = value;
    if (key === 'schemaFolder') this.plugin.index.invalidate();
    await this.plugin.saveSettings();
    if (key === 'codeRoot') await this.plugin.index.code.refresh();
    // The edge options are read when a note is indexed, so existing notes need another pass.
    if (key === 'frontmatterEdges' || key === 'linkEdges' || key === 'asciidoc') await this.plugin.index.reindex();
    // Folder lists are typed a key at a time, so their re-index waits for the typing to pause.
    // @tg: implements:: [[openspec:graph-model#Indexed folders]] {since: "0.25.0"}
    if (SCOPE_KEYS.has(key)) this.plugin.requestReindex();
    else if (key === 'schemaFolder' && this.plugin.hasScope()) this.plugin.requestReindex();
  }

  /** JSON style editor with inline validation, shared by both style settings. */
  private jsonEditor(setting: Setting, key: 'typeStyles' | 'edgeStyles', rows: number): void {
    const status = setting.descEl.createDiv({ cls: 'obsigraph-setting-status' });
    setting.addTextArea((t) => {
      t.inputEl.rows = rows;
      t.inputEl.addClass('obsigraph-styles-input');
      t.setValue(JSON.stringify(this.plugin.settings[key], null, 2)).onChange(async (v) => {
        const parsed = key === 'typeStyles' ? parseTypeStyles(v) : parseEdgeStyles(v);
        if (typeof parsed === 'string') {
          status.setText(parsed);
          return;
        }
        status.setText('');
        await this.setControlValue(key, parsed);
      });
    });
  }
}
