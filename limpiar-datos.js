// Script de limpieza: elimina duplicados por nombre_comun y reagrupa en 3 archivos.
// Ejecutar UNA vez: node limpiar-datos.js
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");

function norm(t = "") {
  return t.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const archivos = readdirSync(dataDir).filter(f => f.endsWith(".json")).sort();
let todas = [];
for (const a of archivos) {
  todas = todas.concat(JSON.parse(readFileSync(join(dataDir, a), "utf-8")));
}
console.log(`Cargadas: ${todas.length}`);

const seen = new Set();
const unicas = [];
for (const p of todas) {
  const key = norm(p.nombre_comun);
  if (seen.has(key)) {
    console.log(`  dup eliminado: ${p.nombre_comun} (id ${p.id})`);
    continue;
  }
  seen.add(key);
  unicas.push(p);
}
console.log(`Únicas: ${unicas.length}`);

// Reasignar ids secuenciales
unicas.forEach((p, i) => p.id = i + 1);

// Repartir en 3 archivos
const chunk = Math.ceil(unicas.length / 3);
for (let i = 0; i < 3; i++) {
  const slice = unicas.slice(i * chunk, (i + 1) * chunk);
  writeFileSync(join(dataDir, `plantas_${i + 1}.json`), JSON.stringify(slice, null, 2));
  console.log(`plantas_${i + 1}.json: ${slice.length}`);
}
