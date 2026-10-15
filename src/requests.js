import { AttachmentBuilder } from "discord.js";
import { canLearn, closestName, findMove, findPokemon } from "./game-data.js";
import { moveCard, pokemonCard, setCard } from "./cards.js";

export class LookupError extends Error {}

const MAX_MOVES = 4;

function notFound(query) {
  const suggestion = closestName(query);
  return new LookupError(`Couldn't find "${query}".${suggestion ? ` Did you mean **${suggestion}**?` : ""}`);
}

export function resolvePokemon(query) {
  const entry = findPokemon(query);
  if (!entry) throw notFound(query);
  return { kind: "pokemon", pokemon: entry };
}

export function resolveMove(query) {
  const move = findMove(query);
  if (!move) throw notFound(query);
  return { kind: "move", move };
}

export function resolveSet(pokemonName, moveNames, title = null) {
  const entry = findPokemon(pokemonName.trim());
  if (!entry) throw notFound(pokemonName.trim());
  const names = moveNames.map(name => name?.trim()).filter(Boolean);
  if (names.length === 0 || names.length > MAX_MOVES) throw new LookupError(`A set needs between 1 and ${MAX_MOVES} moves.`);
  const moves = names.map(name => {
    const move = findMove(name);
    if (!move) throw notFound(name);
    if (!canLearn(entry, move)) throw new LookupError(`${entry.name} can't learn **${move.name}** (${move.type} move).`);
    return move;
  });
  if (new Set(moves.map(move => move.id)).size !== moves.length) throw new LookupError("Each move can only be used once in a set.");
  return { kind: "set", pokemon: entry, moves, title };
}

export function resolveMention(text) {
  const entry = findPokemon(text);
  if (entry) return { kind: "pokemon", pokemon: entry };
  const move = findMove(text);
  if (move) return { kind: "move", move };
  const separator = text.lastIndexOf(":");
  if (separator > 0) return resolveSet(text.slice(0, separator), text.slice(separator + 1).split(","));
  throw notFound(text);
}

const attachment = (name, png) => new AttachmentBuilder(png, { name: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png` });

export async function render(request, author) {
  if (request.kind === "pokemon") return attachment(request.pokemon.name, await pokemonCard(request.pokemon));
  if (request.kind === "move") return attachment(request.move.name, await moveCard(request.move));
  return attachment(`${request.pokemon.name}-set`, await setCard({ ...request, author }));
}
