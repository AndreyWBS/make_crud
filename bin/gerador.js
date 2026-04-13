#!/usr/bin/env node

const path = require('path');
const generate = require('../main');

const args = process.argv.slice(2);

const inputDir = (() => {
  const longIndex = args.indexOf('--input');
  if (longIndex !== -1 && args[longIndex + 1]) {
    return path.resolve(args[longIndex + 1]);
  }

  const shortIndex = args.indexOf('-i');
  if (shortIndex !== -1 && args[shortIndex + 1]) {
    return path.resolve(args[shortIndex + 1]);
  }

  const dirIndex = args.indexOf('--dir');
  if (dirIndex !== -1 && args[dirIndex + 1]) {
    return path.resolve(args[dirIndex + 1]);
  }

  const dirShortIndex = args.indexOf('-d');
  if (dirShortIndex !== -1 && args[dirShortIndex + 1]) {
    return path.resolve(args[dirShortIndex + 1]);
  }

  return process.cwd();
})();

const outputDir = (() => {
  const longIndex = args.indexOf('--output');
  if (longIndex !== -1 && args[longIndex + 1]) {
    return path.resolve(args[longIndex + 1]);
  }

  const shortIndex = args.indexOf('-o');
  if (shortIndex !== -1 && args[shortIndex + 1]) {
    return path.resolve(args[shortIndex + 1]);
  }

  return null;
})();

const configPath = (() => {
  const longIndex = args.indexOf('--config');
  if (longIndex !== -1 && args[longIndex + 1]) {
    return path.resolve(args[longIndex + 1]);
  }

  const shortIndex = args.indexOf('-c');
  if (shortIndex !== -1 && args[shortIndex + 1]) {
    return path.resolve(args[shortIndex + 1]);
  }

  return null;
})();

const dbConfigPath = (() => {
  const longIndex = args.indexOf('--db-config');
  if (longIndex !== -1 && args[longIndex + 1]) {
    return path.resolve(args[longIndex + 1]);
  }

  const shortIndex = args.indexOf('-b');
  if (shortIndex !== -1 && args[shortIndex + 1]) {
    return path.resolve(args[shortIndex + 1]);
  }

  return null;
})();

const envPath = (() => {
  const longIndex = args.indexOf('--env');
  if (longIndex !== -1 && args[longIndex + 1]) {
    return path.resolve(args[longIndex + 1]);
  }

  const shortIndex = args.indexOf('-e');
  if (shortIndex !== -1 && args[shortIndex + 1]) {
    return path.resolve(args[shortIndex + 1]);
  }

  return null;
})();

generate({ inputDir, outputDir, configPath, dbConfigPath, envPath, cliArgs: args }).catch(
  (error) => {
    console.error('Error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  },
);
