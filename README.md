# Video Speed Controller for Firefox

Adjust HTML5 video and audio playback speed with keyboard shortcuts and an
on-screen controller. Rewind or skip forward without opening the player's menus.

This fork continues
[gediminasel/videospeed-firefox](https://github.com/gediminasel/videospeed-firefox),
with fixes for unwanted speed changes during playback events and media reloads.

## Try this fork

This fork does not yet have a signed Firefox add-on download. The
[existing Mozilla listing](https://addons.mozilla.org/en-US/firefox/addon/videospeed/)
distributes the earlier upstream version.

To load this fork temporarily, clone the repository or download and extract its
source, then open `about:debugging#/runtime/this-firefox` in Firefox. Choose
**Load Temporary Add-on** and select `manifest.json` from the source directory.
Disable any other video speed controller first to avoid conflicting controls.
Firefox removes temporary add-ons when it restarts.

## Keep speed steady on YouTube

Enable **Force last saved speed** in the extension's settings if the player
keeps overriding your chosen speed. With this setting on, use the extension's
shortcuts or on-screen buttons to change speed. Changes from the site's own
speed menu or other extensions are overridden too.

**Remember playback speed** reuses your last speed for newly initialized videos.
**Force last saved speed** also reuses it when remembering is off, so a media
reload cannot discard the speed you asked the extension to enforce.

With forcing off, the extension continues to accept speed changes made by the
player. Both settings are off by default.

## Shortcuts

| Key | Action                                                |
| --- | ----------------------------------------------------- |
| S   | Decrease playback speed                               |
| D   | Increase playback speed                               |
| R   | Toggle normal playback speed                          |
| Z   | Rewind 10 seconds                                     |
| X   | Advance 10 seconds                                    |
| G   | Toggle the configured preferred speed, initially 1.8× |
| V   | Show or hide the controller                           |

Customize shortcuts, speed increments, preferred speeds and excluded sites in
the extension's settings. Enable **Work on audio** to control audio elements
too.

## Development

Use Node.js 26.12.1 or newer, Firefox and geckodriver. Install the test
dependencies and run the checks with the same commands used in CI.

```sh
npm ci --ignore-scripts
npm run check
```

The tests install the extension in a disposable headless Firefox profile. They
use local media and do not access your browser profile or YouTube account. On
Linux, use disk-backed temporary storage, for example
`env TMPDIR=/var/tmp npm run check`.

## License

[MIT](LICENSE). Based on the work of Ilya Grigorik, Gediminas Lelešius and the
contributors to the earlier Video Speed Controller projects.
