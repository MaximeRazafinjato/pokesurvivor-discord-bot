import { LookupError, render, resolveMention } from "./requests.js";

const PATTERN = /\[\[([^[\]]{1,150})\]\]/g;
const MAX_CARDS = 3;

export async function handleMessage(message) {
  if (message.author.bot) return;
  const queries = [...new Set([...message.content.matchAll(PATTERN)].map(match => match[1].trim()).filter(Boolean))];
  if (queries.length === 0) return;

  const requests = [];
  const notes = [];
  for (const query of queries.slice(0, MAX_CARDS)) {
    try {
      requests.push(resolveMention(query));
    } catch (error) {
      if (!(error instanceof LookupError)) throw error;
      notes.push(error.message);
    }
  }
  if (queries.length > MAX_CARDS) notes.push(`Only the first ${MAX_CARDS} cards are shown.`);

  if (requests.length) await message.channel.sendTyping();
  const author = message.member?.displayName ?? message.author.username;
  const files = await Promise.all(requests.map(request => render(request, author)));
  await message.reply({ content: notes.join("\n") || undefined, files, allowedMentions: { repliedUser: false } });
}
