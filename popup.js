/* global chrome */
const $ = (id) => document.getElementById(id);

// Show notification
function showNotification(message, isError = false) {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.left = '50%';
  notification.style.transform = 'translateX(-50%)';
  notification.style.padding = '10px 20px';
  notification.style.background = isError ? '#f87171' : '#4CAF50';
  notification.style.color = 'white';
  notification.style.borderRadius = '4px';
  notification.style.zIndex = '1000';
  notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

async function saveOptions() {
  const payload = {
    text: $("text").value,
    minDelay: +$("minDelay").value || 0,
    maxDelay: +$("maxDelay").value || 0,
    mistakeRate: Math.min(25, Math.max(0, +$("mistakeRate").value || 0)),
    pressEnter: $("pressEnter").checked,
    smartPunct: $("smartPunct").checked,
  };
  await chrome.storage.local.set({ autoTyperOptions: payload, lastText: payload.text });
  return payload;
}

async function restoreOptions() {
  const { autoTyperOptions } = await chrome.storage.local.get("autoTyperOptions");
  if (autoTyperOptions) {
    $("text").value = autoTyperOptions.text || "";
    $("minDelay").value = autoTyperOptions.minDelay ?? 20;
    $("maxDelay").value = autoTyperOptions.maxDelay ?? 120;
    $("mistakeRate").value = autoTyperOptions.mistakeRate ?? 2;
    $("pressEnter").checked = autoTyperOptions.pressEnter ?? true;
    $("smartPunct").checked = autoTyperOptions.smartPunct ?? true;
  }
}

async function startTyping() {
  const opts = await saveOptions();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "AUTOTYPER_START", options: opts });
}

async function stopTyping() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "AUTOTYPER_STOP" });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
$("start").addEventListener("click", startTyping);
$("stop").addEventListener("click", stopTyping);
$("startSelector").addEventListener("click", async () => {
  const opts = await saveOptions();
  const selector = $("selector").value.trim();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "AUTOTYPER_SELECTOR", options: opts, selector });
});

// Handle extract and copy text
// Handle extract and copy text
$("extract").addEventListener("click", async () => {
  const selector = $("selector").value.trim();
  if (!selector) {
    showNotification("Please enter a CSS selector", true);
    return;
  }
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: (sel) => {
        try {
          const element = document.querySelector(sel);
          if (!element) return { success: false, error: 'No element found matching the selector' };

          // For input/textarea elements just return .value
          if (element.value !== undefined && element.value !== null) {
            return { success: true, text: String(element.value) };
          }

          // Helper: is element visually hidden?
          function isHidden(el) {
            try {
              const s = window.getComputedStyle(el);
              return s && (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity || '1') === 0);
            } catch (e) {
              return false;
            }
          }

          // Helper: treat <br> as newline
          function isLineBreak(el) {
            return el.tagName && el.tagName.toLowerCase() === 'br';
          }

          // Decide whether element is "visibly empty" (e.g., spacer <span class="mx-1"></span>)
          function isVisiblyEmpty(el) {
            if (!el.hasChildNodes()) return true;
            for (const node of el.childNodes) {
              if (node.nodeType === Node.TEXT_NODE) {
                if (node.nodeValue && node.nodeValue.trim()) return false;
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                // If descendant element has visible text, it's not empty
                if ((node.textContent || '').trim()) return false;
              }
            }
            return true;
          }

          const parts = [];

          function gather(node) {
            if (!node) return;
            if (node.nodeType === Node.TEXT_NODE) {
              // Normalize whitespace in text nodes but keep single spaces
              const t = node.nodeValue.replace(/\s+/g, ' ');
              if (t.trim()) parts.push(t);
              return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            if (isHidden(node)) return;

            if (isLineBreak(node)) {
              parts.push('\n');
              return;
            }

            // If the element appears visually empty (spacer), insert a single space
            if (isVisiblyEmpty(node)) {
              parts.push(' ');
              return;
            }

            // Recurse children in document order
            for (const ch of node.childNodes) gather(ch);
          }

          gather(element);

          // Join, normalize NBSP and excessive spaces/newlines, fix punctuation spacing
          let text = parts.join('');
          text = text
            .replace(/\u00A0/g, ' ')
            .replace(/[ \t]+\n/g, '\n')     // trim spaces before newline
            .replace(/\n[ \t]+/g, '\n')     // trim spaces after newline
            .replace(/[ \t]+/g, ' ')       // collapse multiple spaces
            .replace(/\s*\n\s*/g, '\n')    // normalize newlines
            .replace(/([.,!?;:])([^\s\n])/g, '$1 $2') // space after punctuation if missing (but not before newline)
            .trim();

          return { success: true, text };
        } catch (e) {
          return { success: false, error: (e && e.message) ? e.message : String(e) };
        }
      },
      args: [selector]
    });

    if (result && result.result && result.result.success) {
      const extractedText = result.result.text;
      if (extractedText) {
        // Show extracted text in the UI
        $('extractedContent').textContent = extractedText;
        $('extractedText').style.display = 'block';
        
        // Copy to clipboard
        await navigator.clipboard.writeText(extractedText);
        showNotification('Text extracted and copied to clipboard!');
      } else {
        showNotification('No text found in the selected element', true);
      }
    } else {
      showNotification(`Error: ${result?.result?.error || 'Failed to extract text'}`, true);
    }
  } catch (error) {
    showNotification(`Error: ${error.message}`, true);
  }
});


// Handle typing to a specific selector
$("startSelector").addEventListener("click", async () => {
  const selector = $("selector").value.trim();
  if (!selector) {
    showNotification("Please enter a CSS selector", true);
    return;
  }
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: (sel) => {
        try {
          const element = document.querySelector(sel);
          if (!element) return { success: false, error: 'No element found matching the selector' };
          
          // Focus the element
          element.focus();
          return { success: true };
        } catch (e) {
          return { success: false, error: e.message };
        }
      },
      args: [selector]
    });

    if (result.result.success) {
      // After focusing the element, start typing
      await saveOptions();
      chrome.tabs.sendMessage(tab.id, { type: "AUTOTYPER_START", options: await saveOptions() });
    } else {
      showNotification(`Error: ${result.result.error || 'Failed to focus element'}`, true);
    }
  } catch (error) {
    showNotification(`Error: ${error.message}`, true);
  }
});
