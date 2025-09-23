#!/usr/bin/env ts-node
import fs from "fs";
import path from "path";
import process from "process";

import { config as loadEnv } from "dotenv";
import {
  exchangeCodeForAccessToken,
  exchangeNpssoForCode,
  getTitleTrophies,
  getTitleTrophyGroups,
  makeUniversalSearch,
} from "psn-api";

loadEnv();

class CliError extends Error {
  constructor(message: string, public readonly exitCode: number) {
    super(message);
  }
}

type Authorization = Awaited<ReturnType<typeof exchangeCodeForAccessToken>>;

type TrophyRow = {
  trophy_id: string;
  name: string;
  description: string;
  rarity_bucket: string;
  earned_rate_pct: number | "";
  hidden: "true" | "false";
  icon: string;
  np_communication_id: string;
  group_id: string;
};

type TrophyGroupChoice = "all" | "base";

type CliOptions = {
  helpRequested: boolean;
  query?: string;
  group: TrophyGroupChoice;
  out?: string;
};

function printHelp(): void {
  const help = `Usage: ts-node psn_trophies.ts --query "<game name>" [--group all|base] [--out <file>]

Fetch PlayStation Network trophy data and export it as CSV.

Examples:
  npm start -- --query "Astro's Playroom"
  npm start -- --query "Ghost of Tsushima" --group base --out got_base.csv`;
  console.log(help);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { helpRequested: false, group: "all" };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        options.helpRequested = true;
        break;
      case "--query": {
        const value = argv[i + 1];
        if (!value) {
          throw new CliError("Missing value for --query", 2);
        }
        options.query = value;
        i += 1;
        break;
      }
      case "--group": {
        const value = argv[i + 1];
        if (!value) {
          throw new CliError("Missing value for --group", 2);
        }
        if (value !== "all" && value !== "base") {
          throw new CliError("--group must be 'all' or 'base'", 2);
        }
        options.group = value;
        i += 1;
        break;
      }
      case "--out": {
        const value = argv[i + 1];
        if (!value) {
          throw new CliError("Missing value for --out", 2);
        }
        options.out = value;
        i += 1;
        break;
      }
      default:
        throw new CliError(`Unknown argument: ${arg}`, 2);
    }
  }

  return options;
}

function ensureQuery(options: CliOptions): string {
  if (!options.query || !options.query.trim()) {
    throw new CliError("Missing required --query argument", 2);
  }
  return options.query.trim();
}

export async function authFromNpsso(npsso: string): Promise<Authorization> {
  if (!npsso) {
    throw new CliError("Missing PSN_NPSSO environment variable", 2);
  }
  try {
    const code = await exchangeNpssoForCode(npsso);
    return await exchangeCodeForAccessToken(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`PSN authentication failed: ${message}`, 3);
  }
}

export async function findNpCommunicationId(
  authorization: Authorization,
  gameQuery: string,
): Promise<string> {
  const searchDomains = [
    "ConceptGame",
    "GameContent",
    "UnifiedGameAndDlc",
    "Game",
    "SocialAllAccounts",
  ];
  const errors: string[] = [];

  for (const domain of searchDomains) {
    try {
      const searchResponse: any = await makeUniversalSearch(
        authorization,
        gameQuery,
        domain as any,
      );
      const domainResponses: any[] = searchResponse?.domainResponses ?? [];
      const candidates = domainResponses.flatMap((item) => item?.results ?? []);
      const gameResult = candidates.find((result) => {
        const type = (result?.mediaType ?? result?.type ?? "")
          .toString()
          .toLowerCase();
        return type.includes("game");
      });
      const npCommunicationId =
        gameResult?.id?.npCommunicationId ||
        gameResult?.id?.communicationId ||
        gameResult?.id?.value ||
        gameResult?.metadata?.npCommunicationId;
      if (npCommunicationId) {
        return npCommunicationId;
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
  }
  return groupId;
}

function parseEarnedRate(raw: any): number | "" {
  if (raw === undefined || raw === null || raw === "") {
    return "";
  }
  const value = Number.parseFloat(String(raw));
  return Number.isFinite(value) ? Number(value.toFixed(2)) : "";
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64) || "query";
}

export async function fetchTrophies(
  authorization: Authorization,
  npCommunicationId: string,
  group: TrophyGroupChoice,
): Promise<TrophyRow[]> {
  try {
    const trophyGroupsResponse: any = await getTitleTrophyGroups(authorization, npCommunicationId);
    const groups: any[] = trophyGroupsResponse?.trophyGroups ?? [];
    const filteredGroups = group === "base"
      ? groups.filter((item) => normalizeGroupId(item?.trophyGroupId) === "default")
      : groups;

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
  }

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, { encoding: "utf-8" });
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.helpRequested) {
      printHelp();
      return;
    }

    const query = ensureQuery(options);
    const outFile = options.out ?? `psn_${slugify(query)}_trophies.csv`;

    const npsso = process.env.PSN_NPSSO ?? "";
    const authorization = await authFromNpsso(npsso);
    const npCommunicationId = await findNpCommunicationId(authorization, query);
    const trophies = await fetchTrophies(authorization, npCommunicationId, options.group);

    if (trophies.length === 0) {
      console.warn("No trophies found for the specified title.");
    }

    const resolvedOut = path.resolve(outFile);
    writeCsv(resolvedOut, trophies);
    console.log(`Wrote ${trophies.length} trophies to ${resolvedOut}.`);
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      process.exit(error.exitCode);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Unexpected error: ${message}`);
    process.exit(1);
  }
}

main();
