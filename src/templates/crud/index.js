const coreTemplates = require("./core");
const docsTemplates = require("./docs");
const apiClientTemplate = require("./apiClient");

module.exports = {
  ...coreTemplates,
  ...docsTemplates,
  ...apiClientTemplate,
};
