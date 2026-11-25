/* 실적 엑셀 내려받기
   '자율성과지표 현황' 양식(제목 · 2단 머리글 · 지수별 병합 · 비율반영 지표값 행 · 2026 빨간 테두리)으로
   .xlsx 파일을 브라우저에서 바로 만듭니다. 외부 라이브러리나 인터넷 연결이 필요 없습니다.
   달성률·비율반영 지표값은 엑셀 수식으로 넣어, 파일에서 값을 고치면 자동으로 다시 계산됩니다. */
(function () {
  'use strict';
  var K = window.KPI;

  /* ---------- ZIP (무압축) ---------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) { // files: [{name, data: Uint8Array}]
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- 스타일 ---------- */
  function x(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function Styles() {
    this.fonts = ['<font><sz val="10"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font>'];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.numFmts = []; this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.cache = {};
  }
  Styles.prototype.idx = function (list, xml) { // 같은 글꼴·채우기·테두리는 한 번만 등록
    var found = list.indexOf(xml);
    if (found >= 0) return found;
    list.push(xml);
    return list.length - 1;
  };
  Styles.prototype.get = function (st) {
    var key = JSON.stringify(st);
    if (this.cache[key] !== undefined) return this.cache[key];
    var f = st.font || {};
    var fontXml = '<font>' + (f.b ? '<b/>' : '') + '<sz val="' + (f.sz || 10) + '"/>' + (f.color ? '<color rgb="FF' + f.color + '"/>' : '') +
      '<name val="맑은 고딕"/><family val="3"/><charset val="129"/></font>';
    var fontId = this.idx(this.fonts, fontXml);
    var fillId = st.fill ? this.idx(this.fills, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + st.fill + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
    var b = st.border || {};
    var edge = function (name) {
      var e = b[name];
      return e ? '<' + name + ' style="' + e[0] + '"><color rgb="FF' + e[1] + '"/></' + name + '>' : '<' + name + '/>';
    };
    var borderId = st.border ? this.idx(this.borders, '<border>' + edge('left') + edge('right') + edge('top') + edge('bottom') + '<diagonal/></border>') : 0;
    var numFmtId = 0;
    if (st.fmt) {
      var builtIn = { '0': 1, '0.00': 2, '#,##0': 3, '0%': 9, '0.00%': 10 };
      if (builtIn[st.fmt] !== undefined) numFmtId = builtIn[st.fmt];
      else {
        var found = -1;
        this.numFmts.forEach(function (n, i) { if (n === st.fmt) found = i; });
        if (found < 0) { this.numFmts.push(st.fmt); found = this.numFmts.length - 1; }
        numFmtId = 164 + found;
      }
    }
    var a = st.align || {};
    var xf = '<xf numFmtId="' + numFmtId + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0"' +
      (numFmtId ? ' applyNumberFormat="1"' : '') + ' applyFont="1"' + (fillId ? ' applyFill="1"' : '') + (borderId ? ' applyBorder="1"' : '') +
      ' applyAlignment="1"><alignment horizontal="' + (a.h || 'center') + '" vertical="center"' + (a.h === 'left' ? ' indent="1"' : '') + (a.wrap ? ' wrapText="1"' : '') + (a.shrink ? ' shrinkToFit="1"' : '') + '/></xf>';
    this.xfs.push(xf);
    this.cache[key] = this.xfs.length - 1;
    return this.cache[key];
  };
  Styles.prototype.xml = function () {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (this.numFmts.length ? '<numFmts count="' + this.numFmts.length + '">' + this.numFmts.map(function (f, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + x(f) + '"/>'; }).join('') + '</numFmts>' : '') +
      '<fonts count="' + this.fonts.length + '">' + this.fonts.join('') + '</fonts>' +
      '<fills count="' + this.fills.length + '">' + this.fills.join('') + '</fills>' +
      '<borders count="' + this.borders.length + '">' + this.borders.join('') + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + this.xfs.length + '">' + this.xfs.join('') + '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="표준" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  };

  /* ---------- 시트 ---------- */
  var COLS = 'ABCDEFGHIJ';
  function build(data) {
    K.normalize(data);
    var m = data.meta, r = K.compute(data), S = new Styles();
    var year = Number(String(m.periodStart || '').slice(0, 4)) || new Date().getFullYear();
    var cells = {}, merges = [], heights = {};
    var C_IN = '808080', C_RED = 'FF0000', C_BLUE = '1F3FBF', HEAD = 'D9E1F2', SUM = 'FFF2CC';
    function set(ref, v, st, formula) { cells[ref] = { v: v, st: st || {}, f: formula }; }

    var last = 3 + r.indices.reduce(function (s, ix) { return s + ix.items.length + 1; }, 0); // 마지막 표 행

    // 테두리: 안쪽은 가는 회색, 2026 열(E~G)은 빨간 굵은 테두리, 표 바깥은 파란 굵은 테두리
    function borderFor(col, row) {
      var t = ['thin', C_IN], b = {
        left: col === 'A' ? ['medium', C_BLUE] : col === 'E' && row >= 2 ? ['medium', C_RED] : t,
        right: col === 'J' ? ['medium', C_BLUE] : col === 'G' && row >= 2 ? ['medium', C_RED] : t,
        top: row === 1 ? ['medium', C_BLUE] : row === 2 && 'EFG'.indexOf(col) >= 0 ? ['medium', C_RED] : row === 2 ? ['medium', '000000'] : t,
        bottom: row === last ? ('EFG'.indexOf(col) >= 0 ? ['medium', C_RED] : ['medium', C_BLUE]) : row === 1 ? ['medium', '000000'] : t
      };
      return b;
    }
    function st(col, row, extra) { return Object.assign({ border: borderFor(col, row) }, extra || {}); }

    // 1행 제목
    set('A1', year + '학년도 전문대학 혁신지원사업 자율성과지표 현황', st('A', 1, { font: { b: true, sz: 16 } }));
    for (var i = 1; i < 10; i++) set(COLS[i] + '1', '', st(COLS[i], 1));
    merges.push('A1:J1'); heights[1] = 36;

    // 2~3행 머리글
    var H = { fill: HEAD, font: { b: true } }, HR = { fill: HEAD, font: { b: true, color: C_RED } };
    var head2 = { A: '지표명', B: '세부지수', C: '반영비중\n(%)', D: String(year - 1), E: String(year), F: '', G: '', H: '목표값', I: '지표관리부서', J: '비고' };
    var head3 = { A: '', B: '', C: '', D: '달성값', E: '목표값', F: '달성값', G: '달성률', H: String(year + 1), I: '', J: '' };
    Object.keys(head2).forEach(function (c) {
      set(c + '2', head2[c], st(c, 2, Object.assign({}, H, { align: { h: 'center', wrap: true } })));
      set(c + '3', head3[c], st(c, 3, 'EFG'.indexOf(c) >= 0 ? HR : H));
    });
    ['A', 'B', 'C', 'I', 'J'].forEach(function (c) { merges.push(c + '2:' + c + '3'); });
    merges.push('E2:G2'); heights[2] = 22; heights[3] = 20;

    // 지수별 행
    var row = 4;
    r.indices.forEach(function (ix) {
      var r0 = row, rN = row + ix.items.length - 1, sumRow = rN + 1;
      ix.items.forEach(function (it) {
        var cur = it.state === 'missing' ? null : K.num(it.current);
        var numFmt = function (v) { return v !== null && v !== undefined && !Number.isInteger(Number(v)) ? '0.0#' : '#,##0'; };
        var y1 = K.num(it.y1Actual), t2 = K.num(it.targets.y2), t3 = K.num(it.targets.y3);
        set('A' + row, String(ix.name).replace(/(.)혁신지수$/, '$1\n혁신지수'), st('A', row, { align: { h: 'center', wrap: true } }));
        set('B' + row, it.name + '(' + it.unit + ')', st('B', row, { align: { h: 'left', shrink: true } }));
        set('C' + row, (K.num(it.weight) || 0) / 100, st('C', row, { fmt: '0%' }));
        set('D' + row, y1, st('D', row, { fmt: numFmt(y1) }));
        set('E' + row, t2, st('E', row, { fmt: numFmt(t2) }));
        set('F' + row, cur, st('F', row, { fmt: numFmt(cur) }));
        var rate = cur !== null && t2 ? cur / t2 : '';
        set('G' + row, rate, st('G', row, { fmt: '0.0%' }), 'IF(OR(E' + row + '="",F' + row + '=""),"",F' + row + '/E' + row + ')');
        set('H' + row, t3, st('H', row, { fmt: numFmt(t3) }));
        set('I' + row, it.dept || '', st('I', row, { align: { h: 'center', shrink: true } }));
        var tag = it.state === 'pending' ? '[측정 전] ' : it.state === 'missing' ? '[미입력] ' : '';
        set('J' + row, tag + (it.note || ''), st('J', row, { align: { h: 'center', shrink: true } }));
        heights[row] = 22;
        row++;
      });
      // 비율반영 지표값 행
      var S2 = { fill: SUM, font: { b: true } };
      var rng = function (c) { return c + r0 + ':' + c + rN; };
      set('A' + sumRow, '', st('A', sumRow, { align: { h: 'center', wrap: true } }));
      set('B' + sumRow, '비율반영 지표값(%)', st('B', sumRow, S2));
      set('C' + sumRow, ix.items.reduce(function (s, it) { return s + (K.num(it.weight) || 0); }, 0) / 100, st('C', sumRow, Object.assign({ fmt: '0%' }, S2)), 'SUM(' + rng('C') + ')');
      set('D' + sumRow, ix.y1 ? K.num(ix.y1.actual) : null, st('D', sumRow, Object.assign({ fmt: '0.0' }, S2)));
      set('E' + sumRow, ix.tgt, st('E', sumRow, Object.assign({ fmt: '0.0' }, S2)), 'SUMPRODUCT(' + rng('E') + '/' + rng('H') + ',' + rng('C') + ')*100');
      set('F' + sumRow, ix.cur, st('F', sumRow, Object.assign({ fmt: '0.0' }, S2)), 'SUMPRODUCT(' + rng('F') + '/' + rng('H') + ',' + rng('C') + ')*100');
      set('G' + sumRow, ix.tgt ? ix.cur / ix.tgt : '', st('G', sumRow, Object.assign({ fmt: '0.0%' }, S2)), 'IF(E' + sumRow + '=0,"",F' + sumRow + '/E' + sumRow + ')');
      set('H' + sumRow, 100, st('H', sumRow, Object.assign({ fmt: '0' }, S2)));
      set('I' + sumRow, '', st('I', sumRow, S2));
      set('J' + sumRow, '', st('J', sumRow, S2));
      merges.push('A' + r0 + ':A' + sumRow);
      heights[sumRow] = 22;
      row = sumRow + 1;
    });

    // 표 아래 출처
    var note = row + 1;
    var asOf = K.dotDate(m.asOfDate);
    set('A' + note, '자료: ' + (m.dataBasis || '') + (asOf ? ' · 실적 기준일 ' + asOf : '') + ' · 진척률(달성률) = 달성값 ÷ 목표값, 비율반영 지표값 = Σ(값 ÷ ' + (year + 1) + ' 목표값 × 반영비중) · 내려받은 시각 ' +
      K.clockText(new Date()).replace(/:\d\d KST$/, '') + ' · ' + (m.university || '') + ' ' + ((m.unit || '').split('·')[0] || '').trim(),
      { font: { sz: 9, color: '595959' }, align: { h: 'left', wrap: true } });
    merges.push('A' + note + ':J' + note); heights[note] = 30;

    // 시트 XML
    var rowsXml = '';
    var maxRow = note;
    for (var rr = 1; rr <= maxRow; rr++) {
      var rowCells = '';
      for (var ci = 0; ci < COLS.length; ci++) {
        var ref = COLS[ci] + rr, c = cells[ref];
        if (!c) continue;
        var s = S.get(c.st);
        if (c.f) {
          var isStr = typeof c.v === 'string';
          rowCells += '<c r="' + ref + '" s="' + s + '"' + (isStr ? ' t="str"' : '') + '><f>' + x(c.f) + '</f>' +
            (c.v === null || c.v === undefined ? '' : '<v>' + x(c.v) + '</v>') + '</c>';
        } else if (c.v === null || c.v === undefined || c.v === '') {
          rowCells += '<c r="' + ref + '" s="' + s + '"/>';
        } else if (typeof c.v === 'number') {
          rowCells += '<c r="' + ref + '" s="' + s + '"><v>' + c.v + '</v></c>';
        } else {
          rowCells += '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + x(c.v) + '</t></is></c>';
        }
      }
      rowsXml += '<row r="' + rr + '"' + (heights[rr] ? ' ht="' + heights[rr] + '" customHeight="1"' : '') + '>' + rowCells + '</row>';
    }
    var widths = [14, 34, 10, 10, 10, 10, 10, 10, 26, 26];
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:J' + maxRow + '"/>' +
      '<sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="100"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="16.5"/>' +
      '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' +
      '<sheetData>' + rowsXml + '</sheetData>' +
      '<mergeCells count="' + merges.length + '">' + merges.map(function (mm) { return '<mergeCell ref="' + mm + '"/>'; }).join('') + '</mergeCells>' +
      '<printOptions horizontalCentered="1"/>' +
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';

    var sheetName = '자율성과지표 현황';
    var enc = new TextEncoder();
    var files = [
      { name: '[Content_Types].xml', xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="' + x(sheetName) + '" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">\'' + x(sheetName) + '\'!$A$1:$J$' + maxRow + '</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/worksheets/sheet1.xml', xml: sheet },
      { name: 'xl/styles.xml', xml: S.xml() }
    ].map(function (f) { return { name: f.name, data: enc.encode(f.xml) }; });
    return { blob: zip(files), year: year };
  }

  function download() {
    var data = window.KPI_CURRENT;
    if (!data) { window.alert('자료를 불러온 뒤 다시 눌러 주세요.'); return; }
    var out = build(JSON.parse(JSON.stringify(data)));
    var p = K.clockText(new Date());
    var stamp = p.slice(0, 10).replace(/\./g, '');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(out.blob);
    a.download = out.year + '학년도_자율성과지표_현황_' + stamp + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  window.KPIExcel = { build: build, download: download };
  var btn = document.getElementById('excelBtn');
  if (btn) btn.addEventListener('click', download);
})();
