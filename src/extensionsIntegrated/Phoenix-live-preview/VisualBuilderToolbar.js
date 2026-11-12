define(function (require, exports, module) {
    const AppInit = require("utils/AppInit");
    const Commands = require("command/Commands");
    const CommandManager = require("command/CommandManager");
    const FileViewController = require("project/FileViewController");
    const ProjectManager = require("project/ProjectManager");
    const MainViewManager = require("view/MainViewManager");
    const WorkspaceManager = require("view/WorkspaceManager");
    const LiveDevelopment = require("LiveDevelopment/main");
    const FileTypeUtils = require("utils/FileTypeUtils");
    const LivePreviewSettings = require("./LivePreviewSettings");
    const VisualBuilderFiles = require("./VisualBuilderFiles");
    const Dialogs = require("widgets/Dialogs");
    const DefaultDialogs = require("widgets/DefaultDialogs");
    const Strings = require("strings");
    const ExtensionUtils = require("utils/ExtensionUtils");

    const BUTTON_ID = "toolbar-visual-builder";
    let busy = false;
    let accessNoticeShown = false;

    ExtensionUtils.loadStyleSheet(module, "visual-builder-toolbar.css");

    function info(title, message) {
        Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, title, message);
    }

    function activeProjectFile() {
        const root = ProjectManager.getProjectRoot();
        const file = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE);
        return file && root && file.fullPath && root.fullPath &&
            file.fullPath.startsWith(root.fullPath) ? file : null;
    }

    function updateButton() {
        const button = document.getElementById(BUTTON_ID);
        if (!button) {
            return;
        }
        const active = WorkspaceManager.isInDesignMode();
        const label = active ? Strings.VISUAL_BUILDER_EXIT : Strings.VISUAL_BUILDER_OPEN;
        button.classList.toggle("is-active", active);
        button.classList.toggle("is-busy", busy);
        button.setAttribute("title", label);
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-pressed", String(active));
        button.setAttribute("aria-busy", String(busy));
    }

    async function ensurePreviewTarget() {
        const root = ProjectManager.getProjectRoot();
        if (!root) {
            info(Strings.VISUAL_BUILDER_TITLE, Strings.VISUAL_BUILDER_NEEDS_PROJECT);
            return false;
        }
        const current = activeProjectFile();
        if (current && FileTypeUtils.isHTMLFile(current.fullPath)) {
            return true;
        }
        if (LivePreviewSettings.isUsingCustomServer()) {
            return true;
        }
        const entry = await VisualBuilderFiles.findProjectPage(root);
        if (!entry) {
            info(Strings.VISUAL_BUILDER_TITLE, Strings.VISUAL_BUILDER_NEEDS_HTML);
            return false;
        }
        await new Promise(function (resolve, reject) {
            FileViewController.openFileAndAddToWorkingSet(entry.fullPath)
                .done(resolve)
                .fail(reject);
        });
        return true;
    }

    async function toggleBuilder() {
        if (busy) {
            return;
        }
        const command = CommandManager.get(Commands.VIEW_TOGGLE_DESIGN_MODE);
        if (!command || !command.getEnabled()) {
            info(Strings.VISUAL_BUILDER_TITLE, Strings.VISUAL_BUILDER_UNAVAILABLE);
            return;
        }
        busy = true;
        updateButton();
        try {
            if (WorkspaceManager.isInDesignMode()) {
                await CommandManager.execute(Commands.VIEW_TOGGLE_DESIGN_MODE);
                return;
            }
            if (!(await ensurePreviewTarget())) {
                return;
            }
            const editAvailable = LiveDevelopment.setMode(LiveDevelopment.CONSTANTS.LIVE_EDIT_MODE);
            if (!editAvailable) {
                LiveDevelopment.setMode(LiveDevelopment.CONSTANTS.LIVE_HIGHLIGHT_MODE);
            }
            await CommandManager.execute(Commands.VIEW_TOGGLE_DESIGN_MODE);
            if (!editAvailable && !accessNoticeShown) {
                accessNoticeShown = true;
                info(Strings.VISUAL_BUILDER_TITLE, Strings.VISUAL_BUILDER_HIGHLIGHT_ONLY);
            }
        } catch (error) {
            info(Strings.VISUAL_BUILDER_TITLE,
                Strings.VISUAL_BUILDER_FAILED + " " + String(error && error.message || error));
        } finally {
            busy = false;
            updateButton();
        }
    }

    AppInit.appReady(function () {
        if (Phoenix.isSpecRunnerWindow) {
            return;
        }
        const button = document.getElementById(BUTTON_ID);
        if (!button) {
            return;
        }
        button.addEventListener("click", function (event) {
            event.preventDefault();
            toggleBuilder();
        });
        WorkspaceManager.on(WorkspaceManager.EVENT_WORKSPACE_DESIGN_MODE_CHANGE + ".visualBuilder",
            updateButton);
        updateButton();
    });

    exports.toggleBuilder = toggleBuilder;
});
