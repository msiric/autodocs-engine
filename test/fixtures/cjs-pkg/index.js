const bar = require("./bar");

function foo() {
  return bar.value + 1;
}

module.exports = { foo };
exports.helper = function helper() {
  return "help";
};
