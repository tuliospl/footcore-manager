import { readFile, writeFile } from 'node:fs/promises';
import { parseClubCsv } from '../src/club-csv.js';
import { playerValue, BALANCE_VERSION } from '../src/player-balance.js';
const catalog = JSON.parse(await readFile(new URL('../data/m26/catalog.json', import.meta.url)));
const manifest = JSON.parse(await readFile(new URL('../data/world/leagues.json', import.meta.url)));
const ids = new Map();
const clubs = [];
for (const team of catalog.teams) {
  const result = parseClubCsv(await readFile(new URL(`../${team.csv}`, import.meta.url), 'utf8'), team.csv);
  if (!result.ok) throw new Error(`${team.name}: ${result.errors.join('; ')}`);
  result.club.budget = Math.max(2_000_000, Math.min(400_000_000, Math.round(result.club.squad.reduce((n,p) => n + playerValue(p), 0) * 0.12 / 100000) * 100000));
  result.club.badgePath = team.badgePath;
  ids.set(team.id, result.club.id);
  clubs.push(result.club);
}
const leagues = manifest.leagues.map(({teamIds,...league}) => ({...league,clubIds:teamIds.map(id=>ids.get(id))}));
await writeFile(new URL('../data/world/database.json',import.meta.url),JSON.stringify({version:1,balanceVersion:BALANCE_VERSION,name:'Mundo 2026',countries:catalog.countries,clubs,freeAgents:[],leagues}));
console.log(`${clubs.length} clubes / ${clubs.reduce((n,c)=>n+c.squad.length,0)} jogadores`);
