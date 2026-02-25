# obsidian-mcp

Deterministic read-only MCP server for Obsidian vaults.

## Scope (v0.1)

- Transport: `stdio` only
- Runtime: Node.js 20+
- Tools:
  - `vault.list_notes(input:{folder?,glob?,limit?}) -> {notes[],total}`
  - `vault.read_note(input:{path,maxBytes?}) -> {path,content,bytes,sha256,lineCount}`
  - `vault.search_notes(input:{query,caseSensitive?,limit?}) -> {matches[],total}`
  - `vault.get_metadata(input:{path}) -> {path,title?,tags[],frontmatter}`
- Read-only contract: no write/update/delete tools.

## Security defaults

- Vault boundary enforced by `OBSIDIAN_VAULT_ROOT`
- Path traversal blocked
- Symlink escape blocked
- Max file size bounded by `MAX_FILE_BYTES` (default: `262144`)
- No network calls in tool handlers

## Quick start

```bash
npm ci
OBSIDIAN_VAULT_ROOT="/absolute/path/to/vault" npm run dev
```

Build and test:

```bash
npm run typecheck
npm run test
npm run build
```

## Determinism guarantees

- Sorted path output
- Sorted match output
- Stable SHA-256 for note content
- Fixed validation and error code prefixes for boundary violations

## License

MIT
