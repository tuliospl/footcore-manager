import test from "node:test";
import assert from "node:assert/strict";
import { teamKit, teamShirtMarkup, teamUniformMarkup } from "../src/team-shirt.js";

test("Liverpool usa camisa vermelha lisa", () => {
  assert.deepEqual(teamKit({ name: "Liverpool", colors: ["#E6001E", "#FFFFFF"] }), {
    pattern: "solid",
    primary: "#E6001E",
    secondary: "#FFFFFF",
    ink: "#ffffff"
  });
});

test("Botafogo usa camisa listrada em preto e branco", () => {
  const kit = teamKit({ name: "Botafogo", colors: ["#123456", "#654321"] });
  assert.equal(kit.pattern, "stripes");
  assert.equal(kit.primary, "#0a0a0a");
  assert.equal(kit.secondary, "#ffffff");
});

test("camisa neutraliza cores inválidas e escapa o rótulo", () => {
  const markup = teamShirtMarkup({ name: "Clube <teste>", colors: ["red", "blue"] }, "<ATA>");
  assert.match(markup, /--shirt-primary:#66736b/);
  assert.match(markup, /Camisa do Clube &lt;teste&gt;/);
  assert.match(markup, /&lt;ATA&gt;/);
});

test("camisa exibe patrocinadores nos espaços master, costas e manga", () => {
  const club = {
    name: "Aurora",
    shortName: "AUR",
    colors: ["#112233", "#ffffff"],
    sponsors: {
      master: { name: "Emirates" },
      back: { name: "Coca-Cola" },
      sleeve: { name: "Mastercard" }
    }
  };
  const front = teamShirtMarkup(club, "ATA");
  const back = teamShirtMarkup(club, "", { side: "back", name: "CRAQUE", number: "10" });
  assert.match(front, /team-shirt-sponsor--master[^>]*aria-label="Emirates"[^>]*>.*emirates\.svg/);
  assert.doesNotMatch(front, /cocacola\.svg|team-shirt-back-number/);
  assert.match(back, /team-shirt-sponsor--back[^>]*aria-label="Coca-Cola"[^>]*>.*cocacola\.svg/);
  assert.match(back, /team-shirt-back-name">CRAQUE/);
  assert.match(back, /team-shirt-back-number">10/);
  assert.doesNotMatch(back, /emirates\.svg|team-shirt-position/);
  assert.match(front, /team-shirt-sponsor--sleeve-left[^>]*aria-label="Mastercard"[^>]*>.*mastercard\.svg/);
  assert.match(front, /team-shirt-sponsor--sleeve-right[^>]*aria-hidden="true"[^>]*>.*mastercard\.svg/);
  assert.equal((front.match(/mastercard\.svg/g) || []).length, 2);
});

test("Brahma usa o wordmark colorido em vez de um monograma genérico", () => {
  const markup = teamShirtMarkup({
    name: "Botafogo",
    colors: ["#0a0a0a", "#ffffff"],
    sponsors: { back: { name: "Brahma" } }
  }, "", { side: "back", number: "10" });
  assert.match(markup, /sponsor-logo--color/);
  assert.match(markup, /assets\/sponsors\/brahma\.svg/);
  assert.doesNotMatch(markup, /sponsor-logo--emblem sponsor-logo--brahma/);
});

test("todos os patrocinadores cadastrados usam um arquivo de logo real", () => {
  const sponsors = [
    "Emirates", "Qatar Airways", "Etihad Airways", "Turkish Airlines", "LATAM Airlines", "Iberia", "GOL Linhas Aéreas", "Azul",
    "Spotify", "Microsoft", "Google", "Amazon", "Samsung", "Sony", "PlayStation", "Snapdragon", "HP", "Lenovo", "Motorola", "TCL",
    "Coca-Cola", "Pepsi", "Heineken", "Budweiser", "Carlsberg", "Amstel", "Brahma", "Red Bull", "Monster Energy",
    "BMW", "Audi", "Mercedes-Benz", "Toyota", "Hyundai", "Volkswagen", "BYD", "Chevrolet", "Ford", "Jeep", "Nissan", "Renault", "Fiat",
    "Visa", "Mastercard", "American Express", "Standard Chartered", "Barclays", "Santander", "Itaú", "Nubank", "Banco do Brasil", "Caixa", "Mercado Pago", "PicPay", "Inter"
  ];
  for (const sponsor of sponsors) {
    const markup = teamShirtMarkup({ name: "Clube", sponsors: { master: { name: sponsor } } });
    assert.match(markup, /assets\/sponsors\/.+\.svg/, `${sponsor} deve usar um SVG`);
    assert.doesNotMatch(markup, /sponsor-logo--fallback/, `${sponsor} não deve usar texto genérico`);
  }
});

test("uniforme completo exibe patrocinadores de peito, calção e meias", () => {
  const club = {
    name: "Aurora",
    colors: ["#112233", "#ffffff"],
    sponsors: {
      chest: { name: "Google" },
      shorts: { name: "Visa" },
      socks: { name: "Spotify" }
    }
  };
  const markup = teamUniformMarkup(club);
  assert.match(markup, /team-shirt-sponsor--chest[^>]*aria-label="Google"/);
  assert.match(markup, /team-shorts-sponsor[^>]*aria-label="Visa"/);
  assert.equal((markup.match(/spotify\.svg/g) || []).length, 2);
  assert.match(markup, /team-sock-sponsor--right[^>]*aria-hidden="true"/);
});
