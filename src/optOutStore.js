const path = require('path');
const { loadJson, saveJson } = require('./utils');

const OPT_OUT_PATH = path.join(__dirname, '..', 'data', 'optouts.json');

function getOptOuts() {
  const data = loadJson(OPT_OUT_PATH, []);
  return Array.isArray(data) ? data : [];
}

function isOptedOut(contactId) {
  return getOptOuts().includes(contactId);
}

function optOut(contactId) {
  const current = new Set(getOptOuts());
  current.add(contactId);
  saveJson(OPT_OUT_PATH, [...current]);
}

function optIn(contactId) {
  const next = getOptOuts().filter((id) => id !== contactId);
  saveJson(OPT_OUT_PATH, next);
}

module.exports = {
  getOptOuts,
  isOptedOut,
  optOut,
  optIn
};
