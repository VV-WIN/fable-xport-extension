'use strict';

(function (root) {
  const namespace = root.FableXport || (root.FableXport = {});

  const MESSAGE_TYPES = Object.freeze({
    START_EXPORT: 'FABLE_XPORT_START_EXPORT',
    REQUEST_LIBRARY_EXPORT: 'FABLE_XPORT_REQUEST_LIBRARY_EXPORT',
    REQUEST_PAGE_CREDENTIALS: 'FABLE_XPORT_REQUEST_PAGE_CREDENTIALS',
    REQUEST_ACCOUNT_LISTS: 'FABLE_XPORT_REQUEST_ACCOUNT_LISTS',
  });

  const EXPORT_FORMATS = Object.freeze({
    UNIVERSAL: 'universal',
    DETAILED: 'detailed',
  });

  const EXPORT_SCOPES = Object.freeze({
    CURRENT_VIEW: 'current-view',
    FULL_LIBRARY: 'full-library',
    ACCOUNT_EXPORT: 'full-account',
  });

  const BOOK_EXPORT_COLUMNS = Object.freeze([
    { key: 'title', header: 'Title' },
    { key: 'author', header: 'Author' },
    { key: 'authorLf', header: 'Author l-f' },
    { key: 'additionalAuthors', header: 'Additional Authors' },
    { key: 'isbn', header: 'ISBN' },
    { key: 'isbn13', header: 'ISBN13' },
    { key: 'rating', header: 'My Rating' },
    { key: 'averageRating', header: 'Average Rating' },
    { key: 'publisher', header: 'Publisher' },
    { key: 'binding', header: 'Binding' },
    { key: 'numberOfPages', header: 'Number of Pages' },
    { key: 'yearPublished', header: 'Year Published' },
    { key: 'originalPublicationYear', header: 'Original Publication Year' },
    { key: 'dateRead', header: 'Date Read' },
    { key: 'dateAdded', header: 'Date Added' },
    { key: 'bookshelves', header: 'Bookshelves' },
    { key: 'bookshelvesWithPositions', header: 'Bookshelves with positions' },
    { key: 'exclusiveShelf', header: 'Exclusive Shelf' },
    { key: 'review', header: 'My Review' },
    { key: 'spoiler', header: 'Spoiler' },
    { key: 'privateNotes', header: 'Private Notes' },
    { key: 'readCount', header: 'Read Count' },
    { key: 'ownedCopies', header: 'Owned Copies' },
  ]);

  function normalizePlainText(value) {
    return String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeMultilineText(value) {
    return String(value ?? '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => normalizePlainText(line))
      .filter(Boolean)
      .join('\n');
  }

  function uniqueValues(values) {
    const seen = new Set();
    const result = [];

    for (const value of values || []) {
      const text = normalizePlainText(value);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(text);
    }

    return result;
  }

  function normalizeShelfValues(value) {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return uniqueValues(
        value.map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          return item && typeof item === 'object' ? item.name || item.label || item.title || '' : '';
        }),
      );
    }

    return uniqueValues(String(value).split(/[,;|]/g));
  }

  function canonicalizeShelfName(value) {
    return normalizePlainText(value)
      .toLowerCase()
      .replace(/[-_]+/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeExclusiveShelf(...candidates) {
    const flatCandidates = candidates.flatMap((candidate) => {
      if (Array.isArray(candidate)) {
        return candidate;
      }

      return [candidate];
    });

    for (const candidate of flatCandidates) {
      const canonical = canonicalizeShelfName(candidate);
      if (!canonical) {
        continue;
      }

      if (canonical === 'currently reading' || canonical === 'current reading' || canonical === 'reading') {
        return 'currently-reading';
      }

      if (canonical === 'want to read' || canonical === 'to read' || canonical === 'unread' || canonical === 'tbr') {
        return 'to-read';
      }

      if (canonical === 'finished' || canonical === 'read' || canonical === 'completed' || canonical === 'already read') {
        return 'read';
      }
    }

    return '';
  }

  function buildBookshelves(shelves, exclusiveShelf, additionalShelves = []) {
    const combined = [];

    if (exclusiveShelf) {
      combined.push(exclusiveShelf);
    }

    for (const shelf of normalizeShelfValues(shelves)) {
      if (!normalizeExclusiveShelf(shelf) || normalizeExclusiveShelf(shelf) !== exclusiveShelf) {
        combined.push(shelf);
      }
    }

    for (const shelf of normalizeShelfValues(additionalShelves)) {
      combined.push(shelf);
    }

    return uniqueValues(combined);
  }

  function parseDateParts(value) {
    const text = normalizePlainText(value);
    if (!text) {
      return null;
    }

    let match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      };
    }

    match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (match) {
      let year = Number(match[3]);
      if (year < 100) {
        year += year >= 70 ? 1900 : 2000;
      }

      return {
        year,
        month: Number(match[1]),
        day: Number(match[2]),
      };
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        year: parsed.getFullYear(),
        month: parsed.getMonth() + 1,
        day: parsed.getDate(),
      };
    }

    return null;
  }

  function formatDateParts(parts, format) {
    const year = String(parts.year).padStart(4, '0');
    const month = String(parts.month).padStart(2, '0');
    const day = String(parts.day).padStart(2, '0');

    if (format === EXPORT_FORMATS.DETAILED) {
      return `${year}-${month}-${day}`;
    }

    return `${month}/${day}/${year}`;
  }

  function normalizeDateValue(value, format = EXPORT_FORMATS.UNIVERSAL) {
    const text = normalizePlainText(value);
    if (!text) {
      return '';
    }

    const parsed = parseDateParts(text);
    if (!parsed) {
      return text;
    }

    return formatDateParts(parsed, format);
  }

  function normalizeRatingValue(value) {
    const text = normalizePlainText(value);
    if (!text) {
      return '';
    }

    const match = text.match(/(\d+(?:\.\d+)?)/);
    if (!match) {
      return '';
    }

    return match[1];
  }

  function normalizeBookRecord(book) {
    const incomingShelves = normalizeShelfValues(book?.shelves || book?.bookshelves);
    const exclusiveShelf = normalizeExclusiveShelf(book?.exclusiveShelf, book?.status, incomingShelves);
    const shelves = buildBookshelves(incomingShelves, exclusiveShelf, book?.additionalShelves);

    return {
      bookId: normalizePlainText(book?.bookId || book?.id),
      title: normalizePlainText(book?.title),
      author: normalizePlainText(book?.author),
      authorLf: normalizePlainText(book?.authorLf),
      additionalAuthors: normalizePlainText(book?.additionalAuthors),
      isbn: normalizePlainText(book?.isbn),
      isbn13: normalizePlainText(book?.isbn13),
      rating: normalizeRatingValue(book?.rating),
      averageRating: normalizePlainText(book?.averageRating),
      publisher: normalizePlainText(book?.publisher),
      binding: normalizePlainText(book?.binding),
      numberOfPages: normalizePlainText(book?.numberOfPages || book?.pageCount),
      yearPublished: normalizePlainText(book?.yearPublished),
      originalPublicationYear: normalizePlainText(book?.originalPublicationYear),
      dateRead: normalizePlainText(book?.dateRead),
      dateAdded: normalizePlainText(book?.dateAdded),
      review: normalizeMultilineText(book?.review),
      exclusiveShelf,
      shelves,
      bookshelvesWithPositions: normalizePlainText(book?.bookshelvesWithPositions),
      spoiler: normalizePlainText(book?.spoiler),
      privateNotes: normalizeMultilineText(book?.privateNotes),
      readCount: normalizePlainText(book?.readCount),
      ownedCopies: normalizePlainText(book?.ownedCopies),
      sourceUrl: normalizePlainText(book?.sourceUrl),
    };
  }

  function dedupeBooks(books) {
    const seen = new Set();
    const result = [];

    for (const book of books || []) {
      const normalized = normalizeBookRecord(book);
      const key = normalized.sourceUrl || `${normalized.title}|${normalized.author}|${normalized.dateRead}|${normalized.rating}`;

      if (!normalized.title || seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(normalized);
    }

    return result;
  }

  function escapeCsvCell(value) {
    const text = value == null ? '' : String(value);
    if (/[\r\n,"]/.test(text) || /^\s|\s$/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  }

  function getLocalDateStamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function safeFilenameSegment(value) {
    const text = normalizePlainText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');

    return text.replace(/^-+|-+$/g, '') || 'fable-xport';
  }

  function getFormatFilenameLabel(format) {
    if (format === EXPORT_FORMATS.DETAILED) {
      return 'detailed-fable';
    }

    return 'goodreads';
  }

  function buildFilename(format, scope, date = new Date()) {
    return `fable-${safeFilenameSegment(getFormatFilenameLabel(format))}-${safeFilenameSegment(scope)}-${getLocalDateStamp(date)}.csv`;
  }

  function formatBookField(book, key, format) {
    switch (key) {
      case 'dateRead':
        return normalizeDateValue(book.dateRead, format);
      case 'dateAdded':
        return normalizeDateValue(book.dateAdded, format);
      case 'bookshelves':
        return (book.shelves || []).join(', ');
      case 'bookshelvesWithPositions':
        return book.bookshelvesWithPositions || '';
      case 'exclusiveShelf':
        return book.exclusiveShelf || '';
      case 'review':
        return book.review || '';
      case 'numberOfPages':
        return book.numberOfPages || '';
      case 'spoiler':
        return book.spoiler || '';
      case 'privateNotes':
        return book.privateNotes || '';
      case 'readCount':
        return book.readCount || '';
      case 'ownedCopies':
        return book.ownedCopies || '';
      default:
        return book[key] || '';
    }
  }

  function booksToCsv(books, format = EXPORT_FORMATS.UNIVERSAL) {
    const lines = [BOOK_EXPORT_COLUMNS.map((column) => escapeCsvCell(column.header)).join(',')];

    for (const book of books || []) {
      const row = BOOK_EXPORT_COLUMNS.map((column) => escapeCsvCell(formatBookField(book, column.key, format)));
      lines.push(row.join(','));
    }

    return lines.join('\r\n');
  }

  function messageFromError(error) {
    if (!error) {
      return 'Unknown error';
    }

    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }

    return String(error);
  }

  function isFableUrl(value) {
    if (!value) {
      return false;
    }

    try {
      const url = new URL(value);
      return url.hostname === 'fable.co' || url.hostname.endsWith('.fable.co');
    } catch {
      return false;
    }
  }

  function delay(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  function queryTabs(queryInfo) {
    return new Promise((resolve, reject) => {
      if (!root.chrome?.tabs?.query) {
        reject(new Error('Chrome tabs API is not available.'));
        return;
      }

      root.chrome.tabs.query(queryInfo, (tabs) => {
        const runtimeError = root.chrome.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(tabs || []);
      });
    });
  }

  async function queryActiveTab(queryInfo = { active: true, currentWindow: true }) {
    const tabs = await queryTabs(queryInfo);
    return tabs[0] || null;
  }

  async function queryFableTabs() {
    return queryTabs({ url: ['https://fable.co/*', 'https://*.fable.co/*'] });
  }

  async function queryBestFableTab() {
    const activeTab = await queryActiveTab().catch(() => null);
    if (activeTab && isFableUrl(activeTab.url)) {
      return activeTab;
    }

    const fableTabs = await queryFableTabs().catch(() => []);
    if (!fableTabs.length) {
      return activeTab;
    }

    return (
      fableTabs.find((tab) => tab.active && tab.currentWindow) ||
      fableTabs.find((tab) => tab.lastAccessed === Math.max(...fableTabs.map((candidate) => candidate.lastAccessed || 0))) ||
      fableTabs[0] ||
      activeTab ||
      null
    );
  }

  function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      if (!root.chrome?.tabs?.sendMessage) {
        reject(new Error('Chrome tabs messaging is not available.'));
        return;
      }

      root.chrome.tabs.sendMessage(tabId, message, (response) => {
        const runtimeError = root.chrome.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response || null);
      });
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      if (!root.chrome?.runtime?.sendMessage) {
        reject(new Error('Chrome runtime messaging is not available.'));
        return;
      }

      root.chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = root.chrome.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response || null);
      });
    });
  }

  function downloadCsvFile(csvText, filename) {
    return new Promise((resolve, reject) => {
      if (!root.chrome?.downloads?.download) {
        reject(new Error('Chrome downloads API is not available.'));
        return;
      }

      const downloadUrl = buildCsvDownloadUrl(csvText);
      const revokeUrl = downloadUrl.revoke;

      root.chrome.downloads.download(
        {
          url: downloadUrl.url,
          filename,
          saveAs: true,
        },
        () => {
          const runtimeError = root.chrome.runtime?.lastError;
          if (runtimeError) {
            revokeUrl();
            reject(new Error(runtimeError.message));
            return;
          }

          setTimeout(() => revokeUrl(), 30000);
          resolve(null);
        },
      );
    });
  }

  function buildCsvDownloadUrl(csvText) {
    const payload = String(csvText || '');

    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = new Blob([payload], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      return {
        url,
        revoke() {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // Ignore cleanup failures.
          }
        },
      };
    }

    return {
      url: `data:text/csv;charset=utf-8,${encodeURIComponent(payload)}`,
      revoke() {},
    };
  }

  Object.assign(namespace, {
    MESSAGE_TYPES,
    EXPORT_FORMATS,
    EXPORT_SCOPES,
    BOOK_EXPORT_COLUMNS,
    normalizePlainText,
    normalizeMultilineText,
    uniqueValues,
    normalizeShelfValues,
    canonicalizeShelfName,
    normalizeExclusiveShelf,
    buildBookshelves,
    normalizeDateValue,
    normalizeRatingValue,
    normalizeBookRecord,
    dedupeBooks,
    escapeCsvCell,
    booksToCsv,
    buildFilename,
    getFormatFilenameLabel,
    isFableUrl,
    messageFromError,
    delay,
    queryActiveTab,
    queryFableTabs,
    queryBestFableTab,
    sendMessageToTab,
    sendRuntimeMessage,
    downloadCsvFile,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
