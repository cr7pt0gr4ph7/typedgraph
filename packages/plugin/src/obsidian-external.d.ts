import 'obsidian';

declare module 'obsidian' {
  /** A file Obsidian does not index, such as one in a dot folder, reached with `Vault.getFileByPath`. */
  export class TExternalFile extends TFile {
    /** Retains a user and starts external change monitoring if necessary. */
    addUser(user: unknown): void;
    /** Releases a user; the last release stops monitoring and clears cached data and metadata. */
    removeUser(user: unknown): void;
  }
}
