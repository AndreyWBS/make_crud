class BaseGenerator {
    constructor(targetDir) {
        this.targetDir = targetDir;
    }

    // Abstract method to be implemented by subclasses
    async generate(schema) {
        throw new Error("Method 'generate()' must be implemented.");
    }
}

module.exports = BaseGenerator;
