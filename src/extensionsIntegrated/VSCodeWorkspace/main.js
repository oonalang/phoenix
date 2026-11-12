define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    const CommandManager = require("command/CommandManager");
    const Commands = require("command/Commands");
    const EditorManager = require("editor/EditorManager");
    const ExtensionUtils = require("utils/ExtensionUtils");
    const PreferencesManager = require("preferences/PreferencesManager");
    const CodeMirror = require("thirdparty/CodeMirror/lib/codemirror");
    const Strings = require("strings");

    const PREF = "vscodeWorkbench.aiCompletions";
    const DEFAULTS = {enabled: false, endpoint: "", model: "", debounceMs: 650};
    const NAV = [
        ["explorer", Strings.VSCODE_EXPLORER, "fa-folder-open", null],
        ["search", Strings.VSCODE_SEARCH, "fa-magnifying-glass", Commands.CMD_FIND_IN_FILES],
        ["source", Strings.VSCODE_SOURCE, "fa-code-branch", Commands.CMD_GIT_TOGGLE_PANEL],
        ["extensions", Strings.VSCODE_EXTENSIONS, "fa-puzzle-piece", Commands.FILE_EXTENSION_MANAGER],
        ["terminal", Strings.VSCODE_TERMINAL, "fa-terminal", Commands.VIEW_TERMINAL]
    ];

    let mirror = null;
    let controller = null;
    let timer = null;
    let bookmark = null;
    let completion = "";
    let position = null;
    let sequence = 0;

    PreferencesManager.definePreference(PREF, "object", DEFAULTS);
    ExtensionUtils.loadStyleSheet(module, "style.css");

    function settings() {
        return Object.assign({}, DEFAULTS, PreferencesManager.get(PREF) || {});
    }

    function endpoint(url) {
        try {
            const parsed = new URL(url);
            const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
            if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
                return null;
            }
            if (parsed.username || parsed.password) {
                return null;
            }
            return parsed.href;
        } catch (error) {
            return null;
        }
    }

    function clear() {
        sequence++;
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        if (controller) {
            controller.abort();
            controller = null;
        }
        if (bookmark) {
            bookmark.clear();
            bookmark = null;
        }
        completion = "";
        position = null;
    }

    function extract(data) {
        if (!data || typeof data !== "object") {
            return "";
        }
        let text = data.completion || data.text || "";
        if (!text && Array.isArray(data.choices) && data.choices.length) {
            const first = data.choices[0];
            text = first.text || (first.message && first.message.content) || "";
        }
        return typeof text === "string" ? text.slice(0, 4096).replace(/\r\n/g, "\n") : "";
    }

    async function fetchCompletion(cm, version, editor) {
        const opts = settings();
        const url = endpoint(opts.endpoint);
        if (!opts.enabled || !url || mirror !== cm || version !== sequence) {
            return;
        }
        const cursor = cm.getCursor();
        const line = cm.getLine(cursor.line);
        if (cursor.ch !== line.length || !line.trim() || cm.somethingSelected()) {
            return;
        }
        const offset = cm.indexFromPos(cursor);
        const contents = cm.getValue();
        const abort = new AbortController();
        controller = abort;
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    model: opts.model,
                    prefix: contents.slice(Math.max(offset - 5000, 0), offset),
                    suffix: contents.slice(offset, offset + 2000),
                    language: cm.getOption("mode"),
                    filename: editor.document && editor.document.file ? editor.document.file.name : ""
                }),
                signal: abort.signal
            });
            if (!response.ok) {
                return;
            }
            const value = extract(await response.json());
            const current = cm.getCursor();
            if (value && !abort.signal.aborted && version === sequence && mirror === cm &&
                    current.line === cursor.line && current.ch === cursor.ch) {
                clear();
                const ghost = document.createElement("span");
                ghost.className = "vscode-inline-ghost";
                ghost.setAttribute("aria-hidden", "true");
                ghost.textContent = value;
                bookmark = cm.setBookmark(cursor, {widget: ghost, insertLeft: true});
                completion = value;
                position = cursor;
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                console.warn("Inline completion unavailable:", error.message);
            }
        } finally {
            if (controller === abort) {
                controller = null;
            }
        }
    }

    function changed(cm, change) {
        clear();
        const opts = settings();
        if (!opts.enabled || !endpoint(opts.endpoint) || !change || change.origin !== "+input" ||
                change.text.length !== 1 || !/^[\w.(){}\[\]:= ]$/.test(change.text[0])) {
            return;
        }
        const current = sequence;
        const editor = EditorManager.getCurrentFullEditor();
        timer = setTimeout(function () {
            timer = null;
            fetchCompletion(cm, current, editor);
        }, Math.max(300, Math.min(3000, Number(opts.debounceMs) || 650)));
    }

    function keyTab(cm) {
        if (!bookmark || !completion || !position) {
            return CodeMirror.Pass;
        }
        const text = completion;
        const cursor = position;
        clear();
        cm.replaceRange(text, cursor, cursor, "+inlineSuggestion");
        return undefined;
    }

    function keyEsc() {
        if (!bookmark) {
            return CodeMirror.Pass;
        }
        clear();
        return undefined;
    }

    const keymap = {Tab: keyTab, Esc: keyEsc};

    function cursorMoved(cm) {
        if (!bookmark || !position) {
            return;
        }
        const cursor = cm.getCursor();
        if (cursor.line !== position.line || cursor.ch !== position.ch) {
            clear();
        }
    }

    function bindEditor() {
        const editor = EditorManager.getCurrentFullEditor();
        const next = editor && editor._codeMirror;
        if (next === mirror) {
            return;
        }
        clear();
        if (mirror) {
            mirror.off("change", changed);
            mirror.off("cursorActivity", cursorMoved);
            mirror.removeKeyMap(keymap);
        }
        mirror = next;
        if (mirror) {
            mirror.on("change", changed);
            mirror.on("cursorActivity", cursorMoved);
            mirror.addKeyMap(keymap, true);
        }
    }

    function element(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) {
            node.className = cls;
        }
        if (text) {
            node.textContent = text;
        }
        return node;
    }

    function field(form, title, name, value, type) {
        const label = element("label", "vscode-settings-field");
        label.appendChild(element("span", "", title));
        const input = element("input");
        input.name = name;
        input.type = type || "text";
        if (type === "checkbox") {
            input.checked = Boolean(value);
        } else {
            input.value = value || "";
        }
        label.appendChild(input);
        form.appendChild(label);
        return input;
    }

    function openSettings() {
        if (document.getElementById("vscode-completion-settings")) {
            return;
        }
        const overlay = element("div", "vscode-settings-overlay");
        overlay.id = "vscode-completion-settings";
        const dialog = element("section", "vscode-settings-card");
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-label", Strings.VSCODE_AI_SETTINGS);
        dialog.appendChild(element("h2", "", Strings.VSCODE_AI_SETTINGS));
        dialog.appendChild(element("p", "", Strings.VSCODE_AI_DESCRIPTION));
        const form = element("form", "vscode-settings-form");
        const current = settings();
        const enabled = field(form, Strings.VSCODE_AI_ENABLE, "enabled", current.enabled, "checkbox");
        const url = field(form, Strings.VSCODE_AI_GATEWAY, "endpoint", current.endpoint, "url");
        const model = field(form, Strings.VSCODE_AI_MODEL, "model", current.model);
        const delay = field(form, Strings.VSCODE_AI_DELAY, "delay", current.debounceMs, "number");
        delay.min = "300";
        delay.max = "3000";
        url.placeholder = "https://example.com/complete";
        const buttons = element("div", "vscode-settings-buttons");
        const cancel = element("button", "", Strings.VSCODE_CANCEL);
        const save = element("button", "vscode-primary-button", Strings.VSCODE_SAVE);
        cancel.type = "button";
        save.type = "submit";
        buttons.append(cancel, save);
        form.appendChild(buttons);
        dialog.appendChild(form);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        const close = function () {
            overlay.remove();
        };
        cancel.addEventListener("click", close);
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) {
                close();
            }
        });
        overlay.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                close();
            }
        });
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            if (enabled.checked && !endpoint(url.value.trim())) {
                url.setCustomValidity(Strings.VSCODE_AI_INVALID_URL);
                url.reportValidity();
                return;
            }
            url.setCustomValidity("");
            PreferencesManager.set(PREF, {
                enabled: enabled.checked,
                endpoint: url.value.trim(),
                model: model.value.trim(),
                debounceMs: Math.max(300, Math.min(3000, Number(delay.value) || 650))
            });
            clear();
            close();
        });
        url.focus();
    }

    function activityBar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar || document.getElementById("vscode-activity-bar")) {
            return;
        }
        const bar = element("nav", "vscode-activity-bar");
        bar.id = "vscode-activity-bar";
        bar.setAttribute("aria-label", Strings.VSCODE_NAVIGATION);
        NAV.forEach(function (item) {
            const button = element("button", "vscode-activity-button");
            button.type = "button";
            button.title = item[1];
            button.setAttribute("aria-label", item[1]);
            const icon = element("i", "fa-solid " + item[2]);
            icon.setAttribute("aria-hidden", "true");
            button.appendChild(icon);
            if (item[0] === "explorer") {
                button.classList.add("active");
            }
            button.addEventListener("click", function () {
                if (item[0] !== "explorer") {
                    const command = CommandManager.get(item[3]);
                    if (!command || !command.getEnabled()) {
                        return;
                    }
                    CommandManager.execute(item[3]);
                } else {
                    const header = document.getElementById("project-files-header");
                    if (header) {
                        header.scrollIntoView({block: "nearest"});
                    }
                }
                bar.querySelectorAll(".vscode-activity-button").forEach(function (node) {
                    node.classList.remove("active");
                });
                button.classList.add("active");
            });
            bar.appendChild(button);
        });
        bar.appendChild(element("div", "vscode-activity-spacer"));
        const config = element("button", "vscode-activity-button");
        config.type = "button";
        config.title = Strings.VSCODE_AI_SETTINGS;
        config.setAttribute("aria-label", Strings.VSCODE_AI_SETTINGS);
        config.appendChild(element("i", "fa-solid fa-wand-magic-sparkles"));
        config.addEventListener("click", openSettings);
        bar.appendChild(config);
        sidebar.prepend(bar);
    }

    AppInit.appReady(function () {
        document.body.classList.add("vscode-workbench");
        activityBar();
        bindEditor();
        EditorManager.on("activeEditorChange", bindEditor);
    });
});
