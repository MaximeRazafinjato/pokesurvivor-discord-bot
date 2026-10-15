import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { autocomplete, definitions, execute } from "./commands.js";
import { handleMessage } from "./mentions.js";
import { source } from "./game-data.js";

const GUILD_ID = process.env.GUILD_ID ?? "1559995659187257344";
const token = process.env.DISCORD_TOKEN
  ?? readFileSync(join(homedir(), ".discord-token.txt"), "utf8").replace(/^﻿/, "").trim();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once(Events.ClientReady, async ready => {
  await ready.application.commands.set(definitions, GUILD_ID);
  console.log(`PokéBot connecté en tant que ${ready.user.tag} · données du jeu : commit ${source.commit.slice(0, 7)} du ${source.date}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isAutocomplete()) await autocomplete(interaction);
    else if (interaction.isChatInputCommand()) await execute(interaction);
  } catch (error) {
    console.error("Erreur pendant le traitement d'une commande :", error);
    if (!interaction.isRepliable()) return;
    const reply = { content: "Something went wrong while making that card.", flags: MessageFlags.Ephemeral };
    await (interaction.deferred || interaction.replied ? interaction.followUp(reply) : interaction.reply(reply)).catch(() => {});
  }
});

client.on(Events.MessageCreate, message => {
  handleMessage(message).catch(error => console.error("Erreur pendant le traitement d'un message :", error));
});

client.login(token).catch(error => {
  const reason = /disallowed intents/i.test(error.message)
    ? "Connexion refusée : active « Message Content Intent » dans le Developer Portal (onglet Bot)."
    : `Connexion à Discord impossible : ${error.message}`;
  console.error(reason);
  process.exit(1);
});
