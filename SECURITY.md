# Security Policy

## Supported Versions

`zod-crud` is pre-1.0. Security fixes target the latest published minor version.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately by opening a GitHub security
advisory for the repository:

https://github.com/developer-1px/zod-crud/security/advisories/new

If advisories are unavailable, open a minimal public issue that says a private
security report is needed, but do not include exploit details.

## Scope

This package edits in-memory JSON-compatible values. Reports are most useful
when they show one of these outcomes:

- A failed operation mutates document state, history, clipboard, or id
  allocation.
- A committed document can violate the root Zod schema.
- Malformed JSON-compatible input causes prototype mutation or unexpected
  object shape changes during parse, patch, copy, paste, or schema bridging.
- Published package contents include unexpected files or secrets.
