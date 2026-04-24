# Lumina (Tauri)

Lumina is now configured as a Tauri desktop app with a Vite frontend.

## One-line install (public GitHub)

```bash
curl -fsSL https://raw.githubusercontent.com/DoctorKhan/Lumina/main/install.sh | bash
```

This installer will:
- clone or update the repository in `~/.lumina`
- install dependencies with `pnpm`
- build the app with Tauri
- copy `Lumina.app` to `/Applications` on macOS

## Local development

```bash
./run.sh setup
./run.sh tauri:dev
```

## Useful commands

```bash
./run.sh dev
./run.sh build
./run.sh tauri:build
```
