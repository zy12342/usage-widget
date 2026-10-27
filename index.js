/**
 * Host half of the usage-widget bundle.
 *
 * Owns the official pricing-period feed: fetches DeepSeek's public Models &
 * Pricing page, parses the peak/off-peak windows, and caches a holiday calendar
 * used by the client to decide whether "now" is peak or off-peak in Beijing
 * time. The client only talks to this local route; it never contacts the docs
 * or holiday site directly.
 */
export const inject = ['webServer']

const PRICING_URL_ZH = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'
const PRICING_URL_EN = 'https://api-docs.deepseek.com/quick_start/pricing/'
const DOCS_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'
const HOLIDAY_URL = (year) => 'https://timor.tech/api/holiday/year/' + year
const TIME_ZONE = 'Asia/Shanghai'
const REFRESH_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15000

const FALLBACK = {
  ok: true,
  stale: true,
  source: DOCS_URL,
  docLang: 'fallback',
  timeZone: TIME_ZONE,
  peakWindows: [
    { start: '09:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  weekdays: [1, 2, 3, 4, 5],
  holidays: [],
  note: '周一至周五 9:00-12:00、14:00-18:00 为高峰时段；其余时段（含周末及中国法定节假日）为空闲时段。',
  fetchedAt: 0,
  error: 'not fetched yet',
}

let state = { ...FALLBACK }

function jsonResponse(res, status, value) {
  try {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(value))
  } catch (_) {
    /* ignore */
  }
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!match) return ''
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return ''
  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0')
}

function timeRanges(text) {
  const ranges = []
  const re = /(\d{1,2}:\d{2})\s*[-–—~～至到]\s*(\d{1,2}:\d{2})/g
  let match
  while ((match = re.exec(String(text || ''))) !== null) {
    const start = normalizeClock(match[1])
    const end = normalizeClock(match[2])
    if (start && end && !ranges.some((r) => r.start === start && r.end === end)) ranges.push({ start, end })
  }
  return ranges
}

function parseChinesePricing(text) {
  const marker = String(text).indexOf('为高峰时段')
  if (marker < 0) return null
  const segment = String(text).slice(Math.max(0, marker - 320), marker + 60)
  if (!/周一至周五/.test(segment) || !/法定节假日/.test(segment)) return null
  const ranges = timeRanges(segment)
  if (ranges.length === 0) return null
  return {
    peakWindows: ranges,
    weekdays: [1, 2, 3, 4, 5],
    note: '北京时间周一至周五（不含中国法定节假日）为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。',
    docLang: 'zh',
  }
}

function parseEnglishPricing(text) {
  const marker = String(text).indexOf('Peak hours are')
  if (marker < 0) return null
  const segment = String(text).slice(marker, marker + 380)
  if (!/Monday through Friday/i.test(segment)) return null
  const ranges = timeRanges(segment)
  if (ranges.length === 0) return null
  return {
    peakWindows: ranges,
    weekdays: [1, 2, 3, 4, 5],
    note: 'Peak hours are 09:00-12:00 and 14:00-18:00 Beijing time, Monday through Friday, excluding Chinese public holidays; all other hours are off-peak.',
    docLang: 'en',
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'dsh-usage-widget/1.0.2', accept: 'text/html' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error('HTTP ' + response.status)
  return await response.text()
}

async function fetchHolidays(year) {
  const response = await fetch(HOLIDAY_URL(year), {
    headers: { 'user-agent': 'dsh-usage-widget/1.0.2', accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error('holiday HTTP ' + response.status)
  const data = await response.json()
  const list = []
  const items = data && data.holiday && typeof data.holiday === 'object' ? data.holiday : {}
  for (const item of Object.values(items)) {
    if (!item || item.holiday !== true || typeof item.date !== 'string') continue
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.date)) list.push(item.date)
  }
  return Array.from(new Set(list)).sort()
}

function shanghaiYear(date) {
  try {
    return Number(new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric' }).format(date))
  } catch (_) {
    return date.getFullYear()
  }
}

function shanghaiMonth(date) {
  try {
    return Number(new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, month: '2-digit' }).format(date))
  } catch (_) {
    return date.getMonth() + 1
  }
}

async function refreshPricing(logger) {
  const previous = state
  const next = { ...previous, error: '' }
  let docParsed = null
  try {
    const zh = htmlToText(await fetchText(PRICING_URL_ZH))
    docParsed = parseChinesePricing(zh)
  } catch (error) {
    next.error = '中文价格页：' + String(error && error.message ? error.message : error)
  }
  if (!docParsed) {
    try {
      const en = htmlToText(await fetchText(PRICING_URL_EN))
      docParsed = parseEnglishPricing(en)
    } catch (error) {
      next.error = (next.error ? next.error + '；' : '') + '英文价格页：' + String(error && error.message ? error.message : error)
    }
  }
  if (docParsed) {
    next.peakWindows = docParsed.peakWindows
    next.weekdays = docParsed.weekdays
    next.note = docParsed.note
    next.docLang = docParsed.docLang
    next.source = DOCS_URL
    next.stale = false
  } else {
    next.stale = true
    next.source = previous.source || DOCS_URL
  }

  const now = new Date()
  const year = shanghaiYear(now)
  const years = shanghaiMonth(now) >= 11 ? [year, year + 1] : [year]
  const holidays = []
  for (const item of years) {
    try {
      holidays.push(...(await fetchHolidays(item)))
    } catch (error) {
      next.error = (next.error ? next.error + '；' : '') + '节假日：' + String(error && error.message ? error.message : error)
    }
  }
  if (holidays.length > 0) next.holidays = Array.from(new Set(holidays)).sort()

  next.ok = true
  next.fetchedAt = Date.now()
  if (next.error) {
    try {
      logger?.warn?.('usage-widget pricing sync: ' + next.error)
    } catch (_) {
      /* ignore */
    }
  }
  state = next
  return next
}

export function apply(ctx) {
  const logger = ctx && ctx.logger
  try {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: 'prefix',
          path: '/usage-widget/api',
          handler: async (req, res) => {
            try {
              const url = new URL(req.url || '/', 'http://usage-widget.internal')
              if (url.pathname.endsWith('/pricing') && req.method === 'GET') {
                jsonResponse(res, 200, { ...state, timeZone: TIME_ZONE })
                return
              }
              jsonResponse(res, 404, { ok: false, error: 'not found' })
            } catch (error) {
              jsonResponse(res, 500, { ok: false, error: String(error && error.message ? error.message : error) })
            }
          },
        }),
      'usage-widget: pricing route',
    )
  } catch (error) {
    try {
      logger?.warn?.('usage-widget pricing route failed: ' + String(error && error.message ? error.message : error))
    } catch (_) {
      /* ignore */
    }
  }

  try {
    ctx.effect(() => {
      let stopped = false
      let timer
      const run = async () => {
        try {
          await refreshPricing(logger)
        } catch (error) {
          state = { ...state, error: String(error && error.message ? error.message : error), fetchedAt: Date.now() }
        }
        if (!stopped) timer = setTimeout(run, state.stale ? RETRY_MS : REFRESH_MS)
      }
      run()
      return () => {
        stopped = true
        clearTimeout(timer)
      }
    }, 'usage-widget: pricing sync')
  } catch (error) {
    try {
      logger?.warn?.('usage-widget pricing sync failed: ' + String(error && error.message ? error.message : error))
    } catch (_) {
      /* ignore */
    }
  }
}
