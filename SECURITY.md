# Security Notes — usage-widget

This document describes what the plugin can and cannot access, and how to report security issues.

## Scope

`@mark.zy/usage-widget` has a display-only Web client and a small host half. The client reads data DSH already exposes and renders the sidebar badge/popover; the host fetches only public price/holiday pages for the pricing-period badge. It spawns no processes and modifies no DSH behavior.

## Data access

| Data | How it is read |
| --- | --- |
| Current model | DSH's `modelSelection` conversation projection |
| Session usage (tokens, context pressure, timing) | Not read — the Harness-owned composer UI shows those |
| Account balance / bonus credit | DSH's built-in `remote.account` client service |
| Platform usage URL | DSH account state (`links.usageUrl`) |

The plugin does **not** read API keys, tokens, passwords, cookies, local storage or files.

## Network

- The **client** makes no external network requests (no `fetch`, `XMLHttpRequest`, WebSocket, image beacons or telemetry); it calls only the bundle-local `/usage-widget/api/pricing` route.
- The **host** fetches `https://api-docs.deepseek.com/.../pricing/` and `https://timor.tech/api/holiday/year/<year>` (public pages, no credentials, no account data). Responses are parsed in memory only.
- Balance data is fetched by DSH's own client services, not by this plugin.
- The only outbound navigation is the "Platform usage" link. It is rendered only when it is a plain `http:`/`https:` URL, and it opens with `rel="noopener noreferrer"`.

## Storage

- No `localStorage`, `sessionStorage`, cookies, IndexedDB or files.
- All state is in memory and disappears when DSH restarts.

## Failure isolation

- Initialization, locale registration, balance refresh and every slot registration are wrapped in error handling.
- The plugin does not set `immediately: true` and treats the account service as optional, so a missing/updated DSH service degrades to "no balance" instead of breaking the Web UI boot.

## Reporting

If you find a security issue, please open a private report via GitHub Security Advisories on the repository. Please do not open a public issue for a vulnerability before it is fixed.

## Supported versions

Security fixes target the latest published version of the plugin and DeepSeek Harness versions the package declares in `engines`.
