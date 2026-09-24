// Write the replacement only after a recoverable copy of the current career exists.
export function replaceCareer(storage, key, current, next) {
  const serialized = JSON.stringify(next);
  storage.setItem(`${key}-previous`, JSON.stringify(current));
  storage.setItem(key, serialized);
}

export function restoreCareer(storage, key, current) {
  const source = storage.getItem(`${key}-previous`);
  if (!source) throw new Error("Nenhuma carreira anterior está disponível.");
  const previous = JSON.parse(source);
  if (!previous.clubs?.some(c => c.id === previous.userClubId) || !Array.isArray(previous.schedule)) throw new Error("Não foi possível ler a carreira anterior.");
  if (previous.activeMatch?.phase === "playing") previous.activeMatch.phase = "paused";
  replaceCareer(storage, key, current, previous);
  return previous;
}
