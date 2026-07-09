# Auto Updates

ZeroSort ships desktop updates through **Tauri v2** (`tauri-plugin-updater`).

## Tauri feed

1. `pnpm tauri:build` (or `pnpm build:tauri`) produces platform bundles plus
   updater artifacts (`.sig` signature files) when
   `bundle.createUpdaterArtifacts` is enabled in
   [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json).
2. Configure the updater public key in `tauri.conf.json` → `plugins.updater.pubkey`
   (contents of the public key generated with `tauri signer generate`).
3. Endpoint (already configured):

   ```
   https://zerosort.app/api/updates/stable/{{target}}/{{arch}}/{{current_version}}
   ```

4. Upload Tauri bundles **and** matching `.sig` files to the CDN.

### Signing keys

```bash
# Generate a keypair (once). Store the private key securely.
pnpm tauri signer generate -w ~/.tauri/zerosort.key

# Build with the private key available:
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/zerosort.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""   # if the key is password-protected
pnpm build:tauri
```

Paste the **public** key into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.

### Publishing a release

1. Bump `version` in [package.json](../package.json),
   [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json), and
   [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml).
2. Run `pnpm build:tauri` with `TAURI_SIGNING_PRIVATE_KEY` set.
3. Upload bundles and `.sig` files to a public HTTPS directory.

Every updater asset must include a non-empty Ed25519 `signature`.

## Code signing

- **macOS**: Apple signing/notarization via Tauri bundle config + `APPLE_*`
  env vars; updater signatures use `TAURI_SIGNING_PRIVATE_KEY`.
- **Windows**: follow Tauri's Windows signing docs for NSIS/MSI; updater
  integrity uses `.sig`.
- **Linux**: integrity via `.sig`.

## Known limitations

- Tauri updater pubkey must be set before shipping update-capable builds.

## Local smoke-test

```bash
pnpm tauri:dev          # development
pnpm build              # renderer production build + typecheck
pnpm build:tauri        # production bundle + updater artifacts
```

See the [Tauri updater plugin](https://v2.tauri.app/plugin/updater/) for staged
rollouts and channel support.
