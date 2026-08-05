export function formatMoney(amount: number | null): string {
  if (amount == null) return "Unknown";
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
