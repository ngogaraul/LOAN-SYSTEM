export function buildDefaultCreditline(client) {
  const seed = String(client?.account || client?.id || "CLIENT")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16) || "CLIENT";
  const stamp = Date.now().toString().slice(-8);
  return `AUTO-${seed}-${stamp}`;
}

export function calculateTermMonths(amount, paymentPlan) {
  const parsedAmount = Number(amount);
  const parsedPaymentPlan = Number(paymentPlan);

  if (!parsedAmount || parsedAmount <= 0 || !parsedPaymentPlan || parsedPaymentPlan <= 0) {
    return "";
  }

  return String(Math.ceil(parsedAmount / parsedPaymentPlan));
}
