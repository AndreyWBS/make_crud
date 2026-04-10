const toTokens = (str = "") => {
  return String(str)
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
};

const pascalCase = (str) => {
  const tokens = toTokens(str);
  if (tokens.length === 0) return "";

  return tokens
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join("");
};

const camelCase = (str) => {
  const tokens = toTokens(str);
  if (tokens.length === 0) return "";

  return tokens
    .map((token, index) => {
      if (index === 0) {
        return token.charAt(0).toLowerCase() + token.slice(1);
      }
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join("");
};

module.exports = { pascalCase, camelCase };
