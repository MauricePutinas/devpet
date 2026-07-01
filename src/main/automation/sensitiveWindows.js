// Heuristic blocklist: if the active window title matches any of these, the text
// pattern detector must not buffer ANY typed characters for it — not even transiently.
// Broad on purpose (false positives just mean "text detection skipped there", which is
// harmless; a false negative could mean a password ends up compared in memory).
const PATTERNS = [
  /password/i, /passwort/i, /anmelden/i, /\blogin\b/i, /log ?in/i, /sign ?in/i,
  /2fa|zwei-faktor|two-factor|mfa\b/i,
  /1password/i, /bitwarden/i, /keepass/i, /lastpass/i, /dashlane/i, /nordpass/i,
  /private browsing|inprivate|incognito/i,
  /paypal/i, /\bbank(ing)?\b/i, /wallet/i, /sparkasse|volksbank|kreditkarte/i,
  /wintotal-secrets|\.secrets\b/i,
];

function isSensitiveWindow(title) {
  const t = String(title || '');
  if (!t) return false;
  return PATTERNS.some((re) => re.test(t));
}

module.exports = { isSensitiveWindow };
