
// Bootstrap zstd decompressor for self-extracting HTML exports.
// This runs before everything else to decompress and inject viewer bundles.
//
// Expects to be concatenated with fzstd UMD before this code at build time.
// The fzstd UMD sets `self.fzstd` with .decompress(data: Uint8Array): Uint8Array

(function () {
  var fzstd = (typeof self !== "undefined" ? self : this).fzstd
  if (!fzstd) return // fzstd not loaded, just bail — uncompressed?

  function base64ToBytes(b64) {
    var raw = atob(b64)
    var bytes = new Uint8Array(raw.length)
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    return bytes
  }

  function bytesToString(bytes) {
    var decoder = new TextDecoder("utf-8", { fatal: false })
    return decoder.decode(bytes)
  }

  function bytesToBase64(bytes) {
    var binary = ""
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  function decompressBlock(el) {
    try {
      var compressed = base64ToBytes(el.textContent || "")
      var decompressed = fzstd.decompress(compressed)
      return bytesToString(decompressed)
    } catch (e) {
      return null
    }
  }

  function decompressAndInject() {
    // First pass: decompress session data into the format viewer expects
    var sessionEl = document.getElementById("session-data-zst")
    if (sessionEl) {
      var json = decompressBlock(sessionEl)
      if (json) {
        var el = document.createElement("script")
        el.id = "session-data"
        el.type = "application/base64"
        // Viewer does atob+TextDecoder, so we encode as UTF-8 bytes -> base64
        el.textContent = bytesToBase64(new TextEncoder().encode(json))
        el.dataset.decompressed = "1"
        sessionEl.parentNode.insertBefore(el, sessionEl)
        sessionEl.remove()
      }
    }

    // Second pass: inject CSS before JS
    var blocks = document.querySelectorAll('style[type*="zstd"]')
    for (var i = 0; i < blocks.length; i++) {
      var el = blocks[i]
      var css = decompressBlock(el)
      if (css) {
        var style = document.createElement("style")
        style.textContent = css
        el.parentNode.replaceChild(style, el)
      }
    }

    // Third pass: inject JS sequentially (execution order matters)
    var scripts = document.querySelectorAll('script[type*="zstd"]')
    for (var j = 0; j < scripts.length; j++) {
      var script = scripts[j]
      var js = decompressBlock(script)
      if (js) {
        var newScript = document.createElement("script")
        newScript.textContent = js
        script.parentNode.replaceChild(newScript, script)
      }
    }
  }

  // Run as soon as DOM is interactive (all compressed blocks must be parsed)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", decompressAndInject)
  } else {
    decompressAndInject()
  }
})()
