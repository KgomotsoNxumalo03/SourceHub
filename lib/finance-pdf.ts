import { formatMinorUnits } from "@/lib/money";

function escapePdf(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildFinancePdf({
  title, number, company, client, currency, lines, totals, notes,
}: { title: string; number: string; company: string; client: string; currency: string; lines: Array<{ description: string; quantity: string; lineTotalMinorUnits: number }>; totals: { subtotalMinorUnits: number; vatMinorUnits: number; totalMinorUnits: number }; notes?: string | null }) {
  const text = [
    title, `${company} | ${number}`, `Bill to: ${client}`, "",
    ...lines.map((line) => `${line.quantity} x ${line.description}  ${formatMinorUnits(line.lineTotalMinorUnits, currency)}`),
    "", `Subtotal: ${formatMinorUnits(totals.subtotalMinorUnits, currency)}`, `VAT: ${formatMinorUnits(totals.vatMinorUnits, currency)}`, `Total: ${formatMinorUnits(totals.totalMinorUnits, currency)}`,
    notes ? `Notes: ${notes}` : "",
  ].filter(Boolean);
  let y = 760;
  const commands = ["BT", "/F1 11 Tf"];
  for (const line of text) { commands.push(`1 0 0 1 48 ${y} Tm (${escapePdf(line.slice(0, 180))}) Tj`); y -= 18; if (y < 48) break; }
  commands.push("ET");
  const content = commands.join("\n");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}
