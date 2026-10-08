const ROMAN_MONTHS = [
  'I',    // January (0)
  'II',   // February (1)
  'III',  // March (2)
  'IV',   // April (3)
  'V',    // May (4)
  'VI',   // June (5)
  'VII',  // July (6)
  'VIII', // August (7)
  'IX',   // September (8)
  'X',    // October (9)
  'XI',   // November (10)
  'XII',  // December (11)
];

export function getRomanMonth(monthIndex: number): string {
  const normalized = Math.max(0, Math.min(11, monthIndex));
  return ROMAN_MONTHS[normalized];
}

/**
 * Generates Xecura Invoice Number with format: INV/{SEQ}/ROMAN_MONTH/GMU/YEAR
 * Example: INV/001/VIII/GMU/2026
 * Sequence resets to 001 whenever month or year changes.
 */
export function generateNextInvoiceNumber(
  existingInvoices: Array<{ invoiceNumber?: string; issueDate?: any }> = [],
  issueDateInput: Date | string = new Date()
): string {
  const targetDate = issueDateInput instanceof Date ? issueDateInput : new Date(issueDateInput);
  const validDate = isNaN(targetDate.getTime()) ? new Date() : targetDate;

  const monthIndex = validDate.getMonth();
  const romanMonth = getRomanMonth(monthIndex);
  const year = validDate.getFullYear();

  // Match pattern: INV/{seq}/{romanMonth}/GMU/{year}
  const regex = new RegExp(`^INV/(\\d+)/${romanMonth}/GMU/${year}$`, 'i');

  let maxSeq = 0;

  for (const inv of existingInvoices) {
    if (!inv || !inv.invoiceNumber) continue;
    const match = inv.invoiceNumber.trim().match(regex);
    if (match && match[1]) {
      const seq = parseInt(match[1], 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }

  const nextSeq = maxSeq + 1;
  const formattedSeq = String(nextSeq).padStart(3, '0');

  return `INV/${formattedSeq}/${romanMonth}/GMU/${year}`;
}
