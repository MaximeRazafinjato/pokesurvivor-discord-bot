import vm from "node:vm";
import { mkdir, writeFile } from "node:fs/promises";

const REPO = "JPTER78/pokesurvivor";
const FILES = ["pokedex.js", "types.js", "moves.js", "lang-en.js"];
const OUTPUT = new URL("../data/game.json", import.meta.url);

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Téléchargement impossible : ${url} (HTTP ${response.status})`);
  return response;
}

const commit = await (await download(`https://api.github.com/repos/${REPO}/commits/main`)).json();
const sources = await Promise.all(
  FILES.map(async file => (await download(`https://raw.githubusercontent.com/${REPO}/${commit.sha}/js/data/${file}`)).text())
);

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
sources.forEach((code, index) => vm.runInContext(code, context, { filename: FILES[index] }));

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

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(OUTPUT, JSON.stringify({
  source: { repo: REPO, commit: commit.sha, date: commit.commit.committer.date },
  pokemon,
  moves,
  typeChart,
}));

console.log(`Données du jeu générées : ${pokemon.length} Pokémon, ${moves.length} attaques (commit ${commit.sha.slice(0, 7)})`);
if (missing.size) console.log(`Textes sans traduction anglaise (${missing.size}) :`, [...missing]);
