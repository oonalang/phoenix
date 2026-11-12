define(function (require, exports, module) {
    const Protocol = require("LiveDevelopment/MultiBrowserImpl/protocol/LiveDevProtocol");
    const LivePreview = require("LiveDevelopment/LiveDevMultiBrowser");
    const Instrumentation = require("LiveDevelopment/MultiBrowserImpl/language/HTMLInstrumentation");
    const Source = require("./ResizeSourceUtils");

    function persistResize(data) {
        const config = LivePreview.getConfig();
        if (!config || config.mode !== "edit" || !config.hasLiveEditCapability) {
            throw new Error("Select Edit mode to resize HTML elements.");
        }
        if (!data || !/^[1-9]\d*$/.test(String(data.tagId))) {
            throw new Error("The element has no editable HTML source.");
        }
        const width = Number(data.width);
        const height = Number(data.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) ||
                width < 1 || height < 1 || width > 100000 || height > 100000) {
            throw new Error("Invalid element dimensions.");
        }
        const liveDocument = LivePreview.getCurrentLiveDoc();
        if (!liveDocument || !liveDocument.doc || !liveDocument.doc.file ||
                !liveDocument.editor || !liveDocument.editor.document ||
                liveDocument.editor.document.file.fullPath !== liveDocument.doc.file.fullPath) {
            throw new Error("Open the previewed HTML file in the editor before resizing.");
        }
        const editor = liveDocument.editor;
        const cm = editor._codeMirror;
        if (!cm || !editor.document.editable) {
            throw new Error("This HTML file is read-only.");
        }
        const range = Instrumentation.getPositionFromTagId(editor, Number(data.tagId));
        if (!range || !range.from) {
            throw new Error("The selected HTML element was changed or removed.");
        }
        const start = cm.indexFromPos(range.from);
        const source = cm.getValue();
        const openingLength = Source.openingTagEnd(source.slice(start, start + 16384));
        if (openingLength < 0) {
            throw new Error("Cannot safely update this HTML opening tag.");
        }
        const original = source.slice(start, start + openingLength);
        const replacement = Source.resizeOpeningTag(original, width, height);
        if (original !== replacement) {
            cm.operation(function () {
                cm.replaceRange(replacement, range.from, cm.posFromIndex(start + openingLength),
                    "+live-preview-resize");
            });
        }
        return {saved: true};
    }

    Protocol.registerPhoenixFn("PH_RESIZE_SELECTED_ELEMENT", persistResize);
    exports.persistResize = persistResize;
});
