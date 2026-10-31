/* AMBAR Orlando · "Share my list" PDF. Builds a branded PDF of saved events in the browser with jsPDF
   (assets/vendor/jspdf.umd.min.js, MIT) and the site's own fonts (assets/vendor/pdf-fonts.js, OFL), both
   loaded on demand from this repo: no CDN, no server, nothing sent anywhere. */
(function () {
  "use strict";
  const COL = { forest: [30, 58, 44], forestDeep: [20, 48, 35], gold: [201, 163, 90], gold2: [227, 198, 138], amber: [255, 169, 74],
    brown: [179, 125, 80], cream: [244, 239, 231], ink: [29, 31, 26], muted: [95, 95, 85], blue: [53, 89, 101], line: [214, 205, 188] };
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => { delete loaded[src]; rej(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  async function ensureLib(root) {
    if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript(root + "assets/vendor/jspdf.umd.min.js");
    if (!window.AMBAR_PDF_FONTS) { try { await loadScript(root + "assets/vendor/pdf-fonts.js"); } catch (e) { /* falls back to built-in fonts */ } }
    return { jsPDF: window.jspdf.jsPDF, fonts: window.AMBAR_PDF_FONTS || null };
  }

  /* entries: [{ title, dates, location, url }] ; meta: { title, subtitle, generated, pageUrl } */
  function build(jsPDF, fonts, entries, meta) {
    const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
    let serif = "times", sans = "helvetica";
    if (fonts) {
      for (const [file, name, style] of [["DMSans-Regular", "DMSans", "normal"], ["DMSans-Bold", "DMSans", "bold"], ["Cormorant-Medium", "Cormorant", "normal"], ["Cormorant-MediumItalic", "Cormorant", "italic"]]) {
        if (!fonts[file]) continue;
        doc.addFileToVFS(file + ".ttf", fonts[file]); doc.addFont(file + ".ttf", name, style);
      }
      serif = "Cormorant"; sans = "DMSans";
    }
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 54;
    const font = (f, st, size, col) => { doc.setFont(f, st); doc.setFontSize(size); doc.setTextColor(...col); };
    doc.setProperties({ title: meta.title || "My Orlando list", subject: "Saved events from the Visit Orlando calendar", creator: "AMBAR Orlando · What’s on in Orlando" });

    /* cover band */
    doc.setFillColor(...COL.forest); doc.rect(0, 0, W, 158, "F");
    doc.setFillColor(...COL.amber); doc.rect(0, 158, W, 3, "F");
    doc.setDrawColor(...COL.gold); doc.setLineWidth(0.6); doc.circle(W - 96, 64, 46, "S"); doc.circle(W - 96, 64, 38, "S");
    font(sans, "bold", 8, COL.gold2); doc.text("AMBAR RESIDENCES  ·  ORLANDO", M, 52, { charSpace: 1.6 });
    font(serif, "normal", 36, COL.cream); doc.text("My ", M, 100);
    let x = M + doc.getTextWidth("My ");
    font(serif, "italic", 36, COL.gold2); doc.text("Orlando", x, 100); x += doc.getTextWidth("Orlando ");
    font(serif, "normal", 36, COL.cream); doc.text("list", x, 100);
    font(sans, "normal", 10, [215, 208, 191]); doc.text(meta.subtitle || "", M, 128);
    font(serif, "italic", 15, COL.gold2); doc.text("What’s on", W - 96, 61, { align: "center" }); doc.text("in Orlando", W - 96, 77, { align: "center" });

    const footer = () => {
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setDrawColor(...COL.line); doc.setLineWidth(0.5); doc.line(M, H - 48, W - M, H - 48);
        font(sans, "normal", 7.5, COL.muted);
        doc.text("Event details from the official Visit Orlando calendar (visitorlando.com). Check each listing for times, prices and changes before you go.", M, H - 34);
        doc.text(`Generated ${meta.generated || ""}`, M, H - 23);
        doc.text(`Page ${i} of ${n}`, W - M, H - 23, { align: "right" });
      }
    };

    let y = 200;
    const colX = M + 44, colW = W - colX - M;
    entries.forEach((e, i) => {
      font(serif, "normal", 17, COL.forest);
      const tl = doc.splitTextToSize(e.title || "Event", colW);
      font(sans, "normal", 9.5, COL.ink);
      const ll = e.location ? doc.splitTextToSize(e.location, colW) : [];
      const urlLines = doc.splitTextToSize(e.url || "", colW);
      const h = 14 + tl.length * 19 + ll.length * 13 + urlLines.length * 12 + 22;
      if (y + h > H - 64) {
        doc.addPage(); y = M + 6;
        font(sans, "bold", 7.5, COL.brown); doc.text("MY ORLANDO LIST  ·  CONTINUED", M, y, { charSpace: 1.2 }); y += 30;
      }
      font(serif, "italic", 24, COL.brown); doc.text(String(i + 1).padStart(2, "0"), M, y + 14);
      font(sans, "bold", 8, COL.brown); doc.text((e.dates || "").toUpperCase(), colX, y, { charSpace: 0.8 });
      let yy = y + 18;
      font(serif, "normal", 17, COL.forest); doc.text(tl, colX, yy); yy += tl.length * 19 - 4;
      if (ll.length) { font(sans, "normal", 9.5, COL.ink); doc.text(ll, colX, yy); yy += ll.length * 13; }
      if (e.url) {
        font(sans, "normal", 8.5, COL.blue);
        urlLines.forEach((ln, k) => { doc.textWithLink(ln, colX, yy + k * 12, { url: e.url }); });
        yy += urlLines.length * 12;
      }
      y = yy + 6;
      doc.setDrawColor(...COL.line); doc.setLineWidth(0.5); doc.line(colX, y, W - M, y);
      y += 22;
    });
    if (meta.pageUrl) {
      if (y + 40 > H - 64) { doc.addPage(); y = M + 20; }
      font(sans, "normal", 8.5, COL.muted); doc.text("Open this list online:", M, y + 4);
      font(sans, "normal", 8.5, COL.blue);
      const ul = doc.splitTextToSize(meta.pageUrl, W - 2 * M - 100);
      ul.forEach((ln, k) => doc.textWithLink(ln, M + 100, y + 4 + k * 12, { url: meta.pageUrl }));
    }
    footer();
    return doc;
  }

  async function download(root, entries, meta, filename) {
    const { jsPDF, fonts } = await ensureLib(root);
    const doc = build(jsPDF, fonts, entries, meta);
    doc.save(filename);
    return doc;
  }
  window.AMBAR_EV_PDF = { build, download, ensureLib };
})();
