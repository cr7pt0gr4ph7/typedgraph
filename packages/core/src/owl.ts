// OWL export lives in its own entry point, like SHACL interop, so hosts that
// never export ontologies do not bundle it.
export { exportOwl } from './owl/export.js';
export type { OwlExport, OwlExportOptions, OwlLoss, OwlLossCode } from './owl/export.js';
