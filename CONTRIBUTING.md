# Contributing

## Development

```bash
npm ci
npm run typecheck
npm run test
npm run build
```

## Guardrails

- Keep tool behavior deterministic.
- Preserve read-only scope for `0.1.x`.
- Do not introduce network side effects in tool handlers.
- Include tests for new edge cases and error codes.
