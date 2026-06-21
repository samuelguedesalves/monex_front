const NumberFormat = Intl.NumberFormat("en", {
  style: "decimal",
  minimumFractionDigits: 2,
});

export function formatMoney(value: number) {
  return `$ ${NumberFormat.format(value / 100)}`;
}