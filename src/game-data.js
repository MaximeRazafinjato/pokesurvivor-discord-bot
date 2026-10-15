import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../data/game.json", import.meta.url), "utf8"));

export const source = data.source;
export const pokemon = data.pokemon;
export const moves = data.moves;

const normalize = text => text.toLowerCase().replace(/♀/g, "f").replace(/♂/g, "m")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const pokemonByKey = new Map(pokemon.map(entry => [normalize(entry.name), entry]));
const moveByKey = new Map(moves.flatMap(move => [[normalize(move.name), move], [normalize(move.id), move]]));

export function findPokemon(query) {
  const key = normalize(query);
  return pokemonByKey.get(key) ?? (/^\d+$/.test(key) ? pokemon.find(entry => entry.dex === Number(key)) : undefined);
}

export function findMove(query) {
  return moveByKey.get(normalize(query));
}

export function learnableMoves(entry) {
  const types = new Set(["normal", ...entry.types]);
  return moves.filter(move => types.has(move.type));
}

export function canLearn(entry, move) {
  return move.type === "normal" || entry.types.includes(move.type);
}

export function learnerCount(move) {
  return move.type === "normal" ? pokemon.length : pokemon.filter(entry => entry.types.includes(move.type)).length;
}

function distance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

export function closestName(query) {
  const key = normalize(query);
  const candidates = [...pokemon, ...moves].map(item => ({ name: item.name, score: distance(key, normalize(item.name)) }));
  const best = candidates.sort((a, b) => a.score - b.score)[0];
  return best && best.score <= Math.max(2, Math.floor(key.length / 3)) ? best.name : null;
}

const searchKeys = new Map([...pokemon, ...moves].map(item => [item, normalize(item.name)]));

export function search(list, query, limit = 25) {
  const key = normalize(query);
  const starts = [];
  const contains = [];
  for (const item of list) {
    const name = searchKeys.get(item);
    if (name.startsWith(key)) starts.push(item);
    else if (name.includes(key)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, limit);
}
