# HytaleSource

A decompiled source code viewer for Hytale. The Hytale server jar is automatically downloaded from Hypixel Studios' servers after authentication with your Hytale account.

Note: This project is adapted from [mcsrc.dev](https://mcsrc.dev/) originally created for Minecraft.

## Setup

The application will automatically prompt you to authenticate with your Hytale account when you first run it. You'll need:
- A valid Hytale account
- Access to download the Hytale server files

## How to build locally

First you must build the java project using Gradle.

- `cd java`
- `./gradlew build`

Then you can run the web app:

- `nvm use` (or ensure you have the correct Node version, see `.nvmrc`)
- `npm install`
- `npm run dev`

## Credits

Libraries and tools used:

- Decompiler: [Vineflower](https://github.com/Vineflower/vineflower)
- Wasm compilation of Vineflower: [@run-slicer/vf](https://www.npmjs.com/package/@run-slicer/vf)