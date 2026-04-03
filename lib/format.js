export function formatAmount(value) {
  const num = Number(value) || 0;

  return num.toLocaleString("sl-SI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}