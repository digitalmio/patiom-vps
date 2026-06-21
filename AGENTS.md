# Coding Style

## General
- Do not assume. Ask questions if unsure

## Modern JavaScript
- Use array methods (`map`, `filter`, `reduce`, `flatMap`, `find`, `some`, `every`) instead of `for` loops
- Use `Promise.all` with `map` for parallel async operations
- Prefer functional patterns over imperative loops

## Git
- NEVER commit or push to git without explicit user approval. Always ask first.

## Publishing
- NEVER publish packages to npm without explicit user approval. Ask first.

## Package Manager Strategy
- CLI: Detect and use any package manager (npm/yarn/pnpm) for local builds
- Daemon: Use npm only for server-side dependency installation
