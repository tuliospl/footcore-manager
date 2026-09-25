import test from "node:test";
import assert from "node:assert/strict";
import { teamKit, teamShirtMarkup } from "../src/team-shirt.js";

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
