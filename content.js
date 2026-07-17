(function () {
  if (window.__smartAnalystExportLoaded) return;
  window.__smartAnalystExportLoaded = true;

  const MENU_SELECTOR = '[role="menu"][aria-orientation="vertical"]';
  const RENAME_SELECTOR = '[data-test-id="chat-history-menu-rename"]';
  const TITLE_SELECTOR = '[data-test-id="smart-analyst-chat-panel-title"]';
  const MESSAGES_SELECTOR = '[data-test-id="chatMessages"]';
  const MESSAGE_SELECTOR = '[data-test-id="chat-message-text"]';

  function extractMessages() {
    const container = document.querySelector(MESSAGES_SELECTOR);
    if (!container) return [];

    const bubbles = container.querySelectorAll(MESSAGE_SELECTOR);
    const messages = [];

    for (const bubble of bubbles) {
      const role = bubble.getAttribute("role");
      const rawContent = bubble.getAttribute("content");
      if (!role || !rawContent) continue;

      let text = "";
      if (role === "assistant") {
        text = parseAssistantContent(rawContent);
      } else {
        text = rawContent;
      }

      messages.push({ role, text: text.trim() });
    }

    return messages;
  }

  function parseAssistantContent(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.answer === "string") {
        return parsed.answer;
      }
    } catch {
      // not JSON
    }
    return raw;
  }

  function getChatTitle() {
    const el = document.querySelector(TITLE_SELECTOR);
    return el ? el.textContent.trim() : "Smart Analyst Chat";
  }

  // --- Markdown to HTML conversion ---

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function convertMarkdownToHtml(md) {
    let html = "";
    const lines = md.split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // chart JSON code blocks
      if (line.trim().startsWith("```json") || line.trim() === "```") {
        const blockStart = i;
        if (line.trim().startsWith("```json")) {
          i++;
          let jsonStr = "";
          while (i < lines.length && lines[i].trim() !== "```") {
            jsonStr += lines[i] + "\n";
            i++;
          }
          i++; // skip closing ```
          const chartHtml = tryRenderChart(jsonStr);
          if (chartHtml) {
            html += chartHtml;
          } else {
            html +=
              "<pre><code>" + escapeHtml(jsonStr.trim()) + "</code></pre>";
          }
        } else {
          i++;
        }
        continue;
      }

      // other code blocks
      if (line.trim().startsWith("```")) {
        i++;
        let code = "";
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          code += lines[i] + "\n";
          i++;
        }
        i++;
        html += "<pre><code>" + escapeHtml(code.trimEnd()) + "</code></pre>";
        continue;
      }

      // tables
      if (line.includes("|") && line.trim().startsWith("|")) {
        const tableLines = [];
        while (
          i < lines.length &&
          lines[i].includes("|") &&
          lines[i].trim().startsWith("|")
        ) {
          tableLines.push(lines[i]);
          i++;
        }
        html += convertTable(tableLines);
        continue;
      }

      // headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        html += `<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`;
        i++;
        continue;
      }

      // horizontal rules
      if (/^---+\s*$/.test(line.trim())) {
        html += "<hr>";
        i++;
        continue;
      }

      // unordered lists
      if (/^\s*[-*]\s+/.test(line)) {
        html += "<ul>";
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          const content = lines[i].replace(/^\s*[-*]\s+/, "");
          html += "<li>" + inlineFormat(content);
          i++;
          // continuation lines (indented non-list text within a list item)
          while (
            i < lines.length &&
            lines[i].trim() !== "" &&
            !/^\s*[-*]\s+/.test(lines[i]) &&
            !/^\s*\d+\.\s+/.test(lines[i]) &&
            !lines[i].trim().startsWith("|") &&
            !lines[i].trim().startsWith("#") &&
            !lines[i].trim().startsWith("```")
          ) {
            html += "<br>" + inlineFormat(lines[i].trim());
            i++;
          }
          html += "</li>";
        }
        html += "</ul>";
        continue;
      }

      // ordered lists
      if (/^\s*\d+\.\s+/.test(line)) {
        html += "<ol>";
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          const content = lines[i].replace(/^\s*\d+\.\s+/, "");
          html += "<li>" + inlineFormat(content);
          i++;
          while (
            i < lines.length &&
            lines[i].trim() !== "" &&
            !/^\s*\d+\.\s+/.test(lines[i]) &&
            !/^\s*[-*]\s+/.test(lines[i]) &&
            !lines[i].trim().startsWith("|") &&
            !lines[i].trim().startsWith("#") &&
            !lines[i].trim().startsWith("```")
          ) {
            html += "<br>" + inlineFormat(lines[i].trim());
            i++;
          }
          html += "</li>";
        }
        html += "</ol>";
        continue;
      }

      // blank lines
      if (line.trim() === "") {
        i++;
        continue;
      }

      // paragraphs
      let para = "";
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !lines[i].trim().startsWith("#") &&
        !lines[i].trim().startsWith("|") &&
        !lines[i].trim().startsWith("```") &&
        !/^---+\s*$/.test(lines[i].trim()) &&
        !/^\s*[-*]\s+/.test(lines[i]) &&
        !/^\s*\d+\.\s+/.test(lines[i])
      ) {
        para += (para ? " " : "") + lines[i].trim();
        i++;
      }
      if (para) {
        html += "<p>" + inlineFormat(para) + "</p>";
      }
    }

    return html;
  }

  function inlineFormat(text) {
    // bold + italic
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    // bold
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // italic
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // inline code
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    return text;
  }

  function convertTable(tableLines) {
    const rows = tableLines.map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim())
    );

    if (rows.length < 2) return "";

    // detect separator row (row 1 should be like ---|---|---)
    const isSep = rows[1].every((c) => /^[-:]+$/.test(c));
    const headerRow = rows[0];
    const dataRows = isSep ? rows.slice(2) : rows.slice(1);

    let html = '<div class="table-wrap"><table><thead><tr>';
    for (const cell of headerRow) {
      html += "<th>" + inlineFormat(cell) + "</th>";
    }
    html += "</tr></thead><tbody>";

    for (const row of dataRows) {
      html += "<tr>";
      for (let j = 0; j < headerRow.length; j++) {
        html += "<td>" + inlineFormat(row[j] || "") + "</td>";
      }
      html += "</tr>";
    }

    html += "</tbody></table></div>";
    return html;
  }

  // --- Chart rendering ---

  function tryRenderChart(jsonStr) {
    try {
      const obj = JSON.parse(jsonStr);
      const chart = obj.chart || obj;
      if (!chart.data || !Array.isArray(chart.data)) return null;

      const data = chart.data;
      const title = chart.title || "";

      const keys = Object.keys(data[0]).filter((k) => k !== "name");
      if (keys.length === 0) return null;

      // find min/max across all series
      let min = Infinity;
      let max = -Infinity;
      for (const d of data) {
        for (const k of keys) {
          const v = parseFloat(d[k]);
          if (!isNaN(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
      }

      const padding = (max - min) * 0.15 || 5;
      min = Math.max(0, min - padding);
      max = max + padding;
      const range = max - min || 1;

      const W = 700;
      const H = 280;
      const PL = 55;
      const PR = 20;
      const PT = 40;
      const PB = 60;
      const chartW = W - PL - PR;
      const chartH = H - PT - PB;

      const colors = ["#D9EE50", "#A1A1AA", "#71717A", "#b0c13d", "#52525B"];

      let svg = `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

      // title
      if (title) {
        svg += `<text x="${W / 2}" y="20" text-anchor="middle" font-size="13" font-weight="600" fill="#EDEDED">${escapeHtml(title)}</text>`;
      }

      // y-axis gridlines and labels
      const yTicks = 5;
      for (let t = 0; t <= yTicks; t++) {
        const val = min + (range * t) / yTicks;
        const y = PT + chartH - (chartH * t) / yTicks;
        svg += `<line x1="${PL}" y1="${y}" x2="${PL + chartW}" y2="${y}" stroke="#27272A" stroke-width="0.5"/>`;
        svg += `<text x="${PL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#8E8E93">${val.toFixed(1)}%</text>`;
      }

      // x-axis labels
      for (let d = 0; d < data.length; d++) {
        const x = PL + (chartW * d) / (data.length - 1 || 1);
        svg += `<text x="${x}" y="${H - PB + 18}" text-anchor="middle" font-size="9" fill="#8E8E93">${escapeHtml(data[d].name)}</text>`;
      }

      // lines + dots for each series
      keys.forEach((key, ki) => {
        const color = colors[ki % colors.length];
        let path = "";
        const dots = [];

        for (let d = 0; d < data.length; d++) {
          const x = PL + (chartW * d) / (data.length - 1 || 1);
          const v = parseFloat(data[d][key]);
          if (isNaN(v)) continue;
          const y = PT + chartH - (chartH * (v - min)) / range;
          path += (path ? " L" : "M") + ` ${x.toFixed(1)} ${y.toFixed(1)}`;
          dots.push({ x, y, v });
        }

        svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        for (const dot of dots) {
          svg += `<circle cx="${dot.x.toFixed(1)}" cy="${dot.y.toFixed(1)}" r="3.5" fill="${color}" stroke="#050509" stroke-width="1.5"/>`;
        }
      });

      // legend
      const legendY = H - 12;
      let legendX = PL;
      keys.forEach((key, ki) => {
        const color = colors[ki % colors.length];
        svg += `<rect x="${legendX}" y="${legendY - 6}" width="10" height="10" rx="2" fill="${color}"/>`;
        svg += `<text x="${legendX + 14}" y="${legendY + 3}" font-size="10" fill="#A1A1AA">${escapeHtml(key)}</text>`;
        legendX += key.length * 6.5 + 30;
      });

      svg += "</svg></div>";
      return svg;
    } catch {
      return null;
    }
  }

  // --- HTML page assembly ---

  function buildHtmlPage(title, messages, html2pdfSrc, pdfFilename) {
    const now = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let bodyContent = "";

    for (const msg of messages) {
      if (msg.role === "user") {
        bodyContent += `<div class="message user-message"><div class="role-label user-label">You</div><div class="message-body">${convertMarkdownToHtml(msg.text)}</div></div>`;
      } else if (msg.role === "assistant") {
        bodyContent += `<div class="message assistant-message"><div class="role-label assistant-label">Smart Analyst</div><div class="message-body">${convertMarkdownToHtml(msg.text)}</div></div>`;
      }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' ${html2pdfSrc ? html2pdfSrc : ""}; style-src 'unsafe-inline'; img-src data: blob:;">
<title>${escapeHtml(title)} — Export</title>
<style>
  :root {
    --bg: #050509;
    --surface: #121217;
    --surface-hover: #18181B;
    --border: #27272A;
    --border-strong: #3F3F46;
    --text: #EDEDED;
    --text-secondary: #A1A1AA;
    --text-helper: #8E8E93;
    --brand: #D9EE50;
    --brand-hover: #b0c13d;
    --brand-text: #161617;
    --user-bg: #18181B;
    --assistant-bg: #121217;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: "Proxima Nova", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.7;
    padding: 0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    backdrop-filter: blur(12px);
  }

  .toolbar-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .toolbar-logo {
    height: 18px;
    opacity: 0.7;
  }

  .toolbar-actions { display: flex; gap: 8px; }

  .local-notice {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 6px 32px;
    font-size: 11px;
    color: var(--text-helper);
    text-align: center;
  }

  .btn {
    padding: 8px 18px;
    border-radius: 20px;
    border: 1px solid var(--border);
    background: var(--surface-hover);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: inherit;
  }
  .btn:hover { background: #27272A; border-color: var(--border-strong); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary {
    background: var(--brand);
    border-color: var(--brand);
    color: var(--brand-text);
  }
  .btn-primary:hover { background: var(--brand-hover); }
  .btn-primary:disabled { background: var(--brand); }

  .container {
    max-width: 820px;
    margin: 0 auto;
    padding: 40px 32px 80px;
  }

  .export-header {
    margin-bottom: 40px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
  }
  .export-header h1 {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 6px;
    letter-spacing: -0.3px;
    color: var(--text);
  }
  .export-header .meta {
    font-size: 13px;
    color: var(--text-helper);
  }

  .message {
    margin-bottom: 32px;
    border-radius: 12px;
    border: 1px solid var(--border);
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .role-label {
    padding: 10px 20px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .user-label {
    background: var(--user-bg);
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
  }
  .assistant-label {
    background: #0c0c10;
    color: var(--brand);
    border-bottom: 1px solid var(--border);
  }

  .message-body {
    padding: 20px 24px;
  }

  .user-message { border-color: var(--border); }
  .user-message .message-body {
    background: var(--user-bg);
    white-space: pre-wrap;
  }
  .assistant-message .message-body { background: var(--assistant-bg); }

  h1, h2, h3, h4, h5, h6 {
    color: var(--text);
    margin: 28px 0 12px;
    letter-spacing: -0.2px;
  }
  h1 { font-size: 24px; }
  h2 { font-size: 20px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  h3 { font-size: 17px; }
  h4 { font-size: 15px; }

  .message-body > h2:first-child,
  .message-body > h3:first-child {
    margin-top: 0;
  }

  p { margin: 10px 0; }

  strong { color: #EDEDED; }
  em { color: var(--text-secondary); }
  code {
    background: #27272A;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: "Roboto Mono", "SF Mono", "Fira Code", monospace;
    color: var(--brand);
  }
  pre {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    margin: 16px 0;
  }
  pre code {
    background: none;
    padding: 0;
    color: var(--text-secondary);
  }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 24px 0;
  }

  ul, ol {
    margin: 10px 0;
    padding-left: 24px;
  }
  li {
    margin: 6px 0;
    padding-left: 4px;
  }
  li::marker { color: var(--brand); }

  /* Tables */
  .table-wrap {
    overflow-x: auto;
    margin: 16px 0;
    border-radius: 10px;
    border: 1px solid var(--border);
    page-break-inside: avoid;
    break-inside: avoid;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    min-width: 500px;
  }
  thead {
    background: #0c0c10;
  }
  th {
    padding: 10px 14px;
    text-align: left;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--brand);
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 9px 14px;
    border-bottom: 1px solid var(--border);
    color: var(--text-secondary);
  }
  tbody tr:nth-child(even) { background: var(--bg); }
  tbody tr:nth-child(odd) { background: var(--surface); }
  tbody tr:hover { background: var(--surface-hover); }

  /* Charts */
  .chart-wrap {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    margin: 20px 0;
    overflow-x: auto;
  }
  .chart-wrap svg {
    width: 100%;
    height: auto;
    display: block;
  }

  /* Print / PDF styles */
  @media print {
    body { background: #fff; color: #161617; }
    .toolbar { display: none; }
    .local-notice { display: none; }
    .container { padding: 20px 0; }

    .message { border: 1px solid #e4e4e7; break-inside: avoid; }
    .role-label { color: #161617; }
    .user-label { background: #f4f4f5; color: #52525B; border-bottom-color: #e4e4e7; }
    .assistant-label { background: #f9fbe7; color: #5a6416; border-bottom-color: #e4e4e7; }
    .user-message .message-body { background: #fafafa; }
    .assistant-message .message-body { background: #fff; }

    h2 { border-bottom-color: #e4e4e7; }
    strong { color: #161617; }
    em { color: #52525B; }
    code { background: #f4f4f5; color: #5a6416; }
    pre { background: #fafafa; border-color: #e4e4e7; }
    pre code { color: #3f3f46; }

    .table-wrap { border-color: #e4e4e7; }
    thead { background: #f9fbe7; }
    th { color: #5a6416; border-bottom-color: #d4d4d8; }
    td { color: #3f3f46; border-bottom-color: #f4f4f5; }
    tbody tr:nth-child(even) { background: #fafafa; }
    tbody tr:nth-child(odd) { background: #fff; }
    tbody tr:hover { background: inherit; }

    .chart-wrap { background: #fafafa; border-color: #e4e4e7; }
    .chart-wrap text { fill: #3f3f46 !important; }
    .chart-wrap line { stroke: #e4e4e7 !important; }
    .chart-wrap circle { stroke: #fff !important; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <span class="toolbar-title">
    <svg width="20" height="20" viewBox="0 0 32 32" fill="#D9EE50" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="14" fill="none" stroke="#D9EE50" stroke-width="2"/><circle cx="11" cy="14" r="2" fill="#D9EE50"/><circle cx="21" cy="14" r="2" fill="#D9EE50"/><path d="M10 20 Q16 25 22 20" stroke="#D9EE50" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
    Smart Analyst Export
  </span>
  <div class="toolbar-actions">
    <button class="btn btn-primary" id="download-pdf-btn" disabled>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span id="pdf-btn-label">Loading...</span>
    </button>
  </div>
</div>
<div class="local-notice">This preview is local to your browser. Nothing is uploaded or shared.</div>
<div class="container" id="export-content">
  <div class="export-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Exported on ${now}</div>
  </div>
  ${bodyContent}
</div>
${html2pdfSrc ? `<script src="${html2pdfSrc}"><\\/script>` : ""}
<script>
(function() {
  var filename = ${JSON.stringify(pdfFilename)};
  var btn = document.getElementById("download-pdf-btn");
  var label = document.getElementById("pdf-btn-label");

  function ready() {
    label.textContent = "Download PDF";
    btn.disabled = false;
  }

  if (typeof html2pdf !== "undefined") {
    ready();
  } else {
    var check = setInterval(function() {
      if (typeof html2pdf !== "undefined") { clearInterval(check); ready(); }
    }, 100);
    setTimeout(function() { clearInterval(check); label.textContent = "PDF unavailable"; }, 5000);
  }

  btn.addEventListener("click", function() {
    if (btn.disabled) return;
    label.textContent = "Generating...";
    btn.disabled = true;

    var el = document.getElementById("export-content");

    html2pdf()
      .set({
        margin: [12, 10, 12, 10],
        filename: filename,
        html2canvas: { scale: 2, useCORS: false, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] }
      })
      .from(el)
      .save()
      .then(function() {
        label.textContent = "Download PDF";
        btn.disabled = false;
      })
      .catch(function() {
        label.textContent = "Error - retry";
        btn.disabled = false;
      });
  });
})();
<\\/script>
</body>
</html>`;
  }

  // --- Export handler ---

  function getHtml2PdfUrl() {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL("html2pdf.bundle.min.js");
    }
    return "";
  }

  function slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
  }

  function handleExportClick() {
    const title = getChatTitle();
    const messages = extractMessages();

    if (messages.length === 0) {
      alert("No messages found to export.");
      return;
    }

    const html2pdfSrc = getHtml2PdfUrl();
    const pdfFilename = slugify(title) + ".pdf";
    const html = buildHtmlPage(title, messages, html2pdfSrc, pdfFilename);
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      alert("Pop-up blocked. Please allow pop-ups for this site and try again.");
      return;
    }
    tab.document.open();
    tab.document.write(html);
    tab.document.close();
  }

  // --- Menu injection ---

  function injectExportButton(menu) {
    if (menu.querySelector("[data-export-btn]")) return;

    const renameItem = menu.querySelector(RENAME_SELECTOR);
    if (!renameItem) return;

    const exportItem = document.createElement("div");
    exportItem.setAttribute("role", "menuitem");
    exportItem.setAttribute("tabindex", "-1");
    exportItem.setAttribute("data-export-btn", "true");
    exportItem.className = renameItem.className;
    exportItem.textContent = "Export";

    exportItem.addEventListener("mouseenter", () => {
      exportItem.setAttribute("data-highlighted", "");
    });
    exportItem.addEventListener("mouseleave", () => {
      exportItem.removeAttribute("data-highlighted");
    });

    exportItem.addEventListener("click", (e) => {
      e.stopPropagation();
      handleExportClick();

      menu.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
    });

    const separator = menu.querySelector('[role="separator"]');
    if (separator) {
      separator.before(exportItem);

      const newSep = document.createElement("div");
      newSep.setAttribute("data-orientation", "horizontal");
      newSep.setAttribute("role", "separator");
      newSep.setAttribute("aria-orientation", "horizontal");
      newSep.className = separator.className;
      separator.before(newSep);
    } else {
      renameItem.after(exportItem);
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const menus = [];
        if (node.matches && node.matches(MENU_SELECTOR)) {
          menus.push(node);
        }
        menus.push(...node.querySelectorAll(MENU_SELECTOR));

        for (const menu of menus) {
          if (menu.querySelector(RENAME_SELECTOR)) {
            injectExportButton(menu);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
