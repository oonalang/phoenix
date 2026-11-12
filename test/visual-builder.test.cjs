const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

let api;
const content = fs.readFileSync(
    path.join(__dirname, "../src/extensionsIntegrated/Phoenix-live-preview/VisualBuilderFiles.js"), "utf8"
);
vm.runInNewContext(content, {
    define(factory) {
        api = {};
        factory(null, api, {});
    },
    console
});

function file(name) {
    return {name, fullPath: "/site/" + name, isFile: true};
}

function directory(name, contents) {
    return {
        name,
        isDirectory: true,
        getContentsAsync: async function () {
            return {entries: contents};
        }
    };
}

test("uses the current project's index.html", async function () {
    const root = directory("site", [file("about.html"), file("index.html")]);
    assert.equal((await api.findProjectPage(root)).fullPath, "/site/index.html");
});

test("uses public/index.html when the root has no entry page", async function () {
    const page = file("index.html");
    page.fullPath = "/site/public/index.html";
    const root = directory("site", [file("about.html"), directory("public", [page])]);
    assert.equal((await api.findProjectPage(root)).fullPath, "/site/public/index.html");
});

test("uses an existing HTML page when there is no index.html", async function () {
    const root = directory("site", [file("styles.css"), file("landing.htm")]);
    assert.equal((await api.findProjectPage(root)).name, "landing.htm");
});

test("does not create a page for a project without HTML", async function () {
    const root = directory("site", [file("main.tsx")]);
    assert.equal(await api.findProjectPage(root), null);
});

test("works without an open project", async function () {
    assert.equal(await api.findProjectPage(null), null);
});
