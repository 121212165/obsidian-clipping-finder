# Clipping Finder

An Obsidian plugin for people who keep a large library of web clippings and
methodology notes: search them by keyword and drop the result straight into
whatever you are writing.

## Usage

1. Run **Clipping Finder: search and insert** from the command palette (default
   hotkey free).
2. Type keywords — separate multiple terms with spaces, e.g.
   `writing routine dialogue`.
3. Results are scored by term frequency: matches in the file name or frontmatter
   title weigh more than matches in the body.
4. Navigate with ↑/↓, then:
   - <kbd>Enter</kbd> inserts a `[[wikilink]]` at the cursor.
   - <kbd>Ctrl+Enter</kbd> (or Ctrl+click) inserts the matched passage as a
     quote followed by the wikilink.

## Settings

- **Search folders** — comma-separated folder paths (relative to the vault
  root) to limit the search. Leave empty to search the whole vault.
- **Max results** — number of results shown in the picker.

## Notes

- Plain JavaScript, no build step; `main.js` is the source.
- Only reads vault files; nothing leaves your machine.
