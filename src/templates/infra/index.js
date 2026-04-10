const basicsTemplates = require("./basics");
const swaggerTemplates = require("./swagger");
const documentationTemplates = require("./documentation");

module.exports = {
  ...basicsTemplates,
  ...swaggerTemplates,
  ...documentationTemplates,
};
