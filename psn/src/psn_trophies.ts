<<<<<<< HEAD

#!/usr/bin/env ts-node
import fs from "fs";
import path from "path";
import process from "process";

import { config as loadEnv } from "dotenv";
=======
// src/psn_trophies.ts
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
>>>>>>> 9a45474 (Reworked PSN trophies so it actually returns data)
import {
  exchangeNpssoForCode,
  exchangeCodeForAccessToken,
  makeUniversalSearch,
  getTitleTrophyGroups,
  getTitleTrophies,
} from 'psn-api';

// -----------------------------
// Types & small utilities
// -----------------------------
type Authorization = Awaited<ReturnType<typeof exchangeCodeForAccessToken>>;

class CliError extends Error {
  exitCode: number;
  constructor(message: string, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

type TrophyRow = {
  trophy_id: number;
  name: string;
  description: string;
  rarity_bucket: string;
<<<<<<< HEAD
  earned_rate_pct: number | "";
  hidden: "true" | "false";
=======
  earned_rate_pct: number | ''; // keep numeric; '' if missing
  hidden: boolean;
>>>>>>> 9a45474 (Reworked PSN trophies so it actually returns data)
  icon: string;
  np_communication_id: string;
  group_id: string; // '' for base
};

const NPWR_RE = /NPWR[0-9A-Z]{5,}_[0-9]{2}/i;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'query'
  );
}

function toCsvValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '--query') out.query = args[++i];
    else if (a === '--group') out.group = args[++i];
    else if (a === '--out') out.out = args[++i];
    else if (a === '--npwr') out.npwr = args[++i];       // manual override
    else if (a === '--verbose') out.verbose = true;      // debug dump
  }
  return out;
}

function printHelp() {
  const cmd = `ts-node ${path.basename(process.argv[1])}`;
  console.log(
    [
      `Usage: ${cmd} --query "<game name>" [--group all|base] [--out file.csv] [--npwr NPWRxxxxx_yy] [--verbose]`,
      ``,
      `Required:`,
      `  --query "<game name>"     Title to search.`,
      ``,
      `Optional:`,
      `  --group all|base          Include DLC groups or only base. Default: all`,
      `  --out file.csv            Output CSV path. Default: psn_<slug>.csv`,
      `  --npwr NPWRxxxxx_yy       Skip search and use this NP Communication ID`,
      `  --verbose                 Dump raw search to search_debug.json on failure`,
      ``,
      `Env:`,
      `  PSN_NPSSO                 Your NPSSO string (in .env)`,
    ].join('\n')
  );
}

function ensureString(name: string, value: unknown, msg: string, exitCode = 2): string {
  if (typeof value !== 'string' || !value.trim()) throw new CliError(msg, exitCode);
  return value.trim();
}

// -----------------------------
// PSN helpers
// -----------------------------
async function authFromNpsso(npsso: string): Promise<Authorization> {
  try {
    const code = await exchangeNpssoForCode(npsso);
    return await exchangeCodeForAccessToken(code);
  } catch (err: any) {
    throw new CliError(`PSN authentication failed: ${err?.message || err}`, 3);
  }
}
<<<<<<< HEAD

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function looksLikeNpCommunicationId(value: string): boolean {
  return /^NPWR[0-9A-Z]{5,}_[0-9]{2}$/i.test(value.trim());
}

function extractNpCommunicationId(
  value: unknown,
  visited: Set<unknown> = new Set<unknown>(),
): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    if (looksLikeNpCommunicationId(trimmed)) {
      return trimmed.toUpperCase();
    }
    const embedded = trimmed.match(/NPWR[0-9A-Z]{5,}_[0-9]{2}/i);
    if (embedded) {
      return embedded[0].toUpperCase();
=======

function deepFindNpwr(obj: unknown): string | undefined {
  if (obj == null) return undefined;
  if (typeof obj === 'string') {
    const m = obj.match(NPWR_RE);
    return m ? m[0].toUpperCase() : undefined;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = deepFindNpwr(v);
      if (r) return r;
>>>>>>> 9a45474 (Reworked PSN trophies so it actually returns data)
    }
    return undefined;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (/npcommunicationid/i.test(k) && typeof v === 'string' && NPWR_RE.test(v)) {
        return (v as string).toUpperCase();
      }
    }
    for (const v of Object.values(obj as Record<string, unknown>)) {
      const r = deepFindNpwr(v);
      if (r) return r;
    }
  }
  return undefined;
}

<<<<<<< HEAD
type SearchDomain =
  | "ConceptGame"
  | "GameContent"
  | "UnifiedGameAndDlc"
  | "Game"
  | "SocialAllAccounts";

const SEARCH_DOMAINS: ReadonlyArray<SearchDomain> = [
  "ConceptGame",
  "GameContent",
  "UnifiedGameAndDlc",
  "Game",
  "SocialAllAccounts",
];

function collectDomainResults(searchResponse: unknown): unknown[] {
  if (!isRecord(searchResponse)) {
    return [];
  }

  const domainResponses = Array.isArray(searchResponse.domainResponses)
    ? searchResponse.domainResponses
    : [];

  const allResults: unknown[] = [];
  for (const domainResponse of domainResponses) {
    if (!isRecord(domainResponse)) {
      continue;
    }
    const results = Array.isArray(domainResponse.results)
      ? domainResponse.results
      : [];
    allResults.push(...results);
  }

  return allResults;
}

function pickBestResult(candidates: unknown[]): string | undefined {
  let bestMatch: { id: string; likelyGame: boolean } | undefined;

  for (const candidate of candidates) {
    const npCommunicationId = extractNpCommunicationId(candidate);
    if (!npCommunicationId) {
      continue;
    }

    const type = isRecord(candidate)
      ? String(candidate.mediaType ?? candidate.type ?? "").toLowerCase()
      : "";
    const isLikelyGame = type.includes("game");

    if (!bestMatch || (!bestMatch.likelyGame && isLikelyGame)) {
      bestMatch = { id: npCommunicationId, likelyGame: isLikelyGame };
    }

    if (isLikelyGame) {
      break;
    }
  }

  return bestMatch?.id;
}

export async function findNpCommunicationId(
=======
async function findNpCommunicationId(
>>>>>>> 9a45474 (Reworked PSN trophies so it actually returns data)
  authorization: Authorization,
  gameQuery: string,
  opts?: { verbose?: boolean }
): Promise<string> {
<<<<<<< HEAD
  const errors: string[] = [];

  for (const domain of SEARCH_DOMAINS) {
    try {
      const searchResponse = await makeUniversalSearch(
        authorization,
        gameQuery,
        domain as any,
      );
      const candidates = collectDomainResults(searchResponse);
      const match = pickBestResult(candidates);

      if (match) {
        return match;
      }

      errors.push(
        `Domain ${domain} did not return a result with an NP Communication ID.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Domain ${domain} failed: ${message}`);
    }
  }

  const combinedMessage =
    errors.length > 0
      ? errors.join(" ")
      : "No results contained an NP Communication ID.";
  throw new CliError(
    `Failed to resolve NP Communication ID: ${combinedMessage}`,
    3,
  );
}

function normalizeGroupId(groupId: string | undefined): string {
  if (!groupId || groupId === "default") {
    return "default";
=======
  // psn-api requires a domain literal; use SocialAllAccounts (widest)
  const tryQueries = Array.from(
    new Set([
      gameQuery,
      gameQuery.replace(/\bVI\b/gi, '6'),
      gameQuery.replace(/\b6\b/g, 'VI'),
    ])
  );

  for (const q of tryQueries) {
    const resp: any = await makeUniversalSearch(authorization, q, 'SocialAllAccounts');
    const id = deepFindNpwr(resp);
    if (id) return id;
    if (opts?.verbose) {
      try {
        fs.writeFileSync('search_debug.json', JSON.stringify(resp, null, 2));
        console.error(`[debug] Wrote search_debug.json for query variant "${q}"`);
      } catch {}
    }
>>>>>>> 9a45474 (Reworked PSN trophies so it actually returns data)
  }

  throw new CliError(
    `Failed to resolve NP Communication ID for "${gameQuery}". Try to pass --npwr <NPWR...>.`,
    3
  );
}

function sortRows(a: TrophyRow, b: TrophyRow): number {
  if (a.hidden !== b.hidden) return a.hidden ? 1 : -1; // hidden last
  const ar = typeof a.earned_rate_pct === 'number' ? a.earned_rate_pct : -1;
  const br = typeof b.earned_rate_pct === 'number' ? b.earned_rate_pct : -1;
  return br - ar;
}

function rowsToCsv(rows: TrophyRow[]): string {
  const headers: (keyof TrophyRow)[] = [
    'trophy_id',
    'name',
    'description',
    'rarity_bucket',
    'earned_rate_pct',
    'hidden',
    'icon',
    'np_communication_id',
    'group_id',
  ];
  return [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          let v = (row as any)[h] ?? '';
          return toCsvValue(v);
        })
        .join(',')
    ),
  ].join('\n');
}

async function fetchAllTrophies(
  authorization: Authorization,
  npCommunicationId: string,
  includeAllGroups: boolean
): Promise<TrophyRow[]> {
  const groupsRes: any = await getTitleTrophyGroups(authorization, npCommunicationId);
  const groups: any[] = groupsRes?.trophyGroups || [];
  const targetGroupIds =
    includeAllGroups && groups.length
      ? groups.map((g) => String(g?.trophyGroupId || 'default'))
      : ['default'];

<<<<<<< HEAD
    const targetGroups = filteredGroups.length > 0 ? filteredGroups : [{ trophyGroupId: "default" }];

    const allRows: TrophyRow[] = [];
    for (const groupInfo of targetGroups) {
      const groupId = normalizeGroupId(groupInfo?.trophyGroupId);
      const trophiesResponse: any = await getTitleTrophies(
        authorization,
        npCommunicationId,
        groupId,
      );
      const trophies: any[] = trophiesResponse?.trophies ?? [];
      for (const trophy of trophies) {
        const rarity = trophy?.trophyRare ?? trophy?.rarity ?? "";
        const earnedRate = parseEarnedRate(trophy?.trophyEarnedRate ?? trophy?.earnedRate ?? "");
        allRows.push({
          trophy_id: String(trophy?.trophyId ?? ""),
          name: trophy?.trophyName ?? trophy?.name ?? "",
          description: trophy?.trophyDetail ?? trophy?.detail ?? "",
          rarity_bucket: typeof rarity === "string" ? rarity : String(rarity ?? ""),
          earned_rate_pct: earnedRate,
          hidden: trophy?.trophyHidden ? "true" : "false",
          icon: trophy?.trophyIconUrl ?? trophy?.iconUrl ?? "",
          np_communication_id: npCommunicationId,
          group_id: groupId === "default" ? "" : groupId,
        });
      }
    }

    return sortRows(allRows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`Failed to fetch trophies: ${message}`, 3);
  }
}

function sortRows(rows: TrophyRow[]): TrophyRow[] {
  return [...rows].sort((a, b) => {
    const missingA = a.earned_rate_pct === "" ? 1 : 0;
    const missingB = b.earned_rate_pct === "" ? 1 : 0;
    if (missingA !== missingB) {
      return missingA - missingB;
    }
    if (a.hidden !== b.hidden) {
      return a.hidden === "true" ? 1 : -1;
    }
    const rateA = typeof a.earned_rate_pct === "number" ? a.earned_rate_pct : -Infinity;
    const rateB = typeof b.earned_rate_pct === "number" ? b.earned_rate_pct : -Infinity;
    return rateB - rateA;
  });
}

function toCsvValue(value: string | number | ""): string {
  const str = value === "" ? "" : String(value);
  if (str.includes("\"") || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(filePath: string, rows: TrophyRow[]): void {
  const headers = [
    "trophy_id",
    "name",
    "description",
    "rarity_bucket",
    "earned_rate_pct",
    "hidden",
    "icon",
    "np_communication_id",
    "group_id",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((header) => toCsvValue((row as any)[header] ?? ""));
    lines.push(values.join(","));
=======
  const all: TrophyRow[] = [];
  for (const groupId of targetGroupIds) {
    const res: any = await getTitleTrophies(authorization, npCommunicationId, groupId);
    const trophies: any[] = res?.trophies || [];
    for (const t of trophies) {
      const rate =
        typeof t?.trophyEarnedRate === 'string' && t.trophyEarnedRate.trim() !== ''
          ? Number(t.trophyEarnedRate)
          : '';
      all.push({
        trophy_id: Number(t?.trophyId ?? 0),
        name: String(t?.trophyName ?? ''),
        description: String(t?.trophyDetail ?? ''),
        rarity_bucket: String(t?.trophyRare ?? ''),
        earned_rate_pct: typeof rate === 'number' && !Number.isNaN(rate) ? rate : '',
        hidden: Boolean(t?.trophyHidden),
        icon: String(t?.trophyIconUrl ?? ''),
        np_communication_id: npCommunicationId,
        group_id: groupId === 'default' ? '' : groupId,
      });
    }
>>>>>>> 9a45474 (Reworked PSN trophies so it actually returns data)
  }

  return all.sort(sortRows);
}

// -----------------------------
// Main
// -----------------------------
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const query = ensureString('query', args.query, 'Missing --query "<game name>".', 2);
  const includeAllGroups = String(args.group || 'all').toLowerCase() !== 'base';
  const outPath = String(args.out || `psn_${slugify(query)}.csv`);
  const npsso = ensureString('PSN_NPSSO', process.env.PSN_NPSSO, 'Missing PSN_NPSSO in .env', 2);

  console.log('[info] Authenticating with PSN...');
  const authorization = await authFromNpsso(npsso);

  let npCommunicationId: string;
  if (typeof args.npwr === 'string' && NPWR_RE.test(args.npwr)) {
    npCommunicationId = args.npwr.toUpperCase();
    console.log(`[info] Using NP Communication ID from --npwr: ${npCommunicationId}`);
  } else {
    console.log(`[info] Resolving NP Communication ID for "${query}"...`);
    npCommunicationId = await findNpCommunicationId(authorization, query, { verbose: !!args.verbose });
    console.log(`[info] Found NP Communication ID: ${npCommunicationId}`);
  }

  console.log(`[info] Fetching trophies (${includeAllGroups ? 'all groups' : 'base only'})...`);
  const rows = await fetchAllTrophies(authorization, npCommunicationId, includeAllGroups);

  console.log(`[info] Writing CSV: ${outPath} (${rows.length} rows)`);
  fs.writeFileSync(path.resolve(outPath), rowsToCsv(rows), 'utf8');
  console.log('[done] Success.');
}

<<<<<<< HEAD
main();

=======
main().catch((err) => {
  if (err instanceof CliError) {
    console.error(err.message);
    process.exit(err.exitCode);
  }
  console.error(`Unexpected error: ${err?.message || err}`);
  process.exit(3);
});
>>>>>>> 9a45474 (Reworked PSN trophies so it actually returns data)
