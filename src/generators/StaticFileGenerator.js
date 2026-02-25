const path = require('path');
const fs = require('fs-extra');
const BaseGenerator = require('../core/BaseGenerator');

class StaticFileGenerator extends BaseGenerator {
    constructor(targetDir, relativePath, templateFn) {
        super(targetDir);
        this.relativePath = relativePath; // e.g., 'src/config/database.js'
        this.templateFn = templateFn;
    }

    async generate(schema) {
        const fullPath = path.join(this.targetDir, this.relativePath);
        await fs.ensureDir(path.dirname(fullPath));
        const content = this.templateFn(Object.keys(schema), schema);
        await fs.writeFile(fullPath, content);
    }
}

module.exports = StaticFileGenerator;
