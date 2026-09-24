export const MARKET_COLUMNS = [
  { key: 'name', label: 'Atleta / clube', direction: 'asc' },
  { key: 'position', label: 'Pos.', direction: 'asc' },
  { key: 'age', label: 'Idade', direction: 'asc' },
  { key: 'overall', label: 'Geral', direction: 'desc' },
  { key: 'potential', label: 'Potencial', direction: 'desc' },
  { key: 'salary', label: 'Salário', direction: 'asc' },
  { key: 'value', label: 'Valor de mercado', direction: 'asc' }
];
export const MARKET_RANGES = [
  { key: 'Age', label: 'Idade', min: 16, max: 50, unit: 1, step: 1 },
  { key: 'Overall', label: 'Geral', min: 1, max: 99, unit: 1, step: 1 },
  { key: 'Potential', label: 'Potencial', min: 1, max: 99, unit: 1, step: 1 },
  { key: 'Value', label: 'Valor de mercado (R$ milhões)', min: 0, max: 10000, unit: 1000000, step: 0.1 }
];
export function defaultMarketFilters() {
  return { query: '', clubId: 'all', positions: [], position: 'all', country: 'all', leagueId: 'all', sort: 'overall', direction: 'desc', dealType: 'all', minAge: '', maxAge: '', minOverall: '', maxOverall: '', minPotential: '', maxPotential: '', minValue: '', maxValue: '', maxSalary: '', minGrowth: '', availableOnly: false, affordableOnly: false };
}
export function marketFilterError(filters) {
  const present = value => value !== '' && value !== undefined && value !== null;
  for (const { key, label, min, max, unit } of MARKET_RANGES) {
    const low = filters[`min${key}`], high = filters[`max${key}`];
    if ([low, high].some(v => present(v) && (!Number.isFinite(Number(v)) || Number(v) < min * unit || Number(v) > max * unit))) return `${label}: informe valores entre ${min} e ${max}.`;
    if (present(low) && present(high) && Number(low) > Number(high)) return `${label}: o mínimo não pode superar o máximo.`;
  }
  for (const key of ['maxSalary', 'minGrowth']) if (present(filters[key]) && (!Number.isFinite(Number(filters[key])) || Number(filters[key]) < 0)) return 'Salário e evolução devem ser números positivos ou zero.';
  return '';
}
