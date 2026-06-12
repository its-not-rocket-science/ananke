# Hobbyist Path: Create your first mod

## Step 1 — Custom unit

```json
{
  "id": "unit_ember_knight",
  "hp": 120,
  "move": 4,
  "tags": ["modded", "starter"]
}
```

Expected output:

```txt
[pack] loaded unit_ember_knight
```

## Step 2 — New weapon

```json
{
  "id": "weapon_sunlance",
  "damage": 18,
  "range": 2,
  "keywords": ["pierce"]
}
```

Expected output:

```txt
[pack] loaded weapon_sunlance
```

## Step 3 — Share to registry

```bash
ananke pack publish ./my-first-mod.json --registry https://registry.ananke.dev
```

Expected output:

```txt
published: ananke/mods/my-first-mod@1.0.0
```
