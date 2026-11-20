/** The printed labels of a template's slots, for blocks that draw labelled boxes. Read through a function so it follows the document. */
export const LABELS = Symbol('labels');
export type Labels = Record<string, string>;
export type LabelsContext = () => Labels;
