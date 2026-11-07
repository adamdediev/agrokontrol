// После сборки помечает service worker уникальной версией,
// чтобы телефоны с установленным приложением сразу получали обновление.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const file = "out/sw.js";
if (existsSync(file)) {
  const stamp = "ak-" + new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  writeFileSync(file, readFileSync(file, "utf8").replace(/const VERSION = "[^"]*";/, `const VERSION = "${stamp}";`));
  console.log("sw version:", stamp);
}
