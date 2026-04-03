'use strict';

importScripts(chrome.runtime.getURL('src/shared.js'));
importScripts(chrome.runtime.getURL('src/account.js'));

(function () {
  const api = globalThis.FableXport;

  if (!api) {
    return;
  }

  const {
    MESSAGE_TYPES,
    EXPORT_FORMATS,
    EXPORT_SCOPES,
    normalizeBookRecord,
    dedupeBooks,
    booksToCsv,
    buildFilename,
    isFableUrl,
    messageFromError,
    queryBestFableTab,
    sendMessageToTab,
    downloadCsvFile,
    formatAccountBooks,
    fetchAccountLists,
    fetchAccountLibrary,
    buildAccountFilename,
    detectCredentialsFromActiveTab,
  } = api;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) {
      return false;
    }

    if (message.type === MESSAGE_TYPES.REQUEST_ACCOUNT_LISTS) {
      fetchAccountLists()
        .then((accountData) => {
          const lists = (accountData.lists || []).map((list) => ({
            id: String(list?.id || ''),
            name: String(list?.name || ''),
            bookCount: Number(list?.book_count || list?.books_count || list?.count || 0),
          }));

          sendResponse({
            ok: true,
            lists: lists.filter((list) => list.id && list.name),
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: messageFromError(error),
          });
        });

      return true;
    }

    if (message.type !== MESSAGE_TYPES.START_EXPORT) {
      return false;
    }

    handleStartExport(message)
      .then((response) => sendResponse(response))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: messageFromError(error),
        });
      });

    return true;
  });

  async function handleStartExport(request) {
    const requestedFormat = validateFormat(request.format);
    const scope = validateScope(request.scope);

    if (scope === EXPORT_SCOPES.ACCOUNT_EXPORT) {
      return handleAccountExport(requestedFormat, request.selectedListIds);
    }

    const tab = await queryBestFableTab();
    if (!tab?.id || !isFableUrl(tab.url)) {
      throw new Error('Open the Fable page you want to export, then try again.');
    }

    const response = await sendMessageToTab(tab.id, {
      type: MESSAGE_TYPES.REQUEST_LIBRARY_EXPORT,
      scope,
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'The Fable page did not return any export data.');
    }

    const books = dedupeBooks((response.books || []).map(normalizeBookRecord));
    if (!books.length) {
      throw new Error('No library entries were found on this page. Try the full-account export instead.');
    }

    const csv = booksToCsv(books, EXPORT_FORMATS.UNIVERSAL);
    const filename = buildFilename(EXPORT_FORMATS.UNIVERSAL, scope);
    await downloadCsvFile(csv, filename);

    return {
      ok: true,
      count: books.length,
      filename,
      format: EXPORT_FORMATS.UNIVERSAL,
      scope,
    };
  }

  async function handleAccountExport(format, selectedListIds = []) {
    const accountData = await fetchAccountLibrary(null, { selectedListIds }).catch(async (error) => {
      if (!isCredentialError(error)) {
        throw error;
      }

      const credentials = await detectCredentialsFromActiveTab();
      return fetchAccountLibrary(credentials, { selectedListIds });
    });

    if (!accountData || !Array.isArray(accountData.books) || accountData.books.length === 0) {
      throw new Error('No books were found for the selected lists. Try selecting different lists or export your full account.');
    }

    const csv = formatAccountBooks(accountData.books, format);
    const filename = buildAccountFilename(format);
    await downloadCsvFile(csv, filename);
    const selectedCount = Array.isArray(selectedListIds)
      ? new Set(selectedListIds.map((value) => String(value))).size
      : 0;

    return {
      ok: true,
      count: accountData.books.length,
      listCount: selectedCount || accountData.lists.length,
      reviewCount: Object.keys(accountData.reviewsByBookId || {}).length,
      filename,
      format,
      scope: EXPORT_SCOPES.ACCOUNT_EXPORT,
    };
  }

  function validateFormat(value) {
    return value === EXPORT_FORMATS.DETAILED ? EXPORT_FORMATS.DETAILED : EXPORT_FORMATS.UNIVERSAL;
  }

  function validateScope(value) {
    if (
      value === EXPORT_SCOPES.FULL_LIBRARY ||
      value === EXPORT_SCOPES.ACCOUNT_EXPORT ||
      value === EXPORT_SCOPES.CURRENT_VIEW
    ) {
      return value;
    }

    return EXPORT_SCOPES.ACCOUNT_EXPORT;
  }

  function isCredentialError(error) {
    return /credential|token|user id|auth|401|403|forbidden|unauthorized|signed-in|signed in/i.test(messageFromError(error));
  }
})();
