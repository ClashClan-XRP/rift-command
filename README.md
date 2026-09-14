# Rift Command

Browser RTS for iPhone, iPad, and desktop. Three similar factions, unlimited resources, maps with gated spawn holds, and rooms for up to six players (humans or computer, with difficulty).

**Public source:** [github.com/ClashClan-XRP/rift-command](https://github.com/ClashClan-XRP/rift-command)

Play in the browser. Create a room and share the room code so friends can join. The room host sets the map and game type.

## Play

- **Skirmish** — local match against computer opponents
- **Create room** — host a table, assign open / human / computer seats
- **Join room** — enter a five-character code or open the shared room link

Spawn shields last 75 seconds. Enemy units cannot enter a hold until the gates open.

## Add to Home Screen

This game is a web app. After it is published to a public `*.grok.me` address:

1. Open that link in **Safari** (iPhone / iPad) or **Chrome** (Android)
2. Share → **Add to Home Screen** (iOS) or menu → **Install app** (Android)
3. Open the icon — it launches fullscreen, no browser chrome

On iPhone you can also open `https://YOUR-APP.grok.me/?install=1&platform=ios` for the install walkthrough.

## Controls

**Phone / iPad**
- Drag to pan, pinch to zoom
- Tap a unit to select, tap ground to move
- Command grid to build and train
- Minimap tap to jump the camera

**Desktop**
- WASD pans the camera
- Left-drag box-selects
- Right-click issues move
- A then click = attack-move

## Factions

Aegis, Striker, and Foundry share the same roster. Aegis is tougher and slower, Striker is faster and thinner, Foundry produces quicker with lighter hits.

## Maps

- Bastion Ridge — 2 seats
- Iron Crucible — 4 seats
- Hex Gate — 6 seats

Each spawn sits in a stone alcove behind a choke.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces the production bundle.
