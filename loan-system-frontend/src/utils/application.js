function normalizeCreditlineSeed(client) {
  return String(client?.account || client?.id || "0000000")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16) || "0000000";
}

export function buildDefaultCreditline(client, existingCreditlines = []) {
  const seed = normalizeCreditlineSeed(client);
  const pattern = new RegExp(`^${seed}-(\\d{2})-(\\d{3})$`);

  let maxGroup = 1;
  let maxSequence = 0;

  for (const row of existingCreditlines) {
    const value = typeof row === "string" ? row : row?.creditline;
    const match = pattern.exec(String(value || "").trim());
    if (!match) continue;

    const group = Number(match[1]);
    const sequence = Number(match[2]);

    if (group > maxGroup || (group === maxGroup && sequence > maxSequence)) {
      maxGroup = group;
      maxSequence = sequence;
    }
  }

  maxSequence += 1;
  if (maxSequence > 999) {
    maxGroup += 1;
    maxSequence = 1;
  }

  return `${seed}-${String(maxGroup).padStart(2, "0")}-${String(maxSequence).padStart(3, "0")}`;
}

export function calculateTermMonths(amount, paymentPlan) {
  const parsedAmount = Number(amount);
  const parsedPaymentPlan = Number(paymentPlan);

  if (!parsedAmount || parsedAmount <= 0 || !parsedPaymentPlan || parsedPaymentPlan <= 0) {
    return "";
  }

  return String(Math.ceil(parsedAmount / parsedPaymentPlan));
}
