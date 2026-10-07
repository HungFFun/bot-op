import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

export type Cell = string | number | null;

/** Reads the first sheet of an .xlsx, or a .csv (comma or semicolon), into rows of cells. */
export async function readTable(buffer: Buffer, filename: string): Promise<Cell[][]> {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'csv') return readCsv(buffer);
  if (ext === 'xlsx') return readXlsx(buffer);
  throw new UnsupportedFileError();
}

export class UnsupportedFileError extends Error {}

function readCsv(buffer: Buffer): Cell[][] {
  const text = buffer.toString('utf8');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  // Excel with Vietnamese locale exports CSV with ';'.
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = parse(text, {
    bom: true,
    delimiter,
    relax_column_count: true,
    skip_empty_lines: false,
    trim: true,
  });
  return rows.map((r) => r.map((c) => (c === '' ? null : c)));
}

async function readXlsx(buffer: Buffer): Promise<Cell[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const rows: Cell[][] = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: Cell[] = [];
    for (let c = 1; c <= Math.max(row.cellCount, sheet.columnCount); c++) {
      cells.push(cellValue(row.getCell(c).value));
    }
    rows.push(cells);
  }
  return rows;
}

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if ('richText' in v)
    return (
      v.richText
        .map((t) => t.text)
        .join('')
        .trim() || null
    );
  if ('result' in v) return cellValue(v.result as ExcelJS.CellValue);
  if ('text' in v) return String(v.text).trim() || null;
  return null;
}
