// JSON escaping alone does not stop HTML's parser from closing a script tag.
// Escaping '<' preserves the JSON value while removing all closing-tag syntax.
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
