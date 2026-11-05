# mosque-media-office

نظام متابعة المكتب الإعلامي في المسجد.

A web app the media office uses to follow its work: what has been asked for, which stage each job has reached, who finished which part, and what was delivered. It runs entirely in the browser and keeps its data on the machine, so the office can keep working without a connection.

The interface is Arabic and right-to-left.

## What it does

- A dashboard with the work currently open and the numbers behind it
- Tasks broken into stages, with the member who completed each stage recorded
- Groups, to keep tasks related to one event or one recurring programme together
- Reports with charts built from the same data
- Export to Excel or JSON, and import either format back
- Light and dark themes

## Running it

Open `index.html`, or serve the folder:

```sh
node server.js
```

and go to `http://localhost:3000`.

There is no build step and no framework — plain HTML, CSS and JavaScript.

## Files

| Path | Contents |
|---|---|
| `index.html`, `css/` | the interface |
| `js/app.js` | routing, state and actions |
| `js/data.js` | the task and group model, and localStorage persistence |
| `js/views.js` | screens |
| `js/modals.js` | dialogs |
| `js/io.js` | Excel and JSON import/export |
| `js/charts.js` | the report charts |
| `test/ui-test.js` | Playwright walkthrough of the main screens, with screenshots |

Data lives in `localStorage` under one key. Export it before clearing the browser's site data, or the office's history goes with it.

`scripts/build-exe.js` packages the same folder as a standalone executable.
