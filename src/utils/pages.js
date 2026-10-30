// New page order (1-based page numbers) after moving page `from` to position `to`.
export function movePage(total, from, to) {
  const order = Array.from({ length: total }, (_, index) => index + 1);
  if (from < 1 || from > total || to < 1 || to > total) return order;
  order.splice(from - 1, 1);
  order.splice(to - 1, 0, from);
  return order;
}
