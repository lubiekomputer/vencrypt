# Vencrypt – a Vencord plugin

End-to-end style message encryption for Discord, built as a [Vencord](https://vencord.dev) userplugin.

Type a message as usual, flip the lock switch, hit send – Discord only ever sees the encrypted text. Everyone else who runs the plugin and knows the same key sees the decrypted message right under it.

## Features

- 🔐 **Strong encryption** – AES-256-GCM, key derived from your passphrase with PBKDF2-HMAC-SHA256 (200,000 iterations)
- 🔑 **Key window** – enter your shared key in a small dialog opened from the chat bar
- 🔒 **Lock toggle** – a chat bar button that decides whether the next messages are sent encrypted or as plain text
- 🔓 **Automatic decryption** – incoming messages carrying the plugin's marker prefix are decrypted on the fly, so you can talk with anyone else using the plugin
- 🛡️ **Tamper detection** – GCM authentication makes modified or corrupted messages fail to decrypt instead of showing garbage
- 🎲 **Fresh randomness per message** – random salt and IV, so identical messages never produce identical ciphertext

## How it works

| Step | What happens |
|------|--------------|
| Send | The plugin generates a random 16-byte salt and 12-byte IV, derives an AES-256 key from your passphrase via PBKDF2-SHA256, encrypts the message with AES-GCM and sends `🔐ENC1:` + Base64(`salt ‖ iv ‖ ciphertext+tag`) |
| Receive | Messages starting with `🔐ENC1:` are recognized, parsed and decrypted with your key. The plaintext is rendered below the original message |
| Wrong key | A "wrong key or no key" notice is shown instead of the text |

> **Why not just SHA-256?** SHA-256 is a one-way hash function – it cannot be reversed, so it can't be used to decrypt anything on its own. It is used here inside PBKDF2 to stretch your passphrase into a proper encryption key, while the actual encryption is done by AES-256-GCM.

## Installation

You need Vencord built from source ([official guide](https://docs.vencord.dev/installing/)).

```bash
cd Vencord/src
mkdir -p userplugins
# copy or clone this repo's folder into userplugins:
git clone https://github.com/<your-username>/<repo-name>.git userplugins/Vencrypt

cd ../..
pnpm build
pnpm inject
```

Then fully restart Discord and enable **Vencrypt** under *Settings → Vencord → Plugins*.

The final path must be `Vencord/src/userplugins/Vencrypt/index.tsx`.

## Usage

1. Click the **key** icon in the chat bar and enter your shared passphrase. Everyone you want to talk to must enter the **exact same key**.
2. Click the **lock** icon to turn encryption on (green, closed lock) or off.
3. Type your message and send it. With the lock on, the encrypted version is sent instead of your plain text.
4. Incoming encrypted messages are decrypted automatically as long as your key matches.

Share the key through a **different channel** than Discord (in person, a password manager, another messenger) and use a long, random passphrase.

## Limitations & security notes

- **Message length** – encryption adds overhead (~37 bytes + Base64 expansion). The result must fit into Discord's 2000-character limit; longer messages are blocked with a warning instead of being sent in the clear.
- **Key storage** – the key is stored in plain text in Vencord's local settings. Anyone with access to your computer or your Vencord settings file can read it. Don't share your settings.
- **One key for everything** – a single passphrase is used for all channels and servers (per-channel keys are a possible future improvement).
- **Metadata is not hidden** – Discord still sees who writes, when, and where, plus the message length. Only the content is protected.
- **Ciphertext is visible** – the raw `🔐ENC1:…` text is still shown in the message; the decrypted text appears beneath it.
- **Only text** – attachments, embeds and edits are not encrypted.
- **No forward secrecy** – if your passphrase leaks, all past and future messages encrypted with it can be read.
- **Not audited** – this plugin uses the browser's standard Web Crypto API, but the plugin itself has not been independently reviewed. Don't rely on it for life-or-death secrecy.

## Troubleshooting

- **Messages are sent unencrypted** – make sure the lock is **on** (green) and a key is set. Restart Discord completely after building.
- **Build errors** – Vencord's internal API changes from time to time. Update Vencord (`git pull && pnpm install --frozen-lockfile && pnpm build`) and open an issue with the error message if it persists.
- **"Wrong key" on messages from a friend** – the keys differ, even by a single character or space.

## Disclaimer

Client modifications like Vencord are against Discord's Terms of Service. Use this plugin at your own risk. The software is provided "as is", without warranty of any kind.

## License

Released under the GPL-3.0-or-later license, in line with Vencord. See `LICENSE`.
