import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { findPokemon, learnableMoves, moves, pokemon, search } from "./game-data.js";
import { LookupError, render, resolveMove, resolvePokemon, resolveSet } from "./requests.js";

const MOVE_SLOTS = ["move1", "move2", "move3", "move4"];

const nameOption = (option, description) => option.setName("name").setDescription(description).setRequired(true).setAutocomplete(true);

const setCommand = new SlashCommandBuilder()
  .setName("set")
  .setDescription("Share a set: a Pokémon and up to 4 moves")
  .addStringOption(option => option.setName("pokemon").setDescription("The Pokémon").setRequired(true).setAutocomplete(true));
MOVE_SLOTS.forEach((slot, index) => setCommand.addStringOption(option => option
  .setName(slot).setDescription(`Move in slot ${index + 1}`).setRequired(index === 0).setAutocomplete(true)));
setCommand.addStringOption(option => option.setName("title").setDescription("A name for your set").setMaxLength(60));

export const definitions = [
  new SlashCommandBuilder().setName("pokemon").setDescription("Show a Pokémon's card")
    .addStringOption(option => nameOption(option, "Pokémon name")),
  new SlashCommandBuilder().setName("move").setDescription("Show a move's card")
    .addStringOption(option => nameOption(option, "Move name")),
  setCommand,
].map(command => command.toJSON());

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  let candidates = moves;
  if (interaction.commandName === "pokemon" || focused.name === "pokemon") candidates = pokemon;
  if (interaction.commandName === "set" && MOVE_SLOTS.includes(focused.name)) {
    const entry = findPokemon(interaction.options.getString("pokemon") ?? "");
    if (entry) candidates = learnableMoves(entry);
  }
  await interaction.respond(search(candidates, focused.value).map(item => ({ name: item.name, value: item.name })));
}

function resolve(interaction) {
  const { options } = interaction;
  if (interaction.commandName === "pokemon") return resolvePokemon(options.getString("name"));
  if (interaction.commandName === "move") return resolveMove(options.getString("name"));
  return resolveSet(options.getString("pokemon"), MOVE_SLOTS.map(slot => options.getString(slot)), options.getString("title"));
}

export async function execute(interaction) {
  let request;
  try {
    request = resolve(interaction);
  } catch (error) {
    if (!(error instanceof LookupError)) throw error;
    await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  const author = interaction.member?.displayName ?? interaction.user.username;
  await interaction.editReply({ files: [await render(request, author)] });
}
