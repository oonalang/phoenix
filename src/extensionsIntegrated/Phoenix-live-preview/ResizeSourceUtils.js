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
        const hasWidth = width !== null && width !== undefined;
        const hasHeight = height !== null && height !== undefined;
        if ((!hasWidth && !hasHeight) ||
                (hasWidth && (!Number.isFinite(width) || width < 1 || width > 100000)) ||
                (hasHeight && (!Number.isFinite(height) || height < 1 || height > 100000)) ||
                openingTagEnd(openTag) !== openTag.length) {
            throw new Error("Invalid HTML resize request.");
        }
        const w = hasWidth ? Math.round(width * 100) / 100 : null;
        const h = hasHeight ? Math.round(height * 100) / 100 : null;
        const attribute = /(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/i;
        if (attribute.test(openTag)) {
            return openTag.replace(attribute, function (_, prefix, quote, value) {
                let result = value;
                if (hasWidth) {
                    result = rewriteStyle(result, "width", w);
                }
                if (hasHeight) {
                    result = rewriteStyle(result, "height", h);
                }
                return prefix + quote + result.trim() + quote;
            });
        }
        const styles = [];
        if (hasWidth) {
            styles.push("width: " + w + "px");
        }
        if (hasHeight) {
            styles.push("height: " + h + "px");
        }
        return openTag.replace(/\s*\/?>$/, function (end) {
            return ' style="' + styles.join("; ") + '"' +
                (/\/\s*>$/.test(end) ? "/>" : ">");
        });
    }

    exports.openingTagEnd = openingTagEnd;
    exports.resizeOpeningTag = resizeOpeningTag;
});
