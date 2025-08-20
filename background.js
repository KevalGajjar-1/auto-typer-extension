/* global chrome */
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "start-typing") {
    const { autoTyperOptions, lastText } = await chrome.storage.local.get(["autoTyperOptions", "lastText"]);
    const options = Object.assign({ text: lastText || "" }, autoTyperOptions || {});
    chrome.tabs.sendMessage(tab.id, { type: "AUTOTYPER_START", options });
  }

  if (command === "stop-typing") {
    chrome.tabs.sendMessage(tab.id, { type: "AUTOTYPER_STOP" });
  }
});
