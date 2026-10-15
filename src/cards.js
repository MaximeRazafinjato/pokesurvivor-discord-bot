import { readFileSync } from "node:fs";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { learnableMoves, learnerCount, findMove } from "./game-data.js";
import { portrait } from "./portraits.js";

const font = file => readFileSync(new URL(`../assets/fonts/${file}`, import.meta.url));
const FONTS = [
  { name: "Pixel", data: font("Jersey10-400.ttf"), weight: 400 },
  { name: "Pixel", data: font("Jersey10-400.ttf"), weight: 700 },
  { name: "Label", data: font("Silkscreen-700.ttf"), weight: 700 },
  { name: "Inter", data: font("Inter-400.ttf"), weight: 400 },
  { name: "Inter", data: font("Inter-600.ttf"), weight: 600 },
  { name: "Inter", data: font("Inter-700.ttf"), weight: 700 },
];

const WIDTH = 1000;
const COLORS = {
  background: "#10172e",
  text: "#f2f4fb",
  muted: "#9aa6c7",
  panel: "rgba(255,255,255,0.06)",
  line: "rgba(255,255,255,0.14)",
  gold: "#ffcb05",
  key: "#0b1024",
};
const TYPE_COLORS = {
  normal: "#a8a77a", fire: "#ee8130", water: "#6390f0", electric: "#f7d02c", grass: "#7ac74c", ice: "#96d9d6",
  fighting: "#c22e28", poison: "#a33ea1", ground: "#e2bf65", flying: "#a98ff3", psychic: "#f95587", bug: "#a6b91a",
  rock: "#b6a136", ghost: "#735797", dragon: "#6f35fc", dark: "#705746", steel: "#b7b7ce", fairy: "#d685ad",
};
const KIND_LABELS = {
  projectile: "Projectile", melee: "Melee", beam: "Beam", orbit: "Orbit", nova: "Nova", aura: "Aura", buff: "Buff",
  boomerang: "Boomerang", chain: "Chain", mine: "Mine", meteor: "Meteor", turret: "Turret", dash: "Dash",
  trail: "Trail", cone: "Cone",
};
const COUNT_LABELS = {
  projectile: "Projectiles", nova: "Projectiles", cone: "Shots", orbit: "Orbs", chain: "Jumps", mine: "Mines",
  meteor: "Meteors", turret: "Turrets", boomerang: "Boomerangs",
};
const STAT_NAMES = { atk: "Attack", spd: "Speed", def: "Defense", hp: "HP", rgn: "Regen", cd: "Cooldown" };
const FOOTER = "PokéSurvivor Community";
const typeColor = type => TYPE_COLORS[type] ?? TYPE_COLORS.normal;
const kindLabel = kind => KIND_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);

const h = (type, style, ...children) => ({
  type,
  props: { style: { display: "flex", boxSizing: "border-box", ...style }, children: children.flat().filter(child => child != null && child !== false) },
});
const image = (src, size, style = {}) => ({ type: "img", props: { src, width: size, height: size, style } });
const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);
const percent = value => `${Math.round(value * 100)}%`;
const seconds = value => `${Number(value.toFixed(2))}s`;

function mix(hex, other, ratio) {
  const parse = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
  const [a, b] = [parse(hex), parse(other)];
  return `rgb(${a.map((channel, index) => Math.round(channel * ratio + b[index] * (1 - ratio))).join(",")})`;
}

function readableOn(hex) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#1a1d29" : "#ffffff";
}

function typeBadge(type, size = "large") {
  const color = typeColor(type);
  const large = size === "large";
  return h("div", {
    backgroundColor: color, color: readableOn(color), borderRadius: 999, padding: large ? "6px 20px" : "3px 12px",
    fontFamily: "Label", fontWeight: 700, fontSize: large ? 22 : 14,
  }, type.toUpperCase());
}

function tag(text, color = COLORS.gold) {
  return h("div", {
    border: `2px solid ${color}`, color, borderRadius: 999, padding: "5px 16px", fontFamily: "Label", fontSize: 16,
    fontWeight: 700,
  }, text);
}

function statPill(label, value) {
  return h("div", { flexDirection: "column", backgroundColor: COLORS.panel, borderRadius: 16, padding: "10px 18px", gap: 2 },
    h("div", { fontSize: 15, fontWeight: 600, color: COLORS.muted, letterSpacing: 1.5 }, label.toUpperCase()),
    h("div", { fontFamily: "Pixel", fontSize: 38, lineHeight: 1 }, String(value)));
}

function rarityPill(rarity) {
  const dots = Array.from({ length: 5 }, (_, index) => h("div", {
    width: 16, height: 16, borderRadius: 4, transform: "rotate(45deg)",
    backgroundColor: index < rarity ? COLORS.gold : "rgba(255,255,255,0.15)",
  }));
  return h("div", { flexDirection: "column", backgroundColor: COLORS.panel, borderRadius: 16, padding: "10px 18px", gap: 10 },
    h("div", { fontSize: 15, fontWeight: 600, color: COLORS.muted, letterSpacing: 1.5 }, "GACHA RARITY"),
    h("div", { gap: 12, padding: "4px 2px" }, dots));
}

function cardFrame(color, ...children) {
  return h("div", {
    width: WIDTH, flexDirection: "column", gap: 28, padding: 44, borderRadius: 36, color: COLORS.text,
    fontFamily: "Inter", backgroundColor: COLORS.background,
    backgroundImage: `linear-gradient(135deg, ${mix(color, COLORS.background, 0.45)} 0%, ${COLORS.background} 58%)`,
  }, children);
}

function footer(left) {
  return h("div", { justifyContent: "space-between", fontSize: 18, color: COLORS.muted, borderTop: `2px solid ${COLORS.line}`, paddingTop: 18 },
    h("div", {}, left ?? ""), h("div", { fontFamily: "Pixel", fontSize: 26, lineHeight: 1 }, FOOTER));
}

function pokemonHeader(entry, portraitSource, eyebrow) {
  const color = typeColor(entry.types[0]);
  const visual = portraitSource
    ? image(portraitSource, 200, { borderRadius: 24 })
    : h("div", { fontFamily: "Pixel", fontSize: 48, color: COLORS.muted }, `#${entry.dex}`);
  return h("div", { gap: 32, alignItems: "center" },
    h("div", {
      width: 216, height: 216, borderRadius: 32, border: `8px solid ${color}`, backgroundColor: mix(color, COLORS.background, 0.25),
      alignItems: "center", justifyContent: "center",
    }, visual),
    h("div", { flexDirection: "column", gap: 14, flex: 1 },
      eyebrow,
      h("div", { alignItems: "flex-end", gap: 16 },
        h("div", { fontFamily: "Pixel", fontSize: 84, lineHeight: 0.9 }, entry.name),
        h("div", { fontFamily: "Pixel", fontSize: 40, color: COLORS.muted, paddingBottom: 4 }, `#${entry.dex}`)),
      h("div", { gap: 10, alignItems: "center", flexWrap: "wrap" },
        entry.types.map(type => typeBadge(type)),
        h("div", { fontSize: 20, color: COLORS.muted, padding: "0 6px" }, `Gen ${entry.generation}`),
        entry.legendary && tag("LEGENDARY"),
        entry.starter && tag("STARTER", COLORS.text)),
      h("div", { gap: 12 },
        statPill("HP", entry.hp), statPill("Speed", entry.speed), statPill("Attack", `×${entry.attack.toFixed(2)}`),
        rarityPill(entry.rarity))));
}

function moveSummary(move) {
  const { stats } = move;
  if (move.kind === "buff") {
    return `+${percent(stats.amount)} ${STAT_NAMES[stats.stat] ?? capitalize(stats.stat)}/stack · ${stats.stacks} stacks · ${seconds(stats.dur)}`;
  }
  const parts = [`${stats.dmg} dmg`, `${seconds(stats.cd)} cooldown`];
  if (stats.count > 1 && COUNT_LABELS[move.kind]) parts.push(`${stats.count} ${COUNT_LABELS[move.kind].toLowerCase()}`);
  return parts.join(" · ");
}

function moveSlot(move, index) {
  return h("div", { width: 447, backgroundColor: COLORS.panel, borderRadius: 22, padding: 20, gap: 16 },
    h("div", {
      width: 56, height: 56, borderRadius: 14, backgroundColor: COLORS.key, border: `2px solid ${COLORS.line}`,
      alignItems: "center", justifyContent: "center", fontFamily: "Pixel", fontSize: 38, flexShrink: 0,
    }, String(index + 1)),
    h("div", { flexDirection: "column", gap: 8, flex: 1 },
      h("div", { fontFamily: "Pixel", fontSize: 42, lineHeight: 0.9 }, move.name),
      h("div", { gap: 10, alignItems: "center" },
        typeBadge(move.type, "small"),
        h("div", { fontSize: 16, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.5 }, kindLabel(move.kind).toUpperCase())),
      h("div", { fontSize: 19 }, moveSummary(move)),
      move.evolution && h("div", { fontSize: 17, color: COLORS.gold, fontWeight: 600 }, `Max level → ${move.evolution.name}`)));
}

function sectionTitle(text) {
  return h("div", { fontFamily: "Label", fontWeight: 700, fontSize: 20, color: COLORS.muted }, text);
}

async function render(element) {
  const svg = await satori(element, { width: WIDTH, fonts: FONTS });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();
  return sharp(png).png({ palette: true, quality: 95, effort: 10, compressionLevel: 9 }).toBuffer();
}

export async function setCard({ pokemon: entry, moves, title, author }) {
  const source = await portrait(entry.dex, ["Determined", "Normal"]);
  const eyebrow = h("div", { gap: 14, alignItems: "center" },
    h("div", {
      backgroundColor: COLORS.gold, color: "#1a1d29", borderRadius: 8, padding: "4px 12px", fontFamily: "Label",
      fontWeight: 700, fontSize: 16,
    }, "SET"),
    title && h("div", { fontSize: 22, fontWeight: 600, color: COLORS.text }, title));
  return render(cardFrame(typeColor(entry.types[0]),
    pokemonHeader(entry, source, eyebrow),
    h("div", { flexWrap: "wrap", gap: 18 }, moves.map(moveSlot)),
    footer(author ? `Shared by ${author}` : null)));
}

export async function pokemonCard(entry) {
  const source = await portrait(entry.dex);
  const learnable = learnableMoves(entry);
  const groups = ["normal", ...entry.types.filter(type => type !== "normal")].map(type => ({
    type, moves: learnable.filter(move => move.type === type),
  }));
  return render(cardFrame(typeColor(entry.types[0]),
    pokemonHeader(entry, source),
    sectionTitle(`LEARNABLE MOVES · ${learnable.length}`),
    h("div", { flexDirection: "column", gap: 14 }, groups.map(group => h("div", { gap: 14, alignItems: "flex-start" },
      h("div", { width: 130, flexShrink: 0 }, typeBadge(group.type, "small")),
      h("div", { flexWrap: "wrap", gap: 8, flex: 1 }, group.moves.map(move => h("div", {
        backgroundColor: COLORS.panel, borderRadius: 10, padding: "6px 12px", fontSize: 19, gap: 8, alignItems: "center",
      }, h("div", { fontWeight: 600 }, move.name), h("div", { fontSize: 14, color: COLORS.muted, fontWeight: 700, letterSpacing: 1 }, kindLabel(move.kind).toUpperCase()))))))),
    footer(`Starts with ${findMove(entry.startMove)?.name ?? entry.startMove}`)));
}

function moveStatPills(move) {
  const { stats } = move;
  if (move.kind === "buff") {
    return [
      statPill("Boosts", STAT_NAMES[stats.stat] ?? capitalize(stats.stat)),
      statPill("Per stack", `+${percent(stats.amount)}`),
      statPill("Max stacks", stats.stacks),
      statPill("Duration", seconds(stats.dur)),
    ];
  }
  return [
    statPill("Damage", stats.dmg),
    statPill("Cooldown", seconds(stats.cd)),
    stats.count > 1 && COUNT_LABELS[move.kind] && statPill(COUNT_LABELS[move.kind], stats.count),
    stats.pierce > 0 && statPill("Pierce", stats.pierce),
    stats.dur && statPill("Duration", seconds(stats.dur)),
  ];
}

export async function moveCard(move) {
  const color = typeColor(move.type);
  const learners = learnerCount(move);
  const learnedBy = move.type === "normal"
    ? "Learned by every Pokémon"
    : `Learned by every ${capitalize(move.type)}-type Pokémon (${learners})`;
  return render(cardFrame(color,
    h("div", { gap: 32, alignItems: "center" },
      h("div", {
        width: 216, height: 216, borderRadius: 32, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
        backgroundImage: `linear-gradient(160deg, ${color} 0%, ${mix(color, COLORS.background, 0.45)} 100%)`,
      },
        h("div", { fontFamily: "Pixel", fontSize: 50, lineHeight: 1, color: readableOn(color) }, kindLabel(move.kind)),
        h("div", { fontFamily: "Label", fontWeight: 700, fontSize: 16, color: readableOn(color), opacity: 0.85 }, move.type.toUpperCase())),
      h("div", { flexDirection: "column", gap: 14, flex: 1 },
        h("div", { gap: 14, alignItems: "center" },
          h("div", {
            backgroundColor: COLORS.text, color: "#1a1d29", borderRadius: 8, padding: "4px 12px", fontFamily: "Label",
            fontWeight: 700, fontSize: 16,
          }, "MOVE")),
        h("div", { fontFamily: "Pixel", fontSize: 84, lineHeight: 0.9 }, move.name),
        h("div", { gap: 10, alignItems: "center" },
          typeBadge(move.type),
          h("div", { fontSize: 20, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.5, padding: "0 6px" }, kindLabel(move.kind).toUpperCase())),
        h("div", { fontSize: 22, color: COLORS.text, lineHeight: 1.35 }, move.description))),
    h("div", { gap: 12, flexWrap: "wrap" }, moveStatPills(move)),
    sectionTitle("UPGRADES"),
    h("div", { flexDirection: "column", gap: 10 }, move.upgrades.map((text, index) => h("div", { gap: 14, alignItems: "center" },
      h("div", {
        width: 70, justifyContent: "center", backgroundColor: COLORS.panel, borderRadius: 8, padding: "4px 0",
        fontFamily: "Pixel", fontSize: 28, lineHeight: 1,
      }, `Lv ${index + 2}`),
      h("div", { fontSize: 21 }, text)))),
    move.evolution && h("div", {
      flexDirection: "column", gap: 6, border: `2px solid ${COLORS.gold}`, borderRadius: 20, padding: "18px 22px",
      backgroundColor: "rgba(255,203,5,0.07)",
    },
      h("div", { fontFamily: "Label", fontWeight: 700, fontSize: 16, color: COLORS.gold }, "MAX LEVEL EVOLUTION"),
      h("div", { fontFamily: "Pixel", fontSize: 48, lineHeight: 1 }, move.evolution.name),
      h("div", { fontSize: 21 }, capitalize(move.evolution.effect)),
      h("div", { fontSize: 18, color: COLORS.muted }, `Needs the ${move.evolution.requires} upgrade during the run`)),
    footer(learnedBy)));
}
