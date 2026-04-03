# fable-xport-extension

An unofficial Chrome extension that exports a Fable library into CSV files for Goodreads or StoryGraph. Created with love for the Fable community on reddit that responded to my CLI exporter tool and wanted something a little easier to use.

## What it does

- Scrapes the current Fable library page from the browser.
- Lets you choose between a current-view export and a fuller auto-scrolling scan.
- Generates CSV with title, author, rating, read dates, shelves, and review text when Fable exposes it in the page.
- Downloads the file directly through Chrome.

## Use

1. Open your Fable library page in Chrome.
2. Open the extension popup.
3. Pick Goodreads or StoryGraph.
4. Pick Current view or Full library.
5. Click Export CSV.

## Notes

- Goodreads is the main target for this implementation.
- StoryGraph uses the same normalized field set for now, so treat it as best effort until the mapping is validated against a live import.
- Full library mode tries to scroll and click load-more controls, but Fable markup changes may require selector updates.
- If no books are found, make sure you are on a Fable library/list page and are signed in.
