class GeneratorEngine {
    constructor(introspector) {
        this.introspector = introspector;
        this.generators = [];
    }

    addGenerator(generator) {
        this.generators.push(generator);
        return this;
    }

    async run() {
        console.log("Starting introspection...");
        const schema = await this.introspector.getSchema();
        
        console.log("Executing generators...");
        for (const generator of this.generators) {
            await generator.generate(schema);
        }
        console.log("Generation finished successfully.");
    }
}

module.exports = GeneratorEngine;
