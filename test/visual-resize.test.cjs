const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

let utils = null;
const source = fs.readFileSync(path.join(__dirname, "../src/extensionsIntegrated/Phoenix-live-preview/ResizeSourceUtils.js"), "utf8");
vm.runInNewContext(source, {
    define(factory) {
        const exports = {};
        factory(null, exports, {});
        utils = exports;
    }
});

test("adds inline dimensions to ordinary tags", function () {
    assert.equal(utils.resizeOpeningTag('<div class="card">', 120, 80),
        '<div class="card" style="width: 120px; height: 80px">');
});

test("respects quoted > and self-closing tags", function () {
    assert.equal(utils.resizeOpeningTag('<img alt="a>b" />', 42, 65),
        '<img alt="a>b" style="width: 42px; height: 65px"/>');
});

test("replaces existing declarations without changing unrelated styles", function () {
    assert.equal(utils.resizeOpeningTag('<div style="color:red;width:10px;height:20px">', 50, 25),
        '<div style="color:red; width: 50px; height: 25px">');
});

test("preserves single-quoted style attributes", function () {
    assert.equal(utils.resizeOpeningTag("<span style='padding: 4px'>", 90, 30),
        "<span style='padding: 4px; width: 90px; height: 30px'>");
});

test("rejects non-tag input and dimensions outside bounds", function () {
    assert.throws(function () {
        utils.resizeOpeningTag("not HTML", 30, 30);
    });
    assert.throws(function () {
        utils.resizeOpeningTag("<div>", -1, 30);
    });
    assert.throws(function () {
        utils.resizeOpeningTag("<div>", 30, Infinity);
    });
});
