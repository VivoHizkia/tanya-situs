// Tanya Situs chat widget.
//
// Put this on any page:
//   <script src="https://YOUR-APP/widget.js" data-bot="BOT_ID" async></script>
//
// It adds a round button in the corner. The chat itself runs in a frame served by the app, so
// this script never touches the host page's content and the host page's CSS cannot break it.
(function () {
  var script = document.currentScript;
  if (!script) return;
  var botId = script.getAttribute("data-bot");
  if (!botId || document.getElementById("tanya-situs-button")) return;

  var origin = new URL(script.src).origin;
  var color = script.getAttribute("data-color") || "#1f5f4a";
  var label = script.getAttribute("data-label") || "Chat";

  var style = document.createElement("style");
  style.textContent =
    "#tanya-situs-button{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:56px;height:56px;" +
    "border:0;border-radius:50%;cursor:pointer;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);" +
    "display:flex;align-items:center;justify-content:center;padding:0}" +
    "#tanya-situs-button:focus-visible{outline:3px solid #fff;outline-offset:-6px}" +
    "#tanya-situs-frame{position:fixed;right:20px;bottom:88px;z-index:2147483000;width:380px;height:560px;" +
    "max-height:calc(100vh - 108px);border:0;border-radius:14px;background:#fff;" +
    "box-shadow:0 12px 40px rgba(0,0,0,.28);display:none}" +
    "#tanya-situs-frame[data-open]{display:block}" +
    "@media (max-width:480px){#tanya-situs-frame{right:0;bottom:0;width:100%;height:100%;max-height:100%;border-radius:0}" +
    "#tanya-situs-frame[data-open]~#tanya-situs-button,#tanya-situs-button[data-open]{right:12px;bottom:auto;top:12px;width:40px;height:40px}}";
  document.head.appendChild(style);

  var CHAT_ICON =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  var CLOSE_ICON =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  var frame = null;
  var button = document.createElement("button");
  button.id = "tanya-situs-button";
  button.type = "button";
  button.style.background = color;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = CHAT_ICON;

  function setOpen(open) {
    // The frame is created on first use, so pages where nobody opens the chat load nothing extra.
    if (open && !frame) {
      frame = document.createElement("iframe");
      frame.id = "tanya-situs-frame";
      frame.title = label;
      frame.src = origin + "/embed/" + encodeURIComponent(botId);
      document.body.insertBefore(frame, button);
    }
    if (!frame) return;
    if (open) {
      frame.setAttribute("data-open", "");
      button.setAttribute("data-open", "");
    } else {
      frame.removeAttribute("data-open");
      button.removeAttribute("data-open");
    }
    button.setAttribute("aria-expanded", String(open));
    button.innerHTML = open ? CLOSE_ICON : CHAT_ICON;
  }

  button.addEventListener("click", function () {
    setOpen(button.getAttribute("aria-expanded") !== "true");
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setOpen(false);
  });

  // Escape pressed inside the chat frame arrives as a message. Only our own frame is trusted.
  window.addEventListener("message", function (event) {
    var fromFrame = frame && event.source === frame.contentWindow && event.origin === origin;
    if (fromFrame && event.data === "tanya-situs:close") {
      setOpen(false);
      button.focus();
    }
  });

  function mount() {
    document.body.appendChild(button);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
