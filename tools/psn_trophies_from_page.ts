// tools/psn_trophies_from_page.ts
// Usage examples:
//   npx ts-node tools/psn_trophies_from_page.ts --url "https://psnprofiles.com/trophies/22414-street-fighter-6" --out sf6_psnprofiles.csv
//   npx ts-node tools/psn_trophies_from_page.ts --url "https://www.exophase.com/game/street-fighter-6-ps4/trophies/" --out sf6_exophase.csv

import { chromium, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

type Row = {
  trophy_id: string;
  title: string;
  description: string;
  rarity_percent: number | '';
  rarity_bucket: string;
  hidden: boolean;
  icon: string;
  source_url: string;
};

function toCsvValue(v: unknown) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: Row[]) {
  const headers: (keyof Row)[] = [
    'trophy_id','title','description','rarity_percent','rarity_bucket','hidden','icon','source_url'
  ];
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => toCsvValue((r as any)[h] ?? '')).join(','))
  ].join('\n');
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--url') out.url = argv[++i];
    else if (argv[i] === '--out') out.out = argv[++i];
  }
  if (!out.url) throw new Error('Missing --url');
  out.out ||= path.resolve(`psn_${new URL(out.url).hostname.replace(/\W+/g,'_')}.csv`);
  return out as { url: string; out: string; };
}

function waitForAnySelector(page: Page, selectors: string[], timeout = 20000) {
  return page
    .waitForFunction(
      (sels: string[]) => sels.some((sel) => document.querySelector(sel)),
      { timeout },
      selectors,
    )
    .catch(() => undefined);
}

// --- Site-specific extractors ---

async function extractFromPsnProfiles(page: Page): Promise<Row[]> {
  const ROW_SELECTORS = [
    'li.trophy',
    'tr.trophy',
    'article.trophy-card',
    '.trophy-card',
    '.trophy-list__item',
    '[data-trophy-id]',
  ];

  await waitForAnySelector(page, ROW_SELECTORS, 20000);

  const rows = await page.evaluate<Row[], { selectors: string[]; href: string }>(
    ({ selectors, href }) => {
      const seen = new Set<Element>();
      const elements: Element[] = [];
      for (const selector of selectors) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          if (!seen.has(el)) {
            seen.add(el);
            elements.push(el);
          }
        }
      }

      const getText = (root: Element, candidates: string[]) => {
        for (const candidate of candidates) {
          const target = candidate === ':self' ? root : root.querySelector(candidate);
          if (!target) continue;
          const value = (target.textContent || '').trim().replace(/\s+/g, ' ');
          if (value) return value;
        }
        return '';
      };

      const toNumber = (input: string) => {
        const match = input.match(/(\d+(?:\.\d+)?)/);
        return match ? Number(match[1]) : '';
      };

      const toAbsolute = (value: string | null) => {
        if (!value) return '';
        try {
          return new URL(value, href).toString();
        } catch (err) {
          return value;
        }
      };

      return elements
        .map((el) => {
          const title = getText(el, [
            '.title a',
            '.title',
            '.trophy_title a',
            '.trophy_title',
            '.trophy-card__title a',
            '.trophy-card__title',
            'header .heading',
            'a[href*="/trophies/"]',
            'h3',
            ':self',
          ]);
          const description = getText(el, [
            '.small-info',
            '.trophy_desc',
            '.info',
            '.trophy-info',
            '.trophy-card__description',
            'p',
          ]);
          const rarityText = getText(el, [
            '.ty-rare',
            '.rarity',
            '.small-info .rarity',
            '.trophy-card__rarity',
            '.trophy-card__meta',
          ]);
          const rarity_percent = toNumber(rarityText);
          const rarity_bucket = (rarityText.match(/Ultra Rare|Very Rare|Rare|Uncommon|Common|Legendary|Epic/i)?.[0] || '').trim();
          const iconEl = el.querySelector('img[data-src], img[data-lazy-src], img[src]') as HTMLImageElement | null;
          const icon = toAbsolute(
            iconEl?.getAttribute('data-src') ||
              iconEl?.getAttribute('data-lazy-src') ||
              iconEl?.getAttribute('src') ||
              null,
          );

          const idSources = [
            el.getAttribute('data-trophy-id'),
            el.getAttribute('data-id'),
            el.getAttribute('data-row-id'),
            el.getAttribute('data-key'),
            el.id,
            iconEl?.getAttribute('data-trophy-id') || iconEl?.id || '',
          ];
          const trophy_id = idSources.find((value) => value && value.trim())?.trim() || '';

          const hidden =
            /hidden|secret/i.test(title) ||
            /hidden|secret/i.test(description) ||
            el.classList.contains('trophy--hidden') ||
            el.classList.contains('is-hidden') ||
            el.querySelector('.hidden, .secret, .icon-hidden') !== null;

          return {
            trophy_id,
            title,
            description,
            rarity_percent,
            rarity_bucket,
            hidden,
            icon,
            source_url: href,
          };
        })
        .filter((row) => row.title && !/checking your browser/i.test(row.title));
    },
    { selectors: ROW_SELECTORS, href: page.url() },
  );

  const deduped = rows.filter((row, index, arr) => {
    if (!row.title) return false;
    const firstIndex = arr.findIndex(
      (candidate) => candidate.title === row.title && candidate.description === row.description,
    );
    return firstIndex === index;
  });

  if (deduped.length) return deduped;

  const jsonRows = await page.evaluate<Row[], { href: string }>(({ href }) => {
    const results: Row[] = [];
    const seenKeys = new Set<string>();

    const toAbsolute = (value: string | null | undefined) => {
      if (!value) return '';
      try {
        return new URL(String(value), href).toString();
      } catch (err) {
        return String(value);
      }
    };

    const toNumber = (value: unknown) => {
      if (typeof value === 'number' && !Number.isNaN(value)) return value;
      if (typeof value === 'string') {
        const match = value.match(/(\d+(?:\.\d+)?)/);
        if (match) {
          const n = Number(match[1]);
          if (!Number.isNaN(n)) return n;
        }
      }
      return '';
    };

    const pushRow = (raw: Record<string, any>) => {
      const title =
        raw.trophyName ||
        raw.trophyTitle ||
        raw.title ||
        raw.name ||
        '';
      if (!title) return;
      const description = raw.trophyDetail || raw.trophyDescription || raw.description || '';
      const key = `${title}\u0000${description}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      const rarityObj = raw.trophyRare || raw.rarity || raw.trophyRarity || {};
      const rarityPercent =
        toNumber(raw.trophyEarnedRate) ||
        toNumber(raw.trophyEarnedRatePercent) ||
        toNumber(raw.earnedRate) ||
        toNumber(raw.earnedRatePercentage) ||
        toNumber(raw.percent) ||
        toNumber(raw.rarityPercent) ||
        toNumber(rarityObj.value);
      const rarityBucket =
        (typeof rarityObj === 'object' && rarityObj && typeof rarityObj.name === 'string' && rarityObj.name) ||
        raw.trophyRareName ||
        raw.trophyRarityName ||
        raw.rarityName ||
        raw.trophyGrade ||
        '';

      const trophyIdRaw =
        raw.trophyId ||
        raw.trophy_id ||
        raw.trophyID ||
        raw.id ||
        raw.trophy ||
        '';

      const icon =
        raw.trophyIconUrl ||
        raw.iconUrl ||
        raw.icon ||
        (rarityObj && typeof rarityObj === 'object' && rarityObj.iconUrl);

      const hiddenValue = raw.trophyHidden ?? raw.isHidden ?? raw.hidden ?? false;

      results.push({
        trophy_id: trophyIdRaw ? String(trophyIdRaw) : '',
        title: String(title),
        description: String(description ?? ''),
        rarity_percent: rarityPercent,
        rarity_bucket: typeof rarityBucket === 'string' ? rarityBucket : '',
        hidden: Boolean(hiddenValue),
        icon: toAbsolute(typeof icon === 'string' ? icon : ''),
        source_url: href,
      });
    };

    const visited = new Set<any>();
    const walk = (value: any) => {
      if (!value || visited.has(value)) return;
      if (typeof value === 'string') {
        if (/"trophyId"/.test(value) || /"trophyName"/.test(value)) {
          try {
            walk(JSON.parse(value));
          } catch (err) {
            // ignore
          }
        }
        return;
      }
      if (typeof value !== 'object') return;
      visited.add(value);
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }

      const record = value as Record<string, any>;
      if (
        'trophyId' in record ||
        'trophy_id' in record ||
        'trophyID' in record ||
        'trophyName' in record ||
        'trophyTitle' in record
      ) {
        pushRow(record);
      }

      for (const child of Object.values(record)) {
        walk(child);
      }
    };

    const scriptNodes = Array.from(
      document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__, script#__NUXT_DATA__'),
    );
    for (const script of scriptNodes) {
      const text = script.textContent;
      if (!text) continue;
      try {
        walk(JSON.parse(text));
      } catch (err) {
        // ignore invalid JSON blobs
      }
    }

    const globals: any[] = [
      (window as any).__NUXT__,
      (window as any).__NUXT_DATA__,
      (window as any).__NEXT_DATA__,
      (window as any).__INITIAL_STATE__,
      (window as any).__APOLLO_STATE__,
    ];
    for (const candidate of globals) {
      walk(candidate);
    }

    return results;
  }, { href: page.url() });

  return jsonRows.filter((row, index, arr) => {
    const firstIndex = arr.findIndex(
      (candidate) => candidate.title === row.title && candidate.description === row.description,
    );
    return firstIndex === index;
  });
}

async function extractFromExophase(page: Page): Promise<Row[]> {
  // Typical row pattern: .award or .game__achievement
  await page.waitForSelector('.award, .game__achievement', { timeout: 15000 }).catch(() => {});
  const rows: Row[] = await page.$$eval(
    '.award, .game__achievement',
    (elements: Element[], href: string) => {
      const text = (el: Element, sel: string) => {
        const t = (el.querySelector(sel)?.textContent || '').trim();
        return t.replace(/\s+/g, ' ');
      };
      const num = (s: string) => {
        const m = s.match(/(\d+(\.\d+)?)/);
        return m ? Number(m[1]) : '';
      };

      return elements.map((el) => {
        const title = text(el, '.award__title, .game__achievement__title');
        const description = text(el, '.award__desc, .game__achievement__desc');
        const rarityText = text(el, '.award__rarity, .game__achievement__rarity');
        const rarityPercent = num(rarityText);
        const bucket = (rarityText.match(/Ultra Rare|Very Rare|Rare|Uncommon|Common/i)?.[0] || '').trim();
        const hidden = /secret|hidden/i.test(title) || /secret|hidden/i.test(description);
        const icon = (el.querySelector('img') as HTMLImageElement | null)?.src || '';
        const trophyId = (el.getAttribute('data-award-id') || '').toString();

        return {
          trophy_id: trophyId,
          title,
          description,
          rarity_percent: rarityPercent,
          rarity_bucket: bucket,
          hidden,
          icon,
          source_url: href,
        };
      });
    },
    page.url(),
  );
  return rows.filter(r => r.title);
}

// --- Router ---

async function extract(url: string): Promise<Row[]> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    if (/psnprofiles\.com/i.test(url)) return await extractFromPsnProfiles(page);
    if (/exophase\.com/i.test(url)) return await extractFromExophase(page);

    // Generic fallback: scan DOM for trophy-like rows
    await page.waitForTimeout(1500);
    const rows: Row[] = await page.evaluate<Row[], string>((href) => {
      function num(s: string) {
        const m = s.match(/(\d+(\.\d+)?)/);
        return m ? Number(m[1]) : '';
      }
      const candidates = Array.from(document.querySelectorAll('tr, .card, .trophy'));
      const out: any[] = [];
      for (const el of candidates) {
        const title = (el.querySelector('h3, .title, .trophy_title, a')?.textContent || '').trim();
        const desc = (el.querySelector('p, .desc, .small-info, .info')?.textContent || '').trim();
        const rarityText = (el.querySelector('.rarity, .rare, .ty-rare')?.textContent || '').trim();
        if (title && /%/.test(rarityText)) {
          out.push({
            trophy_id: (el.getAttribute('data-id') || '').toString(),
            title,
            description: desc,
            rarity_percent: num(rarityText),
            rarity_bucket: (rarityText.match(/Ultra Rare|Very Rare|Rare|Uncommon|Common/i)?.[0] || '').trim(),
            hidden: /hidden|secret/i.test(title) || /hidden|secret/i.test(desc),
            icon: (el.querySelector('img') as HTMLImageElement | null)?.src || '',
            source_url: href,
          });
        }
      }
      return out;
    }, url);
    return rows;
  } finally {
    await page.close();
    await browser.close();
  }
}

// --- main ---
(async () => {
  const { url, out } = parseArgs(process.argv);
  const rows = await extract(url);
  if (!rows.length) {
    console.error('No trophies parsed. The page structure may have changed or the site blocked scraping.');
    process.exit(2);
  }
  fs.writeFileSync(out, rowsToCsv(rows), 'utf8');
  console.log(`Wrote ${rows.length} trophies to ${out}`);
})();
