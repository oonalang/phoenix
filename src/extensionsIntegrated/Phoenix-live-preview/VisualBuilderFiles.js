define(function (require, exports, module) {
    async function readEntries(directory) {
        if (!directory || typeof directory.getContentsAsync !== "function") {
            return [];
        }
        const result = await directory.getContentsAsync();
        return result && Array.isArray(result.entries) ? result.entries : [];
    }

    function matchingFile(entries, filename) {
        return entries.find(function (entry) {
            return entry && entry.isFile && entry.name.toLowerCase() === filename;
        }) || null;
    }

    async function findProjectPage(root) {
        if (!root) {
            return null;
        }
        const entries = await readEntries(root);
        const primary = matchingFile(entries, "index.html");
        if (primary) {
            return primary;
        }
        for (const dirname of ["public", "src", "app"]) {
            const directory = entries.find(function (entry) {
                return entry && entry.isDirectory && entry.name.toLowerCase() === dirname;
            });
            if (directory) {
                try {
                    const nested = matchingFile(await readEntries(directory), "index.html");
                    if (nested) {
                        return nested;
                    }
                } catch (error) {
                    console.warn("Visual Builder could not inspect", dirname, error);
                }
            }
        }
        return entries.find(function (entry) {
            return entry && entry.isFile && /\.html?$/i.test(entry.name);
        }) || null;
    }

    exports.findProjectPage = findProjectPage;
});
