const pascalCase = (str) => {
    return str
        .replace(/(_\w)/g, (m) => m[1].toUpperCase())
        .replace(/^\w/, (m) => m.toUpperCase());
};

const camelCase = (str) => {
    return str.replace(/(_\w)/g, (m) => m[1].toUpperCase());
};

module.exports = { pascalCase, camelCase };
