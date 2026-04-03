'use strict';

(function (root) {
  const api = root.FableXport;

  if (!api) {
    return;
  }

  const {
    MESSAGE_TYPES,
    EXPORT_FORMATS,
    buildFilename,
    escapeCsvCell,
    normalizePlainText,
    normalizeMultilineText,
    normalizeDateValue,
    normalizeExclusiveShelf,
    buildBookshelves,
    uniqueValues,
    messageFromError,
    queryBestFableTab,
  } = api;

  const API_ORIGIN = 'https://api.fable.co';

  const DETAILED_COLUMNS = Object.freeze([
    { key: 'title', header: 'Title' },
    { key: 'subtitle', header: 'Subtitle' },
    { key: 'authors', header: 'Author(s)' },
    { key: 'isbn10', header: 'ISBN-10' },
    { key: 'isbn13', header: 'ISBN-13' },
    { key: 'publisher', header: 'Publisher' },
    { key: 'pageCount', header: 'Pages' },
    { key: 'publishedDate', header: 'Published Date' },
    { key: 'genres', header: 'Genres' },
    { key: 'moods', header: 'Moods' },
    { key: 'contentWarnings', header: 'Content Warnings' },
    { key: 'status', header: 'Status' },
    { key: 'rating', header: 'Rating' },
    { key: 'charactersRating', header: 'Characters Rating' },
    { key: 'plotRating', header: 'Plot Rating' },
    { key: 'writingStyleRating', header: 'Writing Style Rating' },
    { key: 'settingRating', header: 'Setting Rating' },
    { key: 'review', header: 'Review' },
    { key: 'reviewSummaryLiked', header: 'Review Summary - Liked' },
    { key: 'reviewSummaryDisliked', header: 'Review Summary - Disliked' },
    { key: 'reviewSummaryDisagreed', header: 'Review Summary - Disagreed' },
    { key: 'attributes', header: 'Attributes/Tags' },
    { key: 'emojiReaction', header: 'Emoji Reaction' },
    { key: 'containsSpoilers', header: 'Contains Spoilers' },
    { key: 'didNotFinish', header: 'Did Not Finish' },
    { key: 'startedReadingAt', header: 'Started Reading' },
    { key: 'finishedReadingAt', header: 'Finished Reading' },
    { key: 'dateAdded', header: 'Date Added' },
    { key: 'currentPage', header: 'Current Page' },
    { key: 'totalPages', header: 'Total Pages' },
    { key: 'spicyLevel', header: 'Spicy Level' },
    { key: 'sourceLists', header: 'Lists' },
  ]);

  const UNIVERSAL_COLUMNS = Object.freeze([
    { key: 'title', header: 'Title' },
    { key: 'authors', header: 'Author' },
    { key: 'authorLf', header: 'Author l-f' },
    { key: 'additionalAuthors', header: 'Additional Authors' },
    { key: 'isbn10', header: 'ISBN' },
    { key: 'isbn13', header: 'ISBN13' },
    { key: 'rating', header: 'My Rating' },
    { key: 'averageRating', header: 'Average Rating' },
    { key: 'publisher', header: 'Publisher' },
    { key: 'binding', header: 'Binding' },
    { key: 'pageCount', header: 'Number of Pages' },
    { key: 'yearPublished', header: 'Year Published' },
    { key: 'originalPublicationYear', header: 'Original Publication Year' },
    { key: 'finishedReadingAt', header: 'Date Read' },
    { key: 'dateAdded', header: 'Date Added' },
    { key: 'sourceLists', header: 'Bookshelves' },
    { key: 'bookshelvesWithPositions', header: 'Bookshelves with positions' },
    { key: 'exclusiveShelf', header: 'Exclusive Shelf' },
    { key: 'review', header: 'My Review' },
    { key: 'spoiler', header: 'Spoiler' },
    { key: 'privateNotes', header: 'Private Notes' },
    { key: 'readCount', header: 'Read Count' },
    { key: 'ownedCopies', header: 'Owned Copies' },
  ]);

  function buildAccountFilename(format) {
    return buildFilename(format, 'full-account');
  }

  function formatAccountBooks(books, format) {
    const normalizedFormat = format === EXPORT_FORMATS.DETAILED ? EXPORT_FORMATS.DETAILED : EXPORT_FORMATS.UNIVERSAL;
    const columns = normalizedFormat === EXPORT_FORMATS.DETAILED ? DETAILED_COLUMNS : UNIVERSAL_COLUMNS;
    const lines = [columns.map((column) => escapeCsvCell(column.header)).join(',')];

    for (const book of books || []) {
      const row = columns.map((column) => escapeCsvCell(formatAccountField(book, column.key, normalizedFormat)));
      lines.push(row.join(','));
    }

    return lines.join('\r\n');
  }

  function formatAccountField(book, key, format) {
    if (format === EXPORT_FORMATS.UNIVERSAL) {
      const shelfData = buildUniversalShelfData(book);

      switch (key) {
        case 'authors':
          return formatAuthorsList(book.authors);
        case 'isbn10':
          return splitIsbn(book.isbn).isbn10;
        case 'isbn13':
          return splitIsbn(book.isbn).isbn13;
        case 'finishedReadingAt':
        case 'dateAdded':
          return normalizeDateValue(book[key], EXPORT_FORMATS.UNIVERSAL);
        case 'bookshelves':
          return shelfData.bookshelves.join(', ');
        case 'exclusiveShelf':
          return shelfData.exclusiveShelf;
        case 'review':
          return book.review || '';
        default:
          return book[key] || '';
      }
    }

    switch (key) {
      case 'authors':
        return formatAuthorsList(book.authors);
      case 'authorLf':
        return book.authorLf || '';
      case 'additionalAuthors':
        return book.additionalAuthors || '';
      case 'isbn10':
        return splitIsbn(book.isbn).isbn10;
      case 'isbn13':
        return splitIsbn(book.isbn).isbn13;
      case 'averageRating':
        return book.averageRating || '';
      case 'publisher':
        return book.publisher || '';
      case 'binding':
        return book.binding || '';
      case 'pageCount':
        return book.pageCount || '';
      case 'yearPublished':
        return book.yearPublished || '';
      case 'originalPublicationYear':
        return book.originalPublicationYear || '';
      case 'genres':
        return joinList(book.genres, '; ');
      case 'moods':
        return joinList(book.moods, '; ');
      case 'contentWarnings':
        return joinList(book.contentWarnings, '; ');
      case 'attributes':
        return joinList(book.attributes, '; ');
      case 'sourceLists':
        return joinList(book.sourceLists, '; ');
      case 'bookshelvesWithPositions':
        return book.bookshelvesWithPositions || '';
      case 'containsSpoilers':
      case 'didNotFinish':
        return booleanToText(book[key]);
      case 'spoiler':
        return booleanToText(book.spoiler);
      case 'privateNotes':
        return book.privateNotes || '';
      case 'readCount':
        return book.readCount || '';
      case 'ownedCopies':
        return book.ownedCopies || '';
      case 'startedReadingAt':
      case 'finishedReadingAt':
      case 'dateAdded':
        return normalizeDateValue(book[key], EXPORT_FORMATS.DETAILED);
      default:
        return book[key] || '';
    }
  }

  function buildUniversalShelfData(book) {
    const sourceLists = Array.isArray(book?.sourceLists) ? book.sourceLists : [];
    const exclusiveShelf = normalizeExclusiveShelf(book?.status, sourceLists);
    const additionalShelves = [];

    if (isTruthy(book?.didNotFinish)) {
      additionalShelves.push('did-not-finish');
    }

    const bookshelves = buildBookshelves(sourceLists, exclusiveShelf, additionalShelves);
    return {
      exclusiveShelf,
      bookshelves: uniqueValues(bookshelves),
    };
  }

  function booleanToText(value) {
    if (isTruthy(value)) {
      return 'Yes';
    }

    if (value === false || value === 'false' || value === 'no' || value === '0' || value === 0) {
      return 'No';
    }

    return '';
  }

  function isTruthy(value) {
    return value === true || value === 'true' || value === 'yes' || value === '1' || value === 1;
  }

  function joinList(values, separator) {
    if (!values) {
      return '';
    }

    if (Array.isArray(values)) {
      return values
        .map((value) => normalizePlainText(typeof value === 'string' ? value : value?.name || value?.title || value?.label || ''))
        .filter(Boolean)
        .join(separator);
    }

    return normalizePlainText(values);
  }

  function formatAuthorsList(authors) {
    return joinList(authors, ', ');
  }

  function splitIsbn(isbn) {
    const normalized = normalizePlainText(isbn).replace(/-/g, '');
    if (normalized.length === 13) {
      return { isbn10: '', isbn13: normalized };
    }

    if (normalized.length === 10) {
      return { isbn10: normalized, isbn13: '' };
    }

    return { isbn10: normalized, isbn13: '' };
  }

  async function fetchJson(url, token) {
    const response = await fetch(url, {
      headers: getHeaders(token),
      credentials: 'include',
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      const suffix = responseText ? ` — ${normalizePlainText(responseText).slice(0, 160)}` : '';
      throw new Error(`Request failed with status ${response.status}${suffix}`);
    }

    return response.json();
  }

  function getHeaders(token) {
    const authToken = normalizeAuthToken(token);
    if (!authToken) {
      throw new Error('No Fable auth token is available in this Chrome profile. Sign in to Fable and try again.');
    }

    return {
      Authorization: `JWT ${authToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Referer: 'https://fable.co/',
      Origin: 'https://fable.co',
    };
  }

  function normalizeAuthToken(value) {
    return normalizePlainText(value).replace(/^(JWT|Token|Bearer)\s+/i, '').replace(/^["']|["'];?$/g, '');
  }

  function chromeStorageGet(key) {
    return new Promise((resolve, reject) => {
      root.chrome.storage.local.get(key, (result) => {
        const runtimeError = root.chrome.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(result || {});
      });
    });
  }

  function chromeStorageSet(value) {
    return new Promise((resolve, reject) => {
      root.chrome.storage.local.set(value, () => {
        const runtimeError = root.chrome.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve();
      });
    });
  }

  async function getStorageCredentials() {
    const stored = await chromeStorageGet('fableCredentials');
    return stored?.fableCredentials || null;
  }

  async function storeCredentials(credentials) {
    const normalized = normalizeCredentials(credentials);
    if (!normalized.authToken && !normalized.userId) {
      return;
    }

    await chromeStorageSet({
      fableCredentials: normalized,
    }).catch(() => null);
  }

  function normalizeCredentials(credentials) {
    return {
      userId: normalizePlainText(credentials?.userId || ''),
      authToken: normalizeAuthToken(credentials?.authToken || ''),
    };
  }

  function mergeCredentials(...credentialSources) {
    const merged = {
      userId: '',
      authToken: '',
    };

    for (const credentials of credentialSources) {
      const normalized = normalizeCredentials(credentials);

      if (!merged.userId && normalized.userId) {
        merged.userId = normalized.userId;
      }

      if (!merged.authToken && normalized.authToken) {
        merged.authToken = normalized.authToken;
      }
    }

    return merged;
  }

  async function resolveCredentials(preferredCredentials = null) {
    const preferred = normalizeCredentials(preferredCredentials);
    const stored = normalizeCredentials(await getStorageCredentials().catch(() => null));

    const merged = mergeCredentials(preferred, stored);
    if (merged.authToken) {
      return merged;
    }

    const detectedCredentials = normalizeCredentials(await detectCredentialsFromActiveTab().catch(() => null));
    if (detectedCredentials.authToken) {
      return mergeCredentials(detectedCredentials, merged);
    }

    throw new Error('Open a signed-in Fable browser tab and try again. No manual auth token is required.');
  }

  async function detectCredentialsFromActiveTab() {
    const tab = await queryBestFableTab().catch(() => null);

    const [pageCredentials, cookieCredentials] = await Promise.all([
      tab?.id ? detectCredentialsFromPage(tab.id) : Promise.resolve({}),
      detectCredentialsFromCookies(tab?.url || ''),
    ]);

    const credentials = mergeCredentials(pageCredentials, cookieCredentials);

    if (!credentials.authToken) {
      throw new Error('Could not detect a Fable auth token from this Chrome profile. Make sure you are signed in to Fable in Chrome and try again.');
    }

    await storeCredentials(credentials);
    return credentials;
  }

  async function detectCredentialsFromPage(tabId) {
    try {
      const response = await api.sendMessageToTab(tabId, { type: MESSAGE_TYPES.REQUEST_PAGE_CREDENTIALS });

      if (!response?.ok) {
        return {};
      }

      return {
        userId: normalizePlainText(response.userId),
        authToken: normalizeAuthToken(response.authToken),
      };
    } catch {
      return {};
    }
  }

  async function detectCredentialsFromCookies(pageUrl) {
    const cookies = await getFableCookies(pageUrl);
    if (!cookies.length) {
      return {};
    }

    const authToken = detectAuthTokenFromCookies(cookies);
    if (!authToken) {
      return {};
    }

    return { authToken };
  }

  async function getFableCookies(pageUrl) {
    if (!root.chrome?.cookies?.getAll) {
      return [];
    }

    const urls = collectCookieUrls(pageUrl);
    const cookies = [];
    const seen = new Set();

    for (const url of urls) {
      const entries = await chromeCookiesGetAll({ url }).catch(() => []);

      for (const cookie of entries) {
        const key = `${cookie.name}|${cookie.domain}|${cookie.path}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        cookies.push(cookie);
      }
    }

    return cookies;
  }

  function collectCookieUrls(pageUrl) {
    const urls = ['https://fable.co/', 'https://api.fable.co/'];

    if (pageUrl) {
      try {
        const origin = new URL(pageUrl).origin;
        if (origin && origin.includes('fable.co')) {
          urls.unshift(`${origin}/`);
        }
      } catch {
        // Ignore invalid URLs and fall back to the shared Fable origins.
      }
    }

    return Array.from(new Set(urls));
  }

  function chromeCookiesGetAll(details) {
    return new Promise((resolve, reject) => {
      root.chrome.cookies.getAll(details, (cookies) => {
        const runtimeError = root.chrome.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(cookies || []);
      });
    });
  }

  function detectAuthTokenFromCookies(cookies) {
    const corpus = (cookies || []).map((cookie) => `${cookie.name}=${cookie.value}`).join('\n');
    const directMatch = extractAuthTokenFromText(corpus);
    if (directMatch) {
      return directMatch;
    }

    const likelyCookies = (cookies || []).filter((cookie) => /(auth|token|jwt|access)/i.test(cookie.name || ''));
    for (const cookie of likelyCookies) {
      const value = normalizeAuthToken(cookie.value);
      if (looksLikeTokenValue(value)) {
        return value;
      }
    }

    for (const cookie of cookies || []) {
      const value = normalizeAuthToken(cookie.value);
      if (looksLikeTokenValue(value)) {
        return value;
      }
    }

    return '';
  }

  function extractAuthTokenFromText(text) {
    const patterns = [
      /(?:authorization|auth[_-]?token|access[_-]?token|jwt|token)\s*[:=]\s*(?:"|')?(?:JWT\s+|Token\s+|Bearer\s+)?([^"'\s;]+)/i,
      /(?:"|')(?:authorization|auth[_-]?token|access[_-]?token|jwt|token)(?:"|')\s*[:=]\s*(?:"|')?(?:JWT\s+|Token\s+|Bearer\s+)?([^"'\s;]+)/i,
      /\bJWT\s+([A-Za-z0-9._-]{20,})\b/i,
      /\btoken=([^;\s]+)/i,
      /\bauth_token=([^;\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return normalizeAuthToken(match[1]);
      }
    }

    return '';
  }

  function looksLikeTokenValue(value) {
    const text = normalizePlainText(value);
    if (!text) {
      return false;
    }

    if (text.split('.').length >= 3 && text.length >= 20) {
      return true;
    }

    return /^[A-Za-z0-9._-]{32,}$/.test(text);
  }

  async function fetchUserId(credentials) {
    if (credentials.userId) {
      return credentials.userId;
    }

    const profileCandidates = [`${API_ORIGIN}/api/v2/users/me/`, `${API_ORIGIN}/api/users/me/`];
    for (const url of profileCandidates) {
      try {
        const data = await fetchJson(url, credentials.authToken);
        const id = data?.id || data?.user?.id || data?.results?.[0]?.id;
        if (id) {
          return String(id);
        }
      } catch {
        // Try the next profile endpoint.
      }
    }

    throw new Error('Could not determine your Fable user ID from the signed-in browser session. Open a Fable profile or library tab and try again.');
  }

  async function fetchUserLists(userId, credentials) {
    const url = `${API_ORIGIN}/api/v2/users/${userId}/book_lists`;
    const data = await fetchJson(url, credentials.authToken);

    if (Array.isArray(data)) {
      return data;
    }

    if (data && Array.isArray(data.results)) {
      return data.results;
    }

    return [];
  }

  async function fetchAccountLists(preferredCredentials = null) {
    const credentials = await resolveCredentials(preferredCredentials);
    const userId = await fetchUserId(credentials);
    const lists = await fetchUserLists(userId, credentials);

    return {
      userId,
      credentials,
      lists,
    };
  }

  async function fetchBooksFromList(userId, listId, credentials) {
    const results = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const url = `${API_ORIGIN}/api/v2/users/${userId}/book_lists/${listId}/books?offset=${offset}&limit=${limit}`;
      const data = await fetchJson(url, credentials.authToken);
      const page = Array.isArray(data) ? data : data?.results || [];

      if (!Array.isArray(page) || page.length === 0) {
        break;
      }

      results.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return results;
  }

  async function fetchOwnedBooks(credentials) {
    const results = [];
    let nextUrl = `${API_ORIGIN}/api/v2/books/owned/?include=preorder,owned`;

    while (nextUrl) {
      const data = await fetchJson(nextUrl, credentials.authToken);
      const page = Array.isArray(data) ? data : data?.results || [];

      if (Array.isArray(page)) {
        results.push(...page);
      }

      nextUrl = data?.next || null;
      if (!nextUrl && (!page || page.length === 0)) {
        break;
      }
    }

    return results;
  }

  async function fetchUserReviews(userId, credentials) {
    const reviewsByBookId = {};
    const endpoints = [
      `${API_ORIGIN}/api/v2/users/${userId}/reviews/?limit=20&offset=0`,
      `${API_ORIGIN}/api/users/${userId}/reviews/?limit=20&offset=0`,
    ];

    for (const baseUrl of endpoints) {
      try {
        let offset = 0;
        const limit = 20;

        while (true) {
          const url = baseUrl.replace('offset=0', `offset=${offset}`);
          const data = await fetchJson(url, credentials.authToken);
          const page = Array.isArray(data) ? data : data?.results || [];

          if (!Array.isArray(page) || page.length === 0) {
            break;
          }

          for (const review of page) {
            const bookId = review?.book?.id;
            if (!bookId) {
              continue;
            }

            reviewsByBookId[bookId] = {
              rating: review.rating ?? '',
              review: normalizeMultilineText(review.review || ''),
              containsSpoilers: review.contains_spoilers ?? false,
              didNotFinish: review.did_not_finish ?? false,
              charactersRating: review.characters_rating ?? '',
              plotRating: review.plot_rating ?? '',
              writingStyleRating: review.writing_style_rating ?? '',
              settingRating: review.setting_rating ?? '',
              attributes: normalizeNamedList(review.attributes || []),
              emojiReaction: normalizePlainText(review.emoji_reaction || review.emoji?.content || ''),
              spicyLevel: review.spicy_level ?? '',
              reviewSummaryLiked: normalizeMultilineText(review.review_summary?.liked || ''),
              reviewSummaryDisliked: normalizeMultilineText(review.review_summary?.disliked || ''),
              reviewSummaryDisagreed: normalizeMultilineText(review.review_summary?.disagreed || ''),
              createdAt: review.created_at || '',
              updatedAt: review.updated_at || '',
            };
          }

          if (page.length < limit) {
            break;
          }

          offset += limit;
        }

        break;
      } catch {
        // Try the fallback endpoint.
      }
    }

    return reviewsByBookId;
  }

  async function fetchAccountLibrary(preferredCredentials = null, options = {}) {
    const credentials = await resolveCredentials(preferredCredentials);
    const userId = await fetchUserId(credentials);
    const selectedListIds = Array.isArray(options?.selectedListIds)
      ? new Set(options.selectedListIds.map((value) => String(value)))
      : new Set();

    await storeCredentials({
      userId,
      authToken: credentials.authToken,
    });

    const [ownedBooks, lists, reviewsByBookId] = await Promise.all([
      fetchOwnedBooks(credentials).catch(() => []),
      fetchUserLists(userId, credentials).catch(() => []),
      fetchUserReviews(userId, credentials).catch(() => ({})),
    ]);

    const booksById = new Map();
    const includeOwnedBooks = selectedListIds.size === 0;

    if (includeOwnedBooks) {
      for (const book of ownedBooks) {
        const normalized = normalizeAccountBook(book);
        if (normalized.id) {
          booksById.set(normalized.id, normalized);
        }
      }
    }

    for (const bookList of lists) {
      const listId = bookList?.id;
      const listName = normalizePlainText(bookList?.name || '');
      if (!listId) {
        continue;
      }

      if (selectedListIds.size > 0 && !selectedListIds.has(String(listId))) {
        continue;
      }

      const books = await fetchBooksFromList(userId, listId, credentials).catch(() => []);
      for (const book of books) {
        const normalized = normalizeAccountBook(book);
        const sourceLists = uniqueValues([...(normalized.sourceLists || []), listName].filter(Boolean));
        const existing = normalized.id ? booksById.get(normalized.id) : null;

        if (existing) {
          booksById.set(normalized.id, {
            ...existing,
            ...normalized,
            sourceLists: uniqueValues([...(existing.sourceLists || []), ...sourceLists]),
          });
        } else if (normalized.id) {
          booksById.set(normalized.id, {
            ...normalized,
            sourceLists,
          });
        }
      }
    }

    const mergedBooks = mergeReviewsWithBooks(Array.from(booksById.values()), reviewsByBookId);
    const uniqueBooks = dedupeAccountBooks(mergedBooks);

    return {
      userId,
      credentials,
      books: uniqueBooks,
      lists,
      reviewsByBookId,
    };
  }

  function mergeReviewsWithBooks(books, reviewsByBookId) {
    return (books || []).map((book) => {
      const review = book?.id ? reviewsByBookId[book.id] : null;
      if (!review) {
        return book;
      }

      return {
        ...book,
        ...review,
        sourceLists: uniqueValues([...(book.sourceLists || [])]),
      };
    });
  }

  function normalizeAccountBook(book) {
    const bookData = book?.book && typeof book.book === 'object' ? book.book : book || {};
    const readingProgress = bookData.reading_progress || book.reading_progress || {};
    const reviewSummary = book.review_summary || bookData.review_summary || {};

    return {
      id: bookData.id || book.id || '',
      title: normalizePlainText(bookData.title || book.title || ''),
      subtitle: normalizePlainText(bookData.subtitle || ''),
      authors: normalizeAuthors(bookData.authors || book.authors || []),
      isbn: normalizePlainText(bookData.isbn || book.isbn || ''),
      publisher: normalizePlainText(bookData.publisher || bookData.imprint || book.publisher || ''),
      pageCount: bookData.page_count || bookData.pages || book.page_count || '',
      publishedDate: normalizePlainText(bookData.published_date || bookData.publish_date || book.published_date || ''),
      genres: normalizeNamedList(bookData.genres || book.genres || []),
      moods: normalizeNamedList(bookData.storygraph_tags?.moods || book.storygraph_tags?.moods || []),
      contentWarnings: normalizeNamedList(bookData.storygraph_tags?.content_warnings || book.storygraph_tags?.content_warnings || []),
      status: normalizePlainText(readingProgress.status || bookData.status || book.status || ''),
      rating: book.rating ?? bookData.rating ?? '',
      review: normalizeMultilineText(book.review || bookData.review || ''),
      reviewSummaryLiked: normalizeMultilineText(book.reviewSummaryLiked || reviewSummary.liked || ''),
      reviewSummaryDisliked: normalizeMultilineText(book.reviewSummaryDisliked || reviewSummary.disliked || ''),
      reviewSummaryDisagreed: normalizeMultilineText(book.reviewSummaryDisagreed || reviewSummary.disagreed || ''),
      containsSpoilers: book.containsSpoilers ?? book.contains_spoilers ?? false,
      didNotFinish: book.didNotFinish ?? book.did_not_finish ?? false,
      startedReadingAt: normalizePlainText(book.startedReadingAt || book.started_reading_at || bookData.started_reading_at || readingProgress.started_at || ''),
      finishedReadingAt: normalizePlainText(book.finishedReadingAt || book.finished_reading_at || bookData.finished_reading_at || readingProgress.finished_at || ''),
      dateAdded: normalizePlainText(book.dateAdded || book.review_created_at || book.added_at || book.created_at || ''),
      currentPage: book.currentPage ?? readingProgress.current_page ?? '',
      totalPages: book.totalPages ?? readingProgress.page_count ?? bookData.total_pages ?? '',
      charactersRating: book.charactersRating ?? book.characters_rating ?? '',
      plotRating: book.plotRating ?? book.plot_rating ?? '',
      writingStyleRating: book.writingStyleRating ?? book.writing_style_rating ?? '',
      settingRating: book.settingRating ?? book.setting_rating ?? '',
      attributes: normalizeNamedList(book.attributes || []),
      emojiReaction: normalizePlainText(book.emojiReaction || book.emoji_reaction || book.emoji?.content || ''),
      spicyLevel: book.spicyLevel ?? book.spicy_level ?? '',
      sourceLists: normalizeNamedList(book.sourceLists || []),
    };
  }

  function normalizeAuthors(authors) {
    if (!Array.isArray(authors)) {
      return [];
    }

    return uniqueValues(
      authors
        .map((author) => (typeof author === 'string' ? author : author?.name || author?.label || ''))
        .map((author) => normalizePlainText(author))
        .filter(Boolean),
    );
  }

  function normalizeNamedList(values) {
    if (!Array.isArray(values)) {
      return [];
    }

    return uniqueValues(
      values
        .map((value) => (typeof value === 'string' ? value : value?.name || value?.label || value?.title || ''))
        .map((value) => normalizePlainText(value))
        .filter(Boolean),
    );
  }

  function dedupeAccountBooks(books) {
    const seen = new Set();
    const result = [];

    for (const book of books || []) {
      if (!book || typeof book !== 'object' || !book.title) {
        continue;
      }

      const key = book.id || `${book.title}|${(book.authors || []).join('|')}|${book.isbn}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(book);
    }

    return result;
  }

  Object.assign(api, {
    buildAccountFilename,
    formatAccountBooks,
    fetchAccountLists,
    fetchAccountLibrary,
    detectCredentialsFromActiveTab,
    normalizeAccountBook,
    dedupeAccountBooks,
    messageFromError,
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
