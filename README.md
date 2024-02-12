# sharkey-bulk-alt

This is a very simple script for adding alt text to images uploaded using
Sharkey's note import feature, since the importer doesn't currently respect the
alt text from the imported posts.

This script is designed to work with an archive downloaded from a Mastodon or
Glitch-soc instance (it probably won't work with Akkoma etc).

## Running

1. `npm install`
2. `npm start`

You will be asked for three pieces of information:

- The url of the instance, e.g. `transfem.social`
- An access token, which you can get by going to Settings > API, clicking
  `Generate Access Token`, and creating a token with the
  `Access your Drive files and folders` and
  `Edit or delete your Drive files and folders`
- The path to your `outbox.json`, which is one of the files in the Mastodon
  archive

## Caveats

- The script doesn't currently handle rate limits, so you might get errors about
  that.
