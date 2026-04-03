# Fable Xport Extension

An unofficial Chrome extension for exporting a signed-in Fable library to CSV without asking the user to open DevTools, find a user ID, or copy auth tokens by hand.

## What changed since the original CLI tool?

This version is optimized for non-technical users:

- **No manual auth tokens or user IDs.** The extension uses the signed-in Fable browser session automatically.
- **Default flow is full-account export.** Users do not need to be on a specific list page.
- **Pick specific libraries when needed.** Account export can include all lists or only selected lists from the popup.
- **Recommended export is a Goodreads CSV** for direct Goodreads import.
- **StoryGraph workflow:** import into Goodreads first, then import your Goodreads export into StoryGraph.
- **Detailed Fable CSV** is still available for spreadsheet-heavy workflows.

## Recommended user flow

1. Open Chrome and sign in to Fable.
2. Open any Fable tab.
3. Open the extension popup.
4. Leave the defaults as:
   - **Export type:** Goodreads CSV (recommended)
5. Click **Export account CSV**.
6. Save the downloaded file.
7. If you want StoryGraph, first import this file into Goodreads, then use your Goodreads export for StoryGraph import.

Optional: In account mode, use **Choose libraries to export** to select one or more specific lists. Leave all unchecked to export the full account.

## Export types

### Goodreads CSV (recommended)

Creates a Goodreads-compatible CSV with the fields Goodreads import expects, including:

- Title
- Author
- ISBN / ISBN13
- My Rating
- Date Read
- Date Added
- Bookshelves
- Exclusive Shelf
- My Review

StoryGraph note:
Use this file as a Goodreads import first, then import your Goodreads export into StoryGraph.

### Detailed Fable CSV

Creates a richer spreadsheet export with additional fields such as:

- Subtitle
- Publisher
- Page count
- Published date
- Genres / moods / content warnings
- Reading status
- Detailed ratings
- Review summary fields
- Fable attributes / tags
- Emoji reaction
- Started / finished dates
- Current page / total pages
- Source lists

## Installation for development / load unpacked

1. Download this project.
2. Run `npm install` if you want to rebuild from source.
3. Run `npm run build`.
4. In Chrome, open `chrome://extensions`.
5. Turn on **Developer mode**.
6. Click **Load unpacked**.
7. Choose the `dist` folder.

## Technical notes

- Full-account export uses the signed-in browser session plus Fable's API.
- The extension stores detected session details in Chrome local storage so later exports are smoother.
- If Fable changes their internal API or page markup, selectors/endpoints may need updates.

## Known limitations

- Detailed export is account-only because page scraping does not reliably expose all detailed fields.
- If you have a very large library, the export may take some time to complete due to API rate limits and pagination.
- The extension hasn't been tested for Fable's movie or TV show libraries, so it may not work correctly with those media types.
- This is an unofficial tool and may require maintenance if Fable changes their website.

## Acknowledgements

Many thanks to the Fable community on Reddit for responding to my first fable xport CLI tool. You needed something more user-friendly and this extension is a direct result of that feedback. I hope it makes it easier for everyone to export their Fable libraries and share them with other platforms!
