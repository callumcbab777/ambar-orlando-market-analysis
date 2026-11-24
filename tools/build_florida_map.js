/* Builds the Brightline Florida map (inline SVG) for visit/index.html, between the
   <!-- FL-MAP:START --> and <!-- FL-MAP:END --> markers.
   Outline: US Census Bureau cartographic boundary for Florida via us-atlas@3 states-10m (ISC).
   Station points: approximate station locations (gobrightline.com station pages). Re-run:
     npm i us-atlas@3 d3-geo@3 topojson-client@3 && node tools/build_florida_map.js
*/
const fs = require("fs");
const path = require("path");
const req = (m) => require(process.env.NODE_MODS ? path.join(process.env.NODE_MODS, m) : m);
const d3 = req("d3-geo");
const topo = req("topojson-client");
const us = JSON.parse(fs.readFileSync(require.resolve(process.env.NODE_MODS ? path.join(process.env.NODE_MODS, "us-atlas/states-10m.json") : "us-atlas/states-10m.json")));
const fl = topo.feature(us, us.objects.states).features.find((f) => f.id === "12");
const W = 440, H = 520;
/* frame the Orlando-to-Miami corridor (25.2N to 28.9N) so the coast is as large as possible,
   and leave the right-hand third for station labels over the ocean. Everything (outline,
   rail line, stations, AMBAR, latitude ticks) goes through the same projection. */
const frame = { type: "MultiPoint", coordinates: [[-82.35, 25.2], [-79.95, 25.2], [-79.95, 28.9], [-82.35, 28.9]] };
const proj = d3.geoMercator().fitExtent([[6, 10], [W - 150, H - 10]], frame);
const p = d3.geoPath(proj);
const r = (n) => Math.round(n * 10) / 10;
/* north to south; lon, lat approximate */
const ST = [
  { id: "orl", name: "Orlando (MCO)", lon: -81.3081, lat: 28.4312, side: "r" },
  { id: "wpb", t: "about 2h 15m", name: "West Palm Beach", lon: -80.0573, lat: 26.7119, side: "r" },
  { id: "boca", t: "about 2h 40m", name: "Boca Raton", lon: -80.0890, lat: 26.3500, side: "r" },
  { id: "fll", t: "about 2h 55m", name: "Fort Lauderdale", lon: -80.1470, lat: 26.1205, side: "r" },
  { id: "ave", t: "about 3h 10m", name: "Aventura", lon: -80.1430, lat: 25.9580, side: "r" },
  { id: "mia", t: "about 3h 30m", name: "MiamiCentral", lon: -80.1960, lat: 25.7781, side: "r" },
];
/* the line follows the FEC corridor down the coast: Orlando east to Cocoa, then south */
const LINE = [[-81.3081, 28.4312], [-81.05, 28.43], [-80.80, 28.38], [-80.72, 28.10], [-80.60, 27.85], [-80.40, 27.60], [-80.33, 27.30], [-80.20, 27.05], [-80.056, 26.7114], [-80.089, 26.35], [-80.147, 26.1205], [-80.143, 25.958], [-80.196, 25.7781]];
const AMBAR = { lon: -81.600, lat: 28.335 };
const pt = (lon, lat) => proj([lon, lat]).map(r);
const lineD = "M" + LINE.map(([a, b]) => pt(a, b).join(",")).join("L");
let s = `<svg class="bl-map" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="blMapT blMapD" focusable="false">
<title id="blMapT">Brightline stations in Florida</title><desc id="blMapD">Map of Florida with Brightline's six stations: Orlando at Orlando International Airport, then West Palm Beach, Boca Raton, Fort Lauderdale, Aventura and MiamiCentral down the southeast coast. AMBAR is marked southwest of Orlando, in Kissimmee. Each South Florida station shows its approximate ride time to Orlando; the full table is beside the map.</desc>
<defs><clipPath id="blClip"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>\n<path class="bl-land" clip-path="url(#blClip)" d="${p(fl)}"/>
<path class="bl-rail" d="${lineD}"/>
<path class="bl-rail-run" d="${lineD}"/>
`;
/* latitude reference lines so station placement can be checked by eye */
[26, 27, 28].forEach((lat) => {
  const [, gy] = pt(-81, lat);
  s += `<g class="bl-lat"><path d="M0,${gy}H${W - 150}"/><text x="4" y="${r(gy - 4)}">${lat}°N</text></g>\n`;
});
const [ax, ay] = pt(AMBAR.lon, AMBAR.lat);
const [ox, oy] = pt(-81.3081, 28.4312);
s += `<path class="bl-drive" d="M${ax},${ay}L${ox},${oy}"/>
<g class="bl-ambar"><circle cx="${ax}" cy="${ay}" r="6"/><text x="${r(ax - 10)}" y="${r(ay + 4)}" text-anchor="end">AMBAR</text></g>
`;
let ly = null;
ST.forEach((st) => {
  const [x, y] = pt(st.lon, st.lat);
  const end = st.id === "orl" || st.id === "mia";
  /* labels sit in a column to the right; the four close South Florida stations get at least 30px apart */
  let ty = y + 4;
  if (st.id === "orl") ty = y - 12;
  else { ty = ly == null ? y + 4 : Math.max(y + 4, ly + 32); ly = ty; }
  const lx = W - 142;
  s += `<g class="bl-st${end ? " is-end" : ""}" data-st="${st.id}"><path class="bl-lead" d="M${r(x + 7)},${r(y)}L${r(lx - 6)},${r(ty - 4)}"/><circle cx="${x}" cy="${y}" r="${end ? 6.5 : 5}"/><text x="${lx}" y="${r(ty)}">${st.name}</text>${st.t ? `<text class="bl-t" x="${lx}" y="${r(ty + 13)}">${st.t}</text>` : ""}</g>\n`;
});
s += `</svg>`;
const file = path.join(__dirname, "..", "visit", "index.html");
const html = fs.readFileSync(file, "utf8");
const a = "<!-- FL-MAP:START -->", b = "<!-- FL-MAP:END -->";
if (!html.includes(a)) { console.error("markers not found"); process.exit(1); }
const out = html.slice(0, html.indexOf(a) + a.length) + "\n" + s + "\n" + html.slice(html.indexOf(b));
fs.writeFileSync(file, out);
console.log("Florida map written", s.length, "bytes");
