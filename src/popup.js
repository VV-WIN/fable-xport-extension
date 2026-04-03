'use strict';

(function () {
  const api = globalThis.FableXport;

  if (!api) {
    return;
  }

  const { MESSAGE_TYPES, EXPORT_FORMATS, EXPORT_SCOPES, sendRuntimeMessage, messageFromError } = api;

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('export-form');
    const formatSelect = document.getElementById('format');
    const accountOptions = document.getElementById('account-options');
    const listPicker = document.getElementById('account-list-picker');
    const listPickerHelp = document.getElementById('list-picker-help');
    const selectAllListsButton = document.getElementById('select-all-lists');
    const clearAllListsButton = document.getElementById('clear-all-lists');
    const exportButton = document.getElementById('export');
    const status = document.getElementById('status');

    if (
      !form ||
      !formatSelect ||
      !accountOptions ||
      !listPicker ||
      !listPickerHelp ||
      !selectAllListsButton ||
      !clearAllListsButton ||
      !exportButton ||
      !status
    ) {
      return;
    }

    let accountLists = [];
    let listsLoaded = false;
    let listsLoading = false;

    updateModeCopy();
    setStatus('No tokens needed. Sign in to Fable in Chrome, then click Export.', 'idle');

    formatSelect.addEventListener('change', updateModeCopy);
    selectAllListsButton.addEventListener('click', () => setAllListsSelection(true));
    clearAllListsButton.addEventListener('click', () => setAllListsSelection(false));
    form.addEventListener('submit', handleExport);

    renderListPicker();

    function updateModeCopy() {
      const isDetailedFormat = formatSelect.value === EXPORT_FORMATS.DETAILED;
      accountOptions.hidden = false;
      maybeLoadAccountLists();

      if (isDetailedFormat) {
        listPickerHelp.textContent = 'Detailed Fable CSV includes extra ratings, tags, and list metadata. Select specific lists below, or leave all unchecked for full account export.';
        exportButton.textContent = 'Export detailed CSV';
        return;
      }

      listPickerHelp.textContent = 'Exports a Goodreads-compatible CSV. Leave everything unchecked to export all lists, or select specific lists below.';
      exportButton.textContent = 'Export account CSV';
    }

    async function handleExport(event) {
      event.preventDefault();
      setBusy(true);
      setStatus('Starting export…', 'busy');

      try {
        const scope = resolveScope();
        const selectedListIds = getSelectedListIds();
        const response = await sendRuntimeMessage({
          type: MESSAGE_TYPES.START_EXPORT,
          format: formatSelect.value,
          scope,
          selectedListIds,
        });

        if (!response?.ok) {
          throw new Error(response?.error || 'Export failed.');
        }

        const summaryParts = [`${response.count} books`];
        if (response.listCount != null) {
          summaryParts.push(`${response.listCount} lists`);
        }
        if (response.reviewCount != null) {
          summaryParts.push(`${response.reviewCount} reviews`);
        }

        setStatus(`Downloaded ${summaryParts.join(', ')} as ${response.filename}.`, 'success');
      } catch (error) {
        setStatus(messageFromError(error), 'error');
      } finally {
        setBusy(false);
      }
    }

    function setBusy(isBusy) {
      formatSelect.disabled = isBusy;
      selectAllListsButton.disabled = isBusy || accountLists.length === 0;
      clearAllListsButton.disabled = isBusy || accountLists.length === 0;
      for (const checkbox of listPicker.querySelectorAll('input[type="checkbox"]')) {
        checkbox.disabled = isBusy;
      }
      exportButton.disabled = isBusy;
    }

    function resolveScope() {
      return EXPORT_SCOPES.ACCOUNT_EXPORT;
    }

    function setStatus(message, state) {
      status.textContent = message;
      status.dataset.state = state;
    }

    async function maybeLoadAccountLists() {
      if (listsLoaded || listsLoading) {
        return;
      }

      listsLoading = true;
      listPickerHelp.textContent = 'Loading your Fable lists…';
      renderListPicker();

      try {
        const response = await sendRuntimeMessage({ type: MESSAGE_TYPES.REQUEST_ACCOUNT_LISTS });
        if (!response?.ok) {
          throw new Error(response?.error || 'Could not load your Fable lists.');
        }

        accountLists = (response.lists || [])
          .map((list) => ({
            id: String(list.id || ''),
            name: String(list.name || '').trim(),
            bookCount: Number(list.bookCount || 0),
          }))
          .filter((list) => list.id && list.name)
          .sort((a, b) => a.name.localeCompare(b.name));
        listsLoaded = true;
        listPickerHelp.textContent = 'Leave everything unchecked to export all lists, or select specific lists below.';
      } catch (error) {
        listPickerHelp.textContent = 'Could not load lists right now. Export still works and will include your full account.';
        setStatus(messageFromError(error), 'error');
      } finally {
        listsLoading = false;
        renderListPicker();
      }
    }

    function renderListPicker() {
      if (listsLoading) {
        listPicker.innerHTML = '<div class="list-picker-empty">Loading lists…</div>';
        return;
      }

      if (!accountLists.length) {
        listPicker.innerHTML = '<div class="list-picker-empty">No lists loaded yet.</div>';
        return;
      }

      listPicker.innerHTML = accountLists
        .map((list) => {
          const countLabel = Number.isFinite(list.bookCount) && list.bookCount > 0 ? `${list.bookCount} books` : 'Book count unavailable';
          return `
            <label class="list-option">
              <input type="checkbox" value="${escapeHtml(list.id)}" />
              <span>
                <strong>${escapeHtml(list.name)}</strong>
                <span>${escapeHtml(countLabel)}</span>
              </span>
            </label>
          `;
        })
        .join('');
    }

    function getSelectedListIds() {
      return Array.from(listPicker.querySelectorAll('input[type="checkbox"]:checked'))
        .map((input) => input.value)
        .filter(Boolean);
    }

    function setAllListsSelection(isSelected) {
      for (const checkbox of listPicker.querySelectorAll('input[type="checkbox"]')) {
        checkbox.checked = isSelected;
      }
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  });
})();
