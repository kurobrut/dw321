(function () {
    "use strict";

    if (window.__robuxBalanceFixLoaded) {
        return;
    }
    window.__robuxBalanceFixLoaded = true;

    var storageKey = "local-robux-balance";
    var defaultBalance = 1000;
    var giftAmount = 100;

    function formatNumber(value) {
        return Number(value || 0).toLocaleString("en-US");
    }

    function readBalance() {
        try {
            var raw = Number(window.localStorage.getItem(storageKey));
            if (Number.isFinite(raw) && raw >= 0) {
                return raw;
            }
        } catch (error) {
            console.warn("Could not read local Robux balance:", error);
        }
        return defaultBalance;
    }

    function writeBalance(value) {
        var safe = Math.max(0, Number(value) || 0);
        try {
            window.localStorage.setItem(storageKey, String(safe));
        } catch (error) {
            console.warn("Could not save local Robux balance:", error);
        }
        updateBalance(safe);
    }

    function updateBalance(value) {
        var formatted = formatNumber(value);
        [
            document.getElementById("nav-robux-amount"),
            document.getElementById("send-robux-balance")
        ].filter(Boolean).forEach(function (node) {
            node.textContent = formatted;
            node.style.display = "inline-flex";
            node.style.visibility = "visible";
            node.style.opacity = "1";
        });
    }

    function bindSendButton() {
        var sendButton = document.getElementById("send-robux-button");
        if (!sendButton) return;

        sendButton.addEventListener("click", function () {
            var existingDialog = document.getElementById("local-send-dialog");
            if (existingDialog) {
                var currentBalanceElement = existingDialog.querySelector("#send-robux-balance");
                if (currentBalanceElement) {
                    currentBalanceElement.textContent = formatNumber(readBalance());
                }
                existingDialog.hidden = false;
                return;
            }

            var dialog = document.createElement("div");
            dialog.id = "local-send-dialog";
            dialog.setAttribute("role", "dialog");
            dialog.setAttribute("aria-modal", "true");
            dialog.innerHTML = [
                '<div class="local-send-card">',
                '<button type="button" class="local-send-close" aria-label="Close">X</button>',
                '<h2>Send Robux</h2>',
                '<p>Gift ' + formatNumber(giftAmount) + ' Robux from your local balance?</p>',
                '<div class="local-send-balance">Balance: <span id="send-robux-balance">' + formatNumber(readBalance()) + '</span></div>',
                '<button type="button" class="local-send-confirm">Send</button>',
                '</div>'
            ].join("");

            var style = document.createElement("style");
            style.textContent = [
                "#local-send-dialog{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}",
                ".local-send-card{position:relative;width:min(360px,calc(100% - 32px));padding:24px;background:#fff;border-radius:12px;color:#111;box-shadow:0 8px 30px rgba(0,0,0,.25);font-family:Arial,sans-serif}",
                ".local-send-card h2{margin:0 0 12px;font:700 24px Arial,sans-serif}",
                ".local-send-card p{margin:0 0 16px;font:16px Arial,sans-serif}",
                ".local-send-balance{margin:0 0 18px;font:600 14px Arial,sans-serif;color:#333}",
                ".local-send-close{position:absolute;top:10px;right:12px;border:0;background:transparent;font:bold 18px Arial,sans-serif;cursor:pointer}",
                ".local-send-confirm{border:0;border-radius:8px;padding:10px 18px;background:#333;color:#fff;font-weight:700;cursor:pointer}"
            ].join("");

            document.head.appendChild(style);
            document.body.appendChild(dialog);

            dialog.querySelector(".local-send-close").addEventListener("click", function () {
                dialog.remove();
                style.remove();
            });

            dialog.addEventListener("click", function (event) {
                if (event.target === dialog) {
                    dialog.remove();
                    style.remove();
                }
            });

            dialog.querySelector(".local-send-confirm").addEventListener("click", function () {
                var currentBalance = readBalance();
                if (currentBalance < giftAmount) {
                    window.alert("Not enough local Robux.");
                    return;
                }

                writeBalance(currentBalance - giftAmount);
                window.alert(formatNumber(giftAmount) + " Robux gifted locally.");
                dialog.remove();
                style.remove();
            });
        });
    }

    function initialize() {
        updateBalance(readBalance());
        bindSendButton();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }
}());
