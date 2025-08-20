/* global chrome */
(() => {
  let typing = false;
  let cancelToken = { cancelled: false };
  let lastActive = null;

  // Track last active element to use if nothing is focused
  const track = (e) => { lastActive = e.target; };
  document.addEventListener("focusin", track, true);
  document.addEventListener("mousedown", track, true);

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    const editable = el.isContentEditable;
    return editable || tag === "textarea" || (tag === "input" && /^(text|search|email|url|tel|password|number)$/i.test(el.type || "text"));
  }

  function smarten(text) {
    // Basic smart punctuation: curly quotes, ellipsis, em-dashes
    return text
      .replace(/\.{3}/g, "…")
      .replace(/--/g, "—")
      .replace(/(^|[\s(\[{<])'/g, "$1‘")
      .replace(/'/g, "’")
      .replace(/(^|[\s(\[{<])"/g, "$1“")
      .replace(/"/g, "”");
  }

  function setNativeValue(el, value) {
    const tag = el.tagName?.toLowerCase();
    if (tag === "textarea" || tag === "input") {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el.isContentEditable) {
      el.innerText = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  async function typeLikeHuman(el, text, opts) {
    typing = true;
    cancelToken.cancelled = false;

    if (opts.smartPunct) text = smarten(text);

    // Move caret to end
    try { el.focus(); } catch {}
    if (el.setSelectionRange && typeof el.value === "string") {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    } else if (window.getSelection && el.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // Use incremental writing to trigger reactive frameworks
    let buffer = (el.value ?? el.innerText) || "";
    const pushChar = async (ch) => {
      if (cancelToken.cancelled) throw new Error("cancelled");
      // Introduce occasional mistakes (type wrong char then backspace)
      if (opts.mistakeRate && Math.random() < (opts.mistakeRate / 100)) {
        buffer += ch.toUpperCase() === ch ? ch.toLowerCase() : ch.toUpperCase();
        setNativeValue(el, buffer);
        await sleep(rand(40, 120));
        buffer = buffer.slice(0, -1);
        setNativeValue(el, buffer);
        await sleep(rand(40, 150));
      }
      buffer += ch;
      setNativeValue(el, buffer);
      await sleep(rand(Math.max(0, opts.minDelay || 20), Math.max(opts.minDelay || 20, opts.maxDelay || 120)));
    };

    try {
      for (const ch of text) {
        await pushChar(ch);
      }
      if (opts.pressEnter) {
        const ev = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true });
        el.dispatchEvent(ev);
        if (el.form && typeof el.form.submit === "function") {
          // Do not auto-submit forms; just insert newline for textareas/contenteditable
          if (el.tagName?.toLowerCase() === "textarea" || el.isContentEditable) {
            buffer += "\n";
            setNativeValue(el, buffer);
          }
        }
      }
    } catch (e) {
      // cancelled
    } finally {
      typing = false;
    }
  }

  async function startTyping(options) {
    if (typing) return;
    const target = document.activeElement && isEditable(document.activeElement) ? document.activeElement
                  : isEditable(lastActive) ? lastActive
                  : null;
    if (!target) {
      alert("Auto Typer: focus an input, textarea, or contenteditable element first.");
      return;
    }
    await typeLikeHuman(target, options.text || "", options || {});
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "AUTOTYPER_START") {
      startTyping(msg.options || {});
      return true; // Keep the message channel open for async response
    }
    if (msg?.type === "AUTOTYPER_STOP") {
      cancelToken.cancelled = true;
      typing = false;
      return true;
    }
    if (msg?.type === "AUTOTYPER_SELECTOR") {
      const element = document.querySelector(msg.selector);
      if (element) {
        if (isEditable(element)) {
          element.focus();
          startTyping(msg.options || {});
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Element is not editable' });
        }
      } else {
        sendResponse({ success: false, error: 'Element not found' });
      }
      return true; // Keep the message channel open for async response
    }
    if (msg?.type === "AUTOTYPER_EXTRACT") {
      try {
        const element = document.querySelector(msg.selector);
        if (element) {
          const text = element.innerText || element.textContent || '';
          sendResponse({ success: true, text: text });
        } else {
          sendResponse({ success: false, error: 'Element not found' });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true; // Keep the message channel open for async response
    }
  });
})();