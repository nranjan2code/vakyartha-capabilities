// What a model's licence lets you do, and whether you can download it, in plain classes.
//
// Only standard open licences are recognised by name, by their standard identifiers; a licence
// whose own name says non-commercial, research or non-production is read as that; every other
// licence is the lab's own, and the desk says to read it. Guessing wrong here would tell someone
// they may ship a model commercially when they may not, so nothing is guessed. Licence terms are
// never reproduced: the model's own page is the authority.

export type LicenceClass = 'permissive' | 'non-commercial' | 'own' | 'none';
export type AccessClass = 'open' | 'gated' | 'unknown';

/** Standard open licences, by their standard identifiers: commercial use without extra conditions. */
const STANDARD_OPEN = new Set([
  'apache-2.0', 'mit', '0bsd', 'bsd', 'bsd-2-clause', 'bsd-3-clause', 'isc', 'unlicense', 'zlib', 'bsl-1.0', 'upl-1.0',
  'cc0-1.0', 'cc-by-4.0', 'cc-by-sa-4.0', 'mpl-2.0', 'artistic-2.0', 'gpl-2.0', 'gpl-3.0', 'lgpl-2.1', 'lgpl-3.0', 'agpl-3.0',
]);

/** "Apache 2.0", "MIT License" and "apache-2.0" are one identifier. */
export function identifier(licence: string): string {
  return licence.trim().toLowerCase().replace(/\s+licen[cs]e$/, '').replace(/^the\s+/, '').replace(/[\s_]+/g, '-');
}

/** A licence whose own words limit it to non-commercial, research or non-production use. */
const LIMITED = /(^|[^a-z])(nc|non-?commercial|research|non-?production)([^a-z]|$)/;

export function classify(licence: string | null | undefined): LicenceClass {
  if (!licence || !licence.trim()) return 'none';
  const id = identifier(licence);
  if (LIMITED.test(id)) return 'non-commercial';
  if (STANDARD_OPEN.has(id)) return 'permissive';
  return 'own';
}

export const LICENCE_LABEL: Record<LicenceClass, string> = { permissive: 'Standard open licence', 'non-commercial': 'Non-commercial', own: "The lab's own licence", none: 'No licence published' };
export const LICENCE_NOTE: Record<LicenceClass, string> = {
  permissive: 'A standard open-source licence: commercial use without extra conditions.',
  'non-commercial': 'Its own terms limit it to non-commercial, research or non-production use.',
  own: 'Terms the lab wrote itself, often with conditions such as user counts or use policies: read them before shipping.',
  none: 'Neither the catalog nor the weights host publishes a licence: check the model page before relying on it.',
};
export const ACCESS_LABEL: Record<AccessClass, string> = { open: 'Open download', gated: 'Access request', unknown: 'Not read yet' };
/** The weights host writes "other" for a licence of the lab's own: a class, not a name to show. */
export const named = (licence: string | null | undefined) => (licence && identifier(licence) !== 'other' ? licence : null);
