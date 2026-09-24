import { estimatePlayer, BALANCE_VERSION } from "./player-balance.js";
import { validateDatabase } from "./database.js";

export const MAX_CSV_BYTES = 256 * 1024;
const positions = { G: "GOL", GK: "GOL", GOL: "GOL", L: "LAT", FB: "LAT", LAT: "LAT", Z: "ZAG", CB: "ZAG", ZAG: "ZAG", V: "VOL", DM: "VOL", VOL: "VOL", M: "MC", MF: "MC", MC: "MC", MEI: "MC", P: "ATA", WG: "ATA", A: "ATA", FW: "ATA", ATA: "ATA" };

// CSV records may contain escaped quotes, separators and line breaks inside quotes.
export function readCsv(source) {
  const records = [];
  let row = [], field = "", quoted = false, closed = false, line = 1, start = 1;
  const pushField = () => { row.push(field.trim()); field = ""; closed = false; };
  const pushRow = () => { pushField(); if (row.some(Boolean)) records.push({ cells: row, line: start }); row = []; start = line + 1; };
  source = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else if (quoted) { quoted = false; closed = true; }
      else if (!field.trim() && !closed) { field = ""; quoted = true; }
      else throw new Error(`Linha ${line}: aspas em posição inválida.`);
    } else if (quoted) { field += char; }
    else if (char === ";") pushField();
    else if (char === "\n") pushRow();
    else if (closed && char.trim()) throw new Error(`Linha ${line}: use ponto e vírgula após fechar as aspas.`);
    else field += char;
    if (char === "\n") line++;
  }
  if (quoted) throw new Error(`Linha ${start}: há um campo com aspas sem fechamento.`);
  pushRow();
  return records;
}

function clubId(name, country) {
  const slug = `${country}-${name}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let hash = 2166136261;
  for (const char of `${country}:${name}`.normalize("NFC")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `c-${slug.slice(0, 24)}-${(hash >>> 0).toString(36)}`;
}

export function parseClubCsv(source, filename = "time.csv") {
  const errors = [], warnings = [];
  if (!/\.csv$/i.test(filename)) return { ok: false, errors: ["Selecione um arquivo .csv. Arquivos .m26 são binários e precisam ser exportados como CSV no jogo de origem."], warnings };
  if (new TextEncoder().encode(source).length > MAX_CSV_BYTES) return { ok: false, errors: ["Cada CSV deve ter no máximo 256 KB."], warnings };
  let records;
  try { records = readCsv(source); } catch (error) { return { ok: false, errors: [error.message], warnings }; }
  if (!records.length) return { ok: false, errors: ["O arquivo está vazio."], warnings };
  const integer = (value, label, min, max, fallback) => {
    if (!value && fallback !== undefined) return fallback;
    if (!/^\d+$/.test(value || "") || Number(value) < min || Number(value) > max) { errors.push(`${label}: informe um inteiro de ${min} a ${max}.`); return min; }
    return Number(value);
  };
  const code = (value, label, fallback = "BRA") => {
    if (!value) return fallback;
    if (!/^[A-Z]{3}$/.test(value)) errors.push(`${label}: use uma sigla de país com três letras maiúsculas.`);
    return value;
  };
  const yesNo = (value, label, fallback = false) => {
    if (!value) return fallback;
    if (!["S", "Y", "N"].includes(value.toUpperCase())) errors.push(`${label}: use S, Y ou N.`);
    return ["S", "Y"].includes(value.toUpperCase());
  };
  const header = records[0].cells;
  if (header.length > 10) errors.push("Linha do clube: use as nove colunas do modelo (a décima coluna legada é opcional).");
  if (header[9]) warnings.push("A décima coluna do clube foi ignorada: o campeonato será montado com os times escolhidos aqui.");
  const name = header[0], country = code(header[1], "País do clube");
  const strength = integer(header[2], "Força do clube", 1, 99, 65);
  const color = (value, fallback) => value ? `#${value.replace(/^#/, "")}` : fallback;
  const id = clubId(name, country);
  const club = { id, name, country, shortName: name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "FC", coach: header[4] || "", coachCountry: code(header[5], "País do técnico", country), colors: [color(header[6], "#0c2118"), color(header[7], "#ffffff")], budget: 6000000, stadium: { name: header[3] || `Estádio ${name}`, capacity: integer(header[8], "Capacidade do estádio", 1000, 200000, 15000), ticketPrice: 32 }, squad: [] };
  let estimated = 0, wingers = 0;
  for (const { cells: p, line } of records.slice(1)) {
    const at = label => `Linha ${line} (${p[0] || "jogador"}), ${label}`;
    if (p.length > 14) errors.push(`Linha ${line}: use no máximo 14 colunas por jogador.`);
    const sourcePosition = (p[1] || "").toUpperCase();
    if (!positions[sourcePosition]) errors.push(`${at("posição")}: use G, L, Z, V, M, P, A ou GOL, LAT, ZAG, VOL, MC, ATA.`);
    const star = yesNo(p[3], at("estrela")), starter = yesNo(p[6], at("titular"));
    const age = integer(p[4], at("idade"), 16, 50, 24);
    if (!p[4]) warnings.push(`Linha ${line}: idade ausente, usado 24 anos.`);
    if (p[5] && !["D", "R", "E", "L", "A", "B"].includes(p[5].toUpperCase())) errors.push(`${at("pé")}: use D/R, E/L ou A/B.`);
    const extra = integer(p[9], at("característica extra"), 0, 7, 0);
    const estimate = estimatePlayer({ name: p[0], clubName: name, country, strength, age, position: positions[sourcePosition], star, starter, extra });
    const overall = integer(p[10], at("geral"), 1, 99, estimate.overall);
    if (!p[10]) estimated++;
    if (["P", "WG"].includes(sourcePosition)) wingers++;
    const player = { id: `${id}-p-${club.squad.length + 1}`, name: p[0], position: positions[sourcePosition], age, overall, potential: integer(p[11], at("potencial"), overall, 99, p[10] ? Math.min(99, overall + (age <= 23 ? 6 : 0)) : Math.max(overall, estimate.potential)), source: { country: code(p[2], at("país"), country), position: sourcePosition, star, starter, foot: (p[5] || "D").toUpperCase(), technical: p[7] || "", physical: p[8] || "", extra } };
    if (!p[10]) {
      const legacyOverall = Math.max(1, Math.min(99, strength + (star ? 5 : 0) - (starter ? 0 : 3)));
      player.calibration = { version: BALANCE_VERSION, method: estimate.method, legacyOverall, legacyPotential: Math.min(99, legacyOverall + (age <= 23 ? 6 : 2)), baseOverall: player.overall, basePotential: player.potential };
    }
    if (p[12]) player.salary = integer(p[12], at("salário por rodada"), 0, 10000000000);
    if (p[13]) player.value = integer(p[13], at("valor de mercado"), 0, 10000000000);
    club.squad.push(player);
  }
  if (estimated) warnings.push(`${estimated} jogadores com geral estimado em escala global por força do clube, contexto da liga, idade e papel no elenco, com referências individuais revisadas. Informe a coluna 11 para definir o geral.`);
  if (wingers) warnings.push(`${wingers} pontas (P/WG) convertidos para ATA, pois o jogo ainda não tem uma posição específica para ponta.`);
  warnings.push("País, técnico, pé e características são guardados como referência. Titularidade e estrela orientam a estimativa do geral; não fixam a escalação nem criam habilidades especiais.");
  const validation = validateDatabase({ version: 1, name: "Liga importada", clubs: [club] }, { allowSingleClub: true });
  errors.push(...validation.errors);
  return errors.length ? { ok: false, errors, warnings } : { ok: true, errors, warnings, club: validation.database.clubs[0] };
}

export function clubToCsv(club) {
  const cell = value => /[;"\r\n]/.test(String(value ?? "")) ? `"${String(value).replaceAll('"', '""')}"` : String(value ?? "");
  const strength = Math.round(club.squad.reduce((sum, p) => sum + p.overall, 0) / club.squad.length);
  const rows = [[club.name, club.country || "BRA", strength, club.stadium.name, club.coach || "", club.coachCountry || "BRA", ...club.colors.map(c => c.replace(/^#/, "")), club.stadium.capacity], ...club.squad.map(p => [p.name, p.position, p.source?.country || club.country || "BRA", p.source?.star ? "S" : "N", p.age, p.source?.foot || "D", p.source?.starter ? "S" : "N", p.source?.technical || "", p.source?.physical || "", p.source?.extra || 0, p.overall, p.potential, p.salary, p.value])];
  return rows.map(row => row.map(cell).join(";")).join("\r\n") + "\r\n";
}
