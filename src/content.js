'use strict';

(function () {
  const api = globalThis.FableXport;

  if (!api) {
    return;
  }

  const {
    MESSAGE_TYPES,
    EXPORT_SCOPES,
    normalizePlainText,
    normalizeMultilineText,
    normalizeBookRecord,
    dedupeBooks,
    normalizeExclusiveShelf,
    delay,
    messageFromError,
  } = api;

  const CARD_SELECTOR = [
    'article',
    'li',
    'figure',
    '[role="listitem"]',
    '[data-testid*="book"]',
    '[data-testid*="card"]',
    '[class*="book"]',
    '[class*="card"]',
  ].join(',');

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === MESSAGE_TYPES.REQUEST_PAGE_CREDENTIALS) {
      try {
        const credentials = detectPageCredentials();
        sendResponse({
          ok: true,
          userId: credentials.userId,
          authToken: credentials.authToken,
        });
      } catch (error) {
        sendResponse({
          ok: false,
          error: messageFromError(error),
        });
      }

      return false;
    }

    if (!message || message.type !== MESSAGE_TYPES.REQUEST_LIBRARY_EXPORT) {
      return false;
    }

    collectBooksForExport(message.scope)
      .then((books) => {
        sendResponse({
          ok: true,
          books,
          pageUrl: location.href,
        });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: messageFromError(error),
        });
      });

    return true;
  });

  async function collectBooksForExport(scope) {
    if (scope === EXPORT_SCOPES.FULL_LIBRARY) {
      await expandLibraryListing();
    }

    const pageContext = detectPageShelfContext();
    const books = collectBookCandidates()
      .map((card) => extractBookRecordFromCard(card, pageContext))
      .filter((book) => Boolean(book.title));

    return dedupeBooks(books.map(normalizeBookRecord));
  }

  async function expandLibraryListing() {
    let stagnantRounds = 0;
    let previousSignature = '';

    for (let round = 0; round < 36 && stagnantRounds < 3; round += 1) {
      clickLoadMoreButton();
      scrollToLibraryBottom();
      await delay(900);

      const signature = [
        document.documentElement.scrollHeight,
        findBookAnchors().length,
        collectBookCandidates().length,
      ].join(':');

      if (signature === previousSignature) {
        stagnantRounds += 1;
      } else {
        stagnantRounds = 0;
      }

      previousSignature = signature;
    }

    scrollToTop();
    await delay(200);
  }

  function collectBookCandidates() {
    const seen = new Set();
    const cards = [];

    for (const anchor of findBookAnchors()) {
      const card = findCardRoot(anchor);
      if (!card || seen.has(card)) {
        continue;
      }

      seen.add(card);
      cards.push(card);
    }

    if (cards.length === 0) {
      for (const card of Array.from(document.querySelectorAll(CARD_SELECTOR))) {
        if (seen.has(card) || !looksLikeBookCard(card)) {
          continue;
        }

        seen.add(card);
        cards.push(card);
      }
    }

    return cards;
  }

  function findBookAnchors() {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    return anchors.filter((anchor) => isBookAnchor(anchor));
  }

  function isBookAnchor(anchor) {
    if (!isVisibleElement(anchor)) {
      return false;
    }

    if (anchor.closest('nav, header, footer, aside')) {
      return false;
    }

    const href = anchor.getAttribute('href') || '';
    if (!href) {
      return false;
    }

    const url = new URL(href, location.href);
    if (!(url.hostname === location.hostname || url.hostname.endsWith('.fable.co'))) {
      return false;
    }

    return /\/(book|books|title|titles)\//i.test(url.pathname);
  }

  function findCardRoot(anchor) {
    return anchor.closest(CARD_SELECTOR) || anchor.parentElement || anchor;
  }

  function looksLikeBookCard(node) {
    const text = getNodeText(node);
    if (!text) {
      return false;
    }

    if (isConsentOrPrivacyPanel(text)) {
      return false;
    }

    if (findBookAnchorWithin(node)) {
      return true;
    }

    const title = getTextFromSelectors(node, [
      '[data-testid*="title"]',
      '[class*="title"]',
      'h1',
      'h2',
      'h3',
      'h4',
    ]);
    const author = getTextFromSelectors(node, [
      '[data-testid*="author"]',
      '[class*="author"]',
      'a[href*="/author/"]',
    ]);

    if (isConsentOrPrivacyPanel(title) || isConsentOrPrivacyPanel(author)) {
      return false;
    }

    return Boolean(title && text.length < 800 && (/\bby\b/i.test(text) || author));
  }

  function findBookAnchorWithin(node) {
    return Array.from(node.querySelectorAll('a[href]')).find((anchor) => isBookAnchor(anchor)) || null;
  }

  function extractBookRecordFromCard(card, pageContext = {}) {
    const cardText = getNodeText(card);
    if (isConsentOrPrivacyPanel(cardText)) {
      return normalizeBookRecord({
        title: '',
        author: '',
        shelves: [],
        sourceUrl: location.href,
      });
    }

    const anchor = findBookAnchorWithin(card);
    const labels = collectTextLines(card);
    const titleAndAuthor = splitTitleAuthor(firstNonEmpty([
      getTextFromSelectors(card, [
        '[data-testid*="title"]',
        '[class*="title"]',
        'h1',
        'h2',
        'h3',
        'h4',
      ]),
      anchor?.getAttribute('aria-label'),
      anchor?.getAttribute('title'),
      card.querySelector('img[alt]')?.getAttribute('alt'),
      anchor ? normalizePlainText(anchor.textContent) : '',
      labels.find((line) => !isNoiseLine(line)),
    ]));

    const title = normalizePlainText(titleAndAuthor.title || titleAndAuthor.remainder || '');
    const author = normalizePlainText(firstNonEmpty([
      getTextFromSelectors(card, [
        '[data-testid*="author"]',
        '[class*="author"]',
        'a[href*="/author/"]',
      ]),
      titleAndAuthor.author,
      guessAuthorFromLines(labels, title),
    ]));

    return normalizeBookRecord({
      title,
      author,
      rating: extractRating(card, labels),
      dateRead: extractDatedValue(card, labels, ['read', 'finished', 'completed']),
      dateAdded: extractDatedValue(card, labels, ['added', 'saved']),
      review: extractReview(card),
      shelves: [...extractShelves(card), ...(pageContext.shelves || [])],
      exclusiveShelf: pageContext.exclusiveShelf || '',
      sourceUrl: anchor ? new URL(anchor.getAttribute('href') || '', location.href).href : location.href,
    });
  }

  function isConsentOrPrivacyPanel(text) {
    const normalized = normalizePlainText(text).toLowerCase();
    if (!normalized) {
      return true;
    }

    return [
      'cookie',
      'cookies',
      'privacy',
      'consent',
      'targeting',
      'advertising',
      'ad partner',
      'site preferences',
      'preferences',
      'analytics',
      'personal information',
    ].some((term) => normalized.includes(term));
  }

  function detectPageShelfContext() {
    const candidates = [
      document.title || '',
      location.pathname || '',
      getTextFromSelectors(document, ['h1', '[data-testid*="title"]']),
    ];

    const exclusiveShelf = normalizeExclusiveShelf(candidates);
    return {
      exclusiveShelf,
      shelves: exclusiveShelf ? [exclusiveShelf] : [],
    };
  }

  function extractRating(card, lines) {
    const candidates = Array.from(card.querySelectorAll('[aria-label], [title], [class*="rating"]'));

    for (const element of candidates) {
      const text = normalizePlainText(element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent);
      const rating = parseRatingFromText(text);
      if (rating) {
        return rating;
      }
    }

    for (const line of lines) {
      if (!/star|rating/i.test(line)) {
        continue;
      }

      const rating = parseRatingFromText(line);
      if (rating) {
        return rating;
      }
    }

    return '';
  }

  function parseRatingFromText(text) {
    const match = text.match(/(\d+(?:\.\d+)?)(?:\s*\/\s*5)?\s*(?:stars?|rating)/i) || text.match(/\b(\d+(?:\.\d+)?)\b/);
    return match ? match[1] : '';
  }

  function extractDatedValue(card, lines, keywords) {
    const keywordPattern = new RegExp(keywords.join('|'), 'i');
    for (const line of lines) {
      if (!keywordPattern.test(line)) {
        continue;
      }

      const date = extractDateFromText(line);
      if (date) {
        return date;
      }
    }

    for (const element of Array.from(card.querySelectorAll('time, [datetime], [aria-label], [title]'))) {
      const text = normalizePlainText(element.getAttribute('datetime') || element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent);
      const date = extractDateFromText(text);
      if (date) {
        return date;
      }
    }

    return '';
  }

  function extractDateFromText(text) {
    const monthNameMatch = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}\b/i);
    if (monthNameMatch) {
      return monthNameMatch[0];
    }

    const isoMatch = text.match(/\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/);
    if (isoMatch) {
      return isoMatch[0];
    }

    const numericMatch = text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/);
    if (numericMatch) {
      return numericMatch[0];
    }

    return '';
  }

  function extractReview(card) {
    const selectors = [
      'textarea',
      '[contenteditable="true"]',
      '[data-testid*="review"]',
      '[class*="review"]',
      'blockquote',
    ];

    for (const selector of selectors) {
      const element = card.querySelector(selector);
      if (!element) {
        continue;
      }

      const text = normalizeMultilineText(element.value || element.innerText || element.textContent);
      if (text) {
        return text;
      }
    }

    return '';
  }

  function extractShelves(card) {
    const shelves = [];
    for (const element of Array.from(card.querySelectorAll('a[href*="/shelf/"], [data-testid*="shelf"], [class*="shelf"], [class*="tag"]'))) {
      const text = normalizePlainText(element.textContent || element.getAttribute('aria-label'));
      if (!text || isNoiseLine(text)) {
        continue;
      }

      shelves.push(text);
    }

    return shelves;
  }

  function guessAuthorFromLines(lines, title) {
    const normalizedTitle = normalizePlainText(title).toLowerCase();

    for (const line of lines) {
      const text = normalizePlainText(line);
      if (!text || text.toLowerCase() === normalizedTitle || isNoiseLine(text)) {
        continue;
      }

      if (text.length > 120) {
        continue;
      }

      if (/\b(?:by|author)\b/i.test(text) || /[,|]/.test(text)) {
        return splitTitleAuthor(text).author || text;
      }

      if (/^[A-Z][^\d]{2,}$/.test(text)) {
        return text;
      }
    }

    return '';
  }

  function getTextFromSelectors(node, selectors) {
    for (const selector of selectors) {
      const element = node.querySelector(selector);
      const text = element ? normalizePlainText(element.textContent) : '';
      if (text) {
        return text;
      }
    }

    return '';
  }

  function collectTextLines(node) {
    return getNodeText(node)
      .split('\n')
      .map((line) => normalizePlainText(line))
      .filter(Boolean);
  }

  function getNodeText(node) {
    return String(node?.innerText || node?.textContent || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  function splitTitleAuthor(text) {
    const normalized = normalizePlainText(text);
    if (!normalized) {
      return {
        title: '',
        author: '',
        remainder: '',
      };
    }

    const byMatch = normalized.match(/^(.*?)\s+(?:by|—|\||-)+\s+(.+)$/i);
    if (byMatch) {
      return {
        title: normalizePlainText(byMatch[1]),
        author: normalizePlainText(byMatch[2]),
        remainder: '',
      };
    }

    return {
      title: normalized,
      author: '',
      remainder: '',
    };
  }

  function firstNonEmpty(values) {
    for (const value of values) {
      const text = normalizePlainText(value);
      if (text) {
        return text;
      }
    }

    return '';
  }

  function isNoiseLine(value) {
    const text = normalizePlainText(value);
    if (!text) {
      return true;
    }

    return /\b(?:star|rating|review|read|finished|completed|added|saved|pages?|page|notes?|shelves?|shelf|cookie|cookies|privacy|consent|targeting|advertising|analytics|preferences|personal information)\b/i.test(text) && text.length < 120;
  }

  function scrollToLibraryBottom() {
    window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  }

  function scrollToTop() {
    window.scrollTo(0, 0);
  }

  function clickLoadMoreButton() {
    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const button = buttons.find((element) => {
      if (!isVisibleElement(element)) {
        return false;
      }

      const text = normalizePlainText(element.textContent);
      return /\b(?:load more|show more|view more|more books|next page|more)\b/i.test(text);
    });

    if (button && typeof button.click === 'function') {
      button.click();
      return true;
    }

    return false;
  }

  function isVisibleElement(element) {
    if (!element) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function detectPageCredentials() {
    const corpus = buildCredentialCorpus();
    const userId = extractUserId(corpus);
    const authToken = extractAuthToken(corpus);

    if (!userId && !authToken) {
      throw new Error('Could not detect any Fable session details from the current tab.');
    }

    return {
      userId,
      authToken,
    };
  }

  function buildCredentialCorpus() {
    const parts = [];

    parts.push(location.href);
    parts.push(document.cookie || '');
    parts.push(document.body?.innerText || '');
    parts.push(document.documentElement?.outerHTML || '');

    for (const storage of [window.localStorage, window.sessionStorage]) {
      try {
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key) {
            continue;
          }

          parts.push(`${key}=${storage.getItem(key) || ''}`);
        }
      } catch {
        // Ignore storage access errors and fall back to the other sources.
      }
    }

    return parts.join('\n');
  }

  function extractUserId(text) {
    const patterns = [
      /\/api\/(?:v2\/)?users\/([^/?#"'\s]+)/i,
      /\/fabler\/user-([^/?#"'\s]+)/i,
      /\buser-([0-9]{6,})\b/i,
      /[?&]user[_-]?id=([^&\s]+)/i,
      /(?:"|')user[_-]?id(?:"|')\s*[:=]\s*(?:"|')?([^"',}\]\s]+)/i,
      /(?:"|')user(?:"|')\s*[:=]\s*\{[^}]*?(?:"|')id(?:"|')\s*[:=]\s*(?:"|')?([^"',}\]\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return normalizePlainText(match[1]).replace(/[^a-zA-Z0-9_-]/g, '');
      }
    }

    return '';
  }

  function extractAuthToken(text) {
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
        return normalizePlainText(match[1]).replace(/^["']|["'];?$/g, '');
      }
    }

    return '';
  }
})();