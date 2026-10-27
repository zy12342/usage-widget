/**
 * usage-widget — Web Client half.
 *
 * Account badge for the sidebar foot: shows the signed-in balance (or a dash),
 * and a popover with balance, bonus credit, current model and the platform
 * usage shortcut. Balance tiers render with gemstone textures:
 *   low = ruby, 10–29.99 = amber/citrine, 30–99.99 = jade, >=100 = metallic gold.
 *
 * Why this is not a context widget anymore: the committed conversation UI
 * already renders its own context meter below the composer and token-usage
 * pills in the composer dock, so this widget owns the account side instead.
 *
 * Privacy / security: the client makes no external network requests and reads
 * no credentials. Balance comes from DSH's own account service; the pricing
 * period comes from this bundle's local /usage-widget/api/pricing route (the
 * host fetches only the public DeepSeek docs and a holiday calendar). The
 * external usage link is http(s)-validated and opened with rel="noopener
 * noreferrer". Every consumer is error-isolated and degrades to a dash.
 */
window.__ModuleLoader__.load({
  id: '@mark.zy/usage-widget',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ---------------------------------------------------------------- store
    const DEFAULT_USAGE_URL = 'https://platform.deepseek.com/usage';

    let state = {
      modelSelection: undefined,
      balance: undefined,
      pricing: undefined,
      now: Date.now(),
      usageUrl: DEFAULT_USAGE_URL,
      open: false,
      anchor: undefined,
    };
    const subscribers = new Set();
    function setState(patch) {
      state = Object.assign({}, state, patch);
      for (const fn of Array.from(subscribers)) {
        try {
          fn();
        } catch (e) {
          /* subscriber failures must never escape */
        }
      }
    }
    function subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }
    function getSnapshot() {
      return state;
    }
    function useStore() {
      return React.useSyncExternalStore(subscribe, getSnapshot);
    }

    // -------------------------------------------------------------- helpers
    function formatAmount(n) {
      const abs = Math.abs(n);
      if (abs > 0 && abs < 0.01) return n < 0 ? '-0.01' : '<0.01';
      const rounded = n >= 0 ? Math.trunc(n * 100) / 100 : -Math.round(abs * 100) / 100;
      return rounded.toFixed(2);
    }

    function currencySymbol(currency) {
      if (currency === 'CNY' || currency === 'RMB') return '¥';
      if (currency === 'USD') return '$';
      return '';
    }

    function normalizeWallets(list) {
      if (!Array.isArray(list)) return [];
      const result = [];
      for (const w of list) {
        if (!w) continue;
        const amount = w.balance ?? w.amount;
        const n = Number(amount);
        if (amount === undefined || amount === null || !Number.isFinite(n)) continue;
        result.push({ currency: w.currency || '', amount: n });
      }
      return result;
    }

    function formatWallets(wallets) {
      if (!Array.isArray(wallets) || wallets.length === 0) return null;
      const parts = [];
      for (const w of wallets) {
        if (!w) continue;
        const n = Number(w.amount);
        if (!Number.isFinite(n)) continue;
        if (n === 0) continue;
        parts.push(currencySymbol(w.currency) + formatAmount(n));
      }
      return parts.length > 0 ? parts.join(' / ') : null;
    }

    function parseBalance(value) {
      const result = { normal: null, bonus: null, wallets: [], bonusWallets: [] };
      if (!value) return result;
      if (Array.isArray(value)) {
        result.wallets = normalizeWallets(value);
        result.normal = formatWallets(result.wallets);
        return result;
      }
      if (value.status === 'ready') {
        result.wallets = normalizeWallets(value.value);
        result.bonusWallets = normalizeWallets(value.bonusWallets);
        result.normal = formatWallets(result.wallets);
        result.bonus = formatWallets(result.bonusWallets);
        return result;
      }
      if (Array.isArray(value.normalWallets) || Array.isArray(value.wallets)) {
        result.wallets = normalizeWallets(value.normalWallets || value.wallets);
        result.bonusWallets = normalizeWallets(value.bonusWallets);
        result.normal = formatWallets(result.wallets);
        result.bonus = formatWallets(result.bonusWallets);
      }
      return result;
    }

    /** Pick the wallet whose amount drives the texture (CNY, then USD, then the first). */
    function primaryWallet(wallets) {
      if (!Array.isArray(wallets) || wallets.length === 0) return null;
      return (
        wallets.find((w) => w.currency === 'CNY') ||
        wallets.find((w) => w.currency === 'USD') ||
        wallets[0]
      );
    }

    /** 'low' (<10) | 'warn' (10–29.99) | 'mid' (30–99.99) | 'high' (>=100). */
    function balanceTier(wallets) {
      const wallet = primaryWallet(wallets);
      if (!wallet || !Number.isFinite(wallet.amount)) return 'unknown';
      if (wallet.amount < 10) return 'low';
      if (wallet.amount < 30) return 'warn';
      if (wallet.amount < 100) return 'mid';
      return 'high';
    }

    /**
     * Gemstone textures per tier. Metallic gold uses several sharp bands to
     * read as metal; ruby/jade/amber use a dark rim, a bright body and a
     * light "window" like a polished stone.
     */
    const TIER_GEMS = {
      low: {
        id: 'ruby',
        stops: [
          ['#4a0a14', 0],
          ['#e11d48', 0.26],
          ['#fecdd3', 0.48],
          ['#9f1239', 0.7],
          ['#fb7185', 0.88],
          ['#7f1d1d', 1],
        ],
      },
      warn: {
        id: 'amber',
        stops: [
          ['#4a2600', 0],
          ['#f59e0b', 0.26],
          ['#fef3c7', 0.48],
          ['#b45309', 0.7],
          ['#fbbf24', 0.88],
          ['#78350f', 1],
        ],
      },
      mid: {
        id: 'jade',
        stops: [
          ['#022c22', 0],
          ['#10b981', 0.26],
          ['#d1fae5', 0.48],
          ['#047857', 0.7],
          ['#34d399', 0.88],
          ['#064e3b', 1],
        ],
      },
      high: {
        id: 'gold',
        stops: [
          ['#5c3b00', 0],
          ['#d4a017', 0.14],
          ['#fff4c2', 0.3],
          ['#b8860b', 0.46],
          ['#ffd700', 0.62],
          ['#fffbe0', 0.76],
          ['#c99700', 0.9],
          ['#7a5200', 1],
        ],
      },
    };

    function gemClass(tier) {
      return TIER_GEMS[tier] ? 'dsh-usage-gem dsh-gem-' + tier : '';
    }

    /**
     * Keep an externally supplied URL safe before rendering it as a link.
     * Only plain http(s) URLs are accepted; anything else falls back to the
     * built-in platform usage page.
     */
    function safeExternalUrl(value) {
      if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null;
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
        return parsed.href;
      } catch (_) {
        return null;
      }
    }

    function modelLabel(selection) {
      if (!selection) return null;
      return (selection.lastUsed && selection.lastUsed.model) || (selection.next && selection.next.model) || null;
    }

    // ------------------------------------------------------- pricing period
    // Official rule (Beijing time): peak = Mon-Fri 09:00-12:00 and
    // 14:00-18:00, excluding Chinese public holidays; everything else is
    // off-peak. The schedule itself comes from the host's daily docs sync.
    const SHANGHAI_TZ = 'Asia/Shanghai';
    const WEEKDAY_NUMBER = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const shanghaiFormat = new Intl.DateTimeFormat('en-CA', {
      timeZone: SHANGHAI_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
    });
    const shanghaiClockFormat = new Intl.DateTimeFormat('en-GB', {
      timeZone: SHANGHAI_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    });

    function shanghaiNow(date) {
      const parts = {};
      for (const part of shanghaiFormat.formatToParts(date)) parts[part.type] = part.value;
      const hour = Number(parts.hour) % 24;
      const minute = Number(parts.minute);
      return {
        dateKey: parts.year + '-' + parts.month + '-' + parts.day,
        weekday: WEEKDAY_NUMBER[parts.weekday] || 0,
        minutes: hour * 60 + minute,
      };
    }

    function clockMinutes(value) {
      const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
      if (!match) return NaN;
      return Number(match[1]) * 60 + Number(match[2]);
    }

    function pricingPeriod(pricing, date) {
      if (!pricing || !Array.isArray(pricing.peakWindows) || pricing.peakWindows.length === 0) return null;
      const now = shanghaiNow(date);
      const weekdays = Array.isArray(pricing.weekdays) ? pricing.weekdays : [1, 2, 3, 4, 5];
      const holidays = Array.isArray(pricing.holidays) ? pricing.holidays : [];
      const holiday = holidays.indexOf(now.dateKey) >= 0;
      const inWindow = pricing.peakWindows.some((range) => {
        const start = clockMinutes(range && range.start);
        const end = clockMinutes(range && range.end);
        return Number.isFinite(start) && Number.isFinite(end) && now.minutes >= start && now.minutes < end;
      });
      const peak = weekdays.indexOf(now.weekday) >= 0 && !holiday && inWindow;
      return { kind: peak ? 'peak' : 'off', holiday, now };
    }

    function nextPricingChange(pricing, date) {
      const current = pricingPeriod(pricing, date);
      if (!current) return null;
      for (let offset = 1; offset <= 8 * 24 * 60; offset += 1) {
        const at = new Date(date.getTime() + offset * 60000);
        const next = pricingPeriod(pricing, at);
        if (next && next.kind !== current.kind) return { at, kind: next.kind };
      }
      return null;
    }

    function formatShanghaiClock(date) {
      try {
        return shanghaiClockFormat.format(date);
      } catch (_) {
        return '';
      }
    }

    function formatSyncedAt(ms) {
      if (!ms) return '';
      try {
        return new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit' }).format(new Date(ms));
      } catch (_) {
        return '';
      }
    }

    // --------------------------------------------------------------- shared
    /** Official DeepSeek Harness whale mark, filled with the tier's gem gradient. */
    const FISH_VIEWBOX = '0 0 23.16 17.04';
    const FISH_PATH = 'M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z';

    function WhaleIcon(props) {
      const gem = props && props.tier ? TIER_GEMS[props.tier] : undefined;
      const width = 20;
      const height = (width * 17.04) / 23.16;
      const gradientId = gem ? 'dsh-whale-gem-' + gem.id : null;
      return h(
        'svg',
        { viewBox: FISH_VIEWBOX, width, height, 'aria-hidden': true, fill: 'none' },
        gem
          ? h(
              'defs',
              null,
              h(
                'linearGradient',
                { id: gradientId, x1: '0', y1: '0', x2: '1', y2: '1' },
                gem.stops.map(([color, offset]) =>
                  h('stop', { key: offset, offset: String(offset * 100) + '%', stopColor: color }),
                ),
              ),
            )
          : null,
        h('path', { d: FISH_PATH, fill: gem ? 'url(#' + gradientId + ')' : 'currentColor' }),
      );
    }

    // --------------------------------------------------------------- styles
    const CSS = `
.dsh-usage-root { display: inline-flex; align-items: center; }
.dsh-usage-btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 9px; border: 0; border-radius: 10px;
  background: transparent; color: var(--dsw-alias-label-secondary, inherit);
  font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
  cursor: pointer; transition: background-color .15s ease, color .15s ease, transform .15s ease;
}
.dsh-usage-btn:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary, currentColor) 12%, transparent);
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-usage-btn:active { transform: scale(.97); }
.dsh-usage-coin {
  display: inline-flex; width: 20px; height: 15px; flex: none;
  align-items: center; justify-content: center;
}
.dsh-usage-amt { font-weight: 600; }
.dsh-usage-period {
  display:inline-flex; align-items:center; gap:4px; height:18px; padding:0 6px; border-radius:999px;
  font-size:10px; font-weight:650; line-height:1; white-space:nowrap; border:1px solid transparent;
}
.dsh-usage-period i, .dsh-usage-period-value i {
  width:5px; height:5px; border-radius:50%; background:currentColor; flex:none;
}
.dsh-usage-period.peak {
  color:#f59e0b;
  background:color-mix(in srgb, #f59e0b 13%, transparent);
  border-color:color-mix(in srgb, #f59e0b 30%, transparent);
}
.dsh-usage-period.off {
  color:#10b981;
  background:color-mix(in srgb, #10b981 13%, transparent);
  border-color:color-mix(in srgb, #10b981 30%, transparent);
}
.dsh-usage-period-value { display:inline-flex; align-items:center; gap:5px; }
.dsh-usage-sync {
  display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:10px;
  font-size:10px; color:var(--dsw-alias-label-tertiary, inherit);
}
.dsh-usage-sync a { color:var(--dsw-alias-brand-primary, inherit); text-decoration:none; }
.dsh-usage-sync a:hover { text-decoration:underline; }


/* Gemstone textures: every tier gets a dark rim, a bright body and a light
   window band. Text uses the same gradient via background-clip. */
.dsh-usage-gem {
  background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text;
  color: transparent; -webkit-text-fill-color: transparent;
}
.dsh-gem-low {
  background-image: linear-gradient(120deg, #4a0a14 0%, #e11d48 26%, #fecdd3 48%, #9f1239 70%, #fb7185 88%, #7f1d1d 100%);
  filter: drop-shadow(0 0 7px rgba(225, 29, 72, .45));
}
.dsh-gem-warn {
  background-image: linear-gradient(120deg, #4a2600 0%, #f59e0b 26%, #fef3c7 48%, #b45309 70%, #fbbf24 88%, #78350f 100%);
  filter: drop-shadow(0 0 7px rgba(245, 158, 11, .45));
}
.dsh-gem-mid {
  background-image: linear-gradient(120deg, #022c22 0%, #10b981 26%, #d1fae5 48%, #047857 70%, #34d399 88%, #064e3b 100%);
  filter: drop-shadow(0 0 7px rgba(16, 185, 129, .45));
}
.dsh-gem-high {
  background-image: linear-gradient(120deg, #5c3b00 0%, #d4a017 14%, #fff4c2 30%, #b8860b 46%, #ffd700 62%, #fffbe0 76%, #c99700 90%, #7a5200 100%);
  filter: drop-shadow(0 0 9px rgba(255, 196, 54, .5));
  animation: dsh-gold-shine 5s ease-in-out infinite;
}
@keyframes dsh-gold-shine {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
.dsh-usage-card {
  position: fixed; z-index: 80; width: 232px;
  padding: 13px 14px; border-radius: 14px;
  background: color-mix(in srgb, var(--dsw-alias-bg-overlay, Canvas) 88%, transparent);
  border: 1px solid var(--dsw-alias-border-l1, color-mix(in srgb, currentColor 14%, transparent));
  box-shadow: 0 18px 48px rgba(0,0,0,.24), 0 2px 8px rgba(0,0,0,.12);
  backdrop-filter: blur(22px) saturate(150%); -webkit-backdrop-filter: blur(22px) saturate(150%);
  color: var(--dsw-alias-label-primary, inherit); font-size: 12px; line-height: 1.45;
  animation: dsh-usage-in .18s ease-out both;
}
@keyframes dsh-usage-in {
  from { opacity: 0; transform: translateY(6px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.dsh-usage-backdrop { position: fixed; inset: 0; z-index: 79; background: transparent; }
.dsh-usage-title { font-weight: 650; font-size: 13px; color: var(--dsw-alias-label-primary, inherit); letter-spacing: .2px; }
.dsh-usage-caption { margin-top: 10px; font-size: 11px; color: var(--dsw-alias-label-tertiary, inherit); }
.dsh-usage-balance { margin-top: 1px; font-weight: 700; font-size: 23px; font-variant-numeric: tabular-nums; letter-spacing: .2px; }
.dsh-usage-warn { margin-top: 4px; font-size: 11px; color: var(--dsw-alias-state-error-primary, #ef4444); }
.dsh-usage-sep { height: 1px; background: var(--dsw-alias-border-l1, color-mix(in srgb, currentColor 12%, transparent)); margin: 10px 0; }
.dsh-usage-row { display: flex; justify-content: space-between; gap: 10px; color: var(--dsw-alias-label-secondary, inherit); }
.dsh-usage-row + .dsh-usage-row { margin-top: 5px; }
.dsh-usage-row b { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, inherit); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-usage-empty { color: var(--dsw-alias-label-tertiary, inherit); font-weight: 400; }
.dsh-usage-link {
  display: inline-block; color: var(--dsw-alias-brand-primary, inherit); text-decoration: none; cursor: pointer;
  border-radius: 6px; padding: 2px 4px; margin: -2px -4px;
  transition: opacity .15s ease, background-color .15s ease;
}
.dsh-usage-link:hover {
  opacity: .85;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, currentColor) 12%, transparent);
}
`;

    // ------------------------------------------------------------- parts
    function UsageCollector(props) {
      const useProjection = props && props.useProjection;
      const modelSelection = useProjection ? useProjection('modelSelection') : undefined;
      React.useEffect(() => {
        setState({ modelSelection });
      }, [modelSelection]);
      return null;
    }

    function UsageBadge(props) {
      const snapshot = useStore();
      const parsed = parseBalance(snapshot.balance);
      const tier = balanceTier(parsed.wallets);
      const gem = gemClass(tier);
      const t = (props && props.t) || ((k) => k);
      const nowDate = new Date(snapshot.now || Date.now());
      const period = pricingPeriod(snapshot.pricing, nowDate);
      const next = period ? nextPricingChange(snapshot.pricing, nowDate) : null;
      const periodLabel = period ? t(period.kind === 'peak' ? 'peak' : 'offPeak') : '';
      const periodShort = period ? t(period.kind === 'peak' ? 'peakShort' : 'offPeakShort') : '';
      const nextLabel = next ? t('nextChange') + ' ' + formatShanghaiClock(next.at) : '';
      const title = [parsed.normal ? t('balance') + ' ' + parsed.normal : t('balance'), periodLabel, nextLabel].filter(Boolean).join(' · ');
      return h(
        'div',
        { className: 'dsh-usage-root' },
        h(
          'button',
          {
            className: 'dsh-usage-btn',
            type: 'button',
            title,
            'aria-label': title,
            onClick: (event) => {
              try {
                if (props.refresh) props.refresh();
              } catch (_) {
                /* refresh is best-effort */
              }
              const current = getSnapshot();
              if (current.open) {
                setState({ open: false, anchor: undefined });
                return;
              }
              const el = event && event.currentTarget;
              const rect = el ? el.getBoundingClientRect() : undefined;
              let box;
              if (el) {
                let node = el;
                while (node && node !== document.body) {
                  const r = node.getBoundingClientRect();
                  if (r.left <= 4 && r.width >= 40 && r.width <= 340 && r.height > 200) {
                    box = r;
                    break;
                  }
                  node = node.parentElement;
                }
              }
              setState({
                open: true,
                anchor: rect
                  ? {
                      right: rect.right,
                      top: rect.top,
                      sidebarLeft: box ? box.left : 0,
                      sidebarWidth: box ? box.width : 260,
                    }
                  : undefined,
              });
            },
          },
          h('span', { className: 'dsh-usage-coin ' + gem }, h(WhaleIcon, { tier })),
          props && props.wide && parsed.normal
            ? h('span', { className: 'dsh-usage-amt ' + gem }, parsed.normal)
            : null,
          period
            ? h(
                'span',
                {
                  className: 'dsh-usage-period ' + (period.kind === 'peak' ? 'peak' : 'off'),
                  title: periodLabel + (nextLabel ? ' · ' + nextLabel : ''),
                },
                h('i'),
                periodShort,
              )
            : null,
        ),
      );
    }

    function UsagePanel(props) {
      const t = (props && props.t) || ((k) => k);
      const snapshot = useStore();
      if (!snapshot.open) return null;
      const parsed = parseBalance(snapshot.balance);
      const tier = balanceTier(parsed.wallets);
      const gem = gemClass(tier);
      const model = modelLabel(snapshot.modelSelection);
      const nowDate = new Date(snapshot.now || Date.now());
      const period = pricingPeriod(snapshot.pricing, nowDate);
      const next = period ? nextPricingChange(snapshot.pricing, nowDate) : null;
      const periodLabel = period ? t(period.kind === 'peak' ? 'peak' : 'offPeak') : '';
      const periodShort = period ? t(period.kind === 'peak' ? 'peakShort' : 'offPeakShort') : '';
      const anchor = snapshot.anchor;
      let cardStyle;
      if (anchor) {
        const width = Math.min(232, Math.max(196, Math.round(anchor.sidebarWidth - 16)));
        cardStyle = {
          left: Math.round(anchor.sidebarLeft + 8) + 'px',
          width: width + 'px',
          bottom: Math.max(12, window.innerHeight - anchor.top + 8) + 'px',
        };
      } else {
        cardStyle = { left: '64px', bottom: '80px' };
      }
      return h(
        React.Fragment,
        null,
        h('div', {
          className: 'dsh-usage-backdrop',
          onClick: () => setState({ open: false }),
        }),
        h(
          'div',
          { className: 'dsh-usage-card', style: cardStyle, role: 'dialog', 'aria-label': t('title') },
          h('div', { className: 'dsh-usage-title' }, t('title')),
          h('div', { className: 'dsh-usage-caption' }, t('balance')),
          h('div', { className: 'dsh-usage-balance ' + gem }, parsed.normal || '—'),
          tier === 'low' ? h('div', { className: 'dsh-usage-warn' }, '⚠ ' + t('lowBalance')) : null,
          h('div', { className: 'dsh-usage-sep' }),
          h(
            'div',
            { className: 'dsh-usage-row' },
            h('span', null, t('bonus')),
            h('b', { className: parsed.bonus ? '' : 'dsh-usage-empty' }, parsed.bonus || '—'),
          ),
          h(
            'div',
            { className: 'dsh-usage-row' },
            h('span', null, t('model')),
            h('b', { className: model ? '' : 'dsh-usage-empty' }, model || '—'),
          ),
          period
            ? h(
                'div',
                { className: 'dsh-usage-row' },
                h('span', null, t('pricingPeriod')),
                h('b', { className: 'dsh-usage-period-value ' + (period.kind === 'peak' ? 'peak' : 'off') }, h('i'), periodLabel),
              )
            : null,
          next
            ? h(
                'div',
                { className: 'dsh-usage-row' },
                h('span', null, t('nextChange')),
                h('b', null, formatShanghaiClock(next.at) + ' · ' + t(next.kind === 'peak' ? 'peakShort' : 'offPeakShort')),
              )
            : null,
          h('div', { className: 'dsh-usage-sep' }),
          h(
            'a',
            {
              className: 'dsh-usage-link',
              href: safeExternalUrl(snapshot.usageUrl) || DEFAULT_USAGE_URL,
              target: '_blank',
              rel: 'noopener noreferrer',
            },
            t('platformUsage') + ' ›',
          ),
          snapshot.pricing
            ? h(
                'div',
                { className: 'dsh-usage-sync' },
                h(
                  'span',
                  null,
                  t('officialSync') +
                    (formatSyncedAt(snapshot.pricing.fetchedAt) ? ' · ' + formatSyncedAt(snapshot.pricing.fetchedAt) : '') +
                    (snapshot.pricing.stale ? ' · ' + t('stalePricing') : ''),
                ),
                snapshot.pricing.source
                  ? h(
                      'a',
                      { href: safeExternalUrl(snapshot.pricing.source) || undefined, target: '_blank', rel: 'noopener noreferrer' },
                      t('pricingDoc') + ' ›',
                    )
                  : null,
              )
            : null,
        ),
      );
    }

    // --------------------------------------------------------------- apply
    function apply(ctx) {
      const warn = (scope, error) => {
        try {
          console.error('[usage-widget] ' + scope + ' failed', error);
        } catch (_) {
          /* ignore */
        }
      };

      try {
        ctx.effect(() => {
          const el = document.createElement('style');
          el.textContent = CSS;
          document.head.append(el);
          return () => el.remove();
        }, 'usage-widget: styles');
      } catch (error) {
        warn('styles', error);
      }

      const locale = ctx.locale;
      let t = (key) => key;
      try {
        if (locale && typeof locale.register === 'function') {
          ctx.effect(
            () => locale.register('usage-widget', {
              en: {
                title: 'Account',
                balance: 'Balance',
                bonus: 'Bonus credit',
                model: 'Model',
                lowBalance: 'Low balance',
                pricingPeriod: 'Pricing period',
                nextChange: 'Next change',
                officialSync: 'Official pricing synced',
                pricingDoc: 'Models & pricing',
                stalePricing: 'stale data',
                peak: 'Peak hours',
                offPeak: 'Off-peak hours',
                peakShort: 'Peak',
                offPeakShort: 'Off-peak',
                platformUsage: 'Platform usage',
              },
              zh: {
                title: '账户',
                balance: '余额',
                bonus: '赠送额度',
                model: '模型',
                lowBalance: '余额偏低',
                pricingPeriod: '计费时段',
                nextChange: '下次切换',
                officialSync: '官方价格同步',
                pricingDoc: '模型 & 价格',
                stalePricing: '旧数据',
                peak: '高峰时段',
                offPeak: '空闲时段',
                peakShort: '高峰',
                offPeakShort: '空闲',
                platformUsage: '平台用量',
              },
            }),
            'usage-widget: locale',
          );
          if (typeof locale.bind === 'function') {
            const bound = locale.bind('usage-widget');
            t = (key) => {
              try {
                return bound(key);
              } catch (_) {
                return key;
              }
            };
          }
        }
      } catch (error) {
        warn('locale', error);
      }

      let refreshAccount = () => {};

      // Balance is optional: a missing remote service must never fail activation.
      try {
        const accountOf = () => {
          try {
            const remote = ctx.remote;
            if (remote && remote.account && typeof remote.account.getBalance === 'function') return remote.account;
            if (typeof ctx.get === 'function') {
              const service = ctx.get('remote.account');
              if (service && typeof service.getBalance === 'function') return service;
            }
            return undefined;
          } catch (_) {
            return undefined;
          }
        };
        const refreshBalance = () => {
          const account = accountOf();
          if (!account) return;
          const meta = {
            version: (typeof globalThis.__DSH_CLIENT_VERSION__ === 'string' && globalThis.__DSH_CLIENT_VERSION__) || '0.2.1-rc.2',
            locale: (locale && typeof locale.getSnapshot === 'function' && locale.getSnapshot().active) || 'zh',
            timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
          };
          Promise.resolve(account.getBalance(meta)).then(
            (result) => setState({ balance: result && result.ok ? result.value : undefined }),
            () => setState({ balance: undefined }),
          );
          if (typeof account.getState === 'function') {
            const applyState = (result) => {
              const raw = result && result.ok && result.value && result.value.links && result.value.links.usageUrl;
              const url = safeExternalUrl(raw);
              if (url) setState({ usageUrl: url });
            };
            Promise.resolve(account.getState(meta)).then(applyState, () => {
              Promise.resolve(account.getState()).then(applyState, () => {});
            });
          }
        };
        refreshAccount = refreshBalance;
        refreshBalance();
        ctx.effect(() => {
          const id = setInterval(refreshBalance, 60000);
          return () => clearInterval(id);
        }, 'usage-widget: balance timer');
      } catch (error) {
        warn('balance', error);
      }

      // Local host route: official pricing schedule + holiday calendar, synced
      // by the host from the public docs. Never contacts external sites directly.
      try {
        const loadPricing = () => {
          if (typeof fetch !== 'function') return;
          fetch('/usage-widget/api/pricing', { headers: { accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
              if (data && data.ok !== false) setState({ pricing: data });
            })
            .catch(() => {});
        };
        loadPricing();
        ctx.effect(() => {
          const id = setInterval(loadPricing, 15 * 60 * 1000);
          return () => clearInterval(id);
        }, 'usage-widget: pricing poll');
      } catch (error) {
        warn('pricing', error);
      }

      try {
        ctx.effect(() => {
          const id = setInterval(() => setState({ now: Date.now() }), 30000);
          return () => clearInterval(id);
        }, 'usage-widget: clock');
      } catch (error) {
        warn('clock', error);
      }

      const register = (slot, options, component) => {
        try {
          ctx.slots.inject(slot, () => ctx.slots.register(Object.assign({ name: slot }, options), component));
        } catch (error) {
          warn('slot ' + slot, error);
        }
      };

      const badgeInject = () => ({ t, refresh: () => refreshAccount() });
      register('conversation.composer.dock', { id: 'usage-widget-collector', order: 50 }, UsageCollector);
      register('sidebar.footer.action', { id: 'usage-widget', order: -2, label: () => t('title'), locale: 'usage-widget', inject: badgeInject }, UsageBadge);
      register('shell.overlay', { id: 'usage-widget-panel', order: 20, inject: () => ({ t }) }, UsagePanel);
    }

    return { inject: ['slots', 'locale', 'remote', 'remote.account'], apply };
  },
});
