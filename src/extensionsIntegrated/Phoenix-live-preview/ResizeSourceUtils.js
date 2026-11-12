define(function (require, exports, module) {
    function openingTagEnd(source) {
        if (!/^<[A-Za-z][\w:-]*/.test(source)) {
            return -1;
        }
        let quote = "";
        for (let i = 1; i < source.length && i < 16384; i++) {
            const c = source[i];
            if (quote) {
                if (c === quote) {
                    quote = "";
                }
            } else if (c === "'" || c === '"') {
                quote = c;
            } else if (c === ">") {
                return i + 1;
            }
        }
        return -1;
    }

    function rewriteStyle(style, prop, value) {
        const pattern = new RegExp("(^|;)\\s*" + prop + "\\s*:[^;]*", "ig");
        const expression = prop + ": " + value + "px";
        if (pattern.test(style)) {
            return style.replace(pattern, function (_, separator) {
                return separator + " " + expression;
            });
        }
        const trimmed = style.trim();
        return trimmed + (trimmed && !trimmed.endsWith(";") ? "; " : " ") + expression;
    }

    function resizeOpeningTag(openTag, width, height) {
        if (!Number.isFinite(width) || !Number.isFinite(height) ||
                width < 1 || height < 1 || width > 100000 || height > 100000 ||
                openingTagEnd(openTag) !== openTag.length) {
            throw new Error("Invalid HTML resize request.");
        }
        const w = Math.round(width * 100) / 100;
        const h = Math.round(height * 100) / 100;
        const attribute = /(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/i;
        if (attribute.test(openTag)) {
            return openTag.replace(attribute, function (_, prefix, quote, value) {
                const result = rewriteStyle(rewriteStyle(value, "width", w), "height", h);
                return prefix + quote + result.trim() + quote;
            });
        }
        return openTag.replace(/\s*\/?>$/, function (end) {
            return ' style="width: ' + w + 'px; height: ' + h + 'px"' +
                (/\/\s*>$/.test(end) ? "/>" : ">");
        });
    }

    exports.openingTagEnd = openingTagEnd;
    exports.resizeOpeningTag = resizeOpeningTag;
});
