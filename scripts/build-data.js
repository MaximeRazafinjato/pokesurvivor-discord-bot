import vm from "node:vm";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = "JPTER78/pokesurvivor";
const REQUIRED_FILES = ["data/pokedex.js", "data/types.js", "data/moves.js", "data/lang-en.js"];
const OPTIONAL_FILES = ["data/items.js", "data/upgrades.js", "data/changelog.js", "systems/gacha.js"];

const { values: options } = parseArgs({
  options: {
    commit: { type: "string", default: "main" },
    output: { type: "string" },
    force: { type: "boolean", default: false },
  },
});
const OUTPUT = options.output ? resolve(options.output) : fileURLToPath(new URL("../data/game.json", import.meta.url));

async function download(url, { optional = false } = {}) {
  const response = await fetch(url);
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`Téléchargement impossible : ${url} (HTTP ${response.status})`);
  return response;
}

async function builtCommit(file) {
  try {
    return JSON.parse(await readFile(file, "utf8")).source?.commit;
  } catch {
    return null;
  }
}

const commit = await (await download(`https://api.github.com/repos/${REPO}/commits/${options.commit}`)).json();
if (!options.force && await builtCommit(OUTPUT) === commit.sha) {
  console.log(`Données du jeu déjà à jour (commit ${commit.sha.slice(0, 7)})`);
  process.exit(0);
}

const raw = path => `https://raw.githubusercontent.com/${REPO}/${commit.sha}/${path}`;
const sources = await Promise.all([
  ...REQUIRED_FILES.map(async file => [file, await (await download(raw(`js/${file}`))).text()]),
  ...OPTIONAL_FILES.map(async file => [file, await (await download(raw(`js/${file}`), { optional: true }))?.text()]),
]);
const versionFile = await download(raw("version.json"), { optional: true });
const version = versionFile ? (await versionFile.json()).v : null;

const SPECIES_NAMES_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
const ENGLISH_LANGUAGE_ID = "9";

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

const speciesCsv = await (await download(SPECIES_NAMES_URL)).text();
const officialNames = new Map(speciesCsv.split("\n").slice(1).map(parseCsvLine)
  .filter(([, language]) => language === ENGLISH_LANGUAGE_ID)
  .map(([id, , name]) => [Number(id), name]));

const translations = {};
const G = {
  I18n: { add: entries => Object.assign(translations, entries) },
  U: { clamp: (value, min, max) => Math.min(max, Math.max(min, value)) },
};
const context = vm.createContext({ G });
sources.filter(([, code]) => code).forEach(([file, code]) => vm.runInContext(code, context, { filename: file }));

const missing = new Set();
const english = text => {
  if (translations[text]) return translations[text];
  missing.add(text);
  return text;
};

const STAT_KEYS = ["dmg", "cd", "count", "pierce", "radius", "arc", "width", "dur", "amount", "stacks", "stat", "speed", "homing"];

const moves = G.Moves.ALL.map(move => {
  const maxed = G.Moves.instance(move.id, move.maxLvl);
  const evolution = G.Moves.evoInfo(maxed, {});
  return {
    id: move.id,
    name: english(move.name),
    type: move.type,
    kind: move.kind,
    description: english(move.desc),
    stats: Object.fromEntries(STAT_KEYS.filter(key => move[key] != null).map(key => [key, move[key]])),
    upgrades: move.ups.map(upgrade => english(upgrade.t)),
    evolution: evolution && {
      name: english(evolution.name),
      requires: english(evolution.needName),
      effect: english(evolution.text),
    },
  };
});

const pokemon = G.DEX.map(entry => ({
  dex: entry.dex,
  name: officialNames.get(entry.dex) ?? english(entry.name),
  types: entry.types,
  hp: entry.hp,
  speed: entry.spd,
  attack: entry.atk,
  rarity: entry.rarity,
  generation: entry.gen,
  legendary: Boolean(entry.leg),
  starter: Boolean(entry.starter),
  startMove: G.Moves.startFor(entry),
}));

const typeChart = Object.fromEntries(
  Object.keys(G.Types.CHART).map(attacker => [
    attacker,
    Object.fromEntries(Object.keys(G.Types.CHART).map(defender => [defender, G.Types.mult(attacker, [defender])])),
  ])
);

const items = G.Items?.LIST.map(item => ({
  id: item.id,
  name: english(item.name),
  description: english(item.desc),
  effect: String(item.on),
}));

const upgrades = G.Upgrades?.LIST.map(upgrade => ({
  id: upgrade.id,
  name: english(upgrade.name),
  perLevel: english(upgrade.unit),
  maxLevel: upgrade.max,
  baseCost: upgrade.base,
  costGrowth: upgrade.grow,
}));

const gacha = G.Gacha && {
  rates: Object.fromEntries(G.Gacha.RATES),
  pity: G.Gacha.PITY_5,
  shinyOdds: Math.round(1 / G.Gacha.SHINY_RATE),
  refund: G.Gacha.REFUND,
};

const changelog = G.CHANGELOG?.map(entry => ({
  date: entry.d,
  title: entry.title[1],
  lines: [...entry.new ?? [], ...entry.chg ?? [], ...entry.fix ?? []].map(line => line[1]),
}));

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, JSON.stringify({
  source: { repo: REPO, commit: commit.sha, date: commit.commit.committer.date },
  version,
  pokemon,
  moves,
  typeChart,
  items,
  upgrades,
  gacha,
  changelog,
}));

console.log(`Données du jeu générées : ${pokemon.length} Pokémon, ${moves.length} attaques (commit ${commit.sha.slice(0, 7)})`);
if (missing.size) console.log(`Textes sans traduction anglaise (${missing.size}) :`, [...missing]);
