# Stick Smash Party

A browser-based 2.5D party brawler. Stickman physics, melee + ranged + funny weapons, grab & throw, climbable / destructible terrain, hazards, bots and online multiplayer (via PeerJS — no server needed).

Plays on PC (keyboard + mouse, or gamepad) and mobile (landscape, touch joystick + buttons).

## Run locally

Any static file server works. The simplest:

```
# Node available?
npm start
# That's just: npx serve -l 5173 .
```

Or:

```
python -m http.server 5173
```

Open http://localhost:5173

## Share with friends (no deploy)

Three options that expose your local server to the internet via a free tunnel — anyone you send the link to can play with you over the public PeerJS broker:

```
# Option 1 — localtunnel (assigns a random *.loca.lt URL)
npm run share

# Option 2 — Cloudflare quick tunnel (random *.trycloudflare.com URL)
npm run tunnel

# Option 3 — ngrok (if you already have an account)
ngrok http 5173
```

You'll get a public HTTPS URL. Send that to friends.
- Press **HOST ONLINE**, share the room code (or click COPY LINK).
- Friends press **JOIN ONLINE** and paste the code.

## Deploy permanently

Pure static — drop the folder on any static host:

- **GitHub Pages**: push, enable Pages on `main` / `/` (root).
- **Netlify**: drag-drop the folder.
- **Cloudflare Pages / Vercel**: connect repo, no build step needed.

No backend required. PeerJS uses its public broker for matchmaking; once peers are connected they communicate over WebRTC P2P.

## Controls

### PC
| | |
|---|---|
| Move | **A / D** or **← / →** |
| Jump | **W**, **↑**, **Space** (double-jump available) |
| Aim  | **Mouse** |
| Attack / shoot | **Left mouse**, **J**, **F** |
| Grab / climb / throw | **Right mouse**, **K**, **Shift** |
| Special / alt fire | **L**, **E** |
| Pause | **Esc**, **P** |

### Gamepad
Movement = left stick. Aim = right stick. A=Jump, X / RT = Attack, B / RB = Grab, Y / LB = Special.

### Mobile (landscape)
Left side = analog joystick. Right cluster: **✊** Attack, **⤴** Jump, **✋** Grab, **AIM** (hold + tilt joystick to aim).

## Mechanics

- **Grab anything**: hold the grab button next to a player, weapon, or wall. Players go limp; release without input to drop, push direction + release to throw. Grab into walls = climb up.
- **Throw players**: throwing into hazards or off the map = kill credit.
- **Destructible tiles**: every tile has HP. Bullets, swings, and explosions damage them. Wood < Stone < Metal. Bedrock is indestructible. Drop people into the void.
- **Hazards**: lava (DPS), spikes (instakill bounce), saws (high damage + knockback).
- **Weapons**: katana, bat, pistol, shotgun, minigun, bow, grenades, RPG, rubber chicken, boomerang, fish slap. All have unique knockback profiles.
- **Power-ups**: health pack, speed boost, shield (5s invuln).
- **Lives**: 3 per player. Last one alive wins.

## Tech

- Three.js (rendering)
- Cannon-es (physics)
- PeerJS (WebRTC matchmaking via public broker)
- Pure ES modules + import maps — **no build step**

## Hacking

Drop a new weapon class in `src/weapons/weapons.js` and add it to `SPAWN_TABLE`. New levels go in `src/levels/definitions.js` (just a tile grid + hazards). New characters: append to `src/characters/roster.js`.
