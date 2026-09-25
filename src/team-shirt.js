import { escapeHtml } from "./html.js";

const SPECIAL_KITS = [
  { names: ["botafogo", "atletico mineiro", "juventus", "newcastle", "udinese"], pattern: "stripes", primary: "#0a0a0a", secondary: "#ffffff" },
  { names: ["flamengo"], pattern: "hoops", primary: "#c52613", secondary: "#090909" },
  { names: ["fluminense"], pattern: "stripes", primary: "#7a263a", secondary: "#00613c" },
  { names: ["gremio"], pattern: "stripes", primary: "#42a5d5", secondary: "#111111" },
  { names: ["barcelona"], pattern: "stripes", primary: "#004d98", secondary: "#a50044" },
  { names: ["internazionale", "inter de milao", "inter milan"], pattern: "stripes", primary: "#1266b1", secondary: "#101010" },
  { names: ["milan"], pattern: "stripes", primary: "#d71920", secondary: "#111111" },
  { names: ["vasco"], pattern: "diagonal", primary: "#ffffff", secondary: "#111111" }
];

function normalizedName(value = "") {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function safeColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function textColor(primary) {
  const [red, green, blue] = [1, 3, 5].map(index => Number.parseInt(primary.slice(index, index + 2), 16));
  const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
  return luminance > 165 ? "#102018" : "#ffffff";
}

export function teamKit(club) {
  const name = normalizedName(club?.name);
  const special = SPECIAL_KITS.find(kit => kit.names.some(candidate => name === candidate || name.startsWith(`${candidate} `)));
  const primary = safeColor(special?.primary || club?.colors?.[0], "#66736b");
  const secondary = safeColor(special?.secondary || club?.colors?.[1], "#eef1ec");
  return {
    pattern: special?.pattern || "solid",
    primary,
    secondary,
    ink: textColor(primary)
  };
}

export function teamShirtMarkup(club, label = "") {
  const kit = teamKit(club);
  const clubName = club?.name ? `Camisa do ${club.name}` : "Camisa neutra";
  return `<span class="team-shirt team-shirt--${kit.pattern}" style="--shirt-primary:${kit.primary};--shirt-secondary:${kit.secondary};--shirt-ink:${kit.ink}" role="img" aria-label="${escapeHtml(clubName)}"><span>${escapeHtml(label)}</span></span>`;
}
