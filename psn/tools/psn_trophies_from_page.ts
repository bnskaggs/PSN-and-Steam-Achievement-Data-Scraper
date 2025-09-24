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

// --- Site-specific extractors ---

async function extractFromPsnProfiles(page: Page): Promise<Row[]> {
  // Typical row pattern: .trophy or tr.trophy
  await page.waitForSelector('.trophy, tr.trophy', { timeout: 15000 }).catch(() => {});

  const rows: Row[] = await page.$$eval(
    '.trophy, tr.trophy',
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
        const title = text(el, '.title a, .trophy_title a, .title, .trophy_title');
        const description = text(el, '.small-info, .trophy_desc, .info, .trophy-info');
        const rarityText = text(el, '.ty-rare, .rarity, .small-info .rarity');
        const rarityPercent = num(rarityText);
        const bucket = (rarityText.match(/Ultra Rare|Very Rare|Rare|Uncommon|Common/i)?.[0] || '').trim();
        const hidden = /hidden/i.test(title) || /hidden/i.test(description) || /secret/i.test(title);
        const img = el.querySelector('img[src*="trophy"], img.avatar') as HTMLImageElement | null;
        const idAttr =
          (el.getAttribute('data-id') ||
            (el.querySelector('[id^="trophy"]')?.id ?? '')).toString();

        return {
          trophy_id: idAttr || '',
          title,
          description,
          rarity_percent: rarityPercent,
          rarity_bucket: bucket,
          hidden,
          icon: img?.src ?? '',
          source_url: href,
        };
      });
    },
    page.url(),
  );
  return rows.filter(r => r.title);
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
    userAgent: 'psn-oneoff-scraper/0.1 (+contact you@domain.com)'
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
