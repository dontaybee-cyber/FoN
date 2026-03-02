/**
 * ANSI-safe table renderer.
 * STANDARD: All tabular terminal output goes through renderTable.
 * Do not hand-roll column alignment or box-drawing elsewhere.
 */

export type TableRow = Record<string, string | number | boolean | undefined | null>;

export type TableOptions = {
  /** Column headers and their display order */
  columns: { key: string; label: string; width?: number }[];
  /** Optional row striping character (defaults to plain) */
  style?: "plain" | "bordered";
};

const STRIP_ANSI_RE = /\x1b\[[0-9;]*m/g;

function visibleLength(str: string): number {
  return str.replace(STRIP_ANSI_RE, "").length;
}

function padEnd(str: string, targetLen: number): string {
  const visible = visibleLength(str);
  const padding = Math.max(0, targetLen - visible);
  return str + " ".repeat(padding);
}

/**
 * Renders rows as an aligned ASCII table safe for terminal output.
 *
 * @example
 * renderTable(rows, {
 *   columns: [
 *     { key: "id",     label: "ID"     },
 *     { key: "status", label: "Status" },
 *     { key: "name",   label: "Name"   },
 *   ],
 * });
 */
export function renderTable(rows: TableRow[], opts: TableOptions): string {
  const { columns, style = "plain" } = opts;

  // Compute column widths: max of header label and all row values.
  const widths = columns.map((col) => {
    const headerLen = col.label.length;
    const maxDataLen = rows.reduce((max, row) => {
      const val = String(row[col.key] ?? "");
      return Math.max(max, visibleLength(val));
    }, 0);
    return col.width ?? Math.max(headerLen, maxDataLen);
  });

  const separator = widths.map((w) => "-".repeat(w)).join("  ");

  const header = columns
    .map((col, i) => padEnd(col.label.toUpperCase(), widths[i] ?? col.label.length))
    .join("  ");

  const dataRows = rows.map((row) =>
    columns
      .map((col, i) => {
        const val = String(row[col.key] ?? "");
        return padEnd(val, widths[i] ?? val.length);
      })
      .join("  "),
  );

  const lines: string[] = [];
  if (style === "bordered") {
    lines.push(separator);
    lines.push(header);
    lines.push(separator);
    lines.push(...dataRows);
    lines.push(separator);
  } else {
    lines.push(header);
    lines.push(separator);
    lines.push(...dataRows);
  }

  return lines.join("\n");
}
