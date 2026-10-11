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

function sponsorKey(name) {
  return normalizedName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const SPONSOR_ASSETS = {
  emirates: "emirates", "qatar-airways": "qatarairways", "etihad-airways": "etihadairways", "turkish-airlines": "turkishairlines", iberia: "iberia",
  sony: "sony", playstation: "playstation", hp: "hp", lenovo: "lenovo", motorola: "motorola",
  "coca-cola": "cocacola", carlsberg: "carlsberg", "red-bull": "redbull", "monster-energy": "monsterenergy",
  bmw: "bmw", audi: "audi", toyota: "toyota", hyundai: "hyundai", volkswagen: "volkswagen", chevrolet: "chevrolet", ford: "ford", jeep: "jeep", nissan: "nissan", renault: "renault", fiat: "fiat",
  "american-express": "americanexpress", barclays: "barclays", nubank: "nubank", "mercado-pago": "mercadopago", picpay: "picpay"
};

const COLORED_SPONSOR_ASSETS = {
  "latam-airlines": "latamairlines", "gol-linhas-aereas": "gol", azul: "azul",
  spotify: "spotify", microsoft: "microsoft", google: "google", amazon: "amazon", samsung: "samsung", snapdragon: "snapdragon", tcl: "tcl",
  pepsi: "pepsi", heineken: "heineken", budweiser: "budweiser", amstel: "amstel", brahma: "brahma",
  "mercedes-benz": "mercedesbenz", byd: "byd",
  visa: "visa", mastercard: "mastercard", "standard-chartered": "standardchartered", santander: "santander", itau: "itau",
  "banco-do-brasil": "bancodobrasil", caixa: "caixa", inter: "inter"
};

const SPONSOR_COLORS = {
  emirates: "#d71921", "qatar-airways": "#5c0632", "etihad-airways": "#bd8b13", "turkish-airlines": "#c70a0c", iberia: "#d7192d",
  sony: "#111111", playstation: "#0070cc", hp: "#0096d6", lenovo: "#e2231a", motorola: "#5c92fa",
  "coca-cola": "#f40009", carlsberg: "#00843d", "red-bull": "#db0a40", "monster-energy": "#00a818",
  bmw: "#0066b1", audi: "#bb0a30", toyota: "#eb0a1e", hyundai: "#002c5f", volkswagen: "#151f5d", chevrolet: "#cd9834",
  ford: "#003478", jeep: "#101820", nissan: "#c3002f", renault: "#ffcc33", fiat: "#ad0c33",
  "american-express": "#2e77bc", barclays: "#00aeef", nubank: "#820ad1", "mercado-pago": "#009ee3", picpay: "#21c25e"
};

function sponsorLogoMarkup(name) {
  const key = sponsorKey(name);
  const coloredAsset = COLORED_SPONSOR_ASSETS[key];
  if (coloredAsset) return `<span class="sponsor-logo sponsor-logo--color"><img src="./assets/sponsors/${coloredAsset}.svg" alt=""></span>`;
  const asset = SPONSOR_ASSETS[key];
  if (asset) return `<span class="sponsor-logo sponsor-logo--asset" style="--sponsor-logo:url('./assets/sponsors/${asset}.svg');--sponsor-color:${SPONSOR_COLORS[key] || "currentColor"}"></span>`;
  return `<span class="sponsor-logo sponsor-logo--fallback"><b>${escapeHtml(name)}</b></span>`;
}

function sponsorMark(club, slot, className, duplicate = false) {
  const name = club?.sponsors?.[slot]?.name;
  if (!name) return "";
  const accessibility = duplicate ? ` aria-hidden="true"` : ` aria-label="${escapeHtml(name)}"`;
  return `<i class="${className}"${accessibility}>${sponsorLogoMarkup(name)}</i>`;
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

export function teamShirtMarkup(club, label = "", options = {}) {
  const kit = teamKit(club);
  const side = options.side === "back" ? "back" : "front";
  const clubName = club?.name ? `Camisa do ${club.name}` : "Camisa neutra";
  const front = `<span class="team-shirt-position">${escapeHtml(label)}</span>${sponsorMark(club, "chest", "team-shirt-sponsor team-shirt-sponsor--chest")}${sponsorMark(club, "master", "team-shirt-sponsor team-shirt-sponsor--master")}`;
  const back = `<span class="team-shirt-back-name">${escapeHtml(options.name || club?.shortName || "JOGADOR")}</span><span class="team-shirt-back-number">${escapeHtml(options.number || label || "10")}</span>${sponsorMark(club, "back", "team-shirt-sponsor team-shirt-sponsor--back")}`;
  return `<span class="team-shirt team-shirt--${kit.pattern} team-shirt--${side}" style="--shirt-primary:${kit.primary};--shirt-secondary:${kit.secondary};--shirt-ink:${kit.ink}" role="img" aria-label="${escapeHtml(`${clubName}, ${side === "back" ? "costas" : "frente"}`)}">${side === "back" ? back : front}${sponsorMark(club, "sleeve", "team-shirt-sponsor team-shirt-sponsor--sleeve team-shirt-sponsor--sleeve-left")}${sponsorMark(club, "sleeve", "team-shirt-sponsor team-shirt-sponsor--sleeve team-shirt-sponsor--sleeve-right", true)}</span>`;
}

export function teamUniformMarkup(club, options = {}) {
  const kit = teamKit(club);
  const side = options.side === "back" ? "back" : "front";
  const style = `--shirt-primary:${kit.primary};--shirt-secondary:${kit.secondary};--shirt-ink:${kit.ink}`;
  const shortsSponsor = side === "front" ? sponsorMark(club, "shorts", "team-shorts-sponsor") : "";
  const leftSockSponsor = sponsorMark(club, "socks", "team-sock-sponsor team-sock-sponsor--left");
  const rightSockSponsor = sponsorMark(club, "socks", "team-sock-sponsor team-sock-sponsor--right", true);
  return `<div class="team-uniform team-uniform--${side}" style="${style}">${teamShirtMarkup(club, "", { side, name: options.name, number: options.number })}<span class="team-shorts">${shortsSponsor}</span><span class="team-socks"><i class="team-sock team-sock--left">${leftSockSponsor}</i><i class="team-sock team-sock--right">${rightSockSponsor}</i></span></div>`;
}
