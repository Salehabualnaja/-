// Build a typeset Arabic Word file from the exported JSON blocks (see references/typesetting-spec.md).
// usage: node build_docx.js IN.json OUT.docx "TITLE"
// env: BOOK_FONT (default Traditional Arabic), PAGE_CM (default 17x24)
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, FootnoteReferenceRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType, Header, Footer,
  PageNumber, VerticalAlign,
} = require('docx');

const [, , IN, OUT, TITLE] = process.argv;
const data = JSON.parse(fs.readFileSync(IN, 'utf8'));

const FONT = process.env.BOOK_FONT || 'Traditional Arabic';
const SZ = { body: 32, small: 26, foot: 24, footSmall: 22, h1: 44, h2: 38, h3: 32, marker: 18, header: 20, table: 26 };
const GRAY = '808080';
// book page, default 17 x 24 cm (1 cm = 566.93 twips)
const [PW_CM, PH_CM] = (process.env.PAGE_CM || '17x24').split('x').map(Number);
const PAGE_W = Math.round(PW_CM * 566.93), PAGE_H = Math.round(PH_CM * 566.93), M_TOP = 1191, M_BOT = 1134, M_SIDE = 1020;
const TEXT_W = PAGE_W - 2 * M_SIDE;

const font = { ascii: FONT, cs: FONT, hAnsi: FONT, eastAsia: FONT };
function run(text, o = {}) {
  const size = o.size || SZ.body;
  return new TextRun({
    text, font, size, sizeComplexScript: size, rightToLeft: true,
    bold: !!o.bold, boldComplexScript: !!o.bold,
    italics: !!o.italics, italicsComplexScript: !!o.italics,
    color: o.color,
  });
}

// footnote ids in order of first reference
const fnId = new Map();
function idFor(label) {
  if (!fnId.has(label)) fnId.set(label, fnId.size + 1);
  return fnId.get(label);
}

// inline markup -> runs
const TOK = /(\*\*|<small>|<\/small>|\[\^[^\]]+\]|\[صفحة [^\]]+\])/;
function runs(text, base = {}) {
  const out = [];
  let bold = !!base.bold, small = false;
  for (const part of text.split(TOK)) {
    if (!part) continue;
    if (part === '**') { bold = !bold; continue; }
    if (part === '<small>') { small = true; continue; }
    if (part === '</small>') { small = false; continue; }
    let m = part.match(/^\[\^([^\]]+)\]$/);
    if (m) { out.push(new FootnoteReferenceRun(idFor(m[1]))); continue; }
    if (/^\[صفحة [^\]]+\]$/.test(part)) {
      out.push(run('\u00A0' + part.replace(/ /g, '\u00A0') + ' ', { size: SZ.marker, color: GRAY }));
      continue;
    }
    const size = small ? (base.smallSize || SZ.small) : (base.size || SZ.body);
    out.push(run(part, { size, bold, color: base.color, italics: base.italics }));
  }
  return out;
}

function para(children, o = {}) {
  return new Paragraph({
    children, bidirectional: true,
    alignment: o.align || AlignmentType.BOTH,
    spacing: { before: o.before || 0, after: o.after === undefined ? 100 : o.after, line: o.line || 276 },
    indent: o.firstLine ? { firstLine: o.firstLine } : undefined,
    heading: o.heading, pageBreakBefore: !!o.pageBreakBefore, keepNext: !!o.keepNext,
    keepLines: !!o.keepLines,
  });
}

const NOBORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NOBORDERS = { top: NOBORDER, bottom: NOBORDER, left: NOBORDER, right: NOBORDER, insideHorizontal: NOBORDER, insideVertical: NOBORDER };
const THIN = { style: BorderStyle.SINGLE, size: 4, color: 'A0A0A0' };
const THINS = { top: THIN, bottom: THIN, left: THIN, right: THIN, insideHorizontal: THIN, insideVertical: THIN };

const LEAD = /^((?:\s*\[صفحة [^\]]+\]\s*|\s*\*\*\[[^\]]+\]\*\*\s*)+)/;

function verseTable(rows) {
  const out = [];
  const first = rows[0][0];
  const m = first.match(LEAD);
  if (m) {
    out.push(para(runs(m[1].trim()), { align: AlignmentType.START, after: 0, keepNext: true }));
    rows = [[first.slice(m[1].length).trim(), ...rows[0].slice(1)], ...rows.slice(1)];
  }
  const half = Math.floor(TEXT_W / 2);
  const tableRows = rows.map((r) => {
    if (r.length === 1 || !r[1]) {
      return new TableRow({ cantSplit: true, children: [new TableCell({
        columnSpan: 2, width: { size: half * 2, type: WidthType.DXA }, borders: NOBORDERS,
        children: [para(runs(r[0]), { align: AlignmentType.CENTER, after: 40 })] })] });
    }
    return new TableRow({ cantSplit: true, children: r.slice(0, 2).map((h) => new TableCell({
      width: { size: half, type: WidthType.DXA }, borders: NOBORDERS, verticalAlign: VerticalAlign.CENTER,
      children: [para(runs(h), { align: AlignmentType.CENTER, after: 40 })] })) });
  });
  out.push(new Table({
    rows: tableRows, width: { size: half * 2, type: WidthType.DXA }, columnWidths: [half, half],
    borders: NOBORDERS, visuallyRightToLeft: true,
  }));
  out.push(para([run('')], { after: 60, line: 120 }));
  return out;
}

function dataTable(rows) {
  const ncol = Math.max(...rows.map((r) => r.length));
  const narrow = 1300;
  const widths = ncol === 1 ? [TEXT_W] : [TEXT_W - narrow * (ncol - 1), ...Array(ncol - 1).fill(narrow)];
  return [new Table({
    width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: widths, borders: THINS, visuallyRightToLeft: true,
    rows: rows.map((r, i) => new TableRow({ tableHeader: i === 0, cantSplit: true, children: widths.map((w, j) => new TableCell({
      width: { size: w, type: WidthType.DXA }, borders: THINS,
      shading: i === 0 ? { type: ShadingType.CLEAR, fill: 'EDEDED', color: 'auto' } : undefined,
      margins: { left: 80, right: 80 },
      children: [para(runs(r[j] || '', { size: SZ.table, bold: i === 0 }), { align: j === 0 ? AlignmentType.START : AlignmentType.CENTER, after: 0 })],
    })) })),
  }), para([run('')], { after: 120 })];
}

// page breaks: before each front-matter page (2-4) and before every section/chapter heading;
// a heading's break moves back over a basmala, picture or page marker that precede it on the same page
const plainOf = (b) => (b.text || '').replace(/\[صفحة [^\]]+\]\s*/g, '').replace(/[\u064B-\u0652]/g, '').trim();
const isLead = (b) => b.t === 'marker' || (b.t === 'para' && (/^بسم\s/.test(plainOf(b)) || plainOf(b).startsWith('[صورة')));
const brk = new Array(data.blocks.length).fill(false);
data.blocks.forEach((b, i) => {
  const prev = data.blocks[i - 1];
  if ([2, 3, 4].includes(b.page) && (!prev || prev.page !== b.page)) brk[i] = true;
  if (b.t === 'h' && ((b.lvl === 1 && b.page > 4) || b.lvl === 2)) {
    let j = i;
    while (j > 0 && data.blocks[j - 1].page === b.page && isLead(data.blocks[j - 1])) j--;
    brk[j] = true;
  }
});
const children = [];
let bi = -1;
for (const b of data.blocks) {
  bi++;
  const front = b.page && b.page <= 4;
  const frontBreak = brk[bi];
  if (b.t === 'marker') {
    children.push(para(runs(b.text), { align: AlignmentType.START, after: 0, pageBreakBefore: frontBreak }));
  } else if (b.t === 'h') {
    const lvl = b.lvl;
    const isFront = b.page <= 4;
    const opt = lvl === 1
      ? { heading: HeadingLevel.HEADING_1, align: AlignmentType.CENTER, before: 240, after: 240, pageBreakBefore: frontBreak }
      : lvl === 2
        ? { heading: HeadingLevel.HEADING_2, align: AlignmentType.CENTER, before: 240, after: 200, pageBreakBefore: frontBreak }
        : { heading: HeadingLevel.HEADING_3, align: AlignmentType.START, before: 160, after: 80 };
    const size = lvl === 1 ? SZ.h1 : lvl === 2 ? SZ.h2 : SZ.h3;
    // page markers stay small and gray even inside headings
    children.push(para(runs(b.text, { size, bold: true }), { ...opt, keepNext: true }));
  } else if (b.t === 'verses') {
    children.push(...verseTable(b.v));
  } else if (b.t === 'table') {
    children.push(...dataTable(b.rows));
  } else if (b.t === 'para') {
    const t = b.text;
    const plain = t.replace(/\[صفحة [^\]]+\]\s*/g, '').trim();
    const isImage = plain.startsWith('[صورة');
    const isBasmala = /^بِ?سْ?مِ?\s/.test(plain.replace(/[ً-ْ]/g, '')) && plain.length < 60;
    const isEntry = plain.startsWith('**[');
    if (isImage) {
      children.push(para(runs(t, { color: GRAY, italics: true, size: SZ.small }), { align: AlignmentType.CENTER, pageBreakBefore: frontBreak }));
    } else if (front || isBasmala) {
      children.push(para(runs(t), { align: AlignmentType.CENTER, after: b.tight ? 40 : 120, pageBreakBefore: frontBreak }));
    } else {
      children.push(para(runs(t), { firstLine: isEntry || b.tight ? undefined : 567, after: b.tight ? 30 : 100, pageBreakBefore: frontBreak }));
    }
  }
}

// footnotes (only those referenced, in reference order)
const footnotes = {};
for (const [label, id] of fnId) {
  const f = data.footnotes[label];
  const ps = [para(runs(f.text, { size: SZ.foot, smallSize: SZ.footSmall }), { after: 20, line: 240 })];
  for (const v of f.verses || []) {
    ps.push(para(runs(v.filter(Boolean).join('     '), { size: SZ.foot }), { align: AlignmentType.CENTER, after: 20, line: 240 }));
  }
  footnotes[id] = { children: ps };
}

const doc = new Document({
  creator: 'saffomiri', title: TITLE,
  styles: {
    default: {
      document: { run: { font, size: SZ.body, sizeComplexScript: SZ.body, rightToLeft: true }, paragraph: { bidirectional: true } },
      heading1: { run: { font, size: SZ.h1, sizeComplexScript: SZ.h1, bold: true, boldComplexScript: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 240 }, keepNext: true, alignment: AlignmentType.CENTER } },
      heading2: { run: { font, size: SZ.h2, sizeComplexScript: SZ.h2, bold: true, boldComplexScript: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 200 }, keepNext: true, alignment: AlignmentType.CENTER } },
      heading3: { run: { font, size: SZ.h3, sizeComplexScript: SZ.h3, bold: true, boldComplexScript: true, color: '000000' }, paragraph: { spacing: { before: 160, after: 80 }, keepNext: true } },
    },
  },
  footnotes,
  sections: [{
    properties: {
      titlePage: true,
      page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: M_TOP, bottom: M_BOT, left: M_SIDE, right: M_SIDE, header: 560, footer: 560 } },
    },
    headers: { default: new Header({ children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'A0A0A0', space: 2 } },
      children: [run(TITLE, { size: SZ.header, color: '595959' })] })] }),
      first: new Header({ children: [new Paragraph({ children: [] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], font, size: SZ.header, sizeComplexScript: SZ.header })] })] }),
      first: new Footer({ children: [new Paragraph({ children: [] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('written', OUT, buf.length, 'bytes; footnotes', fnId.size, 'blocks', data.blocks.length);
});
