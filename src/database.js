export const DATABASE_VERSION = 1;
const positions = ["GOL", "ZAG", "LAT", "VOL", "MC", "ATA"];

export function validateDatabase(input, { allowSingleClub = false, world = false } = {}) {
  const errors = [];
  const object = (value, path) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path}: informe um objeto.`);
      return {};
    }
    return value;
  };
  const text = (value, path, max = 80) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f]/.test(value)) {
      errors.push(`${path}: informe um texto de 1 a ${max} caracteres.`);
      return "";
    }
    return value.trim();
  };
  const number = (value, path, min, max, fallback) => {
    if (value === undefined && fallback !== undefined) return fallback;
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      errors.push(`${path}: use um número inteiro entre ${min} e ${max}.`);
      return min;
    }
    return value;
  };
  const ids = new Set();
  const id = (value, path) => {
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,49}$/.test(value)) errors.push(`${path}: use até 50 letras minúsculas, números e hífens, começando por uma letra.`);
    else if (ids.has(value)) errors.push(`${path}: identificador repetido (${value}).`);
    ids.add(value);
    return value;
  };
  const player = (raw, path, defaultId) => {
    const p = object(raw, path);
    const overall = number(p.overall, `${path}.overall`, 1, 99);
    const potential = number(p.potential, `${path}.potential`, 1, 99, overall);
    if (potential < overall) errors.push(`${path}.potential: não pode ser menor que o geral.`);
    const position = p.position === "MEI" ? "MC" : p.position;
    if (!positions.includes(position)) errors.push(`${path}.position: use ${positions.join(", ")}.`);
    const result = { id: id(p.id ?? defaultId, `${path}.id`), name: text(p.name, `${path}.name`), position, age: number(p.age, `${path}.age`, 16, 50), overall, potential };
    if (p.calibration) {
      const c = object(p.calibration, `${path}.calibration`);
      result.calibration = { version: number(c.version, `${path}.calibration.version`, 1, 100), method: text(c.method, `${path}.calibration.method`, 20), legacyOverall: number(c.legacyOverall, `${path}.calibration.legacyOverall`, 1, 99), legacyPotential: number(c.legacyPotential, `${path}.calibration.legacyPotential`, 1, 99) };
      if (c.baseOverall !== undefined) result.calibration.baseOverall = number(c.baseOverall, `${path}.calibration.baseOverall`, 1, 99);
      if (c.basePotential !== undefined) result.calibration.basePotential = number(c.basePotential, `${path}.calibration.basePotential`, 1, 99);
    }
    if (p.source) {
      const source = object(p.source, `${path}.source`);
      result.source = {};
      for (const field of ["country", "position", "foot", "technical", "physical"]) if (source[field]) result.source[field] = text(source[field], `${path}.source.${field}`, 20);
      for (const field of ["star", "starter"]) result.source[field] = source[field] === true;
      result.source.extra = number(source.extra, `${path}.source.extra`, 0, 7, 0);
    }
    for (const field of ["salary", "value"]) if (p[field] !== undefined) result[field] = number(p[field], `${path}.${field}`, 0, 10000000000);
    return result;
  };
  const data = object(input, "Base");
  if (data.version !== DATABASE_VERSION) errors.push("version: esta versão do jogo aceita bases com version: 1.");
  const name = text(data.name, "name");
  const clubRows = Array.isArray(data.clubs) ? data.clubs : [];
  if (!(allowSingleClub && clubRows.length === 1) && (clubRows.length < 2 || clubRows.length > (world ? 1000 : 20) || (!world && clubRows.length % 2))) errors.push("clubs: informe um número par de clubes, entre 2 e 20.");
  const clubs = clubRows.slice(0, world ? 1000 : 20).map((raw, index) => {
    const path = `clubs[${index}]`;
    const c = object(raw, path);
    const clubId = id(c.id, `${path}.id`);
    const badgePath = typeof c.badgePath === "string" && /^data\/m26\/escudos\/[a-z0-9-]+\.png$/.test(c.badgePath) ? c.badgePath : null;
    if (c.badgePath && !badgePath) errors.push(`${path}.badgePath: caminho de escudo inválido.`);
    const colors = c.colors ?? ["#0c2118", "#ffffff"];
    if (!Array.isArray(colors) || colors.length !== 2 || !colors.every(color => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color))) errors.push(`${path}.colors: informe duas cores no formato #RRGGBB.`);
    const stadium = c.stadium === undefined ? {} : object(c.stadium, `${path}.stadium`);
    const rows = Array.isArray(c.squad) ? c.squad : [];
    if (rows.length < 14 || rows.length > 40) errors.push(`${path}.squad: cada clube precisa de 14 a 40 jogadores.`);
    const squad = rows.slice(0, 40).map((p, i) => player(p, `${path}.squad[${i}]`, `${clubId}-p-${i + 1}`));
    if (!squad.some(p => p.position === "GOL") || squad.filter(p => p.position !== "GOL").length < 10) errors.push(`${path}.squad: inclua pelo menos um goleiro e dez jogadores de linha.`);
    return { id: clubId, name: text(c.name, `${path}.name`), shortName: text(c.shortName, `${path}.shortName`, 5), badgePath, country: c.country ? text(c.country, `${path}.country`, 3) : "BRA", coach: c.coach ? text(c.coach, `${path}.coach`) : "", coachCountry: c.coachCountry ? text(c.coachCountry, `${path}.coachCountry`, 3) : "", colors: Array.isArray(colors) ? [...colors] : [], budget: number(c.budget, `${path}.budget`, 0, 10000000000, 6000000), stadium: { name: text(stadium.name ?? `Estádio ${c.name}`, `${path}.stadium.name`), capacity: number(stadium.capacity, `${path}.stadium.capacity`, 1000, 200000, 15000), ticketPrice: number(stadium.ticketPrice, `${path}.stadium.ticketPrice`, 1, 1000, 32) }, squad };
  });
  const freeRows = data.freeAgents ?? [];
  if (!Array.isArray(freeRows) || freeRows.length > 200) errors.push("freeAgents: informe uma lista de até 200 jogadores sem clube.");
  const freeAgents = Array.isArray(freeRows) ? freeRows.slice(0, 200).map((p, i) => player(p, `freeAgents[${i}]`, `free-p-${i + 1}`)) : [];
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], database: { version: DATABASE_VERSION, name, clubs, freeAgents } };
}
