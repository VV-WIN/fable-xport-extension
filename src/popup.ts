document.getElementById("export")!.addEventListener("click", async () => {

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  chrome.tabs.sendMessage(tab.id!, {
    type: "START_EXPORT"
  });

});