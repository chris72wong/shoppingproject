const fs = require("fs");
const rows = fs.readFileSync("lib/catalog.ts", "utf8");
const re =
  /\['([^']+)','([^']+)','(top|bottom|shoes|outerwear|accessory)','([^']+)','(#[a-f0-9]+)'/g;
let m;
while ((m = re.exec(rows))) {
  const [_, id, name, cat, color, hex] = m;
  let shape = "";
  if (cat === "top" || cat === "outerwear") {
    shape =
      '<path d="M91 57 L58 73 29 145 65 158 78 126 74 246 226 246 222 126 235 158 271 145 242 73 209 57 181 44 Q150 71 119 44Z"/>';
    if (cat === "outerwear")
      shape +=
        '<path d="M150 67V246M126 50l24 43 24-43" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="2"/><path d="M92 126h35v35H92M174 126h35v35h-35" fill="none" stroke="#000" stroke-opacity=".15"/>';
    else
      shape +=
        '<path d="M119 44 Q150 84 181 44" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="5"/>';
  }
  if (cat === "bottom")
    shape =
      '<path d="M84 35H216L227 264 161 264 150 126 139 264 73 264Z"/><path d="M85 55H215M150 55v70M104 59l-5 52M196 59l5 52" stroke="#000" stroke-opacity=".18" fill="none" stroke-width="2"/>';
  if (cat === "shoes")
    shape =
      '<path d="M53 104L112 97 133 151 206 175Q249 179 260 203L257 223H44Q31 190 53 104Z"/><path d="M44 211H258M125 155l43 7m-37 6l44 8m-35 5l43 9" stroke="#fff" stroke-opacity=".65" stroke-width="7" fill="none"/>';
  if (cat === "accessory")
    shape =
      '<path d="M76 102H224L239 248H61Z"/><path d="M112 111V72Q150 25 188 72V111" stroke="' +
      hex +
      '" stroke-width="14" fill="none"/>';
  fs.writeFileSync(
    "public/garments/" + id + ".svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><defs><linearGradient id="g" x2=".9" y2="1"><stop stop-color="${hex}"/><stop offset="1" stop-color="${hex}" stop-opacity=".72"/></linearGradient><filter id="s"><feDropShadow dx="3" dy="9" stdDeviation="7" flood-opacity=".12"/></filter></defs><g fill="url(#g)" filter="url(#s)" stroke="${hex}" stroke-width="2">${shape}</g></svg>`,
  );
}
