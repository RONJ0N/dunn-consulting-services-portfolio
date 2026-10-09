/**
 * Gym AI Chatbot embeddable widget.
 *
 * Usage on a customer's site:
 *   <script src="https://app.your-domain.com/embed.js" data-gym-id="iron-boxing" async></script>
 *
 * Mounts a small iframe (bubble only when closed) that expands when the visitor
 * opens chat. The iframe page posts resize messages so we never block the host
 * site with a full-height white box.
 */
(function () {
  if (window.__gymAiWidgetMounted) {
    return;
  }
  window.__gymAiWidgetMounted = true;

  var RESIZE_MESSAGE = "gym-ai-embed-resize";
  var UNAVAILABLE_MESSAGE = "gym-ai-embed-unavailable";
  var CLOSED_WIDTH = 88;
  var CLOSED_HEIGHT = 88;

  var script = document.currentScript;
  if (!script) {
    var scripts = document.getElementsByTagName("script");
    script = scripts[scripts.length - 1];
  }

  var gymId = script && script.getAttribute("data-gym-id");
  if (!gymId) {
    return;
  }
  var token = (script && script.getAttribute("data-token")) || "";

  var origin = "";
  try {
    origin = new URL(script.src).origin;
  } catch (e) {
    origin = window.location.origin;
  }

  var iframe = document.createElement("iframe");
  iframe.src =
    origin +
    "/widget?gym=" +
    encodeURIComponent(gymId) +
    (token ? "&token=" + encodeURIComponent(token) : "");
  iframe.title = "Gym AI Front Desk";
  iframe.setAttribute("allow", "clipboard-write");
  iframe.setAttribute("loading", "lazy");
  iframe.style.position = "fixed";
  iframe.style.bottom = "0";
  iframe.style.right = "0";
  iframe.style.width = CLOSED_WIDTH + "px";
  iframe.style.height = CLOSED_HEIGHT + "px";
  iframe.style.maxWidth = "100vw";
  iframe.style.maxHeight = "100vh";
  iframe.style.border = "0";
  iframe.style.background = "transparent";
  iframe.style.zIndex = "2147483647";
  iframe.style.colorScheme = "light";
  iframe.style.overflow = "hidden";

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) {
      return;
    }
    var data = event.data;
    if (!data || !data.type) {
      return;
    }
    if (data.type === UNAVAILABLE_MESSAGE) {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      return;
    }
    if (data.type !== RESIZE_MESSAGE) {
      return;
    }
    if (typeof data.width !== "number" || typeof data.height !== "number") {
      return;
    }
    iframe.style.width = Math.min(data.width, window.innerWidth) + "px";
    iframe.style.height = Math.min(data.height, window.innerHeight) + "px";
  });

  function mount() {
    if (!document.body) {
      requestAnimationFrame(mount);
      return;
    }
    document.body.appendChild(iframe);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
