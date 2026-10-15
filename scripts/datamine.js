import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { MessageFlags, REST, Routes } from "discord.js";

const CHANNEL_ID = process.env.DATAMINE_CHANNEL_ID ?? "1560001304586092754";
const REVIEWER_ID = process.env.DATAMINE_REVIEWER_ID ?? "221993039453749258";
const MAX_MESSAGE_LENGTH = 2000;
const MAX_LINES_PER_SECTION = 25;
const UNDETAILED_FILES = new Set(["js/app.min.js", "js/data/lang-en.js", "js/data/changelog.js", "js/data/sprites-meta.js"]);
const NO_PERCENT = new Set(["rarity", "generation", "max level"]);
const MOVE_STATS = {
  dmg: "damage", cd: "cooldown", count: "projectiles", pierce: "pierce", radius: "radius", arc: "arc", width: "width",
  dur: "duration", amount: "amount", stacks: "stacks", stat: "stat bonus", speed: "projectile speed", homing: "homing",
};

const { values: options } = parseArgs({
  options: {
    before: { type: "string", default: fileURLToPath(new URL("../state/datamine.json", import.meta.url)) },
    after: { type: "string", default: fileURLToPath(new URL("../data/game.json", import.meta.url)) },
    "dry-run": { type: "boolean", default: false },
  },
});

async function readJson(file) {
  try {
    return JSON.parse(await readFile(resolve(file), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Lecture impossible de ${file} : ${error.message}`);
  }
}

const shortCommit = data => data.source.commit.slice(0, 7);
const versionOf = data => data.version ?? data.source.commit;
const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

function display(value) {
  if (value === undefined || value === null) return "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.join("/");
  if (typeof value === "number") return String(Number(value.toFixed(4)));
  return `"${value}"`;
}

function describeChange(label, before, after) {
  const change = `${label} ${display(before)} → ${display(after)}`;
  if (typeof before !== "number" || typeof after !== "number" || before === 0 || NO_PERCENT.has(label)) return change;
  const percent = Math.round((after - before) / Math.abs(before) * 100);
  if (percent === 0) return change;
  return `${change} (${percent > 0 ? "+" : "−"}${Math.abs(percent)}%)`;
}

function compareRecords(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(label => JSON.stringify(before[label]) !== JSON.stringify(after[label]))
    .map(label => describeChange(label, before[label], after[label]));
}

function compareLists(before = [], after = [], { key, name, flatten, summary }) {
  const previous = new Map(before.map(entry => [key(entry), entry]));
  const current = new Map(after.map(entry => [key(entry), entry]));
  const lines = [];
  for (const [id, entry] of current) {
    const old = previous.get(id);
    if (!old) lines.push(`- New: **${name(entry)}**${summary ? ` (${summary(entry)})` : ""}`);
    else {
      const changes = compareRecords(flatten(old), flatten(entry));
      if (changes.length) lines.push(`- **${name(entry)}**: ${changes.join(", ")}`);
    }
  }
  for (const [id, entry] of previous) if (!current.has(id)) lines.push(`- Removed: **${name(entry)}**`);
  return lines;
}

const pokemonSection = {
  key: entry => entry.dex,
  name: entry => entry.name,
  summary: entry => `#${entry.dex}, ${entry.types.join("/")}, ${"★".repeat(entry.rarity)}`,
  flatten: entry => ({
    types: entry.types, HP: entry.hp, speed: entry.speed, attack: entry.attack, rarity: entry.rarity,
    generation: entry.generation, legendary: entry.legendary, starter: entry.starter, "starting move": entry.startMove,
  }),
};

const moveSection = {
  key: move => move.id,
  name: move => move.name,
  summary: move => `${move.type} ${move.kind}`,
  flatten: move => ({
    type: move.type,
    kind: move.kind,
    description: move.description,
    ...Object.fromEntries(Object.entries(move.stats).map(([stat, value]) => [MOVE_STATS[stat] ?? stat, value])),
    ...Object.fromEntries(move.upgrades.map((upgrade, index) => [`upgrade ${index + 1}`, upgrade])),
    evolution: move.evolution?.name,
    "evolution requirement": move.evolution?.requires,
    "evolution effect": move.evolution?.effect,
  }),
};

const itemSection = {
  key: item => item.id,
  name: item => item.name,
  summary: item => item.description,
  flatten: item => ({ description: item.description, "effect code": item.effect }),
};

const upgradeSection = {
  key: upgrade => upgrade.id,
  name: upgrade => upgrade.name,
  summary: upgrade => upgrade.perLevel,
  flatten: upgrade => ({
    "per level": upgrade.perLevel, "max level": upgrade.maxLevel, "base cost": upgrade.baseCost, "cost growth": upgrade.costGrowth,
  }),
};

function gachaRecord(gacha) {
  if (!gacha) return {};
  return {
    ...Object.fromEntries(Object.entries(gacha.rates).map(([rarity, rate]) => [`${rarity}★ rate (%)`, rate])),
    "5★ pity (pulls)": gacha.pity,
    "shiny odds (1 in N)": gacha.shinyOdds,
    ...Object.fromEntries(Object.entries(gacha.refund).map(([rarity, coins]) => [`${rarity}★ duplicate refund (coins)`, coins])),
  };
}

function compareTypeChart(before, after) {
  const lines = [];
  for (const [attacker, row] of Object.entries(after)) {
    for (const [defender, multiplier] of Object.entries(row)) {
      const previous = before[attacker]?.[defender];
      if (previous !== multiplier) lines.push(`- **${capitalize(attacker)} → ${capitalize(defender)}**: ×${display(previous)} → ×${display(multiplier)}`);
    }
  }
  return lines;
}

function newChangelogLines(before, after) {
  if (!before.changelog || !after.changelog) return [];
  const known = new Set(before.changelog.flatMap(entry => entry.lines));
  return after.changelog.flatMap(entry => {
    const added = entry.lines.filter(line => !known.has(line));
    return added.length ? [`__${entry.title}__ (${entry.date})`, ...added.map(line => `- ${line}`)] : [];
  });
}

async function fetchChangedCode(before, after) {
  const url = `https://api.github.com/repos/${after.source.repo}/compare/${before.source.commit}...${after.source.commit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Comparaison GitHub impossible : ${url} (HTTP ${response.status})`);
  const { files = [] } = await response.json();
  return files
    .filter(file => file.filename.startsWith("js/") && !UNDETAILED_FILES.has(file.filename))
    .map(file => `- \`${file.filename.slice(3)}\` (${file.status === "removed" ? "deleted" : `+${file.additions} −${file.deletions}`})`);
}

function section(title, lines) {
  if (lines.length === 0) return [];
  const shown = lines.slice(0, MAX_LINES_PER_SECTION);
  const hidden = lines.length - shown.length;
  return [`**${title}**`, ...shown, ...hidden > 0 ? [`- …and ${hidden} more`] : [], ""];
}

function report(before, after, changedCode) {
  const date = new Date(after.source.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const compareUrl = `https://github.com/${after.source.repo}/compare/${shortCommit(before)}...${shortCommit(after)}`;
  const balance = [
    ...section("Pokémon", compareLists(before.pokemon, after.pokemon, pokemonSection)),
    ...section("Moves", compareLists(before.moves, after.moves, moveSection)),
    ...section("Items", compareLists(before.items, after.items, itemSection)),
    ...section("Upgrades", compareLists(before.upgrades, after.upgrades, upgradeSection)),
    ...section("Gacha", compareRecords(gachaRecord(before.gacha), gachaRecord(after.gacha)).map(change => `- ${change}`)),
    ...section("Type chart", compareTypeChart(before.typeChart, after.typeChart)),
  ];
  return [
    `# PokéSurvivor update · ${date}`,
    `-# Datamined from the game's public code · version ${versionOf(after).slice(0, 10)} · [all changes](<${compareUrl}>)`,
    "",
    ...section("Patch notes", newChangelogLines(before, after)),
    ...balance.length ? balance : ["No balance changes: Pokémon, moves, items, upgrades and gacha are the same.", ""],
    ...section("Other code changes (not detailed)", changedCode),
  ];
}

function splitMessages(lines) {
  const messages = [];
  let current = "";
  for (const line of lines.map(text => text.slice(0, MAX_MESSAGE_LENGTH))) {
    if (current.length + line.length + 1 > MAX_MESSAGE_LENGTH) {
      messages.push(current.trimEnd());
      current = "";
    }
    current += `${line}\n`;
  }
  if (current.trim()) messages.push(current.trimEnd());
  return messages;
}

async function publish(messages) {
  const token = process.env.DISCORD_TOKEN
    ?? readFileSync(join(homedir(), ".discord-token.txt"), "utf8").replace(/^﻿/, "").trim();
  const rest = new REST().setToken(token);
  for (const content of messages) {
    await rest.post(Routes.channelMessages(CHANNEL_ID), {
      body: { content, flags: MessageFlags.SuppressEmbeds, allowed_mentions: { parse: [], users: [REVIEWER_ID] } },
    });
  }
}

async function remember(data) {
  await mkdir(dirname(resolve(options.before)), { recursive: true });
  await writeFile(resolve(options.before), JSON.stringify(data));
}

const after = await readJson(options.after);
if (!after) throw new Error(`Données du jeu introuvables : ${options.after}. Lance d'abord « pnpm run build-data ».`);
const before = await readJson(options.before);

if (!before) {
  if (!options["dry-run"]) await remember(after);
  console.log(`Datamine initialisé sur la version ${versionOf(after)} (commit ${shortCommit(after)}) : rien à publier`);
} else if (versionOf(before) === versionOf(after)) {
  console.log(`Pas de nouvelle version du jeu (toujours ${versionOf(after)})`);
} else if (after.source.date <= before.source.date) {
  console.log(`Les données du jeu (${shortCommit(after)}) sont plus anciennes que la dernière version annoncée (${shortCommit(before)}) : rien à publier`);
} else {
  const messages = splitMessages([`<@${REVIEWER_ID}>`, ...report(before, after, await fetchChangedCode(before, after))]);
  if (options["dry-run"]) {
    console.log(messages.join("\n\n──────── message suivant ────────\n\n"));
  } else {
    await publish(messages);
    await remember(after);
    console.log(`Datamine publié : ${shortCommit(before)} → ${shortCommit(after)} (${messages.length} message${messages.length > 1 ? "s" : ""})`);
  }
}
