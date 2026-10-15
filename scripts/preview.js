import { mkdir, writeFile } from "node:fs/promises";
import { findMove, findPokemon } from "../src/game-data.js";
import { moveCard, pokemonCard, setCard } from "../src/cards.js";

const OUTPUT = new URL("../docs/", import.meta.url);
await mkdir(OUTPUT, { recursive: true });

const mewtwo = findPokemon("Mewtwo");
const outputs = {
  "set-mewtwo.png": await setCard({
    pokemon: mewtwo,
    moves: ["Confusion", "Swords Dance", "Harden", "Psychic"].map(findMove),
    title: "Glass cannon psychic",
    author: "a trainer",
  }),
  "pokemon-pikachu.png": await pokemonCard(findPokemon("Pikachu")),
  "move-psychic.png": await moveCard(findMove("Psychic")),
};

for (const [name, png] of Object.entries(outputs)) await writeFile(new URL(name, OUTPUT), png);
console.log("Aperçus générés :", Object.keys(outputs).join(", "));
