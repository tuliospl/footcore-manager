import { escapeHtml } from "./html.js";

export function badgeContent(club) {
  if (typeof club.badgePath === "string" && /^data\/m26\/escudos\/[a-z0-9-]+\.png$/.test(club.badgePath)) return `<img class="imported-club-badge" src="${club.badgePath}" alt="${escapeHtml(club.shortName)}" loading="lazy">`;
  return escapeHtml(club.shortName);
}
