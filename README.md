# Account Balance Quick View for DeepSeek Harness

A quick balance viewer for DeepSeek Harness — good news for the balance-anxious. The sidebar badge also shows the current official pricing period (peak / off-peak) without opening anything; click it for balance, bonus credit, current model, next price switch and the platform usage shortcut. Low balances are highlighted.

> Formerly a context-usage widget. The Harness now renders its own context meter
> below the composer and token-usage pills in the composer dock, so this widget
> focuses on account information instead of repeating those readings.

> **Personal share.** Built for my own use and released as-is — if something is
> off, please be patient; issues and suggestions are welcome. The gemstone tiers
> are there so checking the balance feels a little more VIP.

![badge](icon.svg)

> The icon uses the DeepSeek Harness brand whale mark (a Harness plugin borrowing the Harness brand artwork).

## What it shows

- **Sidebar badge** — the whale mark plus the current balance next to the settings button (in the narrow rail only the whale). The whale and amount are rendered with balance-tier textures: ruby (<10), amber (10–29.99), jade (30–99.99), metallic gold (>=100).
- **Popover** — click the badge for:
  - balance (large),
  - a low-balance warning when below 10,
  - bonus credit,
  - current model,
  - a shortcut to the platform usage page.
- **Live** — balance is refreshed when the popover opens and every 60 seconds.
- **Pricing period** — the sidebar shows `高峰` (peak) or `空闲` (off-peak) in Beijing time, following the official Models & Pricing rules; the host re-syncs the public pricing page daily and retries hourly on failure. Peak hours are Mon–Fri 09:00–12:00 / 14:00–18:00 Beijing time, excluding Chinese public holidays; weekends and holidays are off-peak. The popover shows the next switch and the last official sync date.
- **Theme-aware** — colors follow the active DSH theme; readable in light and dark modes.
- **Safe by design** — every optional service is error-isolated; a failure shows a dash instead of blocking DSH.

## Balance textures

The whale icon, the sidebar amount and the popover balance use gemstone/metal textures by primary wallet amount (CNY, then USD, then the first wallet):

| Amount | Texture |
| --- | --- |
| below 10 | ruby (dark rim, jewel red, light window) |
| 10 – 29.99 | amber / citrine |
| 30 – 99.99 | jade |
| 100 and above | metallic gold (multi-band reflections, subtle 5 s sheen) |

Below 10 the panel also shows a `Low balance` warning. Thresholds are hardcoded in `client.js` (`balanceTier`).

## Requirements

- DeepSeek Harness `>= 0.2.0` (Web client).
- Sign in to a DeepSeek account to see balance and bonus credit. Without an account the badge shows a dash.

## Install

From the plugin manager: **Settings → Plugins**, install the package `@mark.zy/usage-widget`.

For a local source checkout, install the bundle with the plugin manager and point it at this directory (`install_bundle`, target = this folder's absolute path).

After installing or updating, **quit DSH completely and reopen it** — client plugins load at startup, a page refresh is not enough.

## Usage

1. The badge sits at the bottom of the sidebar, next to the settings button.
2. Click it to open the account panel; click anywhere outside to close it.
3. The platform usage link opens the DeepSeek platform usage page in a new tab.

## Data sources & privacy

| Data | Source | Notes |
| --- | --- | --- |
| Balance / bonus credit | DSH's built-in account service (`remote.account.getBalance`) | The same service DSH itself uses; the widget only formats the numbers |
| Pricing period | Host route `/usage-widget/api/pricing` | Host fetches the public DeepSeek Models & Pricing page daily; a public holiday calendar is best-effort |
| Platform usage link | DSH account state (`links.usageUrl`) | Only `http:` / `https:` URLs are rendered; opens with `noopener noreferrer` |
| Current model | DSH's `modelSelection` conversation projection | Read locally; not uploaded |

- The client makes **no external network requests** and stores **nothing** (no localStorage, cookies, files or credentials).
- The host module fetches only `api-docs.deepseek.com` (pricing page) and `timor.tech` (Chinese holiday calendar) to build the pricing-period badge; no account data is sent.
- It reads **no API keys or account credentials**; profile fields (email, phone) are never requested or displayed.

See [SECURITY.md](SECURITY.md) for the full security notes.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Badge missing after install/update | Fully quit DSH and reopen (not just refresh). Check Settings → Plugins that `@mark.zy/usage-widget` is enabled. |
| Badge shows a dash | Not signed in, or the account service is unavailable. |
| Balance is stale | The panel refreshes on open and every 60 seconds; the platform may lag behind real spending. |
| Text is amber | The balance is below the low-balance threshold (see above). |

## Design notes

- Appends to `sidebar.footer.action` and `shell.overlay`; it never replaces the account button or the composer controls.
- Context pressure and token usage stay in the Harness-owned composer UI; this plugin deliberately does not duplicate them.
- Initialization and every slot registration are error-isolated, and the plugin does not use `immediately: true`.

## Uninstall

```bash
dsh plugin --profile desktop remove @mark.zy/usage-widget
```

Or disable/remove it in Settings → Plugins.

## 中文说明

- **功能**：侧边栏底部显示账户余额；点开可看余额、赠送额度、当前模型和平台用量入口；余额按档位呈现质感：<10 红宝石（并显示余额偏低警告）、10–30 琥珀、30–100 翡翠、≥100 黄金。
- **说明**：上下文占用和 token 用量由 DSH 自带的输入框下方指标显示，本插件不再重复。
- **数据**：全部来自 DSH 本地的模型投影和 DSH 自带的账户服务，不联网上传、不写本地存储、不读取任何密钥。
- **安装**：插件管理器安装 `@mark.zy/usage-widget`，装完**完全退出 DSH 再打开**。

## License

MIT — see [LICENSE](LICENSE).
