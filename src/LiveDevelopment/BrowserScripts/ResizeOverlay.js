(function () {
    const comm = window._Brackets_LiveDev_PhoenixComm;
    const marker = "data-phcode-internal-c15r5a9";
    const directions = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    const css = [
        ":host{all:initial!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important}",
        "*,*::before,*::after{box-sizing:border-box}",
        ".frame{position:absolute;outline:1px solid #2583ff;pointer-events:none}",
        ".handle{position:absolute;width:12px;height:12px;background:white;border:2px solid #2583ff;border-radius:3px;pointer-events:auto;touch-action:none;box-shadow:0 1px 4px #0006}",
        ".handle[data-dir*=n]{top:-7px}",
        ".handle[data-dir*=s]{bottom:-7px}",
        ".handle[data-dir*=e]{right:-7px}",
        ".handle[data-dir*=w]{left:-7px}",
        ".handle[data-dir=n],.handle[data-dir=s]{left:50%;transform:translateX(-50%)}",
        ".handle[data-dir=e],.handle[data-dir=w]{top:50%;transform:translateY(-50%)}",
        ".handle[data-dir=nw],.handle[data-dir=se]{cursor:nwse-resize}",
        ".handle[data-dir=ne],.handle[data-dir=sw]{cursor:nesw-resize}",
        ".handle[data-dir=n],.handle[data-dir=s]{cursor:ns-resize}",
        ".handle[data-dir=e],.handle[data-dir=w]{cursor:ew-resize}",
        ".handle:focus-visible{outline:2px solid white;outline-offset:2px}",
        ".size{position:absolute;left:50%;bottom:-29px;transform:translateX(-50%);white-space:nowrap;padding:3px 7px;color:white;background:#2583ff;border-radius:4px;font:12px/17px system-ui,sans-serif}",
        ".size.above{bottom:auto;top:-29px}",
        ".notice{position:fixed;top:20px;left:50%;transform:translateX(-50%);max-width:80vw;padding:8px 12px;background:#8e1f26;color:white;border-radius:5px;font:13px/20px system-ui,sans-serif}",
        ".hidden{display:none!important}"
    ].join("");
    let host;
    let box;
    let size;
    let notice;
    let selection = null;
    let drag = null;
    let saving = false;
    let resizeObserver;
    let raf = 0;
    let noticeTimeout = 0;

    function showError(reason) {
        notice.textContent = String(reason).slice(0, 240);
        notice.classList.remove("hidden");
        clearTimeout(noticeTimeout);
        noticeTimeout = setTimeout(function () {
            notice.classList.add("hidden");
        }, 3500);
    }

    function readSelection() {
        if (!window._LD || window._LD.getMode() !== "edit") {
            return null;
        }
        const element = window.__current_ph_lp_selected;
        if (!element || !element.isConnected || !element.getAttribute ||
                !/^[1-9]\d*$/.test(element.getAttribute("data-brackets-id") || "") ||
                element === document.body || element === document.documentElement ||
                element.closest("[" + marker + "]") ||
                element.closest(".phcode-no-lp-edit") ||
                element.classList.contains("phcode-no-lp-edit-this") ||
                element.closest("svg")) {
            return null;
        }
        const rect = element.getBoundingClientRect();
        return rect.width >= 2 && rect.height >= 2 ? element : null;
    }

    function render() {
        raf = 0;
        if (!selection || !box) {
            return;
        }
        const r = selection.getBoundingClientRect();
        if (!selection.isConnected || r.width < 2 || r.height < 2) {
            box.classList.add("hidden");
            return;
        }
        box.classList.remove("hidden");
        box.style.left = r.left + "px";
        box.style.top = r.top + "px";
        box.style.width = r.width + "px";
        box.style.height = r.height + "px";
        size.textContent = Math.round(r.width) + " × " + Math.round(r.height);
        size.classList.toggle("above", r.bottom > window.innerHeight - 38);
    }

    function queueRender() {
        if (!raf) {
            raf = requestAnimationFrame(render);
        }
    }

    function syncSelection() {
        if (drag || saving) {
            return;
        }
        const next = readSelection();
        if (next !== selection) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
            selection = next;
            if (selection && resizeObserver) {
                resizeObserver.observe(selection);
            }
            if (!selection) {
                box.classList.add("hidden");
                return;
            }
        }
        if (selection) {
            queueRender();
        }
    }

    function number(value) {
        return Number.isFinite(value) ? value : 0;
    }

    function fit(value, minimum) {
        return Math.max(minimum, Math.min(100000, Math.round(value * 100) / 100));
    }

    function pointerMove(event) {
        if (!drag || drag.pointerId !== event.pointerId || !drag.element.isConnected) {
            return;
        }
        event.preventDefault();
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        let w = drag.rect.width + (drag.direction.includes("e") ? dx : 0) -
            (drag.direction.includes("w") ? dx : 0);
        let h = drag.rect.height + (drag.direction.includes("s") ? dy : 0) -
            (drag.direction.includes("n") ? dy : 0);
        if (event.shiftKey && drag.direction.length === 2) {
            const aspect = drag.rect.width / Math.max(1, drag.rect.height);
            if (Math.abs(dx) > Math.abs(dy * aspect)) {
                h = w / aspect;
            } else {
                w = h * aspect;
            }
        }
        if (drag.direction.includes("e") || drag.direction.includes("w")) {
            drag.width = fit(fit(w, 16) / drag.scaleX - drag.extraWidth, 1);
            drag.element.style.width = drag.width + "px";
        }
        if (drag.direction.includes("n") || drag.direction.includes("s")) {
            drag.height = fit(fit(h, 16) / drag.scaleY - drag.extraHeight, 1);
            drag.element.style.height = drag.height + "px";
        }
        drag.changed = true;
        queueRender();
    }

    function restore(session) {
        if (session.element.isConnected) {
            session.element.style.width = session.beforeWidth;
            session.element.style.height = session.beforeHeight;
        }
        queueRender();
    }

    function pointerEnd(event) {
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }
        const session = drag;
        drag = null;
        if (event.type === "pointercancel" || !session.changed) {
            restore(session);
            return;
        }
        if (!comm || typeof comm.execPhoenixFn !== "function") {
            restore(session);
            showError("Preview connection unavailable. Resize was not saved.");
            return;
        }
        saving = true;
        comm.execPhoenixFn("PH_RESIZE_SELECTED_ELEMENT", {
            tagId: session.tagId,
            width: session.width,
            height: session.height
        }).then(function (result) {
            if (!result || result.saved !== true) {
                throw new Error("Source update was not confirmed.");
            }
        }).catch(function (error) {
            restore(session);
            showError("Resize failed: " + String(error && error.message || error));
        }).finally(function () {
            saving = false;
            syncSelection();
        });
    }

    function pointerStart(event) {
        if (event.button !== 0 || !selection || drag || saving) {
            return;
        }
        const element = selection;
        const rect = element.getBoundingClientRect();
        const computed = getComputedStyle(element);
        const borderBox = computed.boxSizing === "border-box";
        const extraWidth = borderBox ? 0 :
            number(parseFloat(computed.paddingLeft)) + number(parseFloat(computed.paddingRight)) +
            number(parseFloat(computed.borderLeftWidth)) + number(parseFloat(computed.borderRightWidth));
        const extraHeight = borderBox ? 0 :
            number(parseFloat(computed.paddingTop)) + number(parseFloat(computed.paddingBottom)) +
            number(parseFloat(computed.borderTopWidth)) + number(parseFloat(computed.borderBottomWidth));
        drag = {
            element: element,
            tagId: element.getAttribute("data-brackets-id"),
            pointerId: event.pointerId,
            direction: event.currentTarget.dataset.dir,
            x: event.clientX,
            y: event.clientY,
            rect: {width: rect.width, height: rect.height},
            scaleX: rect.width / Math.max(1, element.offsetWidth),
            scaleY: rect.height / Math.max(1, element.offsetHeight),
            extraWidth: extraWidth,
            extraHeight: extraHeight,
            beforeWidth: element.style.width,
            beforeHeight: element.style.height,
            width: null,
            height: null,
            changed: false
        };
        event.preventDefault();
        event.stopImmediatePropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function init() {
        if (!document.body || host) {
            return;
        }
        host = document.createElement("div");
        host.setAttribute(marker, "true");
        host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important";
        const root = host.attachShadow({mode: "closed"});
        const style = document.createElement("style");
        style.textContent = css;
        root.appendChild(style);
        box = document.createElement("div");
        box.className = "frame hidden";
        directions.forEach(function (direction) {
            const handle = document.createElement("div");
            handle.className = "handle";
            handle.dataset.dir = direction;
            handle.setAttribute("role", "button");
            handle.setAttribute("aria-label", "Resize " + direction);
            handle.tabIndex = 0;
            handle.addEventListener("pointerdown", pointerStart);
            handle.addEventListener("pointermove", pointerMove);
            handle.addEventListener("pointerup", pointerEnd);
            handle.addEventListener("pointercancel", pointerEnd);
            box.appendChild(handle);
        });
        size = document.createElement("div");
        size.className = "size";
        box.appendChild(size);
        root.appendChild(box);
        notice = document.createElement("div");
        notice.className = "notice hidden";
        root.appendChild(notice);
        document.body.appendChild(host);
        ["click", "dblclick", "contextmenu"].forEach(function (type) {
            window.addEventListener(type, function (event) {
                if (event.composedPath && event.composedPath().includes(host)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            }, true);
        });
        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(queueRender);
        }
        window.addEventListener("resize", queueRender, {passive: true});
        document.addEventListener("scroll", queueRender, {capture: true, passive: true});
        window.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && drag) {
                restore(drag);
                drag = null;
            }
        }, true);
        setInterval(syncSelection, 150);
        syncSelection();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, {once: true});
    } else {
        init();
    }
})();
