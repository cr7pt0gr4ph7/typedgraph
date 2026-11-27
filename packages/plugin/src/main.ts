import type { CodeMode, StyleSource } from '@obsigraph/core';
import { getIcon, Keymap, MarkdownView, Notice, parseYaml, Plugin, type WorkspaceLeaf } from 'obsidian';
import { latLinkTarget } from './lat-links';
import { makeStyler, type Styler } from './render/styler';
import type { EditorView } from '@codemirror/view';
import { edgeEmbedEditorExtension, edgeEmbedPostProcessor, refreshEmbeds } from './embeds/edge-embeds';
import { QueryBlock } from './query/query-block';
import { DEFAULT_SETTINGS, ObsigraphSettingTab, type ObsigraphSettings } from './settings';
import { VaultIndex } from './vault-index';
import { GraphView, VIEW_TYPE_GRAPH } from './view/graph-view';
import { DiagnosticsModal, registerSchemaCommands } from './schema-commands';
import { registerTgIcon, TG_ICON } from './icon';
import { noteScope, obsidianIgnored } from './note-scope';
import { statusCount, type StatusCount } from './status-count';
import { syncOnLoad, TG_CONFIG_POLL_MS, TgConfigSync, type ConfigAdapter } from './tg-config';

/** Pause after the last folder-setting edit before the vault is re-indexed. */
const REINDEX_DELAY_MS = 800;

// @tg: implements:: [[architecture#Standalone plugin]] {since: "2026-10-03"}
// @lat: [[architecture#Standalone plugin]]
export default class ObsigraphPlugin extends Plugin {
  settings: ObsigraphSettings = DEFAULT_SETTINGS;
  index!: VaultIndex;
  private readonly styleListeners = new Set<() => void>();
  private readonly iconUris = new Map<string, string | null>();
  private readonly editors = new Set<EditorView>();
  private status: HTMLElement | null = null;
  private counts: StatusCount | null = null;
  private reindexTimer: number | null = null;
  private pushTimer: number | null = null;
  private reindexing: Promise<void> = Promise.resolve();
  /** Keeps the schema folder in step with `.tg/config.json` while "Sync settings with .tg/config.json" is on. */
  tgConfig!: TgConfigSync;

  // @tg: implements:: [[openspec:graph-query-block#Block structure]]
  async onload(): Promise<void> {
    this.tgConfig = new TgConfigSync(
      this.app.vault.adapter as unknown as ConfigAdapter,
      () => this.settings.schemaFolder,
      (folder) => this.applySchemaFolder(folder),
    );
    await this.loadSettings();
    this.index = new VaultIndex(
      this.app,
      () => this.settings.refreshDebounceMs,
      () => this.settings.schemaFolder,
      () => ({ nodes: this.settings.typeStyles, edges: this.settings.edgeStyles }),
      (name) => getIcon(name) !== null,
      () => ({ maxPathDepth: this.settings.maxPathDepth }),
      () => this.settings.codeMode,
      () => this.settings.codeRoot,
      () => this.settings.frontmatterEdges,
      () => this.settings.asciidoc,
      parseYaml,
      () => this.settings.linkEdges,
      () =>
        noteScope(
          { include: this.settings.indexFolders, exclude: this.settings.excludeFolders, obsidianExcluded: this.settings.obsidianExcluded, schemaFolder: this.settings.schemaFolder },
          obsidianIgnored(this.app),
        ),
    );
    this.addSettingTab(new ObsigraphSettingTab(this.app, this));
    // Obsidian reports no changes inside dot folders, so the config is checked on a timer while sync is on.
    this.registerInterval(window.setInterval(() => void (this.settings.syncTgConfig ? this.tgConfig.poll() : null), TG_CONFIG_POLL_MS));

    this.registerMarkdownCodeBlockProcessor('graph-query', (source, el, ctx) => {
      ctx.addChild(new QueryBlock(el, source, ctx.sourcePath, this));
    });

    registerTgIcon();
    this.registerView(VIEW_TYPE_GRAPH, (leaf) => new GraphView(leaf, this));
    this.addCommand({ id: 'open-graph-view', name: 'Open graph view', callback: () => this.openGraphView() });
    this.addRibbonIcon(TG_ICON, 'Open graph view', () => this.openGraphView());
    // Obsidian sends no event when its "Excluded files" change, so this applies them on demand.
    this.addCommand({ id: 'reindex-vault', name: 'Re-index vault', callback: () => void this.reindexVault() });
    registerSchemaCommands(this);

    // lat.md ids such as [[file#Heading#Sub]] are not Obsidian heading links; resolve them with the lat resolver.
    this.registerDomEvent(
      document,
      'click',
      (evt: MouseEvent) => {
        const a = (evt.target as HTMLElement | null)?.closest?.('a.internal-link');
        const href = a?.getAttribute('data-href');
        if (!href || this.index.lat.sections().length === 0) return;
        const t = latLinkTarget(this.index.lat, href);
        if (!t) return;
        evt.preventDefault();
        evt.stopPropagation();
        if (t.kind === 'open') void this.app.workspace.openLinkText(t.path, '', Keymap.isModEvent(evt), { eState: { line: t.line } });
        else if (t.kind === 'code') new Notice(`Source link: ${t.file}${t.symbol ? `#${t.symbol}` : ''}`);
        else new Notice(`Ambiguous link, use one of: ${t.candidates.join(', ')}`);
      },
      true,
    );

    this.registerMarkdownPostProcessor(edgeEmbedPostProcessor(this));
    this.registerEditorExtension(edgeEmbedEditorExtension(this, this.editors));
    this.register(
      this.index.onChange(() => {
        for (const view of this.editors) view.dispatch({ effects: refreshEmbeds.of(null) });
      }),
    );

    this.app.workspace.onLayoutReady(async () => {
      for (const ref of this.index.watch()) this.registerEvent(ref);
      const status = (this.status = this.addStatusBarItem());
      status.addClass('mod-clickable');
      status.addEventListener('click', () =>
        new DiagnosticsModal(this.app, this.index.diagnostics(), (p, line) => this.openNoteAt(p, line)).open(),
      );
      // Whole-vault diagnostics are recounted once changes settle, not after every keystroke.
      const counts = (this.counts = statusCount(
        (text) => status.setText(text),
        () => this.index.graph.size,
        () => this.index.diagnostics().length,
        () => this.settings.showDiagnostics,
      ));
      this.register(() => counts.dispose());
      this.register(this.index.onChange(() => counts.update()));
      this.register(this.onStylesChanged(() => counts.update()));
      await this.index.build((done, total) => status.setText(`Typed Graph: indexing ${done}/${total}`));
      counts.update();
    });
  }

  onunload(): void {
    if (this.reindexTimer !== null) window.clearTimeout(this.reindexTimer);
    // A pending write of `.tg/config.json` still happens, so the last schema folder edit is not lost.
    if (this.pushTimer !== null) {
      window.clearTimeout(this.pushTimer);
      if (this.settings.syncTgConfig) void this.tgConfig.push();
    }
    this.index?.destroy();
  }

  /** Re-read the vault with the current settings, showing progress in the status bar. */
  reindexVault(): Promise<void> {
    // Startup indexing read the old settings; ask again once it is done.
    if (!this.index.ready) {
      this.requestReindex();
      return Promise.resolve();
    }
    // One at a time, so two passes never interleave.
    this.reindexing = this.reindexing
      .then(() => this.index.reindex((done, total) => this.status?.setText(`Typed Graph: re-indexing ${done}/${total}`)))
      .then(() => this.counts?.update())
      .catch((e: unknown) => console.error('Typed Graph: re-index failed', e));
    return this.reindexing;
  }

  /** Re-index once folder-setting edits pause. */
  requestReindex(): void {
    if (this.reindexTimer !== null) window.clearTimeout(this.reindexTimer);
    this.reindexTimer = window.setTimeout(() => {
      this.reindexTimer = null;
      void this.reindexVault();
    }, REINDEX_DELAY_MS);
  }

  /** True when any folder setting narrows the indexed notes. */
  hasScope(): boolean {
    const s = this.settings;
    return s.indexFolders.trim() !== '' || s.excludeFolders.trim() !== '' || s.obsidianExcluded;
  }

  /**
   * Saved settings over the defaults. A new configuration (no saved data yet) syncs with `.tg/config.json` when the
   * vault has one, and so starts from its schema folder; with sync on, the file's folder wins over the saved one.
   */
  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<ObsigraphSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
    await syncOnLoad(this.settings, saved === null, this.tgConfig);
  }

  // @tg: implements:: [[openspec:visualization-config#Live style updates]]
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.index.invalidate();
    for (const fn of this.styleListeners) fn();
    // The schema folder is typed a key at a time, so the file is written once typing pauses.
    if (this.settings.syncTgConfig) {
      if (this.pushTimer !== null) window.clearTimeout(this.pushTimer);
      this.pushTimer = window.setTimeout(() => {
        this.pushTimer = null;
        void this.tgConfig.push();
      }, REINDEX_DELAY_MS);
    }
  }

  /** Use a schema folder read from `.tg/config.json`: before the index exists only the setting changes. */
  private async applySchemaFolder(folder: string): Promise<void> {
    this.settings.schemaFolder = folder;
    if (!this.index) return;
    this.index.invalidate();
    await this.saveSettings();
    if (this.hasScope()) this.requestReindex();
  }

  /** Turn "Sync settings with .tg/config.json" on or off. Turning it on adopts the file's folder, or writes the setting's when the file names none. */
  async setTgConfigSync(on: boolean): Promise<void> {
    this.settings.syncTgConfig = on;
    if (on && (await this.tgConfig.pull())) return;
    await this.saveSettings();
  }

  /** Switch the code layer between off, annotated and all; saves the setting and rebuilds the layer. */
  async setCodeMode(mode: CodeMode): Promise<void> {
    this.settings.codeMode = mode;
    await this.saveSettings();
    await this.index.code.refresh();
  }

  /** Styler over block header (optional), schema notes and settings, in that order. */
  // @tg: implements:: [[visualization#Styling]] {since: "2026-10-03"}
  // @lat: [[visualization#Styling]]
  makeStyler(blockHeader: StyleSource | null = null): Styler {
    const sources = [...(blockHeader ? [blockHeader] : []), ...this.index.styleSources().sources];
    return makeStyler(sources, (name) => this.iconUri(name));
  }

  /** Lucide icon as a white SVG data URI for node backgrounds; null when unknown. */
  private iconUri(name: string): string | null {
    if (!this.iconUris.has(name)) {
      const svg = getIcon(name);
      let uri: string | null = null;
      if (svg) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('stroke', '#ffffff');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg.outerHTML)}`;
      }
      this.iconUris.set(name, uri);
    }
    return this.iconUris.get(name) ?? null;
  }

  onStylesChanged(fn: () => void): () => void {
    this.styleListeners.add(fn);
    return () => this.styleListeners.delete(fn);
  }

  // @tg: implements:: [[openspec:graph-view#Graph view leaf]]
  async openGraphView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH)[0];
    const leaf = existing ?? this.app.workspace.getLeaf('tab');
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE_GRAPH, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  openNoteAt(path: string, line: number): void {
    void this.app.workspace.openLinkText(path, '', false, { eState: { line } });
  }

  /** Open a note: switch to the tab it is already open in, else open it (in a new tab if asked). */
  // @tg: implements:: [[openspec:graph-view#Opening notes]] {since: "2026-10-24"}
  openNote(path: string, sourcePath: string, newTab = false): void {
    const file = this.app.metadataCache.getFirstLinkpathDest(path.split('#')[0] ?? path, sourcePath);
    let open: WorkspaceLeaf | null = null;
    if (file) {
      this.app.workspace.iterateAllLeaves((leaf) => {
        if (!open && leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) open = leaf;
      });
    }
    if (open && !path.includes('#')) void this.app.workspace.setActiveLeaf(open, { focus: true });
    else void this.app.workspace.openLinkText(path, sourcePath, newTab);
  }
}
