/** Appends a structured negotiation-trail entry to an Order document
 * in-place — caller still needs to `.save()`. Shared by clientController and
 * tailorController so both sides of a deal write the exact same shape.
 * `type` is inferred: the first-ever entry (or first price-bearing entry)
 * is a 'quote', a status transition into 'confirmed' is an 'acceptance',
 * and everything else is a 'counter'. */
function appendNegotiationEntry(order, { author, amount, notes, becameConfirmed }) {
  const type = becameConfirmed ? 'acceptance' : order.negotiationHistory.length === 0 ? 'quote' : 'counter';
  order.negotiationHistory.push({
    authorId: author._id,
    authorRole: author.role,
    authorName: author.name,
    amount,
    notes: notes || '',
    type,
  });
}

module.exports = { appendNegotiationEntry };
