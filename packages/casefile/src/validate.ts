import Ajv2020 from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import caseSchema from '../schema/case.schema.json';
import documentSchema from '../schema/document.schema.json';
import hotspotSchema from '../schema/hotspot.schema.json';
import ledgerSchema from '../schema/ledger.schema.json';
import registrySchema from '../schema/registry-entry.schema.json';
import styleSchema from '../schema/style.schema.json';
import templateSchema from '../schema/template.schema.json';

// Additive changes (new optional fields) are non-breaking, so unknown properties are allowed.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });

export const validateManifest = ajv.compile(caseSchema);
export const validateDocument = ajv.compile(documentSchema);
export const validateHotspot = ajv.compile(hotspotSchema);
export const validateLedger = ajv.compile(ledgerSchema);
export const validateRegistryEntry = ajv.compile(registrySchema);
export const validateStyle = ajv.compile(styleSchema);
export const validateTemplate = ajv.compile(templateSchema);

/** Readable one-line summary of the first few validation errors. */
export function describeErrors(validate: ValidateFunction): string {
  const errors = validate.errors ?? [];
  return errors
    .slice(0, 3)
    .map((e) => `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}`)
    .join('; ');
}
