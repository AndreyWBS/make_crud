module.exports = {
  errorMiddleware: () => `
const logger = require('../utils/logger');
module.exports = (err, req, res, next) => {
    logger.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
};
`,

  logger: () => `
module.exports = {
    info: (msg) => console.log(\`[INFO] \${new Date().toISOString()}: \${msg}\`),
    error: (msg) => console.error(\`[ERROR] \${new Date().toISOString()}: \${msg}\`)
};
`,

  server: () => `
const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
app.listen(env.PORT, () => logger.info(\`Server running on port \${env.PORT}\`));
`,

  packageJson: () =>
    JSON.stringify(
      {
        name: "generated-api",
        version: "1.0.0",
        main: "src/server.js",
        scripts: { start: "node src/server.js" },
        dependencies: {
          express: "^4.18.2",
          mysql2: "^3.6.1",
          dotenv: "^16.3.1",
          jsonwebtoken: "^9.0.2",
          "swagger-ui-express": "^5.0.1",
        },
      },
      null,
      4,
    ),

  database: () => `
const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    port: env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
`,

  env: () => `
require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3000,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME,
    DB_PORT: Number(process.env.DB_PORT) || 3306,
    JWT_SECRET: process.env.JWT_SECRET || 'secret'
};
`,

  authMiddleware: () => `
const jwt = require('jsonwebtoken');
const env = require('../config/env');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const parts = authHeader.split(' ');
    if (parts.length !== 2) return res.status(401).json({ error: 'Token error' });

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) return res.status(401).json({ error: 'Token malformatted' });

    jwt.verify(token, env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Token invalid' });
        req.userId = decoded.id;
        return next();
    });
};
`,

  envfile: () => `PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=my_database
DB_PORT=3306
JWT_SECRET=your_jwt_secret
`,
};
