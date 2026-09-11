/** Escapes regex metacharacters so user input can be used safely inside a
 * `$regex` filter (prevents ReDoS and unintended pattern matching). */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegExp };
