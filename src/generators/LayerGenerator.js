const path = require('path');
const fs = require('fs-extra');
const BaseGenerator = require('../core/BaseGenerator');
const { camelCase } = require('../utils/stringUtils');

class LayerGenerator extends BaseGenerator {
    constructor(targetDir, layerName, templateFn, extention = 'js') {
        super(targetDir);
        this.layerName = layerName; // e.g., 'controllers'
        this.templateFn = templateFn;
        this.extention = extention;
    }

    async generate(schema) {
        const tables = Object.keys(schema);
        const layerPath = path.join(this.targetDir, 'src', this.layerName);
        await fs.ensureDir(layerPath);

        for (const table of tables) {
            const baseLayerName = path.basename(this.layerName);
            let suffix;
            if (baseLayerName.endsWith('s')) {
                suffix = baseLayerName.charAt(0).toUpperCase() + baseLayerName.slice(1, -1);
            }
            else {
                suffix = baseLayerName.charAt(0).toUpperCase() + baseLayerName.slice(1);
            }
            if (baseLayerName === 'repositories') suffix = 'Repository';
            const fileName = `${camelCase(table)}${suffix}.${this.extention}`;
            const content = this.templateFn(table, schema[table]);
            await fs.writeFile(path.join(layerPath, fileName), content);
        }
    }
}

module.exports = LayerGenerator;


